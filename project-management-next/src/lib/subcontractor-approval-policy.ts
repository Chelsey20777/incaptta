import { ExpenseCategory } from '@/lib/types-finance'

export const OPEX_AUTO_APPROVE_THRESHOLD = 300

export interface SubcontractorExpenseLike {
  category?: string | null
  subcontractorId?: string | null
}

export function isSubcontractorExpense(expense: SubcontractorExpenseLike): boolean {
  if (expense.subcontractorId) return true
  return expense.category === ExpenseCategory.SUBCONTRACTOR_EXPENSE
    || expense.category === 'Subcontractor Expense'
}

export function canAutoApproveOpex(amount: number, expense: SubcontractorExpenseLike): boolean {
  return amount < OPEX_AUTO_APPROVE_THRESHOLD && !isSubcontractorExpense(expense)
}
