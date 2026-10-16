/**
 * Unified Operational Context — Type Definitions
 *
 * Single source of truth for the full cross-domain analytics context used by
 * analytics composables, the AI brief service, and the analytics PDF generator.
 *
 * AUDIT BASIS
 * All fields are derived strictly from confirmed Firestore document shapes
 * as audited in the following sources:
 *
 *   Operations  → jobCardsStore.ts, financeStore.ts, CreateJobCard.vue
 *   Finance     → financeStore.ts (jobPayments, ledger), hrStore.ts (payroll)
 *   CRM         → crmStore.ts, useLeadsStore.ts, Leads.vue
 *   HR          → hrStore.ts, hr/types/index.ts
 *   Inventory   → inventoryStore.ts, inventory/types/index.ts
 *
 * OPTIONAL FIELDS
 * Any field marked optional (?) was flagged by the audit as one of:
 *   - Not reliably present on all historical documents
 *   - Requires future data migration to populate
 *   - Computed from a proxy field that may misrepresent the true value
 *
 * NO IMPORTS — this file is intentionally self-contained so it can be shared
 * with backend / AI services without modification.
 */

// ─────────────────────────────────────────────────────────────────────────────
// OPERATIONS — sub-types
// (Inline equivalents of the types in analytics.ts; shapes are identical)
// ─────────────────────────────────────────────────────────────────────────────

/** Count of job cards per status value. */
export interface OpsJobCardStatusCount {
  status: string
  count: number
}

/** A single job card that has exceeded the overdue threshold. */
export interface OpsOverdueJobCard {
  id: string
  /**
   * From generalInfo.jobNumber.
   * Falls back to the first 8 characters of the Firestore document ID
   * for legacy draft records that pre-date the jobNumber field.
   */
  jobNumber: string
  jobTitle: string
  status: string
  /**
   * Firestore document ID referencing adminStore.departments.
   * Field name confirmed in CreateJobCard.vue.
   */
  requestingDepartmentId: string
  /** Resolved from adminStore.departments by ID. 'Unknown Department' if not found. */
  departmentName: string
  /** ISO date string (YYYY-MM-DD) from createdAt Timestamp. */
  createdAt: string
  daysOpen: number
}

export interface OpsJobCardAnalytics {
  total: number
  byStatus: OpsJobCardStatusCount[]
  /**
   * Non-terminal, non-DRAFT cards older than the configured overdueThresholdDays.
   * Sorted descending by daysOpen (most urgent first).
   *
   * ASSUMPTION: No formal SLA is defined in the codebase.
   * The overdue threshold must be confirmed with management before
   * this list is surfaced to end users.
   */
  overdueOpenCards: OpsOverdueJobCard[]
  /** Cards in [SUBMITTED, APPROVAL_PENDING_ACCOUNTANT, APPROVAL_PENDING_MANAGER]. */
  pendingApprovals: number
  /**
   * Cards whose status transitioned to COMPLETED within the analytics period.
   *
   * LIMITATION: Uses card.updatedAt as a proxy for completion date.
   * updatedAt is refreshed on every edit — not only on status transitions.
   * A more precise count would require scanning approvalTimeline entries,
   * which would be O(n×m). Acceptable for dashboard-level display only.
   */
  completedInPeriod: number
}

export interface OpsExpenseCategoryTotal {
  /**
   * From operationalExpenses.category — a free-text string label,
   * NOT a reference to the expenseCategories collection.
   * 'Uncategorised' is substituted when the field is absent.
   */
  category: string
  total: number
  count: number
}

export interface OpsExpenseDailyTotal {
  /** ISO date string YYYY-MM-DD */
  date: string
  total: number
}

export interface OpsLargestExpense {
  id: string
  /**
   * Resolved as: expense.description ?? expense.title
   * ?? expense.category ?? 'Operational Expense'.
   * Matches the fallback chain in financeStore.updateLedger.
   */
  description: string
  category: string
  amount: number
  /**
   * From operationalExpenses.paymentMethod, normalised to UPPERCASE.
   * 'UNKNOWN' if absent.
   */
  paymentMethod: string
  status: string
  /** ISO date string YYYY-MM-DD. 'Unknown' if createdAt is absent. */
  date: string
}

export interface OpsExpenseAnalytics {
  /** Sum of ALL expense amounts in the period (all statuses). */
  totalAmount: number
  /**
   * Sum of expenses in committed/ledger-visible statuses:
   * APPROVED_FOR_PAYMENT, PAYMENT_PROCESSED, APPROVED.
   */
  approvedAmount: number
  byCategory: OpsExpenseCategoryTotal[]
  /** One entry per calendar day in the period. Days with no expenses have total = 0. */
  trend: OpsExpenseDailyTotal[]
  largestItems: OpsLargestExpense[]
  /** Live count of all expenses (not period-scoped) awaiting accountant approval. */
  pendingApprovalCount: number
  /** Live count of all expenses (not period-scoped) with status APPROVED_ACCOUNTANT. */
  pendingManagerCount: number
}

export interface OpsTransferAnalytics {
  totalCompletedAmount: number
  /**
   * Count of COMPLETED transfers in the period.
   * Uses managerApprovedAt if present; falls back to createdAt.
   * NOTE: managerApprovedAt was added in a later release — older records
   * may lack this field, causing them to be binned by createdAt instead.
   */
  completedInPeriod: number
  pendingAccountantCount: number
  pendingManagerCount: number
}

export interface OpsAccountBalance {
  /** One of: BANK | CASH | ECOCASH | IRD */
  account: string
  /**
   * Running balance computed by financeStore.updateLedger.
   * Read directly from financeStore.finalBalances — not recalculated here.
   */
  balance: number
}

export interface OpsDepartmentMetric {
  departmentId: string
  /** From department.name. Falls back to departmentId if name is absent. */
  departmentName: string
  jobCardCount: number
  completedCount: number
  /** completedCount / jobCardCount × 100, rounded. 0 when jobCardCount is 0. */
  completionRate: number
  /**
   * Sum of invoice values for COMPLETED cards in this department.
   *
   * Field precedence:
   *   1. card.lockedTotalInvoiceValue — financially-locked value set at APPROVED_MANAGER.
   *      Present only on records created after the locking mechanism was implemented.
   *   2. card.totals.grandTotal — creation-time estimate; fallback for legacy records.
   */
  totalInvoiceValue: number
}

/**
 * Granular financial performance summary for a single Job Card.
 * Enables AI to perform per-card margin analysis.
 */
export interface OpsJobCardFinancialSummary {
  id: string
  jobNumber: string
  jobTitle: string
  status: string
  /** Sum of client payments linked to this card via jobCardId. */
  revenue: number
  /** Sum of operational expenses linked to this card via sourceJobId. */
  operationalExpenses: number
  /** Sum of item.qtyIssued * item.costSnapshot from requisitionSections. */
  inventoryCost: number
  /** Total outlay: operationalExpenses + inventoryCost. */
  totalCost: number
  /** Actual margin: revenue - totalCost. */
  margin: number
  /** (margin / revenue) * 100, or 0 if revenue is zero. */
  marginPercent: number
  /** Resulting department - added for cross-segment analysis. */
  departmentName: string
}

// ─────────────────────────────────────────────────────────────────────────────
// OPERATIONS CONTEXT
// ─────────────────────────────────────────────────────────────────────────────

export interface OperationsAnalyticsContext {
  /** ISO date string YYYY-MM-DD representing the start of the look-back window. */
  periodStart: string

  jobCards: OpsJobCardAnalytics
  expenses: OpsExpenseAnalytics
  transfers: OpsTransferAnalytics

  /** Current balances for all accounts in financeStore.finalBalances. */
  accountBalances: OpsAccountBalance[]

  /**
   * One entry per department in adminStore.departments.
   * Departments with zero job cards are included (jobCardCount = 0).
   * Sorted descending by jobCardCount.
   */
  departmentMetrics: OpsDepartmentMetric[]

  /**
   * Up to 50 most recent/active Job Card summaries.
   * Enables deep-dive financial analysis of specific jobs by AI.
   */
  jobCardSummaries: OpsJobCardFinancialSummary[]

  /**
   * Average calendar days from document creation to final approval,
   * computed across records that completed the workflow within the period.
   *
   * AUDIT NOTE: Neither jobCards nor operationalExpenses store a dedicated
   * approvedAt timestamp on the document root. Computation requires scanning
   * card.approvalTimeline (job cards) or derived from status-change timestamps
   * — both fields are absent on a significant portion of historical records.
   * Both sub-fields are optional until a backfill migration is run.
   */
  approvalCycleTimes: {
    /** @optional Requires backfill of approvalTimeline entries on historical job cards. */
    avgDaysJobCards?: number
    /** @optional Requires backfill of accountantApprovedAt / managerApprovedAt on historical OPEX. */
    avgDaysExpenses?: number
  }

  /**
   * Structured breakdown of ad-hoc expense line items from jobCards[].adHocExpenses[].
   *
   * Each item carries its own approvalStatus: 'PENDING' | 'APPROVED_ACCOUNTANT' | 'APPROVED_MANAGER'.
   * "Approved" means approvalStatus === 'APPROVED_MANAGER'.
   * "Pending" means approvalStatus is absent, undefined, or 'PENDING'.
   * Amount: item.totalAmount ?? (item.quantity * item.unitPrice).
   * Date: item.createdAt (Firestore Timestamp) — absent on some older records; those
   * items are excluded from todayTotal but included in all totals.
   *
   * Covers ALL job cards regardless of the selected period.
   */
  adHocExpenses: {
    /** Sum of all items (all approval statuses combined) */
    total: number
    /** Sum of items where approvalStatus === 'APPROVED_MANAGER' */
    approved: number
    /** Sum of items where approvalStatus is absent or 'PENDING' */
    pending: number
    /** Total item count across all job cards */
    count: number
    approvedCount: number
    pendingCount: number
    /** Sum of items whose createdAt date matches today (local date) */
    todayTotal: number
    /** Totals grouped by paymentMethod (CASH / ECOCASH / BANK / IRD) */
    byPaymentMethod: { method: string; total: number }[]
    /**
     * Up to 5 most recently created approved items, newest first.
     * Intended for the "Recent Approved" table in the dashboard and PDF.
     */
    recentApproved: {
      id: string
      description: string
      amount: number
      paymentMethod: string
      /** job card number from generalInfo.jobNumber, or first 8 chars of card id */
      jobCardRef: string
      /** ISO 8601 string from item.createdAt; absent if Timestamp was missing */
      createdAt?: string
    }[]
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// FINANCE — sub-types
// ─────────────────────────────────────────────────────────────────────────────

export interface FinanceIncomeByMethod {
  /** Payment method string as stored in jobPayments.paymentMethod, normalised to UPPERCASE. */
  method: string
  total: number
  count: number
}

export interface FinanceIncomeTrendPoint {
  /** ISO date string YYYY-MM-DD */
  date: string
  amount: number
}

export interface FinanceLargestPayment {
  id: string
  amount: number
  /** From jobPayments.paymentMethod */
  method: string
  /**
   * From jobPayments.jobCardId — a string reference to the job card.
   * NOTE: jobPayments documents do not carry a customerName or description field.
   * Do not attempt to join to the customer name from this collection.
   */
  jobCardId: string
  /** ISO date string YYYY-MM-DD derived from jobPayments.createdAt */
  date: string
}

export interface FinanceIncomeAnalytics {
  /** Sum of all jobPayments.amount records within the period. */
  totalReceived: number
  totalCount: number
  /**
   * Breakdown by payment method.
   * NOTE: jobPayments documents have no customerName or description field.
   * Only method, amount, jobCardId, and createdAt are reliably available.
   */
  byPaymentMethod: FinanceIncomeByMethod[]
  /** Daily income totals for every calendar day in the period. */
  trend: FinanceIncomeTrendPoint[]
  /**
   * The single highest-value payment within the period.
   * Optional — absent if no payments exist in the period.
   */
  largestPayment?: FinanceLargestPayment
}

export interface FinancePayrollByMonth {
  month: number
  year: number
  total: number
  /** Status of the payroll run (e.g. 'PAID', 'PENDING'). */
  status: string
}

export interface FinancePayrollAnalytics {
  /** Sum of payroll expenses in a paid/committed status. */
  totalPaid: number
  /** Sum of payroll expenses in a pending/unpaid status. */
  totalUnpaid: number
  /** Count of payroll records that have not yet been marked as paid. */
  unpaidCount: number
  /**
   * Monthly payroll totals derived from operationalExpenses
   * where category matches a payroll identifier.
   */
  byMonth: FinancePayrollByMonth[]
}

// ─────────────────────────────────────────────────────────────────────────────
// FINANCE CONTEXT
// ─────────────────────────────────────────────────────────────────────────────

export interface FinanceAnalyticsContext {
  income: FinanceIncomeAnalytics
  payroll: FinancePayrollAnalytics
}

// ─────────────────────────────────────────────────────────────────────────────
// CRM — sub-types
// ─────────────────────────────────────────────────────────────────────────────

export interface CrmCustomerRef {
  id: string
  /** From customers.name. Used for list display only — no revenue join available. */
  name: string
}

export interface CrmQuoteAnalytics {
  total: number
  approved: number
  draft: number
  /** Sum of grandTotal across all quotes. */
  totalValue: number
  /**
   * totalValue / total, rounded to two decimal places.
   * Optional — absent if total is 0.
   */
  avgDealSize?: number
}

export interface CrmLargestOutstandingInvoice {
  id: string
  /**
   * From crmInvoices.customerName — a plain string stored at invoice creation time,
   * not a FK reference to the customers collection.
   *
   * @approximate The customer name is copied from the quote at invoice creation.
   * It will not reflect subsequent customer record edits.
   */
  customerName: string
  grandTotal: number
  amountPaid: number
}

export interface CrmInvoiceAnalytics {
  total: number
  paid: number
  unpaid: number
  partial: number
  /** Sum of (grandTotal - amountPaid) for all non-PAID invoices. */
  totalOutstanding: number
  /**
   * The invoice with the highest outstanding balance.
   * Optional — absent if no outstanding invoices exist.
   *
   * NOTE: crmInvoices documents do not have a dueDate field.
   * Invoice aging (overdue amount) cannot be computed. Do not add overdueAmount.
   */
  largestOutstanding?: CrmLargestOutstandingInvoice
}

export interface CrmLeadBySource {
  source: string
  count: number
  /** Sum of lead.value for leads from this source. */
  value: number
}

export interface CrmLeadAnalytics {
  total: number
  /**
   * Count per stage key.
   * Keys match LeadStage union: New | Contacted | Qualified | Proposal | Negotiation | Won | Lost.
   */
  byStage: Record<string, number>
  /** Sum of lead.value for all leads not in 'Lost' stage. */
  pipelineValue: number
  wonCount: number
  lostCount: number
  /** Aggregated by lead.source string. */
  bySource: CrmLeadBySource[]
}

// ─────────────────────────────────────────────────────────────────────────────
// CRM CONTEXT
// ─────────────────────────────────────────────────────────────────────────────

export interface CrmAnalyticsContext {
  /**
   * Flat list of customers for display and count purposes only.
   * NOTE: No revenue-by-customer breakdown is possible — the FK between
   * crmInvoices and customers is a plain string (customerName), not a document ID.
   * Do not attempt to join invoice totals to this list.
   */
  customers: CrmCustomerRef[]
  customerCount: number
  quotes: CrmQuoteAnalytics
  invoices: CrmInvoiceAnalytics
  leads: CrmLeadAnalytics
}

// ─────────────────────────────────────────────────────────────────────────────
// HR — sub-types
// ─────────────────────────────────────────────────────────────────────────────

export interface HrHeadcountByDepartment {
  /**
   * Free-text string from employee.department (or the matched department name).
   *
   * @approximate HR employee records store department as a string label,
   * not a Firestore document ID reference to adminStore.departments.
   * Grouping is by string equality — inconsistent capitalisation or
   * spelling will produce separate buckets.
   */
  departmentLabel: string
  count: number
}

export interface HrHeadcountAnalytics {
  total: number
  /** Employees with status === 'active' (or equivalent active flag). */
  active: number
  /** Employees currently on approved leave. */
  onLeave: number
  byDepartment: HrHeadcountByDepartment[]
}

export interface HrLeaveByType {
  /** Leave type string as stored on the leaveRequests document. */
  type: string
  count: number
}

export interface HrLeaveAnalytics {
  /** Count of leave requests with status === 'Pending'. */
  pendingRequests: number
  /** Count of leave requests approved within the analytics period. */
  approvedThisPeriod: number
  byType: HrLeaveByType[]
}

export interface HrPerformanceByDepartment {
  /**
   * Free-text department label from the performance review document.
   *
   * @approximate Same string-match caveat as HrHeadcountByDepartment.departmentLabel.
   */
  departmentLabel: string
  avgScore: number
}

export interface HrPerformanceAnalytics {
  /** Total performance review documents within the period. */
  reviewCount: number
  /**
   * Average numeric score across all reviews in the period.
   * Optional — absent if reviewCount is 0 or if score field is not numeric.
   */
  avgScore?: number
  /** Per-department average scores. Empty array if no reviews exist. */
  byDepartment: HrPerformanceByDepartment[]
}

export interface HrRecruitmentAnalytics {
  /** Count of open job role postings. */
  openRoles: number
  /** Total applicant documents across all open roles. */
  totalApplicants: number
}

// ─────────────────────────────────────────────────────────────────────────────
// HR CONTEXT
// ─────────────────────────────────────────────────────────────────────────────

export interface HrAnalyticsContext {
  headcount: HrHeadcountAnalytics
  leave: HrLeaveAnalytics
  performance: HrPerformanceAnalytics
  recruitment: HrRecruitmentAnalytics
}

// ─────────────────────────────────────────────────────────────────────────────
// INVENTORY — sub-types
// ─────────────────────────────────────────────────────────────────────────────

export interface InvTopConsumedItem {
  /** Firestore document ID from the inventoryItems collection. */
  id: string
  /** Item name / label for display. */
  label: string
  /** Total units issued (not returned) across all job cards in the period. */
  totalIssued: number
}

export interface InvStockMovement {
  /** Total units issued to job cards within the period. */
  totalIssued: number
  /** Total units returned from job cards within the period. */
  totalReturned: number
  /** Top 10 most-consumed items by totalIssued, sorted descending. */
  topConsumedItems: InvTopConsumedItem[]
}

// ─────────────────────────────────────────────────────────────────────────────
// INVENTORY CONTEXT
// ─────────────────────────────────────────────────────────────────────────────

export interface InventoryAnalyticsContext {
  /** Total InventoryItem records. */
  totalItems: number
  /** Items where isActive === true. */
  activeItems: number
  /**
   * Items where onHand <= reorderLevel AND reorderLevel is defined.
   * Items without reorderLevel are NOT counted as low stock.
   * Sourced from inventoryStore.lowStockItems.
   */
  lowStockCount: number
  /**
   * Sum of (onHand × purchasePrice) for all items.
   * NOTE: Uses purchasePrice — this is stock cost value, not potential revenue.
   */
  totalInventoryValue: number
  /**
   * Issued / returned stock movement aggregated for the analytics period.
   * Optional — depends on job card inventory sub-documents being populated.
   * Absent for deployments where inventory tracking on job cards is not in use.
   */
  stockMovement?: InvStockMovement
}

// ─────────────────────────────────────────────────────────────────────────────
// ROOT — Unified Operational Context
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Complete cross-domain analytics context.
 *
 * This is the single object passed to:
 *   - Analytics composables (read-only aggregation source)
 *   - AI brief and chat services (serialised as JSON, no PII)
 *   - Analytics PDF generator
 *
 * Design constraints carried forward from AnalyticsPayload:
 *   - No raw Firestore documents — aggregated/sanitised values only.
 *   - No user PII — employee or user names are not included.
 *   - No live financial recalculations — balance values are read from
 *     already-computed store state (financeStore.finalBalances).
 *   - Treat as read-only derived data, not authoritative financial state.
 */
export interface UnifiedOperationalContext {
  /** ISO 8601 timestamp of when this context object was assembled. */
  generatedAt: string

  /** The configured look-back window in calendar days. */
  periodDays: number

  /**
   * Job cards, expenses, transfers, account balances, department metrics,
   * approval cycle times, and ad-hoc expense totals.
   * Extends the existing AnalyticsPayload shape.
   */
  operations: OperationsAnalyticsContext

  /**
   * Income from client payments (jobPayments collection) and payroll summary.
   * NOTE: Does not include raw ledger entries — use operations.accountBalances
   * for current running balances.
   */
  finance: FinanceAnalyticsContext

  /**
   * CRM pipeline: customers, quotes, invoices, and leads.
   * NOTE: Revenue-by-customer breakdown is not available — the customer FK
   * on invoices is a plain string, not a document ID reference.
   */
  crm: CrmAnalyticsContext

  /**
   * Workforce metrics: headcount, leave, performance reviews, recruitment.
   * NOTE: Department grouping in HR uses free-text string matching and
   * may not align perfectly with adminStore.departments records.
   */
  hr: HrAnalyticsContext

  /**
   * Inventory snapshot plus optional stock movement for the period.
   */
  inventory: InventoryAnalyticsContext
}
