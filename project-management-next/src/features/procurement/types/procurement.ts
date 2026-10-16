import type { ProcurementType, ProcurementLineItem } from './index'

export type POStatus =
  | 'DRAFT'
  | 'SENT'
  | 'ACKNOWLEDGED'
  | 'PARTIALLY_FULFILLED'
  | 'COMPLETE'
  | 'CANCELLED'

export interface PurchaseOrder {
  id: string
  poNumber: string
  prId: string
  prNumber: string
  supplierId: string
  supplierName: string
  supplierEmail: string
  supplierPhone: string
  paymentTerms: string
  items: ProcurementLineItem[]
  totalOrderValue: number
  status: POStatus
  procurementType: ProcurementType
  department: string
  jobCardId: string | null
  jobCardTitle: string | null
  deliveryAddress: string
  expectedDeliveryDate: string | null
  notes: string
  sentAt: any | null
  acknowledgedAt: any | null
  jobCardLinkedPoWritten?: boolean
  createdBy: string
  createdAt: any
  updatedAt: any
}

export type GRNStatus =
  | 'DRAFT'
  | 'CONFIRMED'
  | 'DISPUTED'

export interface GRNLineItem {
  lineItemId: string
  sku: string | null
  description: string
  uom: string
  inventoryItemId: string | null
  inventoryItemStatus: 'EXISTING' | 'NEW_PENDING' | 'ADHOC'
  qtyOrdered: number
  qtyReceived: number
  qtyVariance: number
  unitCostPrice: number
  notes: string
}

export interface GoodsReceiptNote {
  id: string
  grnNumber: string
  poId: string
  poNumber: string
  prId: string
  prNumber: string
  supplierId: string
  supplierName: string
  department: string
  procurementType: ProcurementType
  jobCardId: string | null
  items: GRNLineItem[]
  status: GRNStatus
  hasVariance: boolean
  disputeReason: string | null
  receivedBy: string
  receivedAt: any | null
  inventoryPostingStatus:
    | 'PENDING'
    | 'PROCESSING'
    | 'COMPLETE'
    | 'FAILED'
  inventoryPostingError: string | null
  linkedInvoiceId?: string | null
  createdBy: string
  createdAt: any
  updatedAt: any
  notes?: string | null
}

export type InvoiceStatus =
  | 'DRAFT'
  | 'PENDING_MATCH'
  | 'MATCHED'
  | 'VARIANCE_FLAGGED'
  | 'APPROVED'
  | 'PAYMENT_PENDING'
  | 'PAYMENT_PROCESSED'
  | 'DISPUTED'

export type MatchStatus =
  | 'PENDING'
  | 'MATCHED'
  | 'VARIANCE_WITHIN_THRESHOLD'
  | 'VARIANCE_EXCEEDED'
  | 'OVERRIDE_APPROVED'

export interface InvoiceLineItem {
  description: string
  qty: number
  unitCost: number
  totalCost: number
}

export interface SupplierInvoice {
  id: string
  invoiceNumber: string
  poId: string
  poNumber: string
  grnId: string
  grnNumber: string
  prId: string
  prNumber: string
  supplierId: string
  supplierName: string
  supplierEmail: string
  department: string
  currency: 'USD' | 'ZWL' | 'ZAR'
  invoiceDate: string
  dueDate: string
  items: InvoiceLineItem[]
  subtotal: number
  tax: number
  totalAmount: number
  expectedAmount: number
  matchVariance: number
  matchVariancePercent: number
  matchStatus: MatchStatus
  matchOverrideReason: string | null
  matchOverrideBy: string | null
  matchOverrideAt: any | null
  status: InvoiceStatus
  notes: string
  attachmentUrl: string | null
  operationalExpenseId: string | null
  paymentMethod: string | null
  paymentReference: string | null
  paymentProcessedAt: any | null
  createdBy: string
  createdAt: any
  updatedAt: any
}