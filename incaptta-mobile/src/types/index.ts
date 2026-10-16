// Shared type definitions for InCaptta Mobile

export type UserRole = 
  | 'SUPER_ADMIN'
  | 'ADMIN'
  | 'MANAGER'
  | 'ACCOUNTANT'
  | 'SALES'
  | 'TECHNICAL'
  | 'STOREKEEPER'
  | 'DIRECTOR'

export interface User {
  uid: string
  email: string
  displayName?: string
  roles: UserRole[]
  isActive: boolean
}

export interface FirestoreDocument {
  id: string
  createdAt: Date
  updatedAt: Date
  createdBy: string
  updatedBy: string
}

// Approval workflow status
export type ApprovalStatus = 
  | 'SUBMITTED'
  | 'PENDING_ACCOUNTANT'
  | 'UNDER_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'COMPLETED'

export interface ApprovalWorkflow {
  status: ApprovalStatus
  submittedAt?: Date
  submittedBy?: string
  reviewedAt?: Date
  reviewedBy?: string
  approvedAt?: Date
  approvedBy?: string
  rejectionReason?: string
}

// Account types for finance
export type AccountType = 
  | 'BANK'
  | 'CASH'
  | 'ECOCASH'
  | 'IRD'

export interface Account {
  id: string
  name: string
  type: AccountType
  balance: number
  isActive: boolean
}
