export interface QuoteItem {
  id?: string
  inventoryItemId: string
  itemName: string
  description?: string
  qtyRequired: number
  irdSellingPrice: number
  markupPercent: number
  uom?: string
  priceOverride?: boolean
  /** Catalogue purchase price + freight, snapshotted when the line is picked. */
  costSnapshot?: number
  rowIRDTot?: number
  rowMUTot?: number
  rowGrandTot?: number
}

export interface QuoteRequisitionSection {
  id: string
  jobCategoryId: string
  description: string
  qty?: number
  unit?: string
  items: QuoteItem[]
}

export interface OtherService {
  id: string
  description: string
  qty: number
  price: number
  total: number
}

export interface QuoteInternalCosting {
  labourEstimate?: number
  transportEstimate?: number
  subcontractorEstimate?: number
  otherDeliveryEstimate?: number
  notes?: string
}

export interface QuoteSummary {
  totalIrdCost: number
  totalMarkup: number
  totalOtherServices: number
  subtotal: number
  discountType?: 'NONE' | 'PERCENT' | 'FLAT'
  discountValue?: number
  discountAmount?: number
  netSubtotal?: number
  vatRate: number
  vatAmount: number
  estimatedProfit?: number | null
  estimatedMargin?: number | null
}

export interface FirestoreQuote {
  id?: string
  quoteNumber: string
  customerId: string
  customerName: string
  customerEmail?: string
  dimensionsOfStructure?: string
  status: 'DRAFT' | 'SENT' | 'ACCEPTED' | 'REJECTED'
  reviewStatus?: 'DRAFT' | 'PENDING_MANAGER' | 'APPROVED_TO_SEND' | 'CHANGES_REQUIRED'
  internalCosting?: QuoteInternalCosting
  validUntil: string
  notes?: string
  billingTerms?: {
    arrangement?: 'FULL_UPFRONT' | 'DEPOSIT_BALANCE' | 'MILESTONES' | 'CREDIT'
    netDays?: number
    depositPercent?: number
  }
  leadId?: string
  leadName?: string
  linkedJobCardId?: string
  linkedJobNumber?: string
  linkedInvoiceId?: string
  requisitionSections: QuoteRequisitionSection[]
  items: Array<{
    inventoryItemId: string
    description: string
    qty: number
    price: number
    markupPercent: number
    total: number
  }>
  otherServices: OtherService[]
  summary: QuoteSummary
  grandTotal: number
  createdBy?: string
  createdByName?: string
  createdAt: any
  updatedAt: any
}

export interface CrmQuoteFormData {
  quoteNumber: string
  customerId: string
  customerName: string
  customerEmail: string
  dimensionsOfStructure: string
  status: 'DRAFT' | 'SENT' | 'ACCEPTED' | 'REJECTED'
  reviewStatus?: 'DRAFT' | 'PENDING_MANAGER' | 'APPROVED_TO_SEND' | 'CHANGES_REQUIRED'
  internalCosting?: QuoteInternalCosting
  validUntil: string
  notes: string
  billingTerms?: FirestoreQuote['billingTerms']
  requisitionSections: QuoteRequisitionSection[]
  otherServices: OtherService[]
  discountType?: 'NONE' | 'PERCENT' | 'FLAT'
  discountValue?: number
  leadId?: string
  leadName?: string
  linkedJobCardId?: string
  linkedJobNumber?: string
}

export interface LeadJourney {
  leadId: string
  leadName: string
  linkedQuoteId?: string
  linkedQuoteNumber?: string
  linkedQuoteStatus?: 'DRAFT' | 'SENT' | 'ACCEPTED' | 'REJECTED'
  linkedQuoteTotal?: number
  linkedJobCardId?: string
  linkedJobNumber?: string
  linkedJobStatus?: string
  paymentTotal?: number
  paymentPaid?: number
  jobComplete?: boolean
}
