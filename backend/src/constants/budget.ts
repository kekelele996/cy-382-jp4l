export enum BudgetCategory {
  Transport = 'TRANSPORT',
  Lodging = 'LODGING',
  Food = 'FOOD',
  Ticket = 'TICKET'
}

export const BUDGET_CATEGORY_LABELS: Record<BudgetCategory, string> = {
  [BudgetCategory.Transport]: '交通',
  [BudgetCategory.Lodging]: '住宿',
  [BudgetCategory.Food]: '餐饮',
  [BudgetCategory.Ticket]: '门票'
};

export const BUDGET_CATEGORIES = Object.values(BudgetCategory);

export const IDEMPOTENCY_KEY_MAX_LENGTH = 64;
