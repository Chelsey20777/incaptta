/**
 * Job Card Financial Performance Engine
 *
 * Financial model:
 *   IRD Gross Revenue    = Σ( irdSellingPrice × qty )          — non-adjustment items only
 *   IRD Base Cost        = Σ( costSnapshot × qty )             — purchase price + freight, non-adj
 *   IRD Net Revenue      = IRD Gross Revenue − IRD Base Cost   — IRD profit contribution
 *
 *   TWID Amount          = Σ( irdGrossRow × twidMarkupPercent/100 ) — non-adj
 *   Other Services       = Σ quote service totals (installation and similar), no purchase cost
 *   Total Invoice Value  = max(linked CRM total, IRD Gross + TWID + Other Services)
 *                          when that bill or a linked CRM total exists;
 *                          otherwise Implementation Cost (labor-only jobs)
 *
 *   Implementation Cost  = Σ adHocExpenses + Σ staffRates.jobRateAmount + Σ subcontractWorks
 *                          (SCN links use contractValue; legacy lines use totalAmount when approved)
 *                          This stays in direct cost and is not added on top of an agreed bill.
 *
 *   Target Job Net (static) = IRD Net Revenue + TWID Amount
 *   Total Adjustments    = Σ adjustment inventory items + Σ adjustment adhoc expenses
 *   Adjustment %         = Total Adjustments / Total Invoice Value × 100
 *
 *   Operational Expenses = Σ non-adjustment adhoc + staffRates + subcontractWorks
 *                          (SCN links use paidApprovedTotal / manager-approved payments)
 *   Returns Profit       = Σ( costSnapshot × qtyReturned )
 *
 *   TWID Net After Adj   = TWID Amount − Total Adjustments   (can be negative)
 *   Final Net Revenue    = Target Job Net − Total Adjustments − Operational Expenses + Returns Profit
 *   Profit Decrease      = Target Job Net − Final Net Revenue
 *   Profit Decrease %    = Profit Decrease / Target Job Net × 100
 */

export interface RequisitionItem {
  qty?: number
  qtyRequired?: number
  irdSellingPrice: number
  costSnapshot: number
  twidMarkupPercent?: number
  markupPercent?: number
  isAdjustment?: boolean
  approvalStatus?: string
}

export interface AdHocExpense {
  totalAmount: number
  isAdjustment?: boolean
  approvalStatus?: string
  isLockedAgainstPdf?: boolean
}

export interface InventoryReturn {
  qtyReturned: number
  costSnapshot: number
  totalCredit?: number
}

export interface StaffRate {
  jobRateAmount: number
  isAdjustment?: boolean
  approvalStatus?: string
}

export interface SubcontractWorkLine {
  totalAmount: number
  isAdjustment?: boolean
  approvalStatus?: string
  /** SCN link projection */
  isScnLink?: boolean
  subcontractorJobId?: string
  contractValue?: number
  paidApprovedTotal?: number
}

export interface OtherServiceLine {
  qty?: number
  price?: number
  total?: number
}

export interface FinancialComputeOptions {
  /** Priced PENDING lines still count when the job is linked to a CRM invoice. */
  countPendingMaterials?: boolean
  linkedCrmTotal?: number
}

export interface Referrer {
  id: string
  name: string
  amount: number
  paymentMethod?: 'CASH' | 'ECOCASH' | 'BANK' | 'RESERVE'
  approvalStatus?: string
  approvedAt?: string | null
  approvedBy?: string | null
  attachments?: { name: string; url: string; uploadedAt?: string }[]
  proofUrl?: string | null
  proofName?: string | null
}

export interface FinancialSummary {
  irdGrossRevenue: number
  irdBaseCost: number
  irdNetRevenue: number
  twidAmount: number
  implementationCost: number
  totalInvoiceValue: number
  targetJobNet: number
  adjustmentItems: number
  adjustmentAdhoc: number
  totalAdjustments: number
  adjustmentPercent: number
  operationalExpenses: number
  returnsProfit: number
  twidNetAfterAdjustments: number
  twidRevenuePercentage: number
  adjustedRevenue: number
  finalNetRevenue: number
  profitDecrease: number
  profitDecreasePercent: number
  isProfitUp: boolean
  impCostAmount: number
  irdCumulativeNetRevenue: number
  irdRevenuePercentage: number
  totalRevenue: number
  totalCost: number
  totalOperationalGross: number
  totalOperatingExpenses: number
  grossProfit: number
  netProfit: number
  profitMargin: number
  referrers: Referrer[]
  referrerCommission: number
  commissionPercentage: number
  initialInvoiceValue: number
  staffRatesTotal: number
  adHocTotal: number
  subcontractWorksTotal: number
  otherServicesTotal: number
  /** Revenue row for labor and services: other services on an agreed bill, otherwise implementation. */
  billedLabor: number
}

function flatItems(sections: { items?: RequisitionItem[] }[]): RequisitionItem[] {
  return sections.flatMap(s => s.items ?? [])
}

const round2 = (v: number) => Number((v || 0).toFixed(2))

function serviceAmount(service: OtherServiceLine): number {
  const total = Number(service.total)
  if (Number.isFinite(total) && total !== 0) return total
  return (Number(service.qty) || 0) * (Number(service.price) || 0)
}

/** Agreed customer bill wins over implementation. Labor-only jobs still bill implementation. */
export function resolveAgreedInvoice(input: {
  linkedCrmTotal?: number
  irdGrossRevenue: number
  twidAmount: number
  otherServicesTotal: number
  implementationCost: number
}) {
  const commercialBill = round2(input.irdGrossRevenue + input.twidAmount + input.otherServicesTotal)
  const linked = Number(input.linkedCrmTotal) || 0
  const hasAgreedBill = commercialBill > 0 || linked > 0
  const initialInvoiceValue = hasAgreedBill
    ? round2(linked > 0 ? linked : commercialBill)
    : round2(input.implementationCost)
  return { commercialBill, hasAgreedBill, initialInvoiceValue }
}

export function computeFinancials(
  sections: { items?: RequisitionItem[] }[],
  adhoc: AdHocExpense[],
  returns: InventoryReturn[],
  staffRates: StaffRate[] = [],
  referrers: Referrer[] = [],
  jobStatus?: string,
  subcontractWorks: SubcontractWorkLine[] = [],
  otherServices: OtherServiceLine[] = [],
  options: FinancialComputeOptions = {},
): FinancialSummary {
  const isApproved = (item: { approvalStatus?: string }) => {
    return item.approvalStatus === 'APPROVED_MANAGER' ||
      item.approvalStatus === 'APPROVED' ||
      item.approvalStatus === undefined ||
      item.approvalStatus === null
  }

  const countsWhenLinked = (item: RequisitionItem) => {
    if (!options.countPendingMaterials) return false
    if (item.approvalStatus !== 'PENDING') return false
    return (Number(item.irdSellingPrice) || 0) > 0
  }

  const baseItems = flatItems(sections).filter(i => {
    if (!isApproved(i) && !countsWhenLinked(i)) return false
    if (!i.isAdjustment) return true
    return jobStatus !== 'CLOSED'
  })

  let irdGrossRevenue = 0
  let irdBaseCost = 0
  let twidAmount = 0

  for (const item of baseItems) {
    const qty = Number(item.qty ?? item.qtyRequired) || 0
    const ird = Number(item.irdSellingPrice) || 0
    const cost = Number(item.costSnapshot) || 0
    const twid = Number(item.twidMarkupPercent ?? item.markupPercent) || 0
    const rowIrd = qty * ird
    const rowTwid = rowIrd * (twid / 100)
    irdGrossRevenue += rowIrd
    irdBaseCost += qty * cost
    twidAmount += rowTwid
  }

  const irdNetRevenue = irdGrossRevenue - irdBaseCost

  let adHocTotal = 0
  let staffRatesTotal = 0
  let subcontractWorksTotal = 0
  let adjustmentAdhoc = 0
  let operationalExpenses = 0

  for (const exp of adhoc) {
    if (!isApproved(exp)) continue
    const amt = Number(exp.totalAmount) || 0
    adHocTotal += amt
    if (exp.isAdjustment) adjustmentAdhoc += amt
    else operationalExpenses += amt
  }

  for (const rate of (staffRates || [])) {
    if (!isApproved(rate)) continue
    const amt = Number(rate.jobRateAmount) || 0
    staffRatesTotal += amt
    if (rate.isAdjustment) adjustmentAdhoc += amt
    else operationalExpenses += amt
  }

  for (const work of (subcontractWorks || [])) {
    const isScn = !!(work.isScnLink || work.subcontractorJobId)
    if (isScn) {
      // Linked SCN: always include allocated contract value in implementation cost;
      // operational expenses only count manager-approved payments posted to OPEX.
      const contractAmt = Number(work.contractValue ?? work.totalAmount) || 0
      subcontractWorksTotal += contractAmt
      const paid = Number(work.paidApprovedTotal) || 0
      if (work.isAdjustment) adjustmentAdhoc += paid
      else operationalExpenses += paid
      continue
    }

    if (!isApproved(work)) continue
    const amt = Number(work.totalAmount) || 0
    subcontractWorksTotal += amt
    if (work.isAdjustment) adjustmentAdhoc += amt
    else operationalExpenses += amt
  }

  const implementationCost = adHocTotal + staffRatesTotal + subcontractWorksTotal

  let adjustmentItems = 0
  if (jobStatus === 'CLOSED') {
    const adjItems = flatItems(sections).filter(i => isApproved(i) && i.isAdjustment)
    for (const item of adjItems) {
      const qty = Number(item.qty) || 0
      const ird = Number(item.irdSellingPrice) || 0
      const twid = Number(item.twidMarkupPercent) || 0
      const rowIrd = qty * ird
      adjustmentItems += rowIrd + rowIrd * (twid / 100)
    }
  }

  const totalAdjustments = adjustmentItems + adjustmentAdhoc
  const otherServicesTotal = (otherServices || []).reduce((sum, service) => sum + serviceAmount(service), 0)
  const agreedInvoice = resolveAgreedInvoice({
    linkedCrmTotal: options.linkedCrmTotal,
    irdGrossRevenue,
    twidAmount,
    otherServicesTotal,
    implementationCost,
  })
  const totalInvoiceValue = agreedInvoice.initialInvoiceValue
  const adjustmentPercent = totalInvoiceValue > 0 ? (totalAdjustments / totalInvoiceValue) * 100 : 0

  let returnsProfit = 0
  for (const ret of returns) {
    const qty = Number(ret.qtyReturned) || 0
    const cost = Number(ret.costSnapshot) || 0
    returnsProfit += qty * cost
  }

  const targetJobNet = irdNetRevenue + twidAmount
  const twidNetAfterAdjustments = twidAmount - totalAdjustments
  const twidRevenuePercentage = totalInvoiceValue > 0 ? (twidNetAfterAdjustments / totalInvoiceValue) * 100 : 0
  const adjustedRevenue = targetJobNet - totalAdjustments + returnsProfit
  const finalNetRevenue = adjustedRevenue - operationalExpenses
  const profitDecrease = targetJobNet - adjustedRevenue
  const profitDecreasePercent = targetJobNet > 0 ? (profitDecrease / targetJobNet) * 100 : 0
  const isProfitUp = adjustedRevenue > targetJobNet

  const referrerCommission = referrers
    .filter(r => isApproved(r))
    .reduce((sum, r) => sum + (Number(r.amount) || 0), 0)
  const commissionPercentage = totalInvoiceValue > 0 ? (referrerCommission / totalInvoiceValue) * 100 : 0

  const totalRevenue = totalInvoiceValue - totalAdjustments
  const totalCost = irdBaseCost + implementationCost - returnsProfit + referrerCommission
  const totalOperationalGross = irdGrossRevenue + implementationCost + referrerCommission
  const totalOperatingExpenses = implementationCost
  const grossProfit = totalRevenue - (irdBaseCost + implementationCost - returnsProfit)
  const netProfit = grossProfit - referrerCommission
  const profitMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0
  const billedLabor = agreedInvoice.hasAgreedBill ? otherServicesTotal : implementationCost

  return {
    irdGrossRevenue: round2(irdGrossRevenue),
    irdBaseCost: round2(irdBaseCost),
    irdNetRevenue: round2(irdNetRevenue),
    twidAmount: round2(twidAmount),
    implementationCost: round2(implementationCost),
    totalInvoiceValue: round2(totalInvoiceValue),
    targetJobNet: round2(targetJobNet),
    adjustmentItems: round2(adjustmentItems),
    adjustmentAdhoc: round2(adjustmentAdhoc),
    totalAdjustments: round2(totalAdjustments),
    adjustmentPercent: round2(adjustmentPercent),
    operationalExpenses: round2(operationalExpenses),
    returnsProfit: round2(returnsProfit),
    twidNetAfterAdjustments: round2(twidNetAfterAdjustments),
    twidRevenuePercentage: round2(twidRevenuePercentage),
    adjustedRevenue: round2(adjustedRevenue),
    finalNetRevenue: round2(finalNetRevenue),
    profitDecrease: round2(profitDecrease),
    profitDecreasePercent: round2(profitDecreasePercent),
    isProfitUp,
    impCostAmount: round2(implementationCost),
    irdCumulativeNetRevenue: round2(irdNetRevenue),
    irdRevenuePercentage: round2(irdGrossRevenue > 0 ? (irdNetRevenue / irdGrossRevenue) * 100 : 0),
    totalRevenue: round2(totalRevenue),
    totalCost: round2(totalCost),
    totalOperationalGross: round2(totalOperationalGross),
    totalOperatingExpenses: round2(totalOperatingExpenses),
    grossProfit: round2(grossProfit),
    netProfit: round2(netProfit),
    profitMargin: round2(profitMargin),
    referrers: referrers.filter(r => isApproved(r)),
    referrerCommission: round2(referrerCommission),
    commissionPercentage: round2(commissionPercentage),
    initialInvoiceValue: round2(totalInvoiceValue),
    staffRatesTotal: round2(staffRatesTotal),
    adHocTotal: round2(adHocTotal),
    subcontractWorksTotal: round2(subcontractWorksTotal),
    otherServicesTotal: round2(otherServicesTotal),
    billedLabor: round2(billedLabor),
  }
}
