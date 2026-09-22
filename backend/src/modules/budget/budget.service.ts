import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, QueryFailedError, Repository } from 'typeorm';
import { AppException } from '../../common/errors/app.exception';
import { BUDGET_CATEGORIES, BUDGET_CATEGORY_LABELS, BudgetCategory, IDEMPOTENCY_KEY_MAX_LENGTH } from '../../constants/budget';
import { ERROR_CODES } from '../../constants/errors';
import { TripEntity } from '../trip/trip.entity';
import { BudgetCategoryEntity } from './entities/budget-category.entity';
import { BudgetTransferEntity } from './entities/budget-transfer.entity';
import { ExpenseEntity } from './entities/expense.entity';

interface ExpenseInput {
  category?: unknown;
  amount?: unknown;
  note?: unknown;
  idempotencyKey?: unknown;
}

interface TransferInput {
  fromCategory?: unknown;
  toCategory?: unknown;
  amount?: unknown;
  idempotencyKey?: unknown;
}

@Injectable()
export class BudgetService {
  private readonly logger = new Logger(BudgetService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(BudgetCategoryEntity) private readonly categories: Repository<BudgetCategoryEntity>,
    @InjectRepository(ExpenseEntity) private readonly expenses: Repository<ExpenseEntity>,
    @InjectRepository(BudgetTransferEntity) private readonly transfers: Repository<BudgetTransferEntity>,
    @InjectRepository(TripEntity) private readonly trips: Repository<TripEntity>
  ) {}

  async overview(tripId: number) {
    const trip = await this.requireTrip(tripId);
    await this.ensureCategories(tripId);
    const [rows, expenses, transfers] = await Promise.all([
      this.categories.find({ where: { tripId } }),
      this.expenses.find({ where: { tripId }, order: { id: 'DESC' }, take: 20 }),
      this.transfers.find({ where: { tripId }, order: { id: 'DESC' }, take: 20 })
    ]);
    return this.buildOverview(trip, rows, expenses, transfers);
  }

  async setQuotas(tripId: number, userId: number, input: Record<string, unknown>) {
    const trip = await this.requireTrip(tripId);
    this.requireOwner(trip, userId);
    const totalBudget = this.toNumber(trip.budgetMax ?? 0);
    if (totalBudget <= 0) throw new AppException(ERROR_CODES.TRIP_BUDGET_NOT_SET, '请先在行程中设置预算上限');
    const quotas = new Map<BudgetCategory, number>();
    for (const category of BUDGET_CATEGORIES) {
      quotas.set(category, this.parseQuota(input?.[category], BUDGET_CATEGORY_LABELS[category]));
    }
    const allocatedCents = [...quotas.values()].reduce((acc, quota) => acc + this.toCents(quota), 0);
    if (allocatedCents > this.toCents(totalBudget)) {
      throw new AppException(ERROR_CODES.BUDGET_SUM_EXCEEDED, '分类额度合计不能超过行程总预算', 400, { totalBudget, allocated: allocatedCents / 100 });
    }
    await this.ensureCategories(tripId);
    await this.dataSource.transaction(async (manager) => {
      const rows = await manager.find(BudgetCategoryEntity, { where: { tripId }, order: { category: 'ASC' }, lock: { mode: 'pessimistic_write' } });
      for (const row of rows) {
        const next = quotas.get(row.category as BudgetCategory);
        if (next === undefined) continue;
        if (this.toCents(next) < this.toCents(this.toNumber(row.used))) {
          throw new AppException(ERROR_CODES.QUOTA_BELOW_USED, `${BUDGET_CATEGORY_LABELS[row.category as BudgetCategory]}额度不能低于已用金额`, 400, { category: row.category, used: this.toNumber(row.used) });
        }
      }
      for (const [category, quota] of quotas) {
        await manager.update(BudgetCategoryEntity, { tripId, category }, { quota });
      }
    });
    this.logger.log(`行程 ${tripId} 更新分类额度，合计 ${allocatedCents / 100}`);
    return this.overview(tripId);
  }

  async registerExpense(tripId: number, member: { userId: number; nickname: string }, input: ExpenseInput) {
    const category = this.parseCategory(input.category);
    const amount = this.parseAmount(input.amount, '费用金额');
    const idempotencyKey = this.parseIdempotencyKey(input.idempotencyKey);
    const note = typeof input.note === 'string' && input.note.trim() ? input.note.trim().slice(0, 255) : undefined;
    await this.requireTrip(tripId);
    await this.ensureCategories(tripId);
    try {
      return await this.dataSource.transaction(async (manager) => {
        const existing = await manager.findOne(ExpenseEntity, { where: { tripId, idempotencyKey } });
        if (existing) return { duplicated: true, expense: this.toExpenseView(existing) };
        const deducted = await manager
          .createQueryBuilder()
          .update(BudgetCategoryEntity)
          .set({ used: () => 'used + :amount' })
          .where('trip_id = :tripId AND category = :category AND quota - used >= :amount')
          .setParameters({ tripId, category, amount })
          .execute();
        if (!deducted.affected) {
          const row = await manager.findOneByOrFail(BudgetCategoryEntity, { tripId, category });
          const remaining = Math.max(0, this.toNumber(row.quota) - this.toNumber(row.used));
          throw new AppException(ERROR_CODES.EXPENSE_EXCEEDS_CATEGORY, `${BUDGET_CATEGORY_LABELS[category]}剩余额度不足，整笔费用已拒绝`, 400, { category, maxAmount: remaining });
        }
        const expense = await manager.save(ExpenseEntity, manager.create(ExpenseEntity, { tripId, category, amount, note, memberId: member.userId, memberName: member.nickname, idempotencyKey }));
        this.logger.log(`行程 ${tripId} 登记 ${BUDGET_CATEGORY_LABELS[category]}费用 ${amount}，成员 ${member.userId}`);
        return { duplicated: false, expense: this.toExpenseView(expense) };
      });
    } catch (error) {
      if (this.isDuplicateKey(error)) {
        const existing = await this.expenses.findOneBy({ tripId, idempotencyKey });
        if (existing) return { duplicated: true, expense: this.toExpenseView(existing) };
      }
      throw error;
    }
  }

  async transfer(tripId: number, userId: number, input: TransferInput) {
    const fromCategory = this.parseCategory(input.fromCategory);
    const toCategory = this.parseCategory(input.toCategory);
    if (fromCategory === toCategory) throw new AppException(ERROR_CODES.VALIDATION_FAILED, '调出与调入分类不能相同');
    const amount = this.parseAmount(input.amount, '调拨金额');
    const idempotencyKey = this.parseIdempotencyKey(input.idempotencyKey);
    const trip = await this.requireTrip(tripId);
    this.requireOwner(trip, userId);
    await this.ensureCategories(tripId);
    try {
      return await this.dataSource.transaction(async (manager) => {
        const existing = await manager.findOne(BudgetTransferEntity, { where: { tripId, idempotencyKey } });
        if (existing) return { duplicated: true, transfer: this.toTransferView(existing) };
        // 按分类名固定顺序加行锁，避免并发调拨互相死锁
        await manager.find(BudgetCategoryEntity, { where: { tripId, category: In([fromCategory, toCategory]) }, order: { category: 'ASC' }, lock: { mode: 'pessimistic_write' } });
        const deducted = await manager
          .createQueryBuilder()
          .update(BudgetCategoryEntity)
          .set({ quota: () => 'quota - :amount' })
          .where('trip_id = :tripId AND category = :category AND quota - used >= :amount')
          .setParameters({ tripId, category: fromCategory, amount })
          .execute();
        if (!deducted.affected) {
          const row = await manager.findOneByOrFail(BudgetCategoryEntity, { tripId, category: fromCategory });
          const remaining = Math.max(0, this.toNumber(row.quota) - this.toNumber(row.used));
          throw new AppException(ERROR_CODES.TRANSFER_EXCEEDS_REMAINING, `${BUDGET_CATEGORY_LABELS[fromCategory]}可调出额度不足，调出后不得低于已用金额`, 400, { category: fromCategory, maxAmount: remaining });
        }
        await manager
          .createQueryBuilder()
          .update(BudgetCategoryEntity)
          .set({ quota: () => 'quota + :amount' })
          .where('trip_id = :tripId AND category = :category')
          .setParameters({ tripId, category: toCategory, amount })
          .execute();
        const transfer = await manager.save(BudgetTransferEntity, manager.create(BudgetTransferEntity, { tripId, fromCategory, toCategory, amount, operatorId: userId, idempotencyKey }));
        this.logger.log(`行程 ${tripId} 调拨 ${amount}：${fromCategory} -> ${toCategory}`);
        return { duplicated: false, transfer: this.toTransferView(transfer) };
      });
    } catch (error) {
      if (this.isDuplicateKey(error)) {
        const existing = await this.transfers.findOneBy({ tripId, idempotencyKey });
        if (existing) return { duplicated: true, transfer: this.toTransferView(existing) };
      }
      throw error;
    }
  }

  private buildOverview(trip: TripEntity, rows: BudgetCategoryEntity[], expenses: ExpenseEntity[], transfers: BudgetTransferEntity[]) {
    const byCategory = new Map(rows.map((row) => [row.category, row]));
    const categories = BUDGET_CATEGORIES.map((category) => {
      const row = byCategory.get(category);
      const quota = this.toNumber(row?.quota ?? 0);
      const used = this.toNumber(row?.used ?? 0);
      return { category, label: BUDGET_CATEGORY_LABELS[category], quota, used, remaining: this.round(quota - used) };
    });
    const allocated = categories.reduce((acc, item) => acc + item.quota, 0);
    const totalUsed = categories.reduce((acc, item) => acc + item.used, 0);
    const totalBudget = this.toNumber(trip.budgetMax ?? 0);
    return {
      tripId: trip.id,
      destination: trip.destination,
      totalBudget,
      allocated: this.round(allocated),
      unallocated: this.round(totalBudget - allocated),
      totalUsed: this.round(totalUsed),
      totalRemaining: this.round(allocated - totalUsed),
      categories,
      expenses: expenses.map((expense) => this.toExpenseView(expense)),
      transfers: transfers.map((transfer) => this.toTransferView(transfer))
    };
  }

  private toExpenseView(expense: ExpenseEntity) {
    return {
      id: expense.id,
      category: expense.category,
      label: BUDGET_CATEGORY_LABELS[expense.category as BudgetCategory] ?? expense.category,
      amount: this.toNumber(expense.amount),
      note: expense.note ?? null,
      memberName: expense.memberName,
      createdAt: expense.createdAt
    };
  }

  private toTransferView(transfer: BudgetTransferEntity) {
    return {
      id: transfer.id,
      fromCategory: transfer.fromCategory,
      fromLabel: BUDGET_CATEGORY_LABELS[transfer.fromCategory as BudgetCategory] ?? transfer.fromCategory,
      toCategory: transfer.toCategory,
      toLabel: BUDGET_CATEGORY_LABELS[transfer.toCategory as BudgetCategory] ?? transfer.toCategory,
      amount: this.toNumber(transfer.amount),
      createdAt: transfer.createdAt
    };
  }

  private async ensureCategories(tripId: number) {
    await Promise.all(
      BUDGET_CATEGORIES.map((category) =>
        this.categories.query('INSERT IGNORE INTO trip_budget_categories (trip_id, category, quota, used) VALUES (?, ?, 0, 0)', [tripId, category])
      )
    );
  }

  private async requireTrip(tripId: number): Promise<TripEntity> {
    const trip = Number.isInteger(tripId) && tripId > 0 ? await this.trips.findOneBy({ id: tripId }) : null;
    if (!trip) throw new AppException(ERROR_CODES.TRIP_NOT_FOUND, '行程不存在', 404);
    return trip;
  }

  private requireOwner(trip: TripEntity, userId: number) {
    if (trip.ownerId !== userId) throw new AppException(ERROR_CODES.NOT_TRIP_OWNER, '只有行程发起人可以执行该操作', 403);
  }

  private parseCategory(value: unknown): BudgetCategory {
    if (!BUDGET_CATEGORIES.includes(value as BudgetCategory)) throw new AppException(ERROR_CODES.VALIDATION_FAILED, '未知的费用分类');
    return value as BudgetCategory;
  }

  private parseAmount(value: unknown, field: string): number {
    const amount = this.parseMoney(value, field);
    if (amount <= 0) throw new AppException(ERROR_CODES.VALIDATION_FAILED, `${field}必须大于 0`);
    return amount;
  }

  private parseQuota(value: unknown, label: string): number {
    const quota = this.parseMoney(value, `${label}额度`);
    if (quota < 0) throw new AppException(ERROR_CODES.VALIDATION_FAILED, `${label}额度不能为负数`);
    return quota;
  }

  private parseMoney(value: unknown, field: string): number {
    const amount = typeof value === 'string' && value.trim() ? Number(value) : value;
    if (typeof amount !== 'number' || !Number.isFinite(amount)) throw new AppException(ERROR_CODES.VALIDATION_FAILED, `${field}必须是有效数字`);
    const rounded = this.round(amount);
    if (Math.abs(rounded) > 999999999.99) throw new AppException(ERROR_CODES.VALIDATION_FAILED, `${field}超出允许范围`);
    return rounded;
  }

  private parseIdempotencyKey(value: unknown): string {
    const key = typeof value === 'string' ? value.trim() : '';
    if (!key) throw new AppException(ERROR_CODES.VALIDATION_FAILED, '缺少幂等键 idempotencyKey');
    if (key.length > IDEMPOTENCY_KEY_MAX_LENGTH) throw new AppException(ERROR_CODES.VALIDATION_FAILED, `幂等键长度不能超过 ${IDEMPOTENCY_KEY_MAX_LENGTH} 字符`);
    return key;
  }

  private isDuplicateKey(error: unknown): boolean {
    return error instanceof QueryFailedError && (error.driverError as { errno?: number } | undefined)?.errno === 1062;
  }

  private toNumber(value: number | string): number {
    return Number(value);
  }

  private toCents(value: number): number {
    return Math.round(value * 100);
  }

  private round(value: number): number {
    return Math.round(value * 100) / 100;
  }
}
