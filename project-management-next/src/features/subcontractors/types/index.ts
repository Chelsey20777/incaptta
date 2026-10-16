import type { Timestamp } from 'firebase/firestore'

export type SubcontractorStatus = 'ACTIVE' | 'INACTIVE'

export type SubcontractorPaymentTerms = 'COD' | 'NET30' | 'NET60' | 'NET90'

export type SubcontractorTransactionType = 'CHARGE' | 'PAYMENT' | 'ADJUSTMENT'

export type SubcontractorJobStatus = 'DRAFT' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED'

export type SubcontractorJobPaymentApproval =
  | 'PENDING'
  | 'APPROVED_ACCOUNTANT'
  | 'APPROVED_MANAGER'
  | 'REJECTED'

export type SubcontractorPaymentKind = 'SCN' | 'DIRECT'

export type SubcontractorApprovalActor = string | {
  uid: string
  displayName: string
  email?: string | null
  actorType?: 'USER' | 'SYSTEM_ROBOT'
  actionType?: string
}

export interface Subcontractor {
  id: string
  name: string
  contactPerson: string
  email: string
  phone: string
  address: string
  trade: string
  paymentTerms: SubcontractorPaymentTerms
  bankDetails: string
  status: SubcontractorStatus
  notes: string
  createdBy: string
  createdAt: Timestamp
  updatedAt: Timestamp
}

export interface SubcontractorTransaction {
  id: string
  subcontractorId: string
  subcontractorName: string
  type: SubcontractorTransactionType
  amount: number
  description: string
  jobCardId?: string | null
  jobCardNumber?: string | null
  sourceItemId?: string | null
  subcontractorJobId?: string | null
  contractNumber?: string | null
  opexId?: string | null
  paymentMethod?: string | null
  paymentRef?: string | null
  attachmentUrls?: string[]
  voided?: boolean
  createdBy: string
  createdByName?: string
  createdAt: Timestamp | string
}

/** SCN contract created in the Subcontractors module, optionally linked to a job card. */
export interface SubcontractorJob {
  id: string
  contractNumber: string
  subcontractorId: string
  subcontractorName: string
  description: string
  contractValue: number
  status: SubcontractorJobStatus
  jobCardId?: string | null
  jobCardNumber?: string | null
  transactionChargeId?: string | null
  paidApprovedTotal?: number
  /** Contract documents / PDFs attached to this SCN */
  attachmentUrls?: string[]
  createdBy: string
  createdByName?: string
  createdAt: Timestamp | string
  updatedAt: Timestamp | string
  completedAt?: Timestamp | string | null
}

/** Partial payment against an SCN or direct profile payment; OPEX posts only on manager approval. */
export interface SubcontractorJobPayment {
  id: string
  paymentKind?: SubcontractorPaymentKind
  subcontractorJobId?: string | null
  contractNumber?: string | null
  subcontractorId: string
  subcontractorName: string
  amount: number
  paymentMethod: string
  paymentRef?: string
  description: string
  attachmentUrls?: string[]
  approvalStatus: SubcontractorJobPaymentApproval
  accountantApprovedAt?: string
  accountantApprovedBy?: SubcontractorApprovalActor
  approvedAt?: string
  approvedBy?: SubcontractorApprovalActor
  managerApprovedAt?: string
  managerApprovedBy?: SubcontractorApprovalActor
  opexId?: string | null
  transactionPaymentId?: string | null
  jobCardId?: string | null
  jobCardNumber?: string | null
  createdBy: string
  createdByName?: string
  createdAt: Timestamp | string
}

/**
 * Job-card projection of subcontract work.
 * New rows should be SCN links (`isScnLink` / `subcontractorJobId`).
 * Legacy free-form qty×price rows remain supported read-only.
 */
export interface SubcontractWork {
  id: string
  subcontractorId: string
  subcontractorName: string
  description: string
  quantity: number
  unitPrice: number
  totalAmount: number
  paymentMethod: string
  paymentRef: string
  attachmentUrl: string | null
  attachmentUrls: string[]
  createdAt: string
  approvalStatus?: string
  approvedAt?: string
  approvedBy?: string
  accountantApprovedAt?: string
  accountantApprovedBy?: string
  isLockedAgainstPdf?: boolean
  isAdjustment?: boolean
  transactionChargeId?: string
  opexId?: string
  transactionPaymentId?: string
  /** SCN link fields */
  isScnLink?: boolean
  subcontractorJobId?: string
  contractNumber?: string
  contractValue?: number
  paidApprovedTotal?: number
  scnStatus?: SubcontractorJobStatus
}
