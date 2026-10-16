export interface BomRequisitionItem {
  id: string
  inventoryItemId: string
  itemName: string
  description: string
  qtyRequired: number
  irdSellingPrice: number
  markupPercent: number
  uom?: string
  priceOverride?: boolean
  costSnapshot?: number
  approvalStatus?: string
  approvedAt?: string
  inventoryDeducted?: boolean
  postingState?: 'POSTED' | 'FAILED'
  postingLedgerId?: string
  postingError?: string | null
}

export interface BulkInventoryApprovalFailure {
  lineId: string
  itemName: string
  reason: string
}

export interface BulkInventoryApprovalResult {
  eligible: number
  approved: number
  alreadyPosted: number
  failed: BulkInventoryApprovalFailure[]
}

export interface BomRequisitionSection {
  id: string
  jobCategoryId: string
  description: string
  qty?: number
  unit?: string
  items: BomRequisitionItem[]
}

export interface UnmatchedBomItem {
  templateName: string
  qty: number
}

export interface ApplyTemplateResult {
  sections: BomRequisitionSection[]
  unmatchedItems: UnmatchedBomItem[]
  matchedCount: number
  totalCount: number
}

export interface StaffRate {
  /** Explicit service month, YYYY-MM; independent of approval date. */
  earningPeriod?: string
  id: string
  employeeId: string
  /** Denormalized display name — kept in sync when an employee is selected. */
  employeeName?: string
  jobRateAmount: number
  paymentMethod?: string
  approvalStatus?: string
  approvedAt?: string
  approvedBy?: string
  accountantApprovedAt?: string
  accountantApprovedBy?: string
  /** True once the amount has been posted to payroll (idempotency guard). */
  payrollPosted?: boolean
  payrollPostedAt?: string
  createdAt?: string
}

export interface JobInfo {
  jobCardTitle: string
  projectDescription: string
  requestingDepartmentId: string
  jobCategoryId: string
  jobNumber: string
  projectLocation: string
  dimensionsOfStructure: string
  startDate: string
  recipientName: string
  customerId?: string
  recipientAddress: string
  recipientPhone: string
  linkedCrmId?: string
  linkedCrmType?: 'QUOTE' | 'INVOICE' | ''
  linkedCrmNumber?: string
  linkedCrmTotal?: number
  lockedTotalInvoiceValue?: number
}

export interface Referrer {
  id: string
  name: string
  amount: number
  paymentMethod: 'CASH' | 'ECOCASH' | 'BANK' | 'RESERVE'
  approvalStatus: string
  createdAt: string
  approvedAt?: string | null
  approvedBy?: string | null
  accountantApprovedAt?: string | null
  accountantApprovedBy?: string | null
  attachments?: { name: string; url: string; uploadedAt?: string }[]
  proofUrl?: string | null
  proofName?: string | null
  reservePostingId?: string | null
  postingAudit?: {
    account: 'RESERVE'
    amount: number
    balanceBefore: number
    balanceAfter: number
    actor: { uid: string; displayName: string; email: string | null }
    approvedAt: string
  }
}

export interface AdHocExpense {
  id: string
  description: string
  recipientName: string
  recipientPhone: string
  quantity: number
  unitPrice: number
  paymentMethod: string
  paymentRef: string
  totalAmount: number
  attachmentUrl: string | null
  attachmentUrls: string[]
  createdAt: string
  approvalStatus?: string
  approvedAt?: string
  isLockedAgainstPdf?: boolean
  /** Linked operationalExpenses doc id after first successful post (idempotency). */
  opexId?: string | null
  /** Finalized automatically under the job-card accountant-only threshold. */
  autoApproved?: boolean
}

export type { SubcontractWork } from '@/features/subcontractors/types'

export interface TotalsSummary {
  inventoryIRDTotal: number
  inventoryMUTotal: number
  inventoryGrandTotal: number
  adHocTotal: number
  staffRatesTotal: number
  subcontractWorksTotal: number
  implementationCost: number
  expensesByMethod: { CASH: number; ECOCASH: number; BANK: number }
  overallGrandTotal: number
}
