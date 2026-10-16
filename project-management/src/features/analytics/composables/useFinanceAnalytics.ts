/**
 * useFinanceAnalytics — Finance Domain Analytics Composable
 *
 * Computes FinanceAnalyticsContext by reading:
 *   - financeStore.jobPayments → income from client payments
 *   - hrStore.payrolls         → payroll liability summary
 *
 * Income metrics are period-scoped (periodDays look-back window).
 * Payroll metrics are all-time — outstanding liability is not period-limited.
 *
 * The caller is responsible for ensuring the stores are hydrated before
 * accessing context.value. No Firestore writes occur here.
 */

import { computed, toValue } from 'vue'
import type { Ref } from 'vue'
import { useFinanceStore } from '@/features/fundTransfers/store/financeStore'
import { useHrStore } from '@/features/hr/store/hrStore'
import type {
  FinanceAnalyticsContext,
  FinanceIncomeAnalytics,
  FinancePayrollAnalytics,
  FinancePayrollByMonth,
  FinanceLargestPayment,
} from '../types/unified-context'

// ─── Helpers (duplicated from useAnalyticsData — no shared import to keep
//     composables independently loadable without pulling in ops data) ───────────

function toDate(value: unknown): Date | null {
  if (value === null || value === undefined) return null
  if (typeof (value as any).toDate === 'function') {
    try {
      const d = (value as any).toDate() as Date
      return isNaN(d.getTime()) ? null : d
    } catch { return null }
  }
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value
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

function toLocalDateString(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

// ─── Composable ───────────────────────────────────────────────────────────────

export function useFinanceAnalytics(periodDays: Ref<number>) {
  const financeStore = useFinanceStore()
  const hrStore = useHrStore()

  const context = computed<FinanceAnalyticsContext>(() => {
    const days = toValue(periodDays)
    const now = new Date()
    const periodStartDate = new Date(now)
    periodStartDate.setDate(periodStartDate.getDate() - days)

    // ── Income (jobPayments) ─────────────────────────────────────────────────
    // jobPayments collection: { id, amount, paymentMethod, jobCardId, createdAt }
    // NOTE: no customerName or description on jobPayments documents — see JSDoc
    // on FinanceIncomeAnalytics in unified-context.ts.
    const allPayments = financeStore.jobPayments as any[]
    const paymentsInPeriod = allPayments.filter(p => {
      const d = toDate(p.createdAt)
      return d !== null && d >= periodStartDate
    })

    let totalReceived = 0
    const methodMap = new Map<string, { total: number; count: number }>()

    // Pre-fill trend with zero for every day in the window (no chart gaps)
    const trendMap = new Map<string, number>()
    for (let i = 0; i <= days; i++) {
      const d = new Date(periodStartDate)
      d.setDate(d.getDate() + i)
      trendMap.set(toLocalDateString(d), 0)
    }

    let largestAmt = -1
    let largestRec: any = null

    for (const p of paymentsInPeriod) {
      const amt = Number(p.amount) || 0
      totalReceived += amt

      const method = p.paymentMethod ? String(p.paymentMethod).toUpperCase() : 'UNKNOWN'
      const cur = methodMap.get(method) ?? { total: 0, count: 0 }
      methodMap.set(method, { total: cur.total + amt, count: cur.count + 1 })

      const d = toDate(p.createdAt)
      if (d !== null) {
        const key = toLocalDateString(d)
        if (trendMap.has(key)) trendMap.set(key, (trendMap.get(key) ?? 0) + amt)
      }

      if (amt > largestAmt) { largestAmt = amt; largestRec = p }
    }

    let largestPayment: FinanceLargestPayment | undefined
    if (largestRec !== null) {
      const d = toDate(largestRec.createdAt)
      largestPayment = {
        id: String(largestRec.id ?? ''),
        amount: Number(largestRec.amount) || 0,
        method: largestRec.paymentMethod ? String(largestRec.paymentMethod).toUpperCase() : 'UNKNOWN',
        jobCardId: String(largestRec.jobCardId ?? ''),
        date: d !== null ? toLocalDateString(d) : 'Unknown',
      }
    }

    const income: FinanceIncomeAnalytics = {
      totalReceived,
      totalCount: paymentsInPeriod.length,
      byPaymentMethod: Array.from(methodMap.entries())
        .map(([method, { total, count }]) => ({ method, total, count }))
        .sort((a, b) => b.total - a.total),
      trend: Array.from(trendMap.entries())
        .map(([date, amount]) => ({ date, amount }))
        .sort((a, b) => a.date.localeCompare(b.date)),
      ...(largestPayment !== undefined ? { largestPayment } : {}),
    }

    // ── Payroll ──────────────────────────────────────────────────────────────
    // hrStore.payrolls: all payroll records, ordered by generatedAt desc.
    // No period filter — payroll liability (Unpaid records) is always all-time.
    // Status values: 'Unpaid' | 'Paid'  (confirmed in hr/types/index.ts)
    const allPayrolls = hrStore.payrolls

    let totalPaid = 0
    let totalUnpaid = 0
    let unpaidCount = 0
    const byMonth: FinancePayrollByMonth[] = []

    for (const p of allPayrolls) {
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
        status: p.status,
      })
    }

    // Chronological order for charting
    byMonth.sort((a, b) => a.year !== b.year ? a.year - b.year : a.month - b.month)

    const payroll: FinancePayrollAnalytics = {
      totalPaid,
      totalUnpaid,
      unpaidCount,
      byMonth,
    }

    return { income, payroll }
  })

  return {
    /**
     * Readonly reactive computed ref. Access via context.value.
     * Recomputes whenever financeStore.jobPayments or hrStore.payrolls updates.
     */
    context: context as Readonly<typeof context>,
  }
}
