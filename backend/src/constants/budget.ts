export enum BudgetCategory {
  Transport = 'transport',
  Lodging = 'lodging',
  Food = 'food',
  Tickets = 'tickets'
}

export const BUDGET_CATEGORY_LABELS: Record<BudgetCategory, string> = {
  [BudgetCategory.Transport]: '交通',
  [BudgetCategory.Lodging]: '住宿',
  [BudgetCategory.Food]: '餐饮',
  [BudgetCategory.Tickets]: '门票'
};

export const BUDGET_CATEGORIES: BudgetCategory[] = [
  BudgetCategory.Transport,
  BudgetCategory.Lodging,
  BudgetCategory.Food,
  BudgetCategory.Tickets
];
