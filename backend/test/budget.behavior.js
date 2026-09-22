/* eslint-disable */
// 行为级验证：内存模拟 TypeORM 事务 / FOR UPDATE 行锁 / request_id 唯一索引
const assert = require('assert');

class DuplicateError extends Error {
  constructor() {
    super('ER_DUP_ENTRY');
    this.errno = 1062;
  }
}

function createStore() {
  return {
    trips: new Map([
      [1, { id: 1, ownerId: 1, destination: '大理', budgetMax: 1000 }],
      [2, { id: 2, ownerId: 1, destination: '无上限行程', budgetMax: null }]
    ]),
    budgets: new Map(), // key: tripId:category -> row
    expenses: new Map(), // requestId -> row
    transfers: new Map(),
    expenseSeq: 0,
    transferSeq: 0
  };
}

function createHarness(store) {
  const key = (tripId, category) => `${tripId}:${category}`;

  const budgetRepo = {
    find: ({ where }) =>
      Array.from(store.budgets.values())
        .filter(r => r.tripId === where.tripId)
        .sort((a, b) => a.category.localeCompare(b.category)),
    createQueryBuilder() {
      return {
        where(_clause, params) { this.params = params; return this; },
        orderBy() { return this; },
        setLock() { this.locked = true; return this; },
        async getMany() {
          return Array.from(store.budgets.values()).filter(r => r.tripId === this.params.tripId);
        },
        async getOne() {
          return store.budgets.get(key(this.params.tripId, this.params.category)) ?? null;
        }
      };
    }
  };

  const makeManager = () => ({
    getRepository: () => budgetRepo,
    create: (Entity, data) => ({ ...data }),
    save: async (rowOrRows) => {
      const rows = Array.isArray(rowOrRows) ? rowOrRows : [rowOrRows];
      for (const row of rows) {
        if (row.requestId && store.expenses.has(row.requestId)) throw new DuplicateError();
        if (row.requestId && store.transfers.has(row.requestId)) throw new DuplicateError();
        if (row.category !== undefined && 'planned' in row && !row.id) {
          // budget row
        }
      }
      return persist(rows, rowOrRows);
    }
  });

  function persist(rows, original) {
    const saved = [];
    for (const row of rows) {
      if ('planned' in row && 'spent' in row && !('memberId' in row) && !('operatorId' in row)) {
        const k = key(row.tripId, row.category);
        const existing = store.budgets.get(k);
        const merged = existing ? { ...existing, ...row } : { id: existing?.id ?? store.budgets.size + 1, ...row };
        store.budgets.set(k, merged);
        saved.push(merged);
      } else if ('memberId' in row) {
        if (store.expenses.has(row.requestId)) throw new DuplicateError();
        const e = { id: ++store.expenseSeq, createdAt: new Date(), note: null, ...row };
        store.expenses.set(row.requestId, e);
        saved.push(e);
      } else if ('operatorId' in row) {
        if (store.transfers.has(row.requestId)) throw new DuplicateError();
        const t = { id: ++store.transferSeq, createdAt: new Date(), ...row };
        store.transfers.set(row.requestId, t);
        saved.push(t);
      }
    }
    return Array.isArray(original) ? saved : saved[0];
  }

  const expenseRepo = {
    findOne: async ({ where }) => (where.requestId ? store.expenses.get(where.requestId) ?? null : null),
    findOneByOrFail: async ({ requestId }) => store.expenses.get(requestId)
  };
  const transferRepo = {
    findOne: async ({ where }) => (where.requestId ? store.transfers.get(where.requestId) ?? null : null),
    findOneByOrFail: async ({ requestId }) => store.transfers.get(requestId)
  };
  const tripRepo = {
    findOneBy: async ({ id }) => store.trips.get(id) ?? null
  };
  const dataSource = {
    async transaction(fn) {
      // 模拟单连接事务；行锁语义由同一事件循环串行 + 重复键错误共同保证
      return fn(makeManager());
    }
  };

  return { budgetRepo, expenseRepo, transferRepo, tripRepo, dataSource };
}

async function main() {
  const { BudgetService } = require('../dist/modules/budget/budget.service');
  const store = createStore();
  const h = createHarness(store);
  const service = new BudgetService(h.budgetRepo, h.expenseRepo, h.transferRepo, h.tripRepo, h.dataSource);

  // 1. 初始化分类额度，合计 900 <= 总预算 1000
  const s1 = await service.setup(1, { transport: 300, lodging: 400, food: 150, tickets: 50 }, 1);
  assert.strictEqual(s1.totalPlanned, 900);
  assert.strictEqual(s1.totalRemaining, 900);
  console.log('✓ 初始化分类额度，合计不超过总预算');

  // 2. 合计超总预算被拒绝
  await assert.rejects(
    () => service.setup(1, { transport: 400, lodging: 400, food: 150, tickets: 60 }, 1),
    err => err.code === 'BUDGET_TOTAL_EXCEEDED'
  );
  console.log('✓ 分类合计超过行程总预算被拒绝');

  // 3. 非发起人不能设置
  await assert.rejects(
    () => service.setup(1, { transport: 300, lodging: 400, food: 150, tickets: 50 }, 2),
    err => err.code === 'NOT_TRIP_OWNER'
  );
  console.log('✓ 非发起人设置额度被拒绝');

  // 4. 餐饮登记 100 成功，只扣餐饮
  await service.registerExpense({ tripId: 1, category: 'food', amount: 100, memberId: 9, requestId: 'r1' });
  const s2 = await service.getSummary(1);
  const food = s2.categories.find(c => c.category === 'food');
  assert.strictEqual(food.spent, 100);
  assert.strictEqual(food.remaining, 50);
  assert.strictEqual(s2.totalSpent, 100);
  console.log('✓ 费用只扣对应分类');

  // 5. 超额整笔拒绝，并返回可登记上限 50
  const caught = await service
    .registerExpense({ tripId: 1, category: 'food', amount: 80, memberId: 9, requestId: 'r2' })
    .then(() => null, e => e);
  assert.strictEqual(caught.code, 'BUDGET_QUOTA_EXCEEDED');
  assert.strictEqual(caught.getResponse().maxAmount, 50);
  const s3 = await service.getSummary(1);
  assert.strictEqual(s3.totalSpent, 100, '被拒绝的整笔不得入账');
  console.log('✓ 超额整笔拒绝且返回可登记上限 50');

  // 6. 其他分类余额不得挪用：餐饮仍剩余 50，不能花 50.01
  const caught2 = await service
    .registerExpense({ tripId: 1, category: 'food', amount: 50.01, memberId: 9, requestId: 'r3' })
    .then(() => null, e => e);
  assert.strictEqual(caught2.code, 'BUDGET_QUOTA_EXCEEDED');
  console.log('✓ 其他分类余额不可挪用');

  // 7. 重复 requestId（相同参数）只成功一次
  const rep = await service.registerExpense({ tripId: 1, category: 'food', amount: 100, memberId: 9, requestId: 'r1' });
  assert.strictEqual(rep.duplicate, true);
  assert.strictEqual(rep.expense.amount, 100, '重复请求返回首笔登记的内容（金额 100）');
  const s4 = await service.getSummary(1);
  assert.strictEqual(s4.totalSpent, 100, '重复提交不重复扣款');
  console.log('✓ 重复登记幂等，只生效一次');

  // 7b. 同一 requestId 参数不一致 -> 409 冲突
  await assert.rejects(
    () => service.registerExpense({ tripId: 1, category: 'food', amount: 50, memberId: 9, requestId: 'r1' }),
    err => err.code === 'BUDGET_REQUEST_CONFLICT'
  );
  console.log('✓ 幂等键参数不一致返回冲突');

  // 8. 无 requestId 被拒绝
  await assert.rejects(
    () => service.registerExpense({ tripId: 1, category: 'food', amount: 1, memberId: 9, requestId: '' }),
    err => err.code === 'BUDGET_REQUEST_ID_REQUIRED'
  );

  // 9. 非法分类 / 金额
  await assert.rejects(
    () => service.registerExpense({ tripId: 1, category: 'shopping', amount: 1, memberId: 9, requestId: 'r4' }),
    err => err.code === 'BUDGET_CATEGORY_INVALID'
  );
  await assert.rejects(
    () => service.registerExpense({ tripId: 1, category: 'food', amount: 0, memberId: 9, requestId: 'r5' }),
    err => err.code === 'BUDGET_AMOUNT_INVALID'
  );
  console.log('✓ 参数校验：分类 / 金额 / requestId');

  // 10. 调拨：交通 -> 餐饮 100，成功后交通 200，餐饮 planned 250（spent 150，剩 100）
  await service.transfer({ tripId: 1, fromCategory: 'transport', toCategory: 'food', amount: 100, operatorId: 1, requestId: 't1' });
  const s5 = await service.getSummary(1);
  assert.strictEqual(s5.categories.find(c => c.category === 'transport').planned, 200);
  assert.strictEqual(s5.categories.find(c => c.category === 'food').planned, 250);
  assert.strictEqual(s5.totalPlanned, 900, '调拨不改变合计');
  console.log('✓ 发起人调拨剩余额度，合计不变');

  // 11. 调出后不得低于已用金额：交通 spent=0，可调出 200；调 200.5 拒绝
  const tErr = await service
    .transfer({ tripId: 1, fromCategory: 'transport', toCategory: 'tickets', amount: 200.5, operatorId: 1, requestId: 't2' })
    .then(() => null, e => e);
  assert.strictEqual(tErr.code, 'BUDGET_TRANSFER_EXCEEDED');
  assert.strictEqual(tErr.getResponse().maxTransferable, 200);
  console.log('✓ 调出超过剩余额度被拒绝并返回可调拨上限');

  // 12. 调拨不能使调出分类额度低于已用：先让交通花费 180，再尝试调出 30（剩 20）
  await service.registerExpense({ tripId: 1, category: 'transport', amount: 180, memberId: 9, requestId: 'r6' });
  const tErr2 = await service
    .transfer({ tripId: 1, fromCategory: 'transport', toCategory: 'tickets', amount: 30, operatorId: 1, requestId: 't3' })
    .then(() => null, e => e);
  assert.strictEqual(tErr2.code, 'BUDGET_TRANSFER_EXCEEDED');
  assert.strictEqual(tErr2.getResponse().maxTransferable, 20, '调出后额度必须 >= 已用金额 180');
  console.log('✓ 调拨下限锁定为已用金额');

  // 13. 调拨幂等
  const trep = await service.transfer({ tripId: 1, fromCategory: 'transport', toCategory: 'food', amount: 100, operatorId: 1, requestId: 't1' });
  assert.strictEqual(trep.duplicate, true);
  const s6 = await service.getSummary(1);
  assert.strictEqual(s6.categories.find(c => c.category === 'transport').planned, 200);
  console.log('✓ 重复调拨幂等，只生效一次');

  // 14. 非发起人不能调拨
  await assert.rejects(
    () => service.transfer({ tripId: 1, fromCategory: 'transport', toCategory: 'food', amount: 10, operatorId: 2, requestId: 't4' }),
    err => err.code === 'NOT_TRIP_OWNER'
  );

  // 15. 不能在同分类间调拨
  await assert.rejects(
    () => service.transfer({ tripId: 1, fromCategory: 'food', toCategory: 'food', amount: 10, operatorId: 1, requestId: 't5' }),
    err => err.code === 'BUDGET_TRANSFER_INVALID'
  );
  console.log('✓ 调拨权限与同分类校验');

  // 16. 未初始化预算的行程登记被拒绝
  const initErr = await service
    .registerExpense({ tripId: 2, category: 'food', amount: 1, memberId: 1, requestId: 'x1' })
    .then(() => null, e => e);
  assert.strictEqual(initErr.code, 'BUDGET_NOT_INITIALIZED');
  console.log('✓ 未初始化分类预算时拒绝登记');

  // 17. 并发模拟：事务前预检未命中，但插入时 requestId 唯一索引冲突 -> 只成功一次
  const { BudgetService: BS } = require('../dist/modules/budget/budget.service');
  const store2 = createStore();
  const h2 = createHarness(store2);
  // 下一次事务前幂等查询故意"未命中"，模拟两个事务同时通过预检
  const rawFindOne = h2.expenseRepo.findOne;
  h2.expenseRepo.findOne = async (...args) => {
    h2.expenseRepo.findOne = rawFindOne;
    return null;
  };
  const svc2 = new BS(h2.budgetRepo, h2.expenseRepo, h2.transferRepo, h2.tripRepo, h2.dataSource);
  await svc2.setup(2, { transport: 100, lodging: 100, food: 100, tickets: 100 }, 1);
  // 另一事务已抢先插入同 requestId 的费用
  store2.expenses.set('c1', { id: 99, requestId: 'c1', tripId: 2, category: 'food', amount: 30, note: null, memberId: 1, createdAt: new Date() });
  const conc = await svc2.registerExpense({ tripId: 2, category: 'food', amount: 30, memberId: 1, requestId: 'c1' });
  assert.strictEqual(conc.duplicate, true);
  assert.strictEqual(conc.expense.id, 99);
  const sCon = await svc2.getSummary(2);
  assert.strictEqual(sCon.categories.find(c => c.category === 'food').spent, 0, '失败事务已回滚，未扣款');
  console.log('✓ 并发下唯一索引兜底，只成功一次');

  // 18. 浮点精度：连续登记 0.1 x 3 不产生 0.30000000000000004
  const store3 = createStore();
  const h3 = createHarness(store3);
  const svc3 = new BS(h3.budgetRepo, h3.expenseRepo, h3.transferRepo, h3.tripRepo, h3.dataSource);
  await svc3.setup(2, { transport: 1, lodging: 0, food: 1, tickets: 0 }, 1);
  for (let i = 0; i < 3; i++) {
    await svc3.registerExpense({ tripId: 2, category: 'food', amount: 0.1, memberId: 1, requestId: `f${i}` }).catch(() => {});
  }
  const s7 = await svc3.getSummary(2);
  assert.strictEqual(s7.categories.find(c => c.category === 'food').spent, 0.3);
  console.log('✓ 金额以分整数比较，无浮点误差');

  console.log('\n全部行为验证通过 ✅');
}

main().catch(e => {
  console.error('❌ 验证失败:', e);
  process.exit(1);
});
