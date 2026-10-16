export type QuoteCustomerStatus = 'DRAFT' | 'SENT' | 'ACCEPTED' | 'REJECTED'
export type QuoteReviewStatus = 'DRAFT' | 'PENDING_MANAGER' | 'APPROVED_TO_SEND' | 'CHANGES_REQUIRED'

export interface QuoteMaterialLine {
  id?: string
  qtyRequired?: number
  qty?: number
  irdSellingPrice?: number
  price?: number
  markupPercent?: number
  twidMarkupPercent?: number
  costSnapshot?: number
  inventoryItemId?: string
  rowGrandTot?: number
}

export interface QuoteServiceLine {
  qty?: number
  price?: number
  total?: number
}

export interface QuoteInternalCosting {
  labourEstimate?: number
  transportEstimate?: number
  subcontractorEstimate?: number
  otherDeliveryEstimate?: number
  notes?: string
}

const round2 = (value: number) => Number((value || 0).toFixed(2))

export function catalogueCostOf(data?: { totalCost?: number; purchasePrice?: number; freightDuty?: number } | null) {
  if (!data) return 0
  const total = Number(data.totalCost)
  if (Number.isFinite(total) && total > 0) return total
  return (Number(data.purchasePrice) || 0) + (Number(data.freightDuty) || 0)
}

/** Extended selling total for one material line. Quantity is the quantity sold. */
export function lineExtendedAmounts(item: QuoteMaterialLine) {
  const qty = Number(item.qtyRequired ?? item.qty) || 0
  const price = Number(item.irdSellingPrice ?? item.price) || 0
  const markup = Number(item.markupPercent ?? item.twidMarkupPercent) || 0
  const cost = Number(item.costSnapshot) || 0
  const baseIRD = round2(qty * price)
  const markupValue = round2(baseIRD * (markup / 100))
  const totalPrice = round2(baseIRD + markupValue)
  const purchaseCost = round2(qty * cost)
  return { qty, price, markup, cost, baseIRD, markupValue, totalPrice, purchaseCost }
}

export function sectionExtendedTotal(section: { items?: QuoteMaterialLine[] }) {
  return round2((section.items || []).reduce((sum, item) => sum + lineExtendedAmounts(item).totalPrice, 0))
}

export function stampMaterialLine<T extends QuoteMaterialLine>(item: T, catalogueCost = 0): T & {
  qty: number
  qtyRequired: number
  irdSellingPrice: number
  markupPercent: number
  twidMarkupPercent: number
  costSnapshot: number
  rowIRDTot: number
  rowMUTot: number
  rowGrandTot: number
} {
  const storedCost = Number(item.costSnapshot) || 0
  const costSnapshot = storedCost > 0 ? storedCost : (Number(catalogueCost) || 0)
  const amounts = lineExtendedAmounts({ ...item, costSnapshot })
  return {
    ...item,
    qty: amounts.qty,
    qtyRequired: amounts.qty,
    irdSellingPrice: amounts.price,
    markupPercent: amounts.markup,
    twidMarkupPercent: amounts.markup,
    costSnapshot,
    rowIRDTot: amounts.baseIRD,
    rowMUTot: amounts.markupValue,
    rowGrandTot: amounts.totalPrice,
  }
}

export function stampRequisitionSections<T extends { items?: QuoteMaterialLine[] }>(
  sections: T[],
  costById: Record<string, number> = {},
) {
  return (sections || []).map(section => ({
    ...section,
    items: (section.items || []).map(item => stampMaterialLine(
      item,
      item.inventoryItemId ? costById[item.inventoryItemId] : 0,
    )),
  }))
}

export function sectionsNeedCommercialStamp(
  sections: Array<{ items?: QuoteMaterialLine[] }> | undefined,
  costById: Record<string, number> = {},
) {
  return (sections || []).some(section => (section.items || []).some(item => {
    const amounts = lineExtendedAmounts(item)
    const catalogueCost = item.inventoryItemId ? Number(costById[item.inventoryItemId]) || 0 : 0
    const costMissing = amounts.cost <= 0 && catalogueCost > 0
    const totalMissing = amounts.totalPrice > 0 && Math.abs((Number(item.rowGrandTot) || 0) - amounts.totalPrice) > 0.009
    return costMissing || totalMissing
  }))
}

export type ClientDiscountType = 'NONE' | 'PERCENT' | 'FLAT'

export function resolveDocumentDiscount(
  subtotal: number,
  discount?: { type?: string | null; value?: number | null },
) {
  const base = round2(Math.max(0, Number(subtotal) || 0))
  const type = discount?.type === 'PERCENT' || discount?.type === 'FLAT' ? discount.type : 'NONE'
  const raw = Number(discount?.value) || 0
  if (type === 'PERCENT') {
    const percent = Math.min(100, Math.max(0, raw))
    const discountAmount = round2(base * (percent / 100))
    return { discountType: 'PERCENT' as const, discountValue: percent, discountAmount, netSubtotal: round2(base - discountAmount) }
  }
  if (type === 'FLAT') {
    const discountAmount = round2(Math.min(base, Math.max(0, raw)))
    return { discountType: 'FLAT' as const, discountValue: discountAmount, discountAmount, netSubtotal: round2(base - discountAmount) }
  }
  return { discountType: 'NONE' as const, discountValue: 0, discountAmount: 0, netSubtotal: base }
}

export function calculateQuoteCommercials(input: {
  materials?: QuoteMaterialLine[]
  services?: QuoteServiceLine[]
  vatEnabled?: boolean
  vatRate?: number
  internalCosting?: QuoteInternalCosting
  discountType?: string | null
  discountValue?: number | null
}) {
  let irdCharge = 0
  let twidMarkup = 0
  let purchaseCost = 0
  for (const item of input.materials || []) {
    const amounts = lineExtendedAmounts(item)
    irdCharge = round2(irdCharge + amounts.baseIRD)
    twidMarkup = round2(twidMarkup + amounts.markupValue)
    purchaseCost = round2(purchaseCost + amounts.purchaseCost)
  }

  const services = round2((input.services || []).reduce((sum, service) => {
    const total = Number(service.total)
    if (Number.isFinite(total) && total !== 0) return sum + total
    return sum + ((Number(service.qty) || 0) * (Number(service.price) || 0))
  }, 0))

  const subtotal = round2(irdCharge + twidMarkup + services)
  const discount = resolveDocumentDiscount(subtotal, { type: input.discountType, value: input.discountValue })
  const vatRate = Number(input.vatRate ?? 15)
  const vatAmount = input.vatEnabled === false ? 0 : round2(discount.netSubtotal * (vatRate / 100))
  const customerTotal = round2(discount.netSubtotal + vatAmount)

  const costing = input.internalCosting || {}
  const knownCosts = ['labourEstimate', 'transportEstimate', 'subcontractorEstimate', 'otherDeliveryEstimate'] as const
  const deliveryCosts = round2(knownCosts.reduce((sum, key) => {
    const value = Number(costing[key])
    return Number.isFinite(value) && value > 0 ? sum + value : sum
  }, 0))
  const missingCosts = knownCosts.filter(key => {
    const value = costing[key]
    return value == null || !Number.isFinite(Number(value))
  })
  const estimatedProfit = round2(discount.netSubtotal - purchaseCost - deliveryCosts)
  const estimatedMargin = discount.netSubtotal === 0 ? null : round2(estimatedProfit / discount.netSubtotal)

  return {
    irdCharge,
    twidMarkup,
    purchaseCost,
    services,
    subtotal,
    ...discount,
    vatRate,
    vatAmount,
    customerTotal,
    deliveryCosts,
    estimatedProfit,
    estimatedMargin,
    missingCosts,
  }
}

/** Rebuild stored quote/invoice money from the lines. VAT stays off when a saved summary had no VAT. */
export function prepareQuoteAcceptanceCommercial(
  quote: {
    requisitionSections?: Array<{ items?: QuoteMaterialLine[]; jobCategoryId?: string; [key: string]: unknown }>
    items?: QuoteMaterialLine[]
    otherServices?: QuoteServiceLine[]
    summary?: { subtotal?: number; vatAmount?: number; vatRate?: number; discountType?: string; discountValue?: number }
    discountType?: string | null
    discountValue?: number | null
    internalCosting?: QuoteInternalCosting
  },
  costById: Record<string, number> = {},
) {
  const sourceSections = Array.isArray(quote.requisitionSections) && quote.requisitionSections.length
    ? quote.requisitionSections
    : [{
        items: (quote.items || []).map(item => ({
          ...item,
          qtyRequired: item.qtyRequired ?? item.qty,
          irdSellingPrice: item.irdSellingPrice ?? item.price,
        })),
      }]
  const sections = stampRequisitionSections(sourceSections, costById)
  const materials = sections.flatMap(section => section.items || [])
  const storedSubtotal = Number(quote.summary?.subtotal || 0)
  const storedVat = Number(quote.summary?.vatAmount || 0)
  const vatEnabled = storedSubtotal > 0 ? storedVat > 0 : true
  const calculated = calculateQuoteCommercials({
    materials,
    services: quote.otherServices || [],
    vatEnabled,
    vatRate: Number(quote.summary?.vatRate ?? 15),
    internalCosting: quote.internalCosting,
    discountType: quote.discountType || quote.summary?.discountType,
    discountValue: quote.discountValue ?? quote.summary?.discountValue,
  })
  const items = sections.flatMap((section, sectionIndex) =>
    (section.items || []).map((item, itemIndex) => ({
      ...item,
      id: item && typeof item === 'object' && 'id' in item && item.id
        ? item.id
        : `line_${sectionIndex}_${itemIndex}`,
      jobCategoryId: section.jobCategoryId || (item as { jobCategoryId?: string }).jobCategoryId || '',
    })),
  )
  return {
    sections,
    items,
    calculated,
    grandTotal: calculated.customerTotal,
    summary: {
      totalIrdCost: calculated.irdCharge,
      totalMarkup: calculated.twidMarkup,
      totalOtherServices: calculated.services,
      purchaseCost: calculated.purchaseCost,
      subtotal: calculated.subtotal,
      discountType: calculated.discountType,
      discountValue: calculated.discountValue,
      discountAmount: calculated.discountAmount,
      netSubtotal: calculated.netSubtotal,
      vatRate: calculated.vatRate,
      vatAmount: calculated.vatAmount,
    },
  }
}

export function quoteCommercialFingerprint(input: {
  requisitionSections?: Array<{ items?: QuoteMaterialLine[] }>
  otherServices?: QuoteServiceLine[]
  validUntil?: string
  internalCosting?: QuoteInternalCosting
  discountType?: string | null
  discountValue?: number | null
  summary?: { discountType?: string | null; discountValue?: number | null }
}) {
  return JSON.stringify({
    materials: (input.requisitionSections || []).flatMap(section => section.items || []).map(item => ({
      qty: Number(item.qtyRequired) || 0,
      price: Number(item.irdSellingPrice) || 0,
      markup: Number(item.markupPercent) || 0,
    })),
    services: (input.otherServices || []).map(service => ({
      qty: Number(service.qty) || 0,
      price: Number(service.price) || 0,
      total: Number(service.total) || 0,
    })),
    validUntil: input.validUntil || '',
    internalCosting: input.internalCosting || {},
    discountType: input.discountType || input.summary?.discountType || 'NONE',
    discountValue: Number(input.discountValue ?? input.summary?.discountValue) || 0,
  })
}

export function reviewAfterCommercialEdit(currentReview: string | undefined, wasApprovedOrSent: boolean) {
  if (!wasApprovedOrSent) return currentReview || 'DRAFT'
  return 'PENDING_MANAGER'
}

export function canSendQuote(reviewStatus?: string) {
  return reviewStatus === 'APPROVED_TO_SEND'
}

export function customerFacingQuote<T extends object>(quote: T) {
  const {
    internalCosting,
    estimatedProfit,
    estimatedMargin,
    reviewHistory,
    ...safe
  } = quote as T & {
    internalCosting?: unknown
    estimatedProfit?: unknown
    estimatedMargin?: unknown
    reviewHistory?: unknown
  }
  void internalCosting
  void estimatedProfit
  void estimatedMargin
  void reviewHistory
  return safe as Omit<T, 'internalCosting' | 'estimatedProfit' | 'estimatedMargin' | 'reviewHistory'>
}

export function acceptanceDocumentIds(quoteId: string) {
  const safe = String(quoteId).replace(/[^A-Za-z0-9_-]/g, '_')
  return {
    jobCardId: `job_from_quote_${safe}`,
    invoiceId: `inv_from_quote_${safe}_r1`,
  }
}
