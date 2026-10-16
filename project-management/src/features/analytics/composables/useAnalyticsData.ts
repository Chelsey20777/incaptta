/**
 * useAnalyticsData — Analytics Data Aggregation Composable
 *
 * Reads from existing Pinia stores and computes structured analytics metrics
 * locally in the application. No AI, no backend calls, no Firestore writes.
 *
 * Stores consumed (read-only):
 *   - useJobCardsStore  → jobCards[]
 *   - useFinanceStore   → expenses[], transfers[], finalBalances
 *   - useAdminStore     → departments[]
 *   - useInventoryStore → items[], lowStockItems (computed), totalValue (computed)
 *
 * The caller is responsible for ensuring these stores are hydrated before
 * accessing payload.value. Stores are NOT fetched here — that is the
 * responsibility of the page/component that mounts the analytics feature.
 *
 * Returns a Vue computed ref that reactively recomputes whenever any of the
 * underlying store values change. No manual refresh is needed.
 */

import { computed, toValue } from 'vue'
import { useJobCardsStore } from '@/features/jobCards/store/jobCardsStore'
import { useFinanceStore } from '@/features/fundTransfers/store/financeStore'
import { useAdminStore } from '@/features/admin/store/adminStore'
import { useInventoryStore } from '@/features/inventory/store/inventoryStore'
import type {
  AnalyticsOptions,
  AnalyticsPayload,
  OverdueJobCard,
  JobCardStatusCount,
  CategoryTotal,
  DailyExpenseTotal,
  LargestExpenseItem,
  AccountBalance,
  DepartmentMetric,
  JobCardFinancialSummary,
} from '../types/analytics'
import {
  PENDING_JOB_CARD_STATUSES,
  TERMINAL_JOB_CARD_STATUSES,
  COMMITTED_OPEX_STATUSES,
} from '../types/analytics'

// ─── Module-level constants ───────────────────────────────────────────────────

const DEFAULT_PERIOD_DAYS = 30
const DEFAULT_OVERDUE_THRESHOLD_DAYS = 14

/**
 * Maximum number of individual expense items returned in largestItems.
 * Kept small intentionally — this list is for display and AI summarisation,
 * not a full ledger export.
 */
const LARGEST_EXPENSE_LIMIT = 5

// Pre-compute Set instances once for O(1) lookups inside computed
const PENDING_STATUS_SET = new Set<string>(PENDING_JOB_CARD_STATUSES)
const TERMINAL_STATUS_SET = new Set<string>(TERMINAL_JOB_CARD_STATUSES)
const COMMITTED_OPEX_SET = new Set<string>(COMMITTED_OPEX_STATUSES)

/**
 * Maximum number of Job Cards to include in the granular financial summary.
 * Limited to preserve token count in AI context and UI performance.
 */
const CARD_SUMMARY_LIMIT = 50

// ─── Timestamp conversion helper ─────────────────────────────────────────────

/**
 * Safely converts a Firestore Timestamp, JS Date, ISO string, or Unix millis
 * to a plain JS Date. Returns null on any failure — all callers must guard.
 *
 * Firestore Timestamps expose a .toDate() method. Spreaded document data
 * preserves the Timestamp object, so this is the primary case we handle.
 */
function toDate(value: unknown): Date | null {
  if (value === null || value === undefined) return null

  // Firestore Timestamp (has .toDate method)
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

  // Unix milliseconds (defensive — unlikely in this codebase but safe to handle)
  if (typeof value === 'number') {
    const d = new Date(value)
    return isNaN(d.getTime()) ? null : d
  }

  return null
}

/**
 * Formats a JS Date to 'YYYY-MM-DD' in LOCAL time (not UTC).
 * Using local time matches how the rest of the application formats dates
 * (e.g. toLocaleDateString in financeStore.updateLedger).
 *
 * This avoids the common off-by-one-day bug that occurs when using
 * date.toISOString().split('T')[0] with dates near midnight in UTC+offset zones.
 */
function toLocalDateString(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

// ─── Composable ───────────────────────────────────────────────────────────────

export function useAnalyticsData(options?: AnalyticsOptions) {
  // ── Store access — READ ONLY, no mutations ever ────────────────────────────
  const jobCardsStore = useJobCardsStore()
  const financeStore = useFinanceStore()
  const adminStore = useAdminStore()
  const inventoryStore = useInventoryStore()

  // ── Department name resolver ───────────────────────────────────────────────
  /**
   * Looks up a department name by its Firestore document ID.
   * Returns the departmentId itself if not found (safe fallback — avoids
   * surfacing a blank value while allowing future debugging).
   */
  function resolveDepartmentName(departmentId: string): string {
    if (!departmentId) return 'Unknown Department'
    const dept = adminStore.departments.find(d => d.id === departmentId)
    return dept?.name ?? departmentId
  }

  // ── Main computed payload ──────────────────────────────────────────────────
  /**
   * Reactive computed payload. Automatically recomputes whenever any of the
   * consumed store refs change (jobCards, expenses, transfers, departments,
   * inventory items, finalBalances).
   *
   * Complexity: O(n) across each store collection — no nested quadratic loops.
   * Department metrics are O(departments × cards) which is bounded in practice.
   */
  const payload = computed<AnalyticsPayload>(() => {
    // Resolve reactive or plain values at compute time so the computed tracks
    // any Ref / getter passed in options (e.g. the period selector ref).
    const periodDays = toValue(options?.periodDays ?? DEFAULT_PERIOD_DAYS)
    const overdueThresholdDays = toValue(options?.overdueThresholdDays ?? DEFAULT_OVERDUE_THRESHOLD_DAYS)

    const now = new Date()

    // Period boundary — all period-scoped metrics use this as their lower bound
    const periodStartDate = new Date(now)
    periodStartDate.setDate(periodStartDate.getDate() - periodDays)

    // Overdue threshold in milliseconds for fast comparison
    const overdueThresholdMs = overdueThresholdDays * 24 * 60 * 60 * 1000

    // ── Job Cards ─────────────────────────────────────────────────────────────
    // Cast to any[] — the store uses ref<any[]>() with no static typing.
    const allCards = jobCardsStore.jobCards as any[]

    // Count by status — single pass
    const statusMap = new Map<string, number>()
    for (const card of allCards) {
      const s: string = card.status ?? 'UNKNOWN'
      statusMap.set(s, (statusMap.get(s) ?? 0) + 1)
    }
    const byStatus: JobCardStatusCount[] = Array.from(statusMap.entries())
      .map(([status, count]) => ({ status, count }))
      .sort((a, b) => b.count - a.count)

    // Pending approvals: cards actively waiting in a workflow step
    let pendingApprovals = 0
    for (const card of allCards) {
      if (PENDING_STATUS_SET.has(card.status)) pendingApprovals++
    }

    // Completed within period — uses updatedAt as proxy (see type JSDoc for limitation)
    let completedInPeriod = 0
    for (const card of allCards) {
      if (card.status !== 'COMPLETED') continue
      const d = toDate(card.updatedAt)
      if (d !== null && d >= periodStartDate) completedInPeriod++
    }

    // Overdue open cards — non-terminal, non-DRAFT, older than threshold
    const overdueOpenCards: OverdueJobCard[] = []
    for (const card of allCards) {
      if (TERMINAL_STATUS_SET.has(card.status) || card.status === 'DRAFT') continue
      const createdAt = toDate(card.createdAt)
      if (createdAt === null) continue
      if ((now.getTime() - createdAt.getTime()) <= overdueThresholdMs) continue

      const daysOpen = Math.floor(
        (now.getTime() - createdAt.getTime()) / (24 * 60 * 60 * 1000)
      )
      const deptId: string = card.generalInfo?.requestingDepartmentId ?? ''

      overdueOpenCards.push({
        id: card.id as string,
        // generalInfo.jobNumber confirmed in CreateJobCard.vue line 169
        jobNumber: card.generalInfo?.jobNumber ?? card.id.substring(0, 8),
        // generalInfo.jobTitle confirmed in CreateJobCard.vue line 165
        jobTitle: card.generalInfo?.jobTitle ?? 'Untitled',
        status: card.status as string,
        requestingDepartmentId: deptId,
        departmentName: resolveDepartmentName(deptId),
        createdAt: toLocalDateString(createdAt),
        daysOpen,
      })
    }
    // Most overdue first
    overdueOpenCards.sort((a, b) => b.daysOpen - a.daysOpen)

    // ── Expenses ──────────────────────────────────────────────────────────────
    // financeStore.expenses → operationalExpenses collection (all statuses)
    const allExpenses = financeStore.expenses as any[]

    // Period-scoped subset
    const expensesInPeriod: any[] = []
    for (const e of allExpenses) {
      const d = toDate(e.createdAt)
      if (d !== null && d >= periodStartDate) expensesInPeriod.push(e)
    }

    // Total requested amount (all statuses) in period
    let totalExpenseAmount = 0
    for (const e of expensesInPeriod) {
      totalExpenseAmount += Number(e.amount) || 0
    }

    // Approved/committed amount in period
    let approvedAmount = 0
    for (const e of expensesInPeriod) {
      if (COMMITTED_OPEX_SET.has(e.status)) {
        approvedAmount += Number(e.amount) || 0
      }
    }

    // By category — single pass
    const categoryMap = new Map<string, { total: number; count: number }>()
    for (const e of expensesInPeriod) {
      // operationalExpenses.category is a free-text string, confirmed in
      // financeStore.updateLedger (line 77) and hrStore.markPayrollPaid (line 216)
      const cat: string = e.category ?? 'Uncategorised'
      const cur = categoryMap.get(cat) ?? { total: 0, count: 0 }
      categoryMap.set(cat, {
        total: cur.total + (Number(e.amount) || 0),
        count: cur.count + 1,
      })
    }
    const byCategory: CategoryTotal[] = Array.from(categoryMap.entries())
      .map(([category, { total, count }]) => ({ category, total, count }))
      .sort((a, b) => b.total - a.total)

    // Daily trend — pre-fill every day in range with 0 so chart has no gaps
    const trendMap = new Map<string, number>()
    for (let i = 0; i <= periodDays; i++) {
      const d = new Date(periodStartDate)
      d.setDate(d.getDate() + i)
      trendMap.set(toLocalDateString(d), 0)
    }
    for (const e of expensesInPeriod) {
      const d = toDate(e.createdAt)
      if (d !== null) {
        const key = toLocalDateString(d)
        if (trendMap.has(key)) {
          trendMap.set(key, (trendMap.get(key) ?? 0) + (Number(e.amount) || 0))
        }
      }
    }
    const trend: DailyExpenseTotal[] = Array.from(trendMap.entries())
      .map(([date, total]) => ({ date, total }))
      .sort((a, b) => a.date.localeCompare(b.date))

    // Top-N largest expense items in period — shallow copy to avoid mutating store
    const largestItems: LargestExpenseItem[] = [...expensesInPeriod]
      .sort((a, b) => (Number(b.amount) || 0) - (Number(a.amount) || 0))
      .slice(0, LARGEST_EXPENSE_LIMIT)
      .map(e => {
        const d = toDate(e.createdAt)
        return {
          id: e.id as string,
          // Description fallback chain mirrors financeStore.updateLedger line 77
          description: e.description ?? e.title ?? e.category ?? 'Operational Expense',
          category: e.category ?? 'Uncategorised',
          amount: Number(e.amount) || 0,
          // paymentMethod normalised to uppercase to align with account keys
          paymentMethod: e.paymentMethod ? String(e.paymentMethod).toUpperCase() : 'UNKNOWN',
          status: e.status as string,
          date: d !== null ? toLocalDateString(d) : 'Unknown',
        }
      })

    // Queue depths — ALL expenses (not period-limited) for current workload view
    let expPendingApprovalCount = 0
    let expPendingManagerCount = 0
    for (const e of allExpenses) {
      if (e.status === 'PENDING_ACCOUNTANT') expPendingApprovalCount++
      // APPROVED_ACCOUNTANT = waiting for manager final approval
      if (e.status === 'APPROVED_ACCOUNTANT') expPendingManagerCount++
    }

    // ── Transfers ──────────────────────────────────────────────────────────────
    // financeStore.transfers → fundTransfers collection
    // Note: financeStore.fetchTransfers spreads doc.data() AND adds a derived
    // `date` string field. The raw Timestamp is preserved as `createdAt`.
    const allTransfers = financeStore.transfers as any[]

    let totalCompletedTransferAmount = 0
    let completedInPeriodTransfers = 0
    let pendingAccountantTransfers = 0
    let pendingManagerTransfers = 0

    for (const t of allTransfers) {
      if (t.status === 'COMPLETED') {
        totalCompletedTransferAmount += Number(t.amount) || 0

        // Use managerApprovedAt (set in financeStore.approveTransfer) as the
        // completion date. Fall back to createdAt for records that pre-date the field.
        const completionDate = toDate(t.managerApprovedAt) ?? toDate(t.createdAt)
        if (completionDate !== null && completionDate >= periodStartDate) {
          completedInPeriodTransfers++
        }
      }
      if (t.status === 'PENDING_ACCOUNTANT') pendingAccountantTransfers++
      if (t.status === 'PENDING_MANAGER') pendingManagerTransfers++
    }

    // ── Account Balances ───────────────────────────────────────────────────────
    // financeStore.finalBalances is already computed by updateLedger.
    // We read the result — we do NOT recompute balances here.
    const rawBalances = financeStore.finalBalances as Record<string, number>
    const merged: Record<string, number> = {}
    
    Object.entries(rawBalances).forEach(([account, balance]) => {
      let key = account
      // Group old 'UNKNOWN' COGS with new 'INVENTORY' classification
      if (key === 'UNKNOWN') key = 'INVENTORY'
      merged[key] = (merged[key] || 0) + balance
    })

    const accountBalances: AccountBalance[] = Object.entries(merged).map(
      ([account, balance]) => ({ account, balance })
    )

    // ── Department Metrics ─────────────────────────────────────────────────────
    // adminStore.departments → 'departments' Firestore collection
    // Joined to job cards via generalInfo.requestingDepartmentId === department.id
    //
    // NOTE: HR employee.department is a free-text string (not an ID), so
    // employee headcount cannot be reliably joined here without risking
    // string-name mismatches. Headcount is deferred to a future phase.
    const departmentMetrics: DepartmentMetric[] = adminStore.departments.map(dept => {
      let jobCardCount = 0
      let completedCount = 0
      let totalInvoiceValue = 0

      for (const card of allCards) {
        if (card.generalInfo?.requestingDepartmentId !== dept.id) continue
        jobCardCount++

        if (card.status === 'COMPLETED') {
          completedCount++
          // Field precedence documented in AnalyticsPayload JSDoc:
          //   1. lockedTotalInvoiceValue — financially locked at APPROVED_MANAGER
          //   2. totals.grandTotal       — creation-time estimate (legacy fallback)
          totalInvoiceValue += Number(card.lockedTotalInvoiceValue)
            || Number(card.totals?.grandTotal)
            || 0
        }
      }

      const completionRate = jobCardCount > 0
        ? Math.round((completedCount / jobCardCount) * 100)
        : 0

      return {
        departmentId: dept.id as string,
        departmentName: dept.name ?? dept.id,
        jobCardCount,
        completedCount,
        completionRate,
        totalInvoiceValue,
      }
    }).sort((a, b) => b.jobCardCount - a.jobCardCount)

    // ── Job Card Financial Summaries ───────────────────────────────────────────
    // Join payments, expenses, and inventory usage to provide a per-card margin view.
    // Sorted by updatedAt desc to show most recent activity first.
    const jobPayments = financeStore.jobPayments as any[]

    const jobCardSummaries: JobCardFinancialSummary[] = [...allCards]
      .sort((a, b) => {
        const dateA = toDate(a.updatedAt)?.getTime() || 0
        const dateB = toDate(b.updatedAt)?.getTime() || 0
        return dateB - dateA
      })
      .slice(0, CARD_SUMMARY_LIMIT)
      .map(card => {
        const id = card.id as string

        // 1. Revenue (Sum of recorded payments)
        const revenue = jobPayments
          .filter(p => p.jobCardId === id)
          .reduce((sum, p) => sum + (Number(p.amount) || 0), 0)

        // 2. Operational Expenses (Sum of approved/ledgered expenses)
        const opex = allExpenses
          .filter(e => e.sourceJobId === id && COMMITTED_OPEX_SET.has(e.status))
          .reduce((sum, e) => sum + (Number(e.amount) || 0), 0)

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
          id: card.id as string,
          jobNumber: card.generalInfo?.jobNumber ?? card.id.substring(0, 8),
          jobTitle: card.generalInfo?.jobTitle ?? 'Untitled',
          status: card.status as string,
          revenue,
          operationalExpenses: opex,
          inventoryCost,
          totalCost,
          margin,
          marginPercent,
          departmentName: resolveDepartmentName(deptId)
        }
      })

    // ── Inventory Snapshot ─────────────────────────────────────────────────────
    // inventoryStore.lowStockItems and inventoryStore.totalValue are computed
    // properties on the store — we read them directly.
    const allInventoryItems = inventoryStore.items
    const activeItemCount = allInventoryItems.filter(i => i.isActive).length

    // ── Assemble and return ────────────────────────────────────────────────────
    return {
      generatedAt: now.toISOString(),
      periodDays,
      periodStart: toLocalDateString(periodStartDate),

      jobCards: {
        total: allCards.length,
        byStatus,
        overdueOpenCards,
        pendingApprovals,
        completedInPeriod,
      },

      expenses: {
        totalAmount: totalExpenseAmount,
        approvedAmount,
        byCategory,
        trend,
        largestItems,
        pendingApprovalCount: expPendingApprovalCount,
        pendingManagerCount: expPendingManagerCount,
      },

      transfers: {
        totalCompletedAmount: totalCompletedTransferAmount,
        completedInPeriod: completedInPeriodTransfers,
        pendingAccountantCount: pendingAccountantTransfers,
        pendingManagerCount: pendingManagerTransfers,
      },

      jobCardSummaries,

      accountBalances,
      departmentMetrics,

      inventory: {
        totalItems: allInventoryItems.length,
        activeItems: activeItemCount,
        lowStockCount: inventoryStore.lowStockItems.length,
        totalInventoryValue: inventoryStore.totalValue,
      },
    } satisfies AnalyticsPayload
  })

  // ── Exposed API ────────────────────────────────────────────────────────────
  return {
    /**
     * Readonly reactive computed ref. Access via payload.value.
     * Automatically recomputes when any consumed store updates.
     *
     * Consumers MUST NOT mutate payload.value or any nested objects.
     * To derive additional values, create a separate computed() that reads
     * from this payload.
     */
    payload: payload as Readonly<typeof payload>,

    /**
     * Reactive resolved period in days. Useful for "Last N days" display labels.
     * Tracks the options.periodDays ref/getter if one was passed.
     */
    resolvedPeriodDays: computed(() => toValue(options?.periodDays ?? DEFAULT_PERIOD_DAYS)),

    /**
     * Reactive resolved overdue threshold in days.
     */
    resolvedOverdueDays: computed(() => toValue(options?.overdueThresholdDays ?? DEFAULT_OVERDUE_THRESHOLD_DAYS)),
  }
}
