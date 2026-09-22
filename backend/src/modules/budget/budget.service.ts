import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { BudgetEntity } from './budget.entity';
import { BudgetExpenseEntity } from './budget-expense.entity';
import { BudgetTransferEntity } from './budget-transfer.entity';
import { TripEntity } from '../trip/trip.entity';
import { BUDGET_CATEGORIES, BUDGET_CATEGORY_LABELS, BudgetCategory } from '../../constants/budget';
import { ERROR_CODES } from '../../constants/errors';
import { AppException } from '../../common/errors/app.exception';

const DUPLICATE_ENTRY_ERRNO = 1062;

export interface RegisterExpenseInput {
  tripId: number;
  category: string;
  amount: number;
  note?: string;
  memberId: number;
  requestId: string;
}

export interface TransferBudgetInput {
  tripId: number;
  fromCategory: string;
  toCategory: string;
  amount: number;
  operatorId: number;
  requestId: string;
}

@Injectable()
export class BudgetService {
  private readonly logger = new Logger(BudgetService.name);

  constructor(
    @InjectRepository(BudgetEntity) private readonly budgets: Repository<BudgetEntity>,
    @InjectRepository(BudgetExpenseEntity) private readonly expenses: Repository<BudgetExpenseEntity>,
    @InjectRepository(BudgetTransferEntity) private readonly transfers: Repository<BudgetTransferEntity>,
    @InjectRepository(TripEntity) private readonly trips: Repository<TripEntity>,
    private readonly dataSource: DataSource
  ) {}

  /** 发起人初始化/调整四个分类额度，合计不得超过行程总预算，且不得低于各分类已用金额 */
  async setup(tripId: number, quotas: Record<string, number>, operatorId: number) {
    await this.assertTripOwner(tripId, operatorId);

    for (const category of BUDGET_CATEGORIES) {
      const amount = quotas[category];
      if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0) {
        throw new AppException(ERROR_CODES.BUDGET_AMOUNT_INVALID, `${BUDGET_CATEGORY_LABELS[category]}额度必须是不小于 0 的数字`);
      }
    }
    const extra = Object.keys(quotas).find(key => !BUDGET_CATEGORIES.includes(key as BudgetCategory));
    if (extra) throw new AppException(ERROR_CODES.BUDGET_CATEGORY_INVALID, `不支持的预算分类：${extra}`);

    const total = this.toCents(Object.values(quotas).reduce((sum, value) => sum + value, 0));
    const trip = await this.trips.findOneBy({ id: tripId });
    if (trip?.budgetMax != null && total > this.toCents(Number(trip.budgetMax))) {
      throw new AppException(
        ERROR_CODES.BUDGET_TOTAL_EXCEEDED,
        `分类额度合计 ${(total / 100).toFixed(2)} 超过行程总预算 ${Number(trip.budgetMax).toFixed(2)}`,
        HttpStatus.BAD_REQUEST,
        { totalBudget: Number(trip.budgetMax) }
      );
    }

    const runSetup = () =>
      this.dataSource.transaction(async manager => {
        const rows = await manager
          .getRepository(BudgetEntity)
          .createQueryBuilder('b')
          .where('b.trip_id = :tripId', { tripId })
          .orderBy('b.category', 'ASC')
          .setLock('pessimistic_write')
          .getMany();

        for (const category of BUDGET_CATEGORIES) {
          const planned = this.round2(quotas[category]);
          const row = rows.find(item => item.category === category);
          if (row) {
            if (this.toCents(planned) < this.toCents(Number(row.spent))) {
              throw new AppException(
                ERROR_CODES.BUDGET_PLANNED_BELOW_SPENT,
                `${BUDGET_CATEGORY_LABELS[category]}新额度 ${planned.toFixed(2)} 不能低于已用金额 ${Number(row.spent).toFixed(2)}`,
                HttpStatus.BAD_REQUEST,
                { category, spent: Number(row.spent) }
              );
            }
            row.planned = planned;
            await manager.save(row);
          } else {
            await manager.save(manager.create(BudgetEntity, { tripId, category, planned, spent: 0 }));
          }
        }
      });

    try {
      await runSetup();
    } catch (error) {
      // 并发首次初始化时唯一索引可能冲突，事务回滚后重试一次即可
      if (!this.isDuplicateEntry(error)) throw error;
      this.logger.warn(`trip ${tripId} budget setup hit unique index, retrying once`);
      await runSetup();
    }

    return this.getSummary(tripId);
  }

  /** 查询各分类额度、已用、剩余及合计，页面刷新后始终以该结果为准 */
  async getSummary(tripId: number) {
    const trip = await this.trips.findOneBy({ id: tripId });
    if (!trip) throw new AppException(ERROR_CODES.TRIP_NOT_FOUND, '行程不存在', HttpStatus.NOT_FOUND);

    const rows = await this.budgets.find({ where: { tripId }, order: { category: 'ASC' } });
    const byCategory = new Map(rows.map(row => [row.category, row]));
    const categories = BUDGET_CATEGORIES.map(category => {
      const row = byCategory.get(category);
      const planned = row ? Number(row.planned) : 0;
      const spent = row ? Number(row.spent) : 0;
      return {
        category,
        label: BUDGET_CATEGORY_LABELS[category],
        planned: this.round2(planned),
        spent: this.round2(spent),
        remaining: this.round2(planned - spent)
      };
    });

    return {
      tripId,
      totalBudget: trip.budgetMax == null ? null : Number(trip.budgetMax),
      categories,
      totalPlanned: this.round2(categories.reduce((sum, item) => sum + item.planned, 0)),
      totalSpent: this.round2(categories.reduce((sum, item) => sum + item.spent, 0)),
      totalRemaining: this.round2(categories.reduce((sum, item) => sum + item.remaining, 0)),
      initialized: rows.length > 0
    };
  }

  /** 成员登记费用：只扣对应分类，超出剩余额度则整笔拒绝并返回可登记上限 */
  async registerExpense(input: RegisterExpenseInput) {
    this.assertCategory(input.category);
    this.assertPositiveAmount(input.amount);
    this.assertRequestId(input.requestId);
    const memberId = this.assertOperator(input.memberId, 'memberId');

    // 事务外先查幂等：重复提交直接返回首次结果，绝不二次扣款
    const duplicated = await this.expenses.findOne({ where: { requestId: input.requestId } });
    if (duplicated) {
      this.assertExpenseMatches(duplicated, input);
      return this.duplicateExpenseResult(duplicated);
    }

    try {
      return await this.dataSource.transaction(async manager => {
        const budget = await this.lockCategoryBudget(manager, input.tripId, input.category);
        const amount = this.round2(input.amount);
        const remaining = this.toCents(Number(budget.planned)) - this.toCents(Number(budget.spent));

        if (this.toCents(amount) > remaining) {
          throw new AppException(
            ERROR_CODES.BUDGET_QUOTA_EXCEEDED,
            `${BUDGET_CATEGORY_LABELS[input.category as BudgetCategory]}剩余额度不足，本笔被拒绝`,
            HttpStatus.BAD_REQUEST,
            {
              category: input.category,
              label: BUDGET_CATEGORY_LABELS[input.category as BudgetCategory],
              amount,
              maxAmount: remaining / 100
            }
          );
        }

        const expense = await manager.save(
          manager.create(BudgetExpenseEntity, {
            requestId: input.requestId,
            tripId: input.tripId,
            category: input.category,
            amount,
            note: input.note?.slice(0, 160),
            memberId
          })
        );
        budget.spent = this.round2(Number(budget.spent) + amount);
        await manager.save(budget);

        return { success: true, duplicate: false, expense: this.serializeExpense(expense) };
      });
    } catch (error) {
      if (this.isDuplicateEntry(error)) {
        // 并发下唯一索引兜底：同一 requestId 只有一笔插入成功
        const winner = await this.expenses.findOneByOrFail({ requestId: input.requestId });
        this.assertExpenseMatches(winner, input);
        return this.duplicateExpenseResult(winner);
      }
      throw error;
    }
  }

  /** 发起人调拨分类剩余额度：调出后不得低于已用金额，其他分类余额互不挪用 */
  async transfer(input: TransferBudgetInput) {
    this.assertCategory(input.fromCategory, 'fromCategory');
    this.assertCategory(input.toCategory, 'toCategory');
    this.assertPositiveAmount(input.amount);
    this.assertRequestId(input.requestId);
    const operatorId = this.assertOperator(input.operatorId, 'operatorId');
    if (input.fromCategory === input.toCategory) {
      throw new AppException(ERROR_CODES.BUDGET_TRANSFER_INVALID, '调出分类与调入分类不能相同');
    }
    await this.assertTripOwner(input.tripId, operatorId);

    const duplicated = await this.transfers.findOne({ where: { requestId: input.requestId } });
    if (duplicated) {
      this.assertTransferMatches(duplicated, input);
      return { success: true, duplicate: true, transfer: this.serializeTransfer(duplicated) };
    }

    try {
      return await this.dataSource.transaction(async manager => {
        const repo = manager.getRepository(BudgetEntity);
        // 按分类名固定顺序加锁，避免并发调拨形成死锁
        const ordered = [input.fromCategory, input.toCategory].sort() as BudgetCategory[];
        const rows: BudgetEntity[] = [];
        for (const category of ordered) {
          rows.push(await this.lockCategoryBudget(manager, input.tripId, category));
        }
        const source = rows.find(row => row.category === input.fromCategory)!;
        const target = rows.find(row => row.category === input.toCategory)!;
        const amount = this.round2(input.amount);
        const sourceRemaining = this.toCents(Number(source.planned)) - this.toCents(Number(source.spent));

        if (this.toCents(amount) > sourceRemaining) {
          throw new AppException(
            ERROR_CODES.BUDGET_TRANSFER_EXCEEDED,
            `${BUDGET_CATEGORY_LABELS[input.fromCategory as BudgetCategory]}可调出的剩余额度不足`,
            HttpStatus.BAD_REQUEST,
            {
              fromCategory: input.fromCategory,
              label: BUDGET_CATEGORY_LABELS[input.fromCategory as BudgetCategory],
              amount,
              maxTransferable: sourceRemaining / 100
            }
          );
        }

        source.planned = this.round2(Number(source.planned) - amount);
        target.planned = this.round2(Number(target.planned) + amount);
        await manager.save([source, target]);

        const transfer = await manager.save(
          manager.create(BudgetTransferEntity, {
            requestId: input.requestId,
            tripId: input.tripId,
            fromCategory: input.fromCategory,
            toCategory: input.toCategory,
            amount,
            operatorId
          })
        );
        return { success: true, duplicate: false, transfer: this.serializeTransfer(transfer) };
      });
    } catch (error) {
      if (this.isDuplicateEntry(error)) {
        const winner = await this.transfers.findOneByOrFail({ requestId: input.requestId });
        this.assertTransferMatches(winner, input);
        return { success: true, duplicate: true, transfer: this.serializeTransfer(winner) };
      }
      throw error;
    }
  }

  private async assertTripOwner(tripId: number, operatorId: number) {
    const trip = await this.trips.findOneBy({ id: tripId });
    if (!trip) throw new AppException(ERROR_CODES.TRIP_NOT_FOUND, '行程不存在', HttpStatus.NOT_FOUND);
    if (Number(trip.ownerId) !== Number(operatorId)) {
      throw new AppException(ERROR_CODES.NOT_TRIP_OWNER, '只有行程发起人可以设置或调拨分类预算', HttpStatus.FORBIDDEN);
    }
    return trip;
  }

  private async lockCategoryBudget(manager: import('typeorm').EntityManager, tripId: number, category: string) {
    const budget = await manager
      .getRepository(BudgetEntity)
      .createQueryBuilder('b')
      .where('b.trip_id = :tripId AND b.category = :category', { tripId, category })
      .setLock('pessimistic_write')
      .getOne();
    if (!budget) {
      throw new AppException(
        ERROR_CODES.BUDGET_NOT_INITIALIZED,
        '分类预算尚未初始化，请发起人先设置各分类额度',
        HttpStatus.BAD_REQUEST,
        { category }
      );
    }
    return budget;
  }

  private duplicateExpenseResult(expense: BudgetExpenseEntity) {
    return { success: true, duplicate: true, expense: this.serializeExpense(expense) };
  }

  /** 同一 requestId 的请求内容必须与首次一致，否则按冲突拒绝，防止幂等键被挪用 */
  private assertExpenseMatches(expense: BudgetExpenseEntity, input: RegisterExpenseInput) {
    if (
      expense.tripId !== input.tripId ||
      expense.category !== input.category ||
      this.toCents(Number(expense.amount)) !== this.toCents(input.amount) ||
      Number(expense.memberId) !== Number(input.memberId)
    ) {
      throw new AppException(
        ERROR_CODES.BUDGET_REQUEST_CONFLICT,
        'requestId 已被其他费用登记占用，请更换后重试',
        HttpStatus.CONFLICT
      );
    }
  }

  private assertTransferMatches(transfer: BudgetTransferEntity, input: TransferBudgetInput) {
    if (
      transfer.tripId !== input.tripId ||
      transfer.fromCategory !== input.fromCategory ||
      transfer.toCategory !== input.toCategory ||
      this.toCents(Number(transfer.amount)) !== this.toCents(input.amount)
    ) {
      throw new AppException(
        ERROR_CODES.BUDGET_REQUEST_CONFLICT,
        'requestId 已被其他额度调拨占用，请更换后重试',
        HttpStatus.CONFLICT
      );
    }
  }

  private serializeExpense(expense: BudgetExpenseEntity) {
    return {
      id: expense.id,
      requestId: expense.requestId,
      tripId: expense.tripId,
      category: expense.category,
      label: BUDGET_CATEGORY_LABELS[expense.category as BudgetCategory],
      amount: Number(expense.amount),
      note: expense.note ?? null,
      memberId: expense.memberId,
      createdAt: expense.createdAt
    };
  }

  private serializeTransfer(transfer: BudgetTransferEntity) {
    return {
      id: transfer.id,
      requestId: transfer.requestId,
      tripId: transfer.tripId,
      fromCategory: transfer.fromCategory,
      toCategory: transfer.toCategory,
      fromLabel: BUDGET_CATEGORY_LABELS[transfer.fromCategory as BudgetCategory],
      toLabel: BUDGET_CATEGORY_LABELS[transfer.toCategory as BudgetCategory],
      amount: Number(transfer.amount),
      operatorId: transfer.operatorId,
      createdAt: transfer.createdAt
    };
  }

  private assertCategory(category: string, field = 'category') {
    if (!BUDGET_CATEGORIES.includes(category as BudgetCategory)) {
      throw new AppException(ERROR_CODES.BUDGET_CATEGORY_INVALID, `参数 ${field} 不是有效的预算分类：${category}`);
    }
  }

  private assertPositiveAmount(amount: number) {
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
      throw new AppException(ERROR_CODES.BUDGET_AMOUNT_INVALID, '金额必须是大于 0 的数字');
    }
  }

  private assertRequestId(requestId: string) {
    if (typeof requestId !== 'string' || requestId.trim().length === 0) {
      throw new AppException(ERROR_CODES.BUDGET_REQUEST_ID_REQUIRED, 'requestId 不能为空，用于保证操作只生效一次');
    }
  }

  private assertOperator(operatorId: number, field: string) {
    const id = Number(operatorId);
    if (!Number.isInteger(id) || id <= 0) {
      throw new AppException(ERROR_CODES.VALIDATION_FAILED, `参数 ${field} 无效，请先登录或传入有效的成员 ID`);
    }
    return id;
  }

  private isDuplicateEntry(error: unknown) {
    return typeof error === 'object' && error !== null && (error as { errno?: number; code?: string }).errno === DUPLICATE_ENTRY_ERRNO;
  }

  /** 以分为单位做整数比较，规避浮点误差 */
  private toCents(value: number) {
    return Math.round(Number(value) * 100);
  }

  private round2(value: number) {
    return Math.round(Number(value) * 100) / 100;
  }
}
