/**
 * useUnifiedOperationalContext — Root Analytics Context Composable
 *
 * Assembles a fully reactive UnifiedOperationalContext by composing all five
 * domain analytics composables. Every domain recomputes independently whenever
 * its source stores change; the root computed recomputes whenever any domain
 * value changes.
 *
 * ── Architecture pipeline ──────────────────────────────────────────────────
 *
 *   Pinia stores (Firestore onSnapshot / REST)
 *     ↓
 *   Domain composables (pure computed aggregation, no fetches)
 *     useAnalyticsData     → operations
 *     useFinanceAnalytics  → finance
 *     useCrmAnalytics      → crm
 *     useHrAnalytics       → hr
 *     useInventoryAnalytics → inventory (snapshot sync; stockMovement async)
 *     ↓
 *   useUnifiedOperationalContext  ← YOU ARE HERE
 *     ↓ context.value (UnifiedOperationalContext)
 *   buildAiContext()   ← slim arrays, drop customer name list
 *     ↓ AiSafeContext (same type, fewer items)
 *   analyticsAiService  → POST /api/analytics/brief  → AI Brief
 *   analyticsChatService → POST /api/analytics/chat  → Chat answer
 *   generateAnalyticsPdf → PDF download
 *
 * ── Known limitations ─────────────────────────────────────────────────────
 *   - approvalCycleTimes is always {} — no approvedAt timestamps on historical records
 *   - performance.byDepartment is always [] — PerformanceReview has no department field
 *   - Customer revenue breakdown is approximate — invoice.customerName is a plain
 *     string, not a FK reference to the customers collection
 *   - Invoice aging is unavailable — crmInvoices has no dueDate field
 *   - inventoryStore uses a one-time fetch, not real-time onSnapshot
 *   - inventory.stockMovement is undefined on initial render and after each
 *     periodDays change until the async stockLedger getDocs query resolves
 *   - Low stock count understated when item.reorderLevel is not set
 *   - HR headcount by department is approximate — employee.department is free-text
 *   - Commission data excluded — field shape is any[] (unknown schema)
 *
 * ── Future improvements (not TODOs) ───────────────────────────────────────
 *   - Add dueDate to crmInvoices → enables invoice aging
 *   - Add departmentId to employees → reliable HR-department cross-reference
 *   - Add departmentId to PerformanceReview → performance by department
 *   - Migrate inventoryStore to onSnapshot → real-time stock levels
 *   - Resolve commission field shape → include in AI context
 *   - Add completedAt to job cards → remove updatedAt proxy for completion date
 *   - Add lostReason to leads → segment lost deals by reason
 *   - Remove legacy flat backend schema once all clients use unified format
 *
 * Domain composables consumed (read-only, no mutations):
 *   useAnalyticsData    → operations  (job cards, expenses, transfers, accounts, departments)
 *   useFinanceAnalytics → finance     (income from jobPayments, payroll liability)
 *   useCrmAnalytics     → crm        (customers, quotes, invoices, leads)
 *   useHrAnalytics      → hr         (headcount, leave, performance, recruitment)
 *   useInventoryAnalytics → inventory (snapshot + async stock movement)
 *
 * The caller is responsible for ensuring all underlying stores are hydrated
 * before accessing context.value. This composable does not trigger any fetches.
 *
 * Stock movement in the inventory domain is populated asynchronously (one
 * Firestore getDocs call per periodDays change). inventory.stockMovement will
 * be undefined until that query resolves — see useInventoryAnalytics.ts.
 */

import { computed, toValue } from 'vue'
import type { Ref } from 'vue'
import { useAnalyticsData } from './useAnalyticsData'
import { useFinanceAnalytics } from './useFinanceAnalytics'
import { useCrmAnalytics } from './useCrmAnalytics'
import { useHrAnalytics } from './useHrAnalytics'
import { useInventoryAnalytics } from './useInventoryAnalytics'
import type {
  UnifiedOperationalContext,
  OperationsAnalyticsContext,
} from '../types/unified-context'

// ─── Composable ───────────────────────────────────────────────────────────────

export function useUnifiedOperationalContext(periodDays: Ref<number>) {
  // ── Domain composables ────────────────────────────────────────────────────
  // Each composable is initialised once and returns a reactive computed ref.
  // Passing `periodDays` (the same Ref) to all composables ensures a single
  // period selector drives recomputation across every domain simultaneously.

  const { payload: operationsPayload } = useAnalyticsData({ periodDays })
  const { context: financeContext } = useFinanceAnalytics(periodDays)
  const { context: crmContext } = useCrmAnalytics(periodDays)
  const { context: hrContext } = useHrAnalytics(periodDays)
  const { context: inventoryContext } = useInventoryAnalytics(periodDays)

  // ── Root computed ─────────────────────────────────────────────────────────
  /**
   * Assembles all domain contexts into a single UnifiedOperationalContext.
   *
   * Reactivity guarantees:
   *   - Runs whenever any domain computed invalidates (store change or period change).
   *   - generatedAt is set at the moment of each recomputation — it reflects
   *     when this specific snapshot was assembled, not when stores were last written.
   *   - periodDays is resolved via toValue() so this computed tracks the ref.
   *
   * Type safety note:
   *   operationsPayload.value is typed as AnalyticsPayload (legacy) intersected
   *   with the two new OperationsAnalyticsContext fields. Its structure is
   *   structurally identical to OperationsAnalyticsContext — the cast below is
   *   safe. The extra fields on the payload (generatedAt, periodDays, inventory)
   *   are silently dropped by the OperationsAnalyticsContext shape.
   */
  const context = computed<UnifiedOperationalContext>(() => {
    const days = toValue(periodDays)

    // Cast is safe: AnalyticsPayload fields map 1-to-1 onto OperationsAnalyticsContext
    // fields (structurally equivalent nominally-different types confirmed in audit).
    // Extra payload fields (generatedAt, periodDays, inventory) are discarded.
    const operations = operationsPayload.value as unknown as OperationsAnalyticsContext

    return {
      generatedAt: new Date().toISOString(),
      periodDays: days,
      operations,
      finance: financeContext.value,
      crm: crmContext.value,
      hr: hrContext.value,
      inventory: inventoryContext.value,
    } satisfies UnifiedOperationalContext
  })

  return {
    /**
     * Readonly reactive computed ref. Access via context.value.
     *
     * Do NOT mutate context.value or any nested object — it is shared reactive
     * state derived from multiple stores. Create a separate computed() for any
     * derived values.
     *
     * Pass context.value to buildAiContext() before forwarding to AI services.
     */
    context: context as Readonly<typeof context>,
  }
}
