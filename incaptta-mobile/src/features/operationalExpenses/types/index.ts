import type { FirestoreDocument, ApprovalStatus } from '@/types'

export interface OperationalExpense extends FirestoreDocument {
  expenseNumber: string
  title: string
  description: string
  category: string
  amount: number
  items?: Array<{
    description: string
    quantity: number
    estCost: number
  }>
  paymentMethod?: string
  pettyCashAccount?: string
  department?: string
  requestType?: string
  beneficiary?: string
  accountNo?: string
  attachmentUrl?: string
  attachmentUrls?: string[]
  receiptUrl?: string // Legacy
  status: 'DRAFT' | 'SUBMITTED' | 'PENDING_ACCOUNTANT' | 'APPROVED_ACCOUNTANT' | 'PENDING_MANAGER' | 'APPROVED' | 'APPROVED_FOR_PAYMENT' | 'PAYMENT_PROCESSED' | 'REJECTED'
  rejectionReason?: string
}

export interface OpexFormData {
  title: string
  description: string
  category: string
  amount: number
  date: string
  receiptUrl?: string
  attachmentUrl?: string
  attachmentUrls?: string[]
}
