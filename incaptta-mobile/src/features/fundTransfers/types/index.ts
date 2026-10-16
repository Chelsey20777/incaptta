import type { FirestoreDocument, ApprovalStatus, AccountType } from '@/types'

export interface FundTransfer extends FirestoreDocument {
  transferNumber: string
  fromAccountId: string
  fromAccountName: string
  fromAccountType: AccountType
  toAccountId: string
  toAccountName: string
  toAccountType: AccountType
  amount: number
  description?: string
  date: Date
  approvalStatus?: ApprovalStatus
  submittedAt?: Date
  submittedBy?: string
  reviewedAt?: Date
  reviewedBy?: string
  approvedAt?: Date
  approvedBy?: string
  rejectionReason?: string
  status: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'COMPLETED'
}

export interface AccountBalance extends FirestoreDocument {
  accountId: string
  accountName: string
  accountType: AccountType
  balance: number
  lastUpdated: Date
}
