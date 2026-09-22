export type BudgetCategoryCode = 'transport' | 'lodging' | 'food' | 'tickets';

export interface BudgetCategoryView {
  category: BudgetCategoryCode;
  label: string;
  planned: number;
  spent: number;
  remaining: number;
}

export interface BudgetSummary {
  tripId: number;
  totalBudget: number | null;
  categories: BudgetCategoryView[];
  totalPlanned: number;
  totalSpent: number;
  totalRemaining: number;
  initialized: boolean;
}

export interface BudgetActionResult {
  success: boolean;
  duplicate?: boolean;
}
