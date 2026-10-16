/**
 * Job Card Financial Performance Engine
 *
 * Financial model:
 *   IRD Gross Revenue    = Σ( irdSellingPrice × qty )          — non-adjustment items only
 *   IRD Base Cost        = Σ( costSnapshot × qty )             — purchase price + freight, non-adj
 *   IRD Net Revenue      = IRD Gross Revenue − IRD Base Cost   — IRD profit contribution
 *
 *   TWID Amount          = Σ( irdGrossRow × twidMarkupPercent/100 ) — non-adj
 *   Total Invoice Value  = IRD Gross + TWID + Implementation Cost
 *
 *   Implementation Cost  = Σ adHocExpenses + Σ staffRates.jobRateAmount
 *
 *   Target Job Net (static) = IRD Net Revenue + TWID Amount
 *     ↑ This is the locked profit target computed before any adjustments.
 *
 *   Total Adjustments    = Σ adjustment inventory items + Σ adjustment adhoc expenses
 *     — all adjustments deduct from TWID portion only
 *   Adjustment %         = Total Adjustments / Total Invoice Value × 100
 *
 *   Operational Expenses = Σ non-adjustment adhoc expenses + Σ staffRates (non-adjustment)
 *
 *   Returns Profit       = Σ( costSnapshot × qtyReturned )
 *     — when inventory is returned to stock, we recover the purchase cost since
 *       the invoice has already been paid (profit increases by the cost of returned goods)
 *
 *   TWID Net After Adj   = TWID Amount − Total Adjustments   (can be negative)
 *   Final Net Revenue    = Target Job Net − Total Adjustments − Operational Expenses + Returns Profit
 *   Profit Decrease      = Target Job Net − Final Net Revenue
 *   Profit Decrease %    = Profit Decrease / Target Job Net × 100
 *   isProfitUp:         boolean        // true when adjustedRevenue > targetNet (returns pushed it up)
 */

export interface RequisitionItem {
    id?: string
    qty: number
    irdSellingPrice: number      // read from inventory master — never recalculated
    costSnapshot: number         // inventory totalCost (purchasePrice + freightDuty) at time of adding
    twidMarkupPercent: number    // TWID markup %
    isAdjustment?: boolean       // amendment items that deduct from TWID
    approvalStatus?: string      // approval tracking (DRAFT, PENDING, APPROVED_MANAGER, REJECTED, etc.)
    rowIRDTot?: number
    rowMUTot?: number
    rowGrandTot?: number
    [key: string]: any
}

export interface AdHocExpense {
    id?: string
    totalAmount: number
    quantity?: number
    unitPrice?: number
    isAdjustment?: boolean       // adjustment adhoc also deducts from TWID
    approvalStatus?: string      // approval tracking (DRAFT, PENDING, APPROVED_MANAGER, REJECTED, etc.)
    [key: string]: any
}

export interface InventoryReturn {
    id?: string
    qtyReturned: number
    costSnapshot?: number         // purchase cost per unit — the profit recovered on return
    totalCredit?: number         // fallback: selling-price-based credit (less accurate)
    approvalStatus?: string
    [key: string]: any
}

export interface StaffRate {
    id?: string
    jobRateAmount: number
    isAdjustment?: boolean
    approvalStatus?: string      // approval tracking (DRAFT, PENDING, APPROVED_MANAGER, REJECTED, etc.)
    [key: string]: any
}

export interface Referrer {
    id: string
    name: string
    amount: number
    approvalStatus?: string
    approvedAt?: string
    approvedBy?: string
    [key: string]: any
}

export interface FinancialSummary {
    // ── Tier 1 — Independent tiles ────────────────────────────────────────────
    irdGrossRevenue:    number    // $500 example
    irdBaseCost:        number    // $350 example (purchase + freight)
    irdNetRevenue:      number    // $150 example (= gross − cost)
    twidAmount:         number    // $200 example
    implementationCost: number    // Ad-hoc + Staff Rates
    totalInvoiceValue:  number    // $700 example (gross + twid + implementation)

    // ── Tier 2 — Static profit target ────────────────────────────────────────
    targetJobNet:       number    // $350 example (irdNet + twid) — locked at job creation

    // ── Adjustments (reduce TWID only) ───────────────────────────────────────
    adjustmentItems:    number    // Σ adjustment inventory row values
    adjustmentAdhoc:    number    // Σ adjustment adhoc expenses
    totalAdjustments:   number    // combined
    adjustmentPercent:  number    // (totalAdjustments / totalInvoiceValue) × 100

    // ── Operational expenses (non-adjustment adhoc + staff rates) ───────────
    operationalExpenses: number

    // ── Returns — profit recovered ────────────────────────────────────────────
    returnsProfit:      number    // Σ(costSnapshot × qtyReturned)

    // ── Tier 3 — Dynamic current state ───────────────────────────────────────
    twidNetAfterAdjustments: number    // twid − totalAdjustments
    twidRevenuePercentage:   number    // (twidNetAfterAdjustments / totalInvoiceValue) * 100
    adjustedRevenue:    number         // targetJobNet − totalAdjustments + returnsProfit
    finalNetRevenue:    number         // adjustedRevenue − operationalExpenses
    profitDecrease:     number         // targetJobNet − adjustedRevenue  (adj impact only)
    profitDecreasePercent: number      // profitDecrease / targetJobNet × 100
    isProfitUp:         boolean        // true when adjustedRevenue > targetNet (returns pushed it up)
    impCostAmount:      number         // Alias for implementationCost for PDF generator

    // ── IRD Formula Fields ────────────────────────────────────────────────────
    irdCumulativeNetRevenue: number    // same as irdNetRevenue
    irdRevenuePercentage:    number    // (irdNetRevenue / irdGrossRevenue) * 100

    // ── Standard Accounting P&L (Simplified) ──────────────────────────────────
    totalRevenue:       number         // totalInvoiceValue - totalAdjustments
    totalCost:          number         // irdBaseCost + implementationCost - returnsProfit
    totalOperationalGross: number      // irdGrossRevenue + implementationCost
    totalOperatingExpenses: number     // implementationCost (Staff + Ad-hoc)
    grossProfit:        number         // totalRevenue - totalCost
    netProfit:          number         // grossProfit - operational expenses (if any) - commission
    profitMargin:       number         // (netProfit / totalRevenue) * 100

    // ── Referral Commission ──────────────────────────────────────────────────
    referrers: Referrer[]              // List of people earning commission
    referrerCommission: number         // Total commission amount awarded to referrers
    commissionPercentage: number       // Deprecated: % of total invoice value (now calculated from total)
    initialInvoiceValue: number        // The base/locked invoice value
}

/**
 * Flatten all items from sectioned requisition structure.
 */
function flatItems(sections: { items?: RequisitionItem[] }[]): RequisitionItem[] {
    return sections.flatMap(s => s.items ?? [])
}

/**
 * Core engine — pure function, no Vue reactivity.
 */
export function computeFinancials(
    sections:   { items?: RequisitionItem[] }[],
    adhoc:      AdHocExpense[],
    returns:    InventoryReturn[],
    staffRates: StaffRate[] = [],
    referrers:  Referrer[] = [],
    jobStatus?: string
): FinancialSummary {
    // Helper to check if an item has been approved by the manager, or is undefined (backward-compatibility)
    const isApproved = (item: { approvalStatus?: string }) => {
        return item.approvalStatus === 'APPROVED_MANAGER' || 
               item.approvalStatus === 'APPROVED' || 
               item.approvalStatus === undefined || 
               item.approvalStatus === null;
    };

    // ── Base items (non-adjustment OR adjustment items before closure) ───────
    const baseItems = flatItems(sections).filter(i => {
        if (!isApproved(i)) return false

        if (!i.isAdjustment) return true
        // If it IS an adjustment, but the job isn't closed yet, treat it as a base item
        return jobStatus !== 'CLOSED'
    })

    let irdGrossRevenue = 0
    let irdBaseCost     = 0
    let twidAmount      = 0

    for (const item of baseItems) {
        const qty   = Number(item.qty)                   || 0
        const ird   = Number(item.irdSellingPrice)       || 0
        const cost  = Number(item.costSnapshot)          || 0
        const twid  = Number(item.twidMarkupPercent)     || 0

        const rowIrd  = qty * ird
        const rowTwid = rowIrd * (twid / 100)

        irdGrossRevenue += rowIrd
        irdBaseCost     += qty * cost
        twidAmount      += rowTwid
    }

    const irdNetRevenue    = irdGrossRevenue - irdBaseCost

    // ── Implementation Cost (ad-hoc + staff rates) ─────────────────────────────
    let adHocTotal = 0
    let staffRatesTotal = 0
    let adjustmentAdhoc = 0
    let operationalExpenses = 0

    // Process ad-hoc expenses
    for (const exp of adhoc) {
        if (!isApproved(exp)) continue

        const amt = Number(exp.totalAmount || (exp.quantity || 0) * (exp.unitPrice || 0)) || 0
        adHocTotal += amt
        if (exp.isAdjustment) adjustmentAdhoc += amt
        else                  operationalExpenses += amt
    }

    // Process staff rates
    for (const rate of (staffRates || [])) {
        if (!isApproved(rate)) continue

        const amt = Number(rate.jobRateAmount) || 0
        staffRatesTotal += amt
        if (rate.isAdjustment) adjustmentAdhoc += amt
        else                   operationalExpenses += amt
    }

    const implementationCost = adHocTotal + staffRatesTotal
    const totalInvoiceValue = irdGrossRevenue + twidAmount + implementationCost
    const targetJobNet = irdNetRevenue + twidAmount

    // ── Adjustment items (Inventory — only if CLOSED) ─────────────────────────
    const adjItems = flatItems(sections).filter(i => i.isAdjustment && jobStatus === 'CLOSED' && isApproved(i))
    let adjustmentItems = 0
    for (const item of adjItems) {
        const qty  = Number(item.qty)              || 0
        const ird  = Number(item.irdSellingPrice)  || 0
        const twid = Number(item.twidMarkupPercent) || 0
        const rowIrd  = qty * ird
        const rowTwid = rowIrd * (twid / 100)
        adjustmentItems += rowIrd + rowTwid
    }

    const totalAdjustments  = adjustmentItems + adjustmentAdhoc
    const adjustmentPercent = totalInvoiceValue > 0
        ? (totalAdjustments / totalInvoiceValue) * 100
        : 0

    // ── Returns profit ────────────────────────────────────────────────────────
    // System adds back the purchase cost of returned items since invoice was paid
    let returnsProfit = 0
    const approvedReturns = returns.filter(isApproved)
    for (const ret of approvedReturns) {
        const qty  = Number(ret.qtyReturned) || 0
        const cost = Number(ret.costSnapshot || ret.purchaseCostSnapshot) || 0
        // Fallback: if no cost snapshot stored, use 0 (safe — avoids inflating profit)
        returnsProfit += qty * cost
    }

    // ── Commission ────────────────────────────────────────────────────────────
    const approvedReferrers = (referrers || []).filter(r => r.approvalStatus === 'APPROVED_MANAGER' || r.approvalStatus === 'APPROVED')
    const totalCommission = approvedReferrers.reduce((sum, r) => sum + (Number(r.amount) || 0), 0)
    const effectiveCommissionPercentage = totalInvoiceValue > 0 ? (totalCommission / totalInvoiceValue) * 100 : 0

    // ── Final calculations ────────────────────────────────────────────────────
    const twidNetAfterAdjustments = twidAmount - totalAdjustments
    const adjustedRevenue   = targetJobNet - totalAdjustments + returnsProfit
    const finalNetRevenue   = adjustedRevenue - operationalExpenses
    const profitDecrease    = targetJobNet - adjustedRevenue
    const profitDecreasePercent = targetJobNet > 0
        ? (profitDecrease / targetJobNet) * 100
        : 0

    return {
        irdGrossRevenue,
        irdBaseCost,
        irdNetRevenue,
        twidAmount,
        implementationCost,
        totalInvoiceValue,
        targetJobNet,
        adjustmentItems,
        adjustmentAdhoc,
        totalAdjustments,
        adjustmentPercent,
        operationalExpenses,
        returnsProfit,
        twidNetAfterAdjustments,
        twidRevenuePercentage: totalInvoiceValue > 0 ? (twidNetAfterAdjustments / totalInvoiceValue) * 100 : 0,
        adjustedRevenue,
        finalNetRevenue,
        profitDecrease,
        profitDecreasePercent,
        isProfitUp: adjustedRevenue > targetJobNet,
        impCostAmount: implementationCost,

        // ── IRD Formula Fields ──
        irdCumulativeNetRevenue: irdNetRevenue,
        irdRevenuePercentage: irdGrossRevenue > 0 ? (irdNetRevenue / irdGrossRevenue) * 100 : 0,

        // ── Standard P&L ──
        totalRevenue:   totalInvoiceValue - totalAdjustments,
        totalCost:      irdBaseCost + implementationCost - returnsProfit + totalCommission,
        totalOperationalGross: irdGrossRevenue + implementationCost,
        totalOperatingExpenses: implementationCost,
        
        // ── Referral Commission ──
        referrers: referrers || [],
        referrerCommission: totalCommission,
        commissionPercentage: effectiveCommissionPercentage,
        initialInvoiceValue: totalInvoiceValue,

        grossProfit:    (totalInvoiceValue - totalAdjustments) - (irdBaseCost + implementationCost - returnsProfit),
        netProfit:      ((totalInvoiceValue - totalAdjustments) - (irdBaseCost + implementationCost - returnsProfit)) - totalCommission,
        profitMargin:   (totalInvoiceValue - totalAdjustments) > 0 
            ? (((totalInvoiceValue - totalAdjustments) - (irdBaseCost + implementationCost - returnsProfit) - totalCommission) / (totalInvoiceValue - totalAdjustments)) * 100 
            : 0
    }
}