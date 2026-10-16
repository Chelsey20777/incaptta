import type { FirestoreDocument, ApprovalStatus } from '@/types'

export interface ProcurementRequisition extends FirestoreDocument {
  requisitionNumber: string
  requestedBy: string
  requestedByName: string
  department: string
  date: Date
  requiredDate: Date
  items: RequisitionItem[]
  totalEstimatedCost: number
  reason: string
  approvalStatus?: ApprovalStatus
  submittedAt?: Date
  submittedBy?: string
  reviewedAt?: Date
  reviewedBy?: string
  approvedAt?: Date
  approvedBy?: string
  rejectionReason?: string
  status: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'ORDERED' | 'RECEIVED'
}

export interface RequisitionItem {
  inventoryItemId?: string
  itemName: string
  description?: string
  quantity: number
  unit: string
  estimatedUnitCost: number
  totalCost: number
}

export interface PurchaseOrder extends FirestoreDocument {
  orderNumber: string
  requisitionId?: string
  supplier: string
  date: Date
  expectedDeliveryDate: Date
  items: PurchaseOrderItem[]
  totalCost: number
  status: 'DRAFT' | 'SENT' | 'PARTIAL' | 'RECEIVED' | 'CANCELLED'
}

export interface PurchaseOrderItem {
  itemName: string
  quantity: number
  unit: string
  unitCost: number
  totalCost: number
}
