/**
 * Analytics Feature — Type Definitions
 *
 * All types are derived exclusively from actual Firestore document shapes
 * observed in the following stores and source files:
 *
 *   Job Card fields   → jobCardsStore.ts, CreateJobCard.vue
 *   OPEX fields       → financeStore.ts
 *   Transfer fields   → financeStore.ts
 *   Department fields → adminStore.ts
 *   Inventory fields  → inventoryStore.ts, inventory/types/index.ts
 *   HR types          → hrStore.ts, hr/types/index.ts
 *
 * No fields have been invented. Where a field is absent from the real
 * schema, a NOTE comment explains the fallback or limitation.
 */

// ─── Job Card Status ──────────────────────────────────────────────────────────

/**
 * All known job card statuses as defined in the approval workflow
 * (jobCardsStore.ts, approveJobCard). The store uses ref<any[]>() so
 * runtime documents are not statically constrained — treat this union
 * as documentation of the expected values, not a runtime guarantee.
 */
export type JobCardStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'APPROVAL_PENDING_ACCOUNTANT'
  | 'APPROVED_ACCOUNTANT'
  | 'APPROVAL_PENDING_MANAGER'
  | 'APPROVED_MANAGER'
  | 'COMPLETED'
  | 'REJECTED'

/**
 * Statuses where the job card is active in the approval queue.
 * DRAFT is excluded — it has not been submitted into the workflow yet.
 * APPROVED_ACCOUNTANT is excluded — it is a transient state that
 * auto-transitions to APPROVAL_PENDING_MANAGER in the same call.
 */
export const PENDING_JOB_CARD_STATUSES = [
  'SUBMITTED',
  'APPROVAL_PENDING_ACCOUNTANT',
  'APPROVAL_PENDING_MANAGER',
] as const satisfies readonly JobCardStatus[]

/**
 * Terminal statuses — the job card is no longer in-flight.
 * Cards in these statuses are excluded from overdue detection.
 */
export const TERMINAL_JOB_CARD_STATUSES = [
  'COMPLETED',
  'REJECTED',
] as const satisfies readonly JobCardStatus[]

// ─── OPEX Status ──────────────────────────────────────────────────────────────

/**
 * All operational expense statuses from financeStore.ts.
 * 'APPROVED' is a direct-approval shortcut used by hrStore.markPayrollPaid
 * and approveAdHocExpenseFromFinance — it bypasses the two-step flow.
 */
export type OpexStatus =
  | 'PENDING_ACCOUNTANT'
  | 'APPROVED_ACCOUNTANT'
  | 'APPROVED_FOR_PAYMENT'
  | 'PAYMENT_PROCESSED'
  | 'REJECTED_ACCOUNTANT'
  | 'REJECTED_MANAGER'
  | 'APPROVED'

/**
 * OPEX statuses that represent committed, ledger-visible expenses.
 * Expenses in these statuses appear in financeStore.updateLedger().
 */
export const COMMITTED_OPEX_STATUSES = [
  'APPROVED_FOR_PAYMENT',
  'PAYMENT_PROCESSED',
  'APPROVED',
] as const satisfies readonly OpexStatus[]

// ─── Transfer Status ──────────────────────────────────────────────────────────

/**
 * All fund transfer statuses from financeStore.ts (fundTransfers collection).
 * Only COMPLETED transfers appear in the ledger (financeStore.updateLedger).
 */
export type TransferStatus =
  | 'PENDING_ACCOUNTANT'
  | 'PENDING_MANAGER'
  | 'COMPLETED'
  | 'REJECTED'

// ─── Account Keys ─────────────────────────────────────────────────────────────

/**
 * The four cash account identifiers used throughout the system.
 * These match the keys in financeStore.finalBalances exactly.
 */
export type AccountKey = 'BANK' | 'CASH' | 'ECOCASH' | 'IRD'

// ─── Analytics Configuration ──────────────────────────────────────────────────

/**
 * MaybeRefOrGetter mirrors the Vue 3.3+ utility type.
 * Defined here so analytics.ts stays framework-agnostic for unit testing,
 * while still accurately describing what useAnalyticsData accepts.
 */
import type { Ref } from 'vue'
export type MaybeRefOrGetter<T> = T | Ref<T> | (() => T)

export interface AnalyticsOptions {
  /**
   * Number of days to look back for period-scoped metrics.
   * Accepts a plain number, a Vue Ref<number>, or a getter () => number so
   * the dashboard period selector can drive reactive recomputation.
   * Defaults to 30.
   */
  periodDays?: MaybeRefOrGetter<number>

  /**
   * Days after which a non-terminal, non-DRAFT job card is flagged as overdue.
   * Accepts the same reactive types as periodDays.
   * Defaults to 14.
   *
   * ASSUMPTION: No formal SLA is defined in the codebase. This threshold
   * must be confirmed with management before it is surfaced to end users.
   * Overdue cards are those in an active workflow step (SUBMITTED,
   * APPROVAL_PENDING_*) whose createdAt is older than this many days.
   */
  overdueThresholdDays?: MaybeRefOrGetter<number>
}

// ─── Job Card Analytics ───────────────────────────────────────────────────────

export interface OverdueJobCard {
  /** Firestore document ID */
  id: string

  /**
   * From generalInfo.jobNumber (e.g. 'JC-2026-0042').
   * Falls back to first 8 chars of doc ID if generalInfo is absent
   * (possible for very old draft records).
   */
  jobNumber: string

  /** From generalInfo.jobTitle. Falls back to 'Untitled'. */
  jobTitle: string

  /** Current workflow status at time of computation */
  status: string

  /**
   * From generalInfo.requestingDepartmentId.
   * This is a Firestore document ID referencing adminStore.departments.
   * NOTE: field name confirmed in CreateJobCard.vue line 168.
   */
  requestingDepartmentId: string

  /**
   * Department name resolved from adminStore.departments by matching
   * requestingDepartmentId to department.id.
   * Returns 'Unknown Department' if the ID is empty or not found.
   */
  departmentName: string

  /** ISO date string (YYYY-MM-DD) derived from the card's createdAt Timestamp */
  createdAt: string

  /** Integer number of calendar days since createdAt */
  daysOpen: number
}

export interface JobCardStatusCount {
  /** Status string value as stored in Firestore */
  status: string
  count: number
}

export interface JobCardAnalytics {
  /** Total job cards in jobCardsStore (all time, all statuses) */
  total: number

  /** Count per distinct status value across all job cards, sorted descending */
  byStatus: JobCardStatusCount[]

  /**
   * Non-terminal, non-DRAFT cards older than overdueThresholdDays.
   * Sorted descending by daysOpen (most urgent first).
   *
   * ASSUMPTION: "Overdue" = status is in [SUBMITTED, APPROVAL_PENDING_ACCOUNTANT,
   * APPROVAL_PENDING_MANAGER] AND createdAt is older than the configured threshold.
   * DRAFT cards are excluded as they have not entered the workflow.
   * Business SLA threshold must be confirmed before Phase 2 UI is built.
   */
  overdueOpenCards: OverdueJobCard[]

  /**
   * Count of cards currently waiting for a human approval action.
   * Includes: SUBMITTED, APPROVAL_PENDING_ACCOUNTANT, APPROVAL_PENDING_MANAGER.
   */
  pendingApprovals: number

  /**
   * Count of cards that reached COMPLETED within the analytics period.
   *
   * LIMITATION: Uses card.updatedAt as the proxy for completion date since
   * the store does not provide a dedicated completedAt field. updatedAt changes
   * on every field edit, not only on status transitions. A more precise count
   * would require scanning approvalTimeline for COMPLETED entries, at significant
   * O(n×m) cost. This approximation is acceptable for dashboard-level display.
   */
  completedInPeriod: number
}

/**
 * Granular financial performance summary for a single Job Card.
 * Enables AI to perform per-card margin analysis.
 * Identical to OpsJobCardFinancialSummary in unified-context.ts.
 */
export interface JobCardFinancialSummary {
  id: string
  jobNumber: string
  jobTitle: string
  status: string
  revenue: number
  operationalExpenses: number
  inventoryCost: number
  totalCost: number
  margin: number
  marginPercent: number
  departmentName: string
}

// ─── Expense Analytics ────────────────────────────────────────────────────────

export interface CategoryTotal {
  /**
   * From operationalExpenses.category (a free-text string, not a document ID).
   * 'Uncategorised' is used when the field is absent.
   * NOTE: The expense category is stored as a string label on the document,
   * not as a reference to expenseCategories collection.
   */
  category: string
  total: number
  count: number
}

export interface DailyExpenseTotal {
  /** ISO date string in 'YYYY-MM-DD' format */
  date: string
  /** Sum of expense amounts (all statuses) created on this date */
  total: number
}

export interface LargestExpenseItem {
  /** Firestore document ID */
  id: string

  /**
   * Display label derived from: expense.description ?? expense.title
   * ?? expense.category ?? 'Operational Expense'.
   * Matches the fallback logic in financeStore.updateLedger (line 77).
   */
  description: string

  /** From operationalExpenses.category. Falls back to 'Uncategorised'. */
  category: string

  /** From operationalExpenses.amount, coerced to number */
  amount: number

  /**
   * From operationalExpenses.paymentMethod, normalised to UPPERCASE.
   * Maps to account keys (BANK, CASH, ECOCASH, IRD).
   * 'UNKNOWN' if the field is absent.
   */
  paymentMethod: string

  /** Current status at time of computation */
  status: string

  /** ISO date string (YYYY-MM-DD) derived from createdAt. 'Unknown' if absent. */
  date: string
}

export interface ExpenseAnalytics {
  /**
   * Sum of ALL expense amounts created within the period (all statuses included).
   * This is the total value requested, not the total approved.
   */
  totalAmount: number

  /**
   * Sum of expense amounts in committed/ledger-visible statuses
   * (APPROVED_FOR_PAYMENT, PAYMENT_PROCESSED, APPROVED) created within the period.
   */
  approvedAmount: number

  /**
   * Per-category totals for expenses created within the period.
   * Grouped by operationalExpenses.category string.
   * Sorted descending by total.
   */
  byCategory: CategoryTotal[]

  /**
   * Daily expense totals for every calendar day in the period.
   * Every day in the range is present — days with no expenses have total = 0.
   * Sorted ascending by date for chart rendering.
   */
  trend: DailyExpenseTotal[]

  /** Top 5 expenses by amount created within the period */
  largestItems: LargestExpenseItem[]

  /**
   * Current count of ALL expenses (not period-limited) awaiting accountant approval.
   * Represents the live approval queue depth for the accountant.
   */
  pendingApprovalCount: number

  /**
   * Current count of ALL expenses (not period-limited) with status APPROVED_ACCOUNTANT,
   * meaning they are awaiting manager final approval.
   */
  pendingManagerCount: number
}

// ─── Transfer Analytics ───────────────────────────────────────────────────────

export interface TransferAnalytics {
  /** Sum of all COMPLETED transfers (all time, not period-scoped) */
  totalCompletedAmount: number

  /**
   * Count of COMPLETED transfers whose completion date falls within the period.
   * Uses managerApprovedAt if present; falls back to createdAt.
   * NOTE: managerApprovedAt is a Firestore serverTimestamp set in
   * financeStore.approveTransfer. Older records may not have this field.
   */
  completedInPeriod: number

  /** Count of transfers currently awaiting accountant initials (PENDING_ACCOUNTANT) */
  pendingAccountantCount: number

  /** Count of transfers currently awaiting manager approval (PENDING_MANAGER) */
  pendingManagerCount: number
}

// ─── Account Balance ──────────────────────────────────────────────────────────

export interface AccountBalance {
  /**
   * One of the four system account identifiers (BANK, CASH, ECOCASH, IRD).
   * Sourced directly from financeStore.finalBalances object keys.
   */
  account: string

  /**
   * Current computed running balance for this account.
   * Calculated by financeStore.updateLedger — this composable reads the
   * already-computed value and does NOT recalculate it.
   */
  balance: number
}

// ─── Department Analytics ─────────────────────────────────────────────────────

export interface DepartmentMetric {
  /** Firestore document ID from adminStore.departments */
  departmentId: string

  /** Department name from department.name. Falls back to departmentId. */
  departmentName: string

  /**
   * Total job cards assigned to this department (all time).
   * Matched by generalInfo.requestingDepartmentId === department.id.
   */
  jobCardCount: number

  /** Job cards with status === 'COMPLETED' (all time) */
  completedCount: number

  /**
   * completedCount / jobCardCount × 100, rounded to nearest integer.
   * Returns 0 when jobCardCount is 0 (no division by zero).
   */
  completionRate: number

  /**
   * Sum of invoice values for COMPLETED cards in this department.
   *
   * Field precedence (per jobCardsStore.approveJobCard):
   *   1. card.lockedTotalInvoiceValue — set at APPROVED_MANAGER transition,
   *      represents the financially-locked value. Present on records created
   *      after the locking mechanism was implemented.
   *   2. card.totals.grandTotal — the creation-time estimated total.
   *      Used as fallback for legacy records that pre-date the lock field.
   *
   * NOTE: Neither field has a department-level breakdown in the source data.
   * This total is the sum across all completed job cards for the department.
   */
  totalInvoiceValue: number
}

// ─── Inventory Snapshot ───────────────────────────────────────────────────────

export interface InventorySnapshot {
  /** Total InventoryItem records in inventoryStore.items */
  totalItems: number

  /** Items where isActive === true */
  activeItems: number

  /**
   * Items where onHand <= reorderLevel AND reorderLevel is defined.
   * Items without reorderLevel set are NOT counted as low stock.
   * Source: inventoryStore.lowStockItems computed property.
   */
  lowStockCount: number

  /**
   * Sum of (onHand × purchasePrice) for all items.
   * Source: inventoryStore.totalValue computed property.
   * NOTE: Uses purchasePrice, not sellingPrice — this is stock cost value,
   * not potential revenue.
   */
  totalInventoryValue: number
}

// ─── AI Brief Response ────────────────────────────────────────────────────────

/** Severity/priority levels used in anomaly and recommendation items. */
export type AiBriefSeverity = 'low' | 'medium' | 'high'

export interface AiBriefAnomaly {
  metric: string
  observation: string
  severity: AiBriefSeverity
}

export interface AiBriefRecommendation {
  title: string
  rationale: string
  priority: AiBriefSeverity
}

export interface AiBriefChartAnnotation {
  label: string
  metric: string
  note: string
}

/**
 * Structured response returned by POST /api/analytics/brief.
 *
 * All content is AI-generated from the locally-computed AnalyticsPayload.
 * The AI is instructed not to fabricate numbers not present in the payload.
 * `generatedAt` is set server-side; the frontend should treat it as the
 * authoritative timestamp of when the analysis was produced.
 */
export interface AiBriefResponse {
  dailyBrief: string
  keyFindings: string[]
  anomalies: AiBriefAnomaly[]
  recommendations: AiBriefRecommendation[]
  chartAnnotations: AiBriefChartAnnotation[]
  modelConfidence: AiBriefSeverity
  generatedAt: string
}

// ─── Full Analytics Payload ───────────────────────────────────────────────────

/**
 * The complete structured output produced by useAnalyticsData.
 *
 * Design constraints:
 *   - No raw Firestore documents — only aggregated/sanitised values.
 *   - No user PII — employee or user names are not included.
 *   - No live financial recalculations — balance and invoice values are
 *     read from already-computed store state (financeStore.finalBalances,
 *     card.lockedTotalInvoiceValue).
 *   - This payload is the source for chart rendering (Phase 2) and will
 *     later be forwarded to the AI service (Phase 4). Both consumers must
 *     treat it as read-only derived data, not authoritative financial state.
 */
export interface AnalyticsPayload {
  /** ISO 8601 timestamp of when this payload was computed */
  generatedAt: string

  /** The configured look-back period in days */
  periodDays: number

  /**
   * ISO date string (YYYY-MM-DD) representing the start of the period window.
   * Computed as: today − periodDays.
   */
  periodStart: string

  jobCards: JobCardAnalytics
  expenses: ExpenseAnalytics
  transfers: TransferAnalytics

  /**
   * Up to 50 most recent/active Job Card summaries.
   * Enables deep-dive financial analysis of specific jobs by AI.
   */
  jobCardSummaries: JobCardFinancialSummary[]

  /**
   * Current balances for all accounts present in financeStore.finalBalances.
   * Typically four entries: BANK, CASH, ECOCASH, IRD.
   */
  accountBalances: AccountBalance[]

  /**
   * One entry per department in adminStore.departments.
   * Departments with zero job cards are included (jobCardCount = 0).
   * Sorted descending by jobCardCount.
   */
  departmentMetrics: DepartmentMetric[]

  inventory: InventorySnapshot
}

// ─── Analytics Chat ────────────────────────────────────────────────────────────

/** A single message turn in an analytics conversation history */
export interface ConversationTurn {
  role: 'user' | 'assistant'
  content: string
  mode?: 'chat' | 'reason'
  timestamp: string
}

/** Severity levels used in chat highlight items (same set as AiBriefSeverity) */
export type AnalyticsChatSeverity = 'low' | 'medium' | 'high'

/**
 * A single key metric surfaced by the AI as directly relevant to the question.
 * Only metrics present in the supplied analytics context are included.
 */
export interface AnalyticsChatHighlight {
  /** Short metric name or KPI label (max 100 chars) */
  label: string
  /** The specific value from the data, formatted as a human-readable string (max 200 chars) */
  value: string
  /** Urgency or importance of this highlight relative to the question */
  severity: AnalyticsChatSeverity
}

/**
 * A reference to a specific record that appears verbatim in the analytics
 * context data. The AI must not fabricate IDs — only IDs present in the
 * context payload are valid here.
 */
export interface AnalyticsChatRelatedRecord {
  /** Domain type of the referenced record */
  type: 'job_card' | 'department' | 'expense' | 'account' | 'transfer'
  /** Record ID exactly as it appears in the analytics context */
  id: string
  /** Human-readable label derived from the context data */
  label: string
}

/**
 * Structured response returned by POST /api/analytics/chat.
 *
 * All content is AI-generated strictly from the supplied analytics context.
 * `generatedAt` is set server-side and should be treated as authoritative.
 */
export interface AnalyticsChatResponse {
  /** The interaction mode used (chat = standard, reason = deep analysis) */
  mode: 'chat' | 'reason'
  /** Direct, specific answer to the manager's question citing actual values */
  answer: string
  /** Key metrics from the data that directly support the answer (max 8) */
  highlights: AnalyticsChatHighlight[]
  /** Specific, data-supported next steps the manager could take (max 5) */
  recommendedActions: string[]
  /** Records from the context data directly relevant to the answer (max 10) */
  relatedRecords: AnalyticsChatRelatedRecord[]
  /** Specific questions for the manager to follow up with (max 5) */
  suggestedFollowUps?: string[]
  /** Server-assigned ISO 8601 timestamp */
  generatedAt: string
}

/** Error codes returned by the analytics chat service */
export type AnalyticsChatErrorCode =
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'INVALID_PAYLOAD'
  | 'RATE_LIMITED'
  | 'INVALID_AI_RESPONSE'
  | 'UPSTREAM_TIMEOUT'
  | 'UPSTREAM_UNAVAILABLE'
  | 'NETWORK_ERROR'
  | 'UNKNOWN'

export class AnalyticsChatError extends Error {
  readonly code: AnalyticsChatErrorCode
  constructor(code: AnalyticsChatErrorCode, message: string) {
    super(message)
    this.code = code
    this.name = 'AnalyticsChatError'
  }
}
