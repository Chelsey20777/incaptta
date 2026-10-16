'use client'

import { useMemo, useState, useEffect } from 'react'
import { db } from '@/lib/firebase'
import { collection, query, where, getDocs, Timestamp } from 'firebase/firestore'
import { useJobCardsStore } from '@/stores/job-cards-store'
import { useFinanceStore } from '@/stores/finance-store'
import { useAdminStore } from '@/stores/admin-store'
import { useInventoryStore } from '@/stores/inventory-store'
import { useHrStore } from '@/stores/hr-store'
import { useCrmStore } from '@/stores/crm-store'

import type {
  UnifiedOperationalContext,
  OperationsAnalyticsContext,
  FinanceAnalyticsContext,
  CrmAnalyticsContext,
  HrAnalyticsContext,
  InventoryAnalyticsContext,
  InvStockMovement,
  InvTopConsumedItem,
  OpsExpenseAnalytics,
  OpsTransferAnalytics,
  OpsAccountBalance,
  OpsDepartmentMetric,
  OpsJobCardFinancialSummary
} from '@/lib/types-unified-context'

// Helper: Safely converts Firestore Timestamp, JS Date, ISO string, etc. to Date
function toDate(value: unknown): Date | null {
  if (value === null || value === undefined) return null
  if (typeof (value as any).toDate === 'function') {
    try {
      const d = (value as any).toDate() as Date
      return isNaN(d.getTime()) ? null : d
    } catch {
      return null
    }
  }
  if (value instanceof Date) {
    return isNaN(value.getTime()) ? null : value
  }
  if (typeof value === 'string') {
    const d = new Date(value)
    return isNaN(d.getTime()) ? null : d
  }
  if (typeof value === 'number') {
    const d = new Date(value)
    return isNaN(d.getTime()) ? null : d
  }
  return null
}

// Helper: Formats Date to 'YYYY-MM-DD' in local time
function toLocalDateString(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function useUnifiedOperationalContext(periodDays: number = 30, overdueThresholdDays: number = 14) {
  const jobCards = useJobCardsStore((state) => state.jobCards)
  const expenses = useFinanceStore((state) => state.expenses)
  const transfers = useFinanceStore((state) => state.transfers)
  const jobPayments = useFinanceStore((state) => state.jobPayments)
  const topUps = useFinanceStore((state) => state.topUps)
  const salariesTransactions = useFinanceStore((state) => state.salariesTransactions)
  const finalBalances = useFinanceStore((state) => state.finalBalances)
  const historicalInventoryCost = useFinanceStore((state) => state.historicalInventoryCost)
  
  const departments = useAdminStore((state) => state.departments)
  
  const inventoryItems = useInventoryStore((state) => state.items)

  // Derive low-stock and total-value from the raw items array
  // instead of calling store methods inside a Zustand selector,
  // which creates new references every render and triggers an infinite loop.
  const lowStockItemsList = useMemo(
    () => inventoryItems.filter(item => item.reorderLevel !== undefined && item.onHand <= item.reorderLevel),
    [inventoryItems]
  )
  const totalInventoryValueVal = useMemo(
    () => inventoryItems.reduce((total, item) => total + (item.onHand * (item.sellingPrice || 0)), 0),
    [inventoryItems]
  )
  
  const employees = useHrStore((state) => state.employees)
  const leaveRequests = useHrStore((state) => state.leaveRequests)
  const performanceReviews = useHrStore((state) => state.performanceReviews)
  const jobPostings = useHrStore((state) => state.jobPostings)
  const payrolls = useHrStore((state) => state.payrolls)
  
  const customers = useCrmStore((state) => state.customers)
  const quotes = useCrmStore((state) => state.quotes)
  const invoices = useCrmStore((state) => state.invoices)
  const leads = useCrmStore((state) => state.leads)

  const [stockMovement, setStockMovement] = useState<InvStockMovement | undefined>(undefined)
  const [stockLoading, setStockLoading] = useState(false)

  // Fetch Stock Movement asynchronously
  useEffect(() => {
    let active = true
    const fetchMovement = async () => {
      setStockLoading(true)
      const periodStartDate = new Date()
      periodStartDate.setDate(periodStartDate.getDate() - periodDays)
      const startTs = Timestamp.fromDate(periodStartDate)

      try {
        const q = query(
          collection(db, 'stockLedger'),
          where('postedAt', '>=', startTs)
        )
        const snap = await getDocs(q)
        if (!active) return
        
        const entries = snap.docs.map(d => ({ id: d.id, ...d.data() })) as any[]
        
        let totalIssued = 0
        let totalReturned = 0
        const itemIssuedMap = new Map<string, number>()

        for (const e of entries) {
          const qty = Math.abs(Number(e.qty) || 0)
          if (e.movementType === 'ISSUE') {
            totalIssued += qty
            const itemId = String(e.inventoryItemId ?? '')
            if (itemId) {
              itemIssuedMap.set(itemId, (itemIssuedMap.get(itemId) ?? 0) + qty)
            }
          } else if (e.movementType === 'RETURN') {
            totalReturned += qty
          }
        }

        const topConsumedItems: InvTopConsumedItem[] = Array.from(itemIssuedMap.entries())
          .map(([id, issued]): InvTopConsumedItem => {
            const storeItem = inventoryItems.find(i => i.id === id)
            const label = String(storeItem?.name ?? id)
            return { id, label, totalIssued: issued }
          })
          .sort((a, b) => b.totalIssued - a.totalIssued)
          .slice(0, 10)

        setStockMovement({ totalIssued, totalReturned, topConsumedItems })
      } catch (err) {
        console.error('[useUnifiedOperationalContext] Failed to fetch stock movement:', err)
        if (active) setStockMovement(undefined)
      } finally {
        if (active) setStockLoading(false)
      }
    }

    fetchMovement()
    return () => {
      active = false
    }
  }, [periodDays, inventoryItems])

  // Compute full analytics context
  const context = useMemo<UnifiedOperationalContext>(() => {
    const now = new Date()
    const periodStartDate = new Date(now)
    periodStartDate.setDate(periodStartDate.getDate() - periodDays)
    const overdueThresholdMs = overdueThresholdDays * 24 * 60 * 60 * 1000

    // Department name lookup resolver
    const resolveDepartmentName = (deptId: string): string => {
      if (!deptId) return 'Unknown Department'
      const dept = departments.find(d => d.id === deptId)
      return dept?.name ?? deptId
    }

    // ─────────────────────────────────────────────────────────────────────────
    // OPERATIONS DOMAIN
    // ─────────────────────────────────────────────────────────────────────────
    const statusMap = new Map<string, number>()
    let pendingApprovals = 0
    let completedInPeriod = 0
    const overdueOpenCards: any[] = []

    const PENDING_STATUS_SET = new Set(['SUBMITTED', 'APPROVAL_PENDING_ACCOUNTANT', 'APPROVAL_PENDING_MANAGER'])
    const TERMINAL_STATUS_SET = new Set(['COMPLETED', 'REJECTED'])
    const COMMITTED_OPEX_SET = new Set(['APPROVED', 'APPROVED_FOR_PAYMENT', 'PAYMENT_PROCESSED'])

    for (const card of jobCards) {
      const s = card.status ?? 'UNKNOWN'
      statusMap.set(s, (statusMap.get(s) ?? 0) + 1)

      if (PENDING_STATUS_SET.has(card.status)) {
        pendingApprovals++
      }

      if (card.status === 'COMPLETED') {
        const d = toDate(card.updatedAt)
        if (d !== null && d >= periodStartDate) {
          completedInPeriod++
        }
      }

      if (!TERMINAL_STATUS_SET.has(card.status) && card.status !== 'DRAFT') {
        const createdAt = toDate(card.createdAt)
        if (createdAt !== null) {
          const ageMs = now.getTime() - createdAt.getTime()
          if (ageMs > overdueThresholdMs) {
            overdueOpenCards.push({
              id: card.id,
              jobNumber: card.generalInfo?.jobNumber || card.id.substring(0, 8),
              jobTitle: card.generalInfo?.jobTitle || 'Untitled Job',
              status: card.status,
              requestingDepartmentId: card.generalInfo?.requestingDepartmentId || '',
              departmentName: resolveDepartmentName(card.generalInfo?.requestingDepartmentId || ''),
              createdAt: toLocalDateString(createdAt),
              daysOpen: Math.floor(ageMs / (24 * 60 * 60 * 1000))
            })
          }
        }
      }
    }

    overdueOpenCards.sort((a, b) => b.daysOpen - a.daysOpen)

    const opsJobCards = {
      total: jobCards.length,
      byStatus: Array.from(statusMap.entries()).map(([status, count]) => ({ status, count })).sort((a, b) => b.count - a.count),
      overdueOpenCards,
      pendingApprovals,
      completedInPeriod
    }

    // Granular summaries for first 50 cards
    const jobCardSummaries = jobCards
      .slice()
      .sort((a, b) => {
        const dateA = toDate(a.updatedAt)?.getTime() || 0
        const dateB = toDate(b.updatedAt)?.getTime() || 0
        return dateB - dateA
      })
      .slice(0, 50)
      .map(card => {
        const id = card.id as string

        // 1. Revenue (Sum of recorded payments)
        const revenue = jobPayments
          .filter((p: any) => p.jobCardId === id)
          .reduce((sum: number, p: any) => sum + (Number(p.amount) || 0), 0)

        // 2. Operational Expenses (Sum of approved/ledgered expenses)
        const opex = expenses
          .filter((e: any) => e.sourceJobId === id && COMMITTED_OPEX_SET.has(e.status))
          .reduce((sum: number, e: any) => sum + (Number(e.amount) || 0), 0)

        // 3. Inventory Cost (Sum of qtyIssued * costSnapshot)
        let inventoryCost = 0
        const sections = (card.requisitionSections as any[]) || []
        const flatItems = (card.requisitionItems as any[]) || []

        if (sections.length > 0) {
          sections.forEach(s => {
            (s.items || []).forEach((i: any) => {
              const cost = i.costSnapshot || i.purchaseCostSnapshot || 0
              inventoryCost += (Number(i.qtyIssued) || 0) * Number(cost)
            })
          })
        } else {
          flatItems.forEach(i => {
            const cost = i.costSnapshot || i.purchaseCostSnapshot || 0
            inventoryCost += (Number(i.qtyIssued) || 0) * Number(cost)
          })
        }

        const totalCost = opex + inventoryCost
        const margin = revenue - totalCost
        const marginPercent = revenue > 0 ? (margin / revenue) * 100 : 0
        const deptId = card.generalInfo?.requestingDepartmentId ?? ''

        return {
          id,
          jobNumber: card.generalInfo?.jobNumber || card.id.substring(0, 8),
          jobTitle: card.generalInfo?.jobTitle || 'Untitled Job',
          status: card.status || 'UNKNOWN',
          revenue,
          operationalExpenses: opex,
          inventoryCost,
          totalCost,
          margin,
          marginPercent,
          departmentName: resolveDepartmentName(deptId)
        }
      })

    // Expenses scope
    const opsExpensesInPeriod = expenses.filter(e => {
      const d = toDate(e.createdAt)
      return d !== null && d >= periodStartDate
    })

    let totalAmount = 0
    let approvedAmount = 0
    const opexCategoryMap = new Map<string, { total: number; count: number }>()
    const opexTrendMap = new Map<string, number>()

    for (let i = 0; i <= periodDays; i++) {
      const d = new Date(periodStartDate)
      d.setDate(d.getDate() + i)
      opexTrendMap.set(toLocalDateString(d), 0)
    }

    for (const e of opsExpensesInPeriod) {
      const amt = Number(e.amount) || 0
      totalAmount += amt
      
      if (COMMITTED_OPEX_SET.has(e.status)) {
        approvedAmount += amt
      }

      const cat = e.category || 'Uncategorised'
      const cur = opexCategoryMap.get(cat) ?? { total: 0, count: 0 }
      opexCategoryMap.set(cat, { total: cur.total + amt, count: cur.count + 1 })

      const d = toDate(e.createdAt)
      if (d !== null) {
        const key = toLocalDateString(d)
        if (opexTrendMap.has(key)) {
          opexTrendMap.set(key, (opexTrendMap.get(key) ?? 0) + amt)
        }
      }
    }

    const opexCategories = Array.from(opexCategoryMap.entries())
      .map(([category, { total, count }]) => ({ category, total, count }))
      .sort((a, b) => b.total - a.total)

    const opexTrend = Array.from(opexTrendMap.entries())
      .map(([date, total]) => ({ date, total }))
      .sort((a, b) => a.date.localeCompare(b.date))

    const largestOpexItems = [...opsExpensesInPeriod]
      .sort((a, b) => (Number(b.amount) || 0) - (Number(a.amount) || 0))
      .slice(0, 5)
      .map(e => ({
        id: e.id,
        description: e.description || e.title || e.category || 'Operational Expense',
        category: e.category || 'Uncategorised',
        amount: Number(e.amount) || 0,
        paymentMethod: e.paymentMethod ? String(e.paymentMethod).toUpperCase() : 'UNKNOWN',
        status: e.status,
        date: e.createdAt ? toLocalDateString(toDate(e.createdAt) || new Date()) : ''
      }))

    let pendingApprovalCount = 0
    let pendingManagerCount = 0
    for (const e of expenses) {
      if (e.status === 'PENDING_ACCOUNTANT') pendingApprovalCount++
      if (e.status === 'APPROVED_ACCOUNTANT') pendingManagerCount++
    }

    const opsExpenses: OpsExpenseAnalytics = {
      totalAmount,
      approvedAmount,
      byCategory: opexCategories,
      trend: opexTrend,
      largestItems: largestOpexItems,
      pendingApprovalCount,
      pendingManagerCount
    }

    // Transfers scope
    let totalCompletedTransferAmount = 0
    let completedInPeriodTransfers = 0
    let pendingAccountantTransfers = 0
    let pendingManagerTransfers = 0

    for (const t of transfers) {
      if (t.status === 'COMPLETED') {
        totalCompletedTransferAmount += Number(t.amount) || 0
        const completionDate = toDate(t.managerApprovedAt) ?? toDate(t.createdAt)
        if (completionDate !== null && completionDate >= periodStartDate) {
          completedInPeriodTransfers++
        }
      }
      if (t.status === 'PENDING_ACCOUNTANT') pendingAccountantTransfers++
      if (t.status === 'PENDING_MANAGER') pendingManagerTransfers++
    }

    const opsTransfers: OpsTransferAnalytics = {
      totalCompletedAmount: totalCompletedTransferAmount,
      completedInPeriod: completedInPeriodTransfers,
      pendingAccountantCount: pendingAccountantTransfers,
      pendingManagerCount: pendingManagerTransfers
    }

    // Balances. UNKNOWN (unrecognized payment methods) is kept as its own bucket —
    // folding it into INVENTORY hid mis-bucketed entries from the dashboard.
    const rawBalances = finalBalances as Record<string, number> || {}
    const accountBalances: OpsAccountBalance[] = Object.entries(rawBalances).map(
      ([account, balance]) => ({ account, balance })
    )

    // Department metrics
    const departmentMetrics: OpsDepartmentMetric[] = departments.map(dept => {
      const deptId = dept.id
      const deptCards = jobCards.filter(c => c.generalInfo?.requestingDepartmentId === deptId)
      
      let completedCount = 0
      let totalInvoiceValue = 0

      deptCards.forEach(card => {
        if (card.status === 'COMPLETED') {
          completedCount++
          totalInvoiceValue += Number(card.lockedTotalInvoiceValue)
            || Number(card.totals?.grandTotal)
            || 0
        }
      })

      const completionRate = deptCards.length > 0
        ? Math.round((completedCount / deptCards.length) * 100)
        : 0

      return {
        departmentId: deptId,
        departmentName: dept.name || deptId,
        jobCardCount: deptCards.length,
        completedCount,
        completionRate,
        totalInvoiceValue
      }
    }).sort((a, b) => b.jobCardCount - a.jobCardCount)

    // Ad-Hoc Expenses
    let adHocTotal = 0
    let adHocApproved = 0
    let adHocPending = 0
    let adHocCount = 0
    let adHocApprovedCount = 0
    let adHocPendingCount = 0
    let adHocTodayTotal = 0
    const adHocMethodMap = new Map<string, number>()
    const allRecentApproved: any[] = []

    const todayStr = toLocalDateString(new Date())

    for (const card of jobCards) {
      const adHocList = card.adHocExpenses || []
      const jobCardRef = card.generalInfo?.jobNumber || card.id.substring(0, 8)

      for (const item of adHocList) {
        const amt = Number(item.totalAmount) || (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0)
        const status = item.approvalStatus || 'PENDING'
        const method = item.paymentMethod ? String(item.paymentMethod).toUpperCase() : 'UNKNOWN'

        adHocTotal += amt
        adHocCount++

        if (status === 'APPROVED_MANAGER') {
          adHocApproved += amt
          adHocApprovedCount++
          
          adHocMethodMap.set(method, (adHocMethodMap.get(method) ?? 0) + amt)

          const itemDate = toDate(item.createdAt)
          let createdAtStr: string | undefined = undefined
          if (itemDate !== null) {
            createdAtStr = itemDate.toISOString()
            if (toLocalDateString(itemDate) === todayStr) {
              adHocTodayTotal += amt
            }
          }

          allRecentApproved.push({
            id: item.id || Math.random().toString(36).substring(2),
            description: item.description || 'Ad-Hoc Expense',
            amount: amt,
            paymentMethod: method,
            jobCardRef,
            createdAt: createdAtStr,
            rawCreatedAtDate: itemDate
          })
        } else {
          adHocPending += amt
          adHocPendingCount++
        }
      }
    }

    allRecentApproved.sort((a, b) => {
      const timeA = a.rawCreatedAtDate ? a.rawCreatedAtDate.getTime() : 0
      const timeB = b.rawCreatedAtDate ? b.rawCreatedAtDate.getTime() : 0
      return timeB - timeA
    })
    const recentApproved = allRecentApproved.slice(0, 5).map(x => {
      const { rawCreatedAtDate, ...rest } = x
      return rest
    })

    const byPaymentMethod = Array.from(adHocMethodMap.entries()).map(([method, total]) => ({
      method,
      total
    }))

    const adHocExpenses = {
      total: adHocTotal,
      approved: adHocApproved,
      pending: adHocPending,
      count: adHocCount,
      approvedCount: adHocApprovedCount,
      pendingCount: adHocPendingCount,
      todayTotal: adHocTodayTotal,
      byPaymentMethod,
      recentApproved
    }

    const operations: OperationsAnalyticsContext = {
      periodStart: toLocalDateString(periodStartDate),
      jobCards: opsJobCards,
      jobCardSummaries,
      expenses: opsExpenses,
      transfers: opsTransfers,
      accountBalances,
      departmentMetrics,
      approvalCycleTimes: {},
      adHocExpenses
    }

    // ─────────────────────────────────────────────────────────────────────────
    // FINANCE DOMAIN
    // ─────────────────────────────────────────────────────────────────────────
    const paymentsInPeriod = jobPayments.filter(p => {
      const d = toDate(p.createdAt)
      return d !== null && d >= periodStartDate
    })

    let incomeTotal = 0
    const incomeMethodMap = new Map<string, { total: number; count: number }>()
    const incomeTrendMap = new Map<string, number>()

    for (let i = 0; i <= periodDays; i++) {
      const d = new Date(periodStartDate)
      d.setDate(d.getDate() + i)
      incomeTrendMap.set(toLocalDateString(d), 0)
    }

    let largestAmt = -1
    let largestRec: any = null

    for (const p of paymentsInPeriod) {
      const amt = Number(p.amount) || 0
      incomeTotal += amt

      const method = p.paymentMethod ? String(p.paymentMethod).toUpperCase() : 'UNKNOWN'
      const cur = incomeMethodMap.get(method) ?? { total: 0, count: 0 }
      incomeMethodMap.set(method, { total: cur.total + amt, count: cur.count + 1 })

      const d = toDate(p.createdAt)
      if (d !== null) {
        const key = toLocalDateString(d)
        if (incomeTrendMap.has(key)) {
          incomeTrendMap.set(key, (incomeTrendMap.get(key) ?? 0) + amt)
        }
      }

      if (amt > largestAmt) {
        largestAmt = amt
        largestRec = p
      }
    }

    let largestPayment = undefined
    if (largestRec !== null) {
      const d = toDate(largestRec.createdAt)
      largestPayment = {
        id: String(largestRec.id ?? ''),
        amount: Number(largestRec.amount) || 0,
        method: largestRec.paymentMethod ? String(largestRec.paymentMethod).toUpperCase() : 'UNKNOWN',
        jobCardId: String(largestRec.jobCardId ?? ''),
        date: d !== null ? toLocalDateString(d) : 'Unknown'
      }
    }

    const income = {
      totalReceived: incomeTotal,
      totalCount: paymentsInPeriod.length,
      byPaymentMethod: Array.from(incomeMethodMap.entries()).map(([method, { total, count }]) => ({ method, total, count })).sort((a, b) => b.total - a.total),
      trend: Array.from(incomeTrendMap.entries()).map(([date, amount]) => ({ date, amount })).sort((a, b) => a.date.localeCompare(b.date)),
      largestPayment
    }

    let totalPaid = 0
    let totalUnpaid = 0
    let unpaidCount = 0
    const byMonth: any[] = []

    for (const p of payrolls) {
      const net = Number(p.netPay) || 0
      if (p.status === 'Paid') {
        totalPaid += net
      } else {
        totalUnpaid += net
        unpaidCount++
      }
      byMonth.push({
        month: p.month,
        year: p.year,
        total: net,
        status: p.status
      })
    }

    byMonth.sort((a, b) => a.year !== b.year ? a.year - b.year : a.month - b.month)

    const payroll = {
      totalPaid,
      totalUnpaid,
      unpaidCount,
      byMonth
    }

    const finance: FinanceAnalyticsContext = { income, payroll }

    // ─────────────────────────────────────────────────────────────────────────
    // CRM DOMAIN
    // ─────────────────────────────────────────────────────────────────────────
    const crmCustomers = customers.map(c => ({
      id: String(c.id ?? ''),
      name: String(c.name ?? '')
    }))

    let quoteTotalCount = 0
    let quoteApproved = 0
    let quoteDraft = 0
    let quoteTotalValue = 0

    for (const q of quotes) {
      quoteTotalCount++
      quoteTotalValue += Number(q.grandTotal) || 0
      const status = String(q.status ?? '').toUpperCase()
      if (status === 'APPROVED') quoteApproved++
      else if (status === 'DRAFT') quoteDraft++
    }

    const quoteAnalytics = {
      total: quoteTotalCount,
      approved: quoteApproved,
      draft: quoteDraft,
      totalValue: quoteTotalValue,
      ...(quoteTotalCount > 0
        ? { avgDealSize: Math.round((quoteTotalValue / quoteTotalCount) * 100) / 100 }
        : {})
    }

    let invTotal = 0
    let invPaid = 0
    let invUnpaid = 0
    let invPartial = 0
    let totalOutstanding = 0
    let largestOutstanding = undefined

    for (const inv of invoices) {
      invTotal++
      const status = String(inv.status ?? '').toUpperCase()
      const grandTotal = Number(inv.grandTotal) || 0
      const amountPaid = Number(inv.amountPaid) || 0
      const outstanding = Math.max(0, grandTotal - amountPaid)

      if (status === 'PAID') {
        invPaid++
      } else if (status === 'PARTIAL') {
        invPartial++
        totalOutstanding += outstanding
      } else {
        invUnpaid++
        totalOutstanding += outstanding
      }

      if (status !== 'PAID' && outstanding > 0) {
        if (
          largestOutstanding === undefined ||
          outstanding > (largestOutstanding.grandTotal - largestOutstanding.amountPaid)
        ) {
          largestOutstanding = {
            id: String(inv.id ?? ''),
            customerName: String(inv.customerName ?? ''),
            grandTotal,
            amountPaid
          }
        }
      }
    }

    const invoiceAnalytics = {
      total: invTotal,
      paid: invPaid,
      unpaid: invUnpaid,
      partial: invPartial,
      totalOutstanding,
      largestOutstanding
    }

    const stageMap = new Map<string, number>()
    const sourceMap = new Map<string, { count: number; value: number }>()
    let pipelineValue = 0
    let wonCount = 0
    let lostCount = 0

    for (const lead of leads) {
      const stage = String(lead.stage ?? 'Unknown')
      stageMap.set(stage, (stageMap.get(stage) ?? 0) + 1)

      const val = Number(lead.value) || 0
      if (stage !== 'Lost') pipelineValue += val
      if (stage === 'Won') wonCount++
      if (stage === 'Lost') lostCount++

      const source = String(lead.source ?? 'Unknown')
      const cur = sourceMap.get(source) ?? { count: 0, value: 0 }
      sourceMap.set(source, { count: cur.count + 1, value: cur.value + val })
    }

    const leadAnalytics = {
      total: leads.length,
      byStage: Object.fromEntries(stageMap.entries()),
      pipelineValue,
      wonCount,
      lostCount,
      bySource: Array.from(sourceMap.entries()).map(([source, { count, value }]) => ({ source, count, value })).sort((a, b) => b.count - a.count)
    }

    const crm: CrmAnalyticsContext = {
      customers: crmCustomers,
      customerCount: crmCustomers.length,
      quotes: quoteAnalytics,
      invoices: invoiceAnalytics,
      leads: leadAnalytics
    }

    // ─────────────────────────────────────────────────────────────────────────
    // HR DOMAIN
    // ─────────────────────────────────────────────────────────────────────────
    let activeHeadcount = 0
    let onLeaveHeadcount = 0
    const hrDeptMap = new Map<string, number>()

    for (const emp of employees) {
      if (emp.status === 'Active') activeHeadcount++
      if (emp.status === 'On Leave') onLeaveHeadcount++
      const dept = String(emp.department || 'Unknown')
      hrDeptMap.set(dept, (hrDeptMap.get(dept) ?? 0) + 1)
    }

    const headcount = {
      total: employees.length,
      active: activeHeadcount,
      onLeave: onLeaveHeadcount,
      byDepartment: Array.from(hrDeptMap.entries()).map(([departmentLabel, count]) => ({ departmentLabel, count })).sort((a, b) => b.count - a.count)
    }

    let pendingLeave = 0
    let approvedLeaveThisPeriod = 0
    const leaveTypeMap = new Map<string, number>()

    for (const lr of leaveRequests) {
      if (lr.status === 'Pending') pendingLeave++
      if (lr.status === 'Approved') {
        const d = toDate(lr.createdAt)
        if (d !== null && d >= periodStartDate) {
          approvedLeaveThisPeriod++
        }
      }
      const type = String(lr.type || 'Unknown')
      leaveTypeMap.set(type, (leaveTypeMap.get(type) ?? 0) + 1)
    }

    const leave = {
      pendingRequests: pendingLeave,
      approvedThisPeriod: approvedLeaveThisPeriod,
      byType: Array.from(leaveTypeMap.entries()).map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count)
    }

    const reviewsInPeriod = performanceReviews.filter(r => {
      const d = toDate(r.generatedAt)
      return d !== null && d >= periodStartDate
    })

    let scoreSum = 0
    let scoreCount = 0

    for (const r of reviewsInPeriod) {
      const score = Number(r.overallScore)
      if (!isNaN(score)) {
        scoreSum += score
        scoreCount++
      }
    }

    const performance = {
      reviewCount: reviewsInPeriod.length,
      ...(scoreCount > 0
        ? { avgScore: Math.round((scoreSum / scoreCount) * 100) / 100 }
        : {}),
      byDepartment: []
    }

    let openRoles = 0
    let totalApplicants = 0

    for (const jp of jobPostings) {
      if (jp.status === 'Open') {
        openRoles++
        totalApplicants += (jp.applicants ?? []).length
      }
    }

    const recruitment = { openRoles, totalApplicants }

    const hr: HrAnalyticsContext = { headcount, leave, performance, recruitment }

    // ─────────────────────────────────────────────────────────────────────────
    // INVENTORY DOMAIN
    // ─────────────────────────────────────────────────────────────────────────
    const inventory: InventoryAnalyticsContext = {
      totalItems: inventoryItems.length,
      activeItems: inventoryItems.filter(i => i.isActive).length,
      lowStockCount: lowStockItemsList.length,
      totalInventoryValue: totalInventoryValueVal,
      ...(stockMovement !== undefined ? { stockMovement } : {})
    }

    return {
      generatedAt: new Date().toISOString(),
      periodDays,
      operations,
      finance,
      crm,
      hr,
      inventory
    }
  }, [
    periodDays,
    overdueThresholdDays,
    jobCards,
    expenses,
    transfers,
    jobPayments,
    topUps,
    salariesTransactions,
    finalBalances,
    historicalInventoryCost,
    departments,
    inventoryItems,
    lowStockItemsList,
    totalInventoryValueVal,
    employees,
    leaveRequests,
    performanceReviews,
    jobPostings,
    payrolls,
    customers,
    quotes,
    invoices,
    leads,
    stockMovement
  ])

  return {
    context,
    stockLoading
  }
}
