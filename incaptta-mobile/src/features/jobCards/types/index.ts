import type { FirestoreDocument, ApprovalStatus } from '@/types'
import type { RequisitionItem, AdHocExpense, InventoryReturn, StaffRate, FinancialSummary } from '@/utils/financialEngine'

export interface JobCard extends FirestoreDocument {
  // Job card workflow status
  status: 'DRAFT' | 'SUBMITTED' | 'APPROVAL_PENDING_ACCOUNTANT' | 'APPROVAL_PENDING_MANAGER' | 'APPROVED_MANAGER' | 'APPROVED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'REJECTED'

  generalInfo: {
    jobNumber: string
    jobTitle: string
    recipientName: string
    recipientAddress?: string
    recipientPhone?: string
    projectDescription?: string
    requestingDepartmentId?: string
    jobCategoryId?: string
    projectLocation?: string
    dimensionsOfStructure?: string
    startDate?: string
    priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'
  }

  // Legacy/Top-level (Keep for compatibility during transition if needed)
  jobNumber?: string
  customerName?: string
  jobTitle?: string
  description?: string
  department?: string
  priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'

  // Approval timeline
  approvalTimeline?: Array<{
    user: string
    role?: string
    status: string
    comment?: string
    date: string
  }>
  
  // Financial data
  requisitionSections: { title: string; items?: RequisitionItem[] }[]
  adHocExpenses: AdHocExpense[]
  inventoryReturns: InventoryReturn[]
  staffRates?: StaffRate[]
  financialSummary?: FinancialSummary
  commissionPercentage?: number
  
  // Site information
  siteAddress?: string
  sitePhotos?: string[]
  
  // Totals (New Schema)
  totals?: {
    inventoryIRDTotal: number
    inventoryMUTotal: number
    adHocTotal: number
    staffRatesTotal: number
    implementationCost: number
    grandTotal: number
  }
}

export interface JobCardFormData {
  customerName: string
  customerAddress?: string
  customerPhone?: string
  jobTitle: string
  description: string
  startDate?: string
  endDate?: string
  assignedTo?: string[]
  department: string
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'
  siteAddress?: string
}
