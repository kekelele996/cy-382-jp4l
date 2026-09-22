import { api } from '../api';
import type { BudgetActionResult, BudgetCategoryCode, BudgetSummary } from '../types/budget';

function newRequestId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `req-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function fetchBudget(tripId: number) {
  return api<BudgetSummary>(`/trips/${tripId}/budget`);
}

export function setupBudget(tripId: number, quotas: Record<BudgetCategoryCode, number>, operatorId: number) {
  return api<BudgetSummary>(`/trips/${tripId}/budget`, {
    method: 'PUT',
    body: JSON.stringify({ quotas, operatorId })
  });
}

export function registerExpense(
  tripId: number,
  payload: { category: BudgetCategoryCode; amount: number; note?: string; memberId: number },
  requestId = newRequestId()
) {
  return api<BudgetActionResult>(`/trips/${tripId}/budget/expenses`, {
    method: 'POST',
    body: JSON.stringify({ ...payload, requestId })
  });
}

export function transferBudget(
  tripId: number,
  payload: { fromCategory: BudgetCategoryCode; toCategory: BudgetCategoryCode; amount: number; operatorId: number },
  requestId = newRequestId()
) {
  return api<BudgetActionResult>(`/trips/${tripId}/budget/transfers`, {
    method: 'POST',
    body: JSON.stringify({ ...payload, requestId })
  });
}

export { newRequestId };
