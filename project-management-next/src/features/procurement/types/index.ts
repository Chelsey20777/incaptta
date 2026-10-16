import { Timestamp } from 'firebase/firestore'
export type { POStatus, PurchaseOrder } from './procurement'

export type ProcurementType = 
  'PROJECT_MATERIAL' | 'INVENTORY' | 'CAPEX' | 'SERVICE' | 'ADHOC'

export type PRStatus = 
  'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED'

export type SupplierStatus = 'ACTIVE' | 'INACTIVE'

export type PaymentTerms = 'COD' | 'NET30' | 'NET60' | 'NET90'

export type InventoryItemStatus = 'EXISTING' | 'NEW_PENDING' | 'ADHOC'

export interface ProcurementLineItem {
  id: string
  description: string
  uom: string
  qty: number
  unitCostPrice: number
  freightDuty: number
  totalCost: number
  markupPercent: number
  sellingPrice: number
  marginAmount: number
  inventoryItemId: string | null
  sku: string | null
  isAdHoc: boolean
  inventoryItemStatus: InventoryItemStatus
  newItemData?: NewItemData | null
  notes: string
}

export interface Supplier {
  id: string
  name: string
  contactPerson: string
  email: string
  phone: string
  address: string
  paymentTerms: PaymentTerms
  categories: string[]
  status: SupplierStatus
  notes: string
  createdBy: string
  createdAt: Timestamp
  updatedAt: Timestamp
}

export interface ProcurementRequisition {
  id: string
  prNumber: string
  title: string
  description: string
  procurementType: ProcurementType
  department: string
  jobCardId: string | null
  jobCardTitle: string | null
  supplierId: string | null
  supplierName: string | null
  items: ProcurementLineItem[]
  totalEstimatedCost: number
  status: PRStatus
  rejectionReason: string | null
  requestedBy: string
  requestedByName: string
  approvedBy: string | null
  approvedAt: Timestamp | null
  rejectedBy: string | null
  rejectedAt: Timestamp | null
  createdAt: Timestamp
  updatedAt: Timestamp
  linkedPoId?: string | null
}

export interface NewItemData {
  name: string
  sku: string
  uom: string
  categoryId: string
  categoryName: string
  purchasePrice: number
  freightDuty: number
  markupPercent: number
  reorderLevel: number
  location: string
}