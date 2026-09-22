export const BUDGET_CATEGORY_OPTIONS = [
  { value: 'TRANSPORT', label: '交通' },
  { value: 'LODGING', label: '住宿' },
  { value: 'FOOD', label: '餐饮' },
  { value: 'TICKET', label: '门票' }
];

export interface BudgetCategoryView {
  category: string;
  label: string;
  quota: number;
  used: number;
  remaining: number;
}

export interface ExpenseView {
  id: number;
  category: string;
  label: string;
  amount: number;
  note: string | null;
  memberName: string;
  createdAt: string;
}

export interface TransferView {
  id: number;
  fromCategory: string;
  fromLabel: string;
  toCategory: string;
  toLabel: string;
  amount: number;
  createdAt: string;
}

export interface BudgetOverview {
  tripId: number;
  destination: string;
  totalBudget: number;
  allocated: number;
  unallocated: number;
  totalUsed: number;
  totalRemaining: number;
  categories: BudgetCategoryView[];
  expenses: ExpenseView[];
  transfers: TransferView[];
}

export interface TripOption {
  id: number;
  ownerId: number;
  destination: string;
  departDate: string;
  budgetMax?: number | null;
}
