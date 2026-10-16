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
  poNumber: string             // PO-2026-0001
  prId: string                 // source PR id
  prNumber: string             // denormalized
  supplierId: string
  supplierName: string
  supplierEmail: string        // for PDF send
  supplierPhone: string
  paymentTerms: string         // COD | NET30 | NET60 | NET90
  items: ProcurementLineItem[] // copied from approved PR
  totalOrderValue: number      // sum of all item totalCost
  status: POStatus
  procurementType: ProcurementType
  department: string
  jobCardId: string | null
  jobCardTitle: string | null
  deliveryAddress: string
  expectedDeliveryDate: string | null  // ISO date string
  notes: string
  sentAt: any | null           // Timestamp
  acknowledgedAt: any | null   // Timestamp
  jobCardLinkedPoWritten?: boolean  // flag to prevent re-runs
  createdBy: string            // uid
  createdAt: any               // Timestamp
  updatedAt: any               // Timestamp
}

export type GRNStatus =
  | 'DRAFT'
  | 'CONFIRMED'
  | 'DISPUTED'

export interface GRNLineItem {
  lineItemId: string           // ref to PO line item id
  sku: string | null
  description: string
  uom: string
  inventoryItemId: string | null
  inventoryItemStatus: 'EXISTING' | 'NEW_PENDING' | 'ADHOC'
  qtyOrdered: number           // from PO
  qtyReceived: number          // user enters this
  qtyVariance: number          // auto-calc: qtyReceived - qtyOrdered
  unitCostPrice: number        // from PO line item
  notes: string
}

export interface GoodsReceiptNote {
  id: string
  grnNumber: string            // GRN-2026-0001
  poId: string                 // source PO id
  poNumber: string             // denormalized
  prId: string                 // source PR id
  prNumber: string             // denormalized
  supplierId: string
  supplierName: string
  department: string
  procurementType: ProcurementType
  jobCardId: string | null
  items: GRNLineItem[]
  status: GRNStatus
  hasVariance: boolean         // true if any qtyVariance !== 0
  disputeReason: string | null // required if status: DISPUTED
  receivedBy: string           // uid
  receivedAt: any | null       // Timestamp — set on CONFIRMED
  inventoryPostingStatus:
    | 'PENDING'
    | 'PROCESSING'
    | 'COMPLETE'
    | 'FAILED'
  inventoryPostingError: string | null
  linkedInvoiceId?: string | null  // set after invoice created
  createdBy: string            // uid
  createdAt: any               // Timestamp
  updatedAt: any               // Timestamp
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
  totalCost: number            // qty × unitCost
}

export interface SupplierInvoice {
  id: string
  invoiceNumber: string        // supplier's own invoice ref
  poId: string                 // source PO
  poNumber: string             // denormalized
  grnId: string                // source GRN
  grnNumber: string            // denormalized
  prId: string                 // source PR
  prNumber: string             // denormalized
  supplierId: string
  supplierName: string
  supplierEmail: string
  department: string
  currency: 'USD' | 'ZWL' | 'ZAR'
  invoiceDate: string          // ISO date string
  dueDate: string              // ISO date string
  items: InvoiceLineItem[]
  subtotal: number
  tax: number                  // default 0
  totalAmount: number          // subtotal + tax

  // 3-way match fields
  expectedAmount: number       // from GRN confirmed qty × unit costs
  matchVariance: number        // totalAmount - expectedAmount
  matchVariancePercent: number // abs(matchVariance / expectedAmount × 100)
  matchStatus: MatchStatus
  matchOverrideReason: string | null  // required if OVERRIDE_APPROVED
  matchOverrideBy: string | null      // uid
  matchOverrideAt: any | null         // Timestamp

  // Workflow
  status: InvoiceStatus
  notes: string
  attachmentUrl: string | null // invoice scan upload

  // Payment linkage (set by Phase 8B)
  operationalExpenseId: string | null
  paymentMethod: string | null  // ECOCASH|BANK|CASH|IRD (uppercase)
  paymentReference: string | null
  paymentProcessedAt: any | null

  // Audit
  createdBy: string            // uid
  createdAt: any               // Timestamp
  updatedAt: any               // Timestamp
}
