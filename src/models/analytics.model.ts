import { z } from 'zod';

// ── Sub-schemas: inbound AnalyticsPayload (mirrors frontend analytics types) ──

const JobCardStatusCountSchema = z.object({
    status: z.string().min(1).max(80),
    count: z.number().int().nonnegative(),
});

const OverdueJobCardSchema = z.object({
    id: z.string().min(1),
    jobNumber: z.string().min(1),
    jobTitle: z.string().min(1),
    status: z.string().min(1),
    requestingDepartmentId: z.string(),
    departmentName: z.string(),
    createdAt: z.string(),
    daysOpen: z.number().int().nonnegative(),
});

const JobCardAnalyticsSchema = z.object({
    total: z.number().int().nonnegative(),
    byStatus: z.array(JobCardStatusCountSchema).max(30),
    overdueOpenCards: z.array(OverdueJobCardSchema).max(200),
    pendingApprovals: z.number().int().nonnegative(),
    completedInPeriod: z.number().int().nonnegative(),
});

const CategoryTotalSchema = z.object({
    category: z.string().min(1).max(200),
    total: z.number().nonnegative(),
    // count mirrors the frontend CategoryTotal.count field
    count: z.number().int().nonnegative(),
});

const DailyExpenseTotalSchema = z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    total: z.number().nonnegative(),
});

const LargestExpenseItemSchema = z.object({
    id: z.string().min(1),
    description: z.string().min(1),
    amount: z.number().nonnegative(),
    category: z.string(),
    // paymentMethod and status mirror the frontend LargestExpenseItem interface
    paymentMethod: z.string(),
    status: z.string(),
    date: z.string(),
});

const ExpenseAnalyticsSchema = z.object({
    totalAmount: z.number().nonnegative(),
    approvedAmount: z.number().nonnegative(),
    byCategory: z.array(CategoryTotalSchema).max(100),
    trend: z.array(DailyExpenseTotalSchema).max(365),
    largestItems: z.array(LargestExpenseItemSchema).max(50),
    pendingApprovalCount: z.number().int().nonnegative(),
    pendingManagerCount: z.number().int().nonnegative(),
});

const TransferAnalyticsSchema = z.object({
    totalCompletedAmount: z.number().nonnegative(),
    completedInPeriod: z.number().int().nonnegative(),
    pendingAccountantCount: z.number().int().nonnegative(),
    pendingManagerCount: z.number().int().nonnegative(),
});

// Field name is `account` (not `key`) — matches frontend AccountBalance interface.
// No `label` field exists on the frontend type; it is resolved client-side only.
const AccountBalanceSchema = z.object({
    account: z.string().min(1).max(20),
    balance: z.number(),
});

const DepartmentMetricSchema = z.object({
    departmentId: z.string().min(1),
    departmentName: z.string().min(1).max(200),
    jobCardCount: z.number().int().nonnegative(),
    completedCount: z.number().int().nonnegative(),
    // completionRate is 0–100 (integer percent), not a 0–1 fraction.
    completionRate: z.number().min(0).max(100),
    totalInvoiceValue: z.number().nonnegative(),
});

const InventorySnapshotSchema = z.object({
    totalItems: z.number().int().nonnegative(),
    activeItems: z.number().int().nonnegative(),
    lowStockCount: z.number().int().nonnegative(),
    // Field is `totalInventoryValue` (purchase-price basis), not `totalStockValue`.
    totalInventoryValue: z.number().nonnegative(),
});

// ── Finance Domain ───────────────────────────────────────────────────────────

const FinanceIncomeByMethodSchema = z.object({
    method: z.string(),
    total: z.number(),
    count: z.number().int(),
});

const FinanceIncomeTrendPointSchema = z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    amount: z.number(),
});

const FinanceLargestPaymentSchema = z.object({
    id: z.string(),
    amount: z.number(),
    method: z.string(),
    jobCardId: z.string(),
    date: z.string(),
});

const FinanceIncomeAnalyticsSchema = z.object({
    totalReceived: z.number(),
    totalCount: z.number().int(),
    byPaymentMethod: z.array(FinanceIncomeByMethodSchema),
    trend: z.array(FinanceIncomeTrendPointSchema),
    largestPayment: FinanceLargestPaymentSchema.optional(),
});

const FinancePayrollByMonthSchema = z.object({
    month: z.number().int(),
    year: z.number().int(),
    total: z.number(),
    status: z.string(),
});

const FinancePayrollAnalyticsSchema = z.object({
    totalPaid: z.number(),
    totalUnpaid: z.number(),
    unpaidCount: z.number().int(),
    byMonth: z.array(FinancePayrollByMonthSchema),
});

const FinanceAnalyticsContextSchema = z.object({
    income: FinanceIncomeAnalyticsSchema,
    payroll: FinancePayrollAnalyticsSchema,
});

// ── CRM Domain ────────────────────────────────────────────────────────────────

const CrmCustomerRefSchema = z.object({
    id: z.string(),
    name: z.string(),
});

const CrmQuoteAnalyticsSchema = z.object({
    total: z.number().int(),
    approved: z.number().int(),
    draft: z.number().int(),
    totalValue: z.number(),
    avgDealSize: z.number().optional(),
});

const CrmLargestOutstandingInvoiceSchema = z.object({
    id: z.string(),
    customerName: z.string(),
    grandTotal: z.number(),
    amountPaid: z.number(),
});

const CrmInvoiceAnalyticsSchema = z.object({
    total: z.number().int(),
    paid: z.number().int(),
    unpaid: z.number().int(),
    partial: z.number().int(),
    totalOutstanding: z.number(),
    largestOutstanding: CrmLargestOutstandingInvoiceSchema.optional(),
});

const CrmLeadBySourceSchema = z.object({
    source: z.string(),
    count: z.number().int(),
    value: z.number(),
});

const CrmLeadAnalyticsSchema = z.object({
    total: z.number().int(),
    byStage: z.record(z.string(), z.number().int()),
    pipelineValue: z.number(),
    wonCount: z.number().int(),
    lostCount: z.number().int(),
    bySource: z.array(CrmLeadBySourceSchema),
});

const CrmAnalyticsContextSchema = z.object({
    customers: z.array(CrmCustomerRefSchema),
    customerCount: z.number().int(),
    quotes: CrmQuoteAnalyticsSchema,
    invoices: CrmInvoiceAnalyticsSchema,
    leads: CrmLeadAnalyticsSchema,
});

// ── HR Domain ─────────────────────────────────────────────────────────────────

const HrHeadcountByDepartmentSchema = z.object({
    departmentLabel: z.string(),
    count: z.number().int(),
});

const HrHeadcountAnalyticsSchema = z.object({
    total: z.number().int(),
    active: z.number().int(),
    onLeave: z.number().int(),
    byDepartment: z.array(HrHeadcountByDepartmentSchema),
});

const HrLeaveByTypeSchema = z.object({
    type: z.string(),
    count: z.number().int(),
});

const HrLeaveAnalyticsSchema = z.object({
    pendingRequests: z.number().int(),
    approvedThisPeriod: z.number().int(),
    byType: z.array(HrLeaveByTypeSchema),
});

const HrPerformanceByDepartmentSchema = z.object({
    departmentLabel: z.string(),
    avgScore: z.number(),
});

const HrPerformanceAnalyticsSchema = z.object({
    reviewCount: z.number().int(),
    avgScore: z.number().optional(),
    byDepartment: z.array(HrPerformanceByDepartmentSchema),
});

const HrRecruitmentAnalyticsSchema = z.object({
    openRoles: z.number().int(),
    totalApplicants: z.number().int(),
});

const HrAnalyticsContextSchema = z.object({
    headcount: HrHeadcountAnalyticsSchema,
    leave: HrLeaveAnalyticsSchema,
    performance: HrPerformanceAnalyticsSchema,
    recruitment: HrRecruitmentAnalyticsSchema,
});

// ── Operations Domain (nested structure) ─────────────────────────────────────

const AdHocExpenseSummarySchema = z.object({
    total: z.number(),
    approved: z.number(),
    pending: z.number(),
    count: z.number().int(),
    approvedCount: z.number().int(),
    pendingCount: z.number().int(),
    todayTotal: z.number(),
    byPaymentMethod: z.array(z.object({ method: z.string(), total: z.number() })),
    recentApproved: z.array(z.object({
        id: z.string(),
        description: z.string(),
        amount: z.number(),
        paymentMethod: z.string(),
        jobCardRef: z.string(),
        createdAt: z.string().optional(),
    })).max(10),
});

const OperationsAnalyticsContextSchema = z.object({
    periodStart: z.string(),
    jobCards: JobCardAnalyticsSchema,
    expenses: ExpenseAnalyticsSchema,
    transfers: TransferAnalyticsSchema,
    accountBalances: z.array(AccountBalanceSchema),
    departmentMetrics: z.array(DepartmentMetricSchema),
    approvalCycleTimes: z.object({
        avgDaysJobCards: z.number().optional(),
        avgDaysExpenses: z.number().optional(),
    }).optional(),
    adHocExpenses: AdHocExpenseSummarySchema.optional(),
});

// ── Inventory Domain (nested structure) ──────────────────────────────────────

const InvTopConsumedItemSchema = z.object({
    id: z.string(),
    label: z.string(),
    totalIssued: z.number(),
});

const InvStockMovementSchema = z.object({
    totalIssued: z.number(),
    totalReturned: z.number(),
    topConsumedItems: z.array(InvTopConsumedItemSchema),
});

const InventoryAnalyticsContextSchema = InventorySnapshotSchema.extend({
    stockMovement: InvStockMovementSchema.optional(),
});

// ── Main inbound request schema ───────────────────────────────────────────────
// MATCHES FRONTEND UnifiedOperationalContext
export const AnalyticsBriefRequestSchema = z.object({
    generatedAt: z.string().min(1),
    periodDays: z.number().int().positive().max(365),
    operations: OperationsAnalyticsContextSchema,
    finance: FinanceAnalyticsContextSchema,
    crm: CrmAnalyticsContextSchema,
    hr: HrAnalyticsContextSchema,
    inventory: InventoryAnalyticsContextSchema,
});

export type AnalyticsBriefRequest = z.infer<typeof AnalyticsBriefRequestSchema>;

// ── AI response schema ────────────────────────────────────────────────────────

const AnomalySchema = z.object({
    metric: z.string().min(1).max(200),
    observation: z.string().min(1).max(600),
    severity: z.enum(['low', 'medium', 'high']),
});

const RecommendationSchema = z.object({
    title: z.string().min(1).max(200),
    rationale: z.string().min(1).max(600),
    priority: z.enum(['low', 'medium', 'high']),
});

const ChartAnnotationSchema = z.object({
    label: z.string().min(1).max(100),
    metric: z.string().min(1).max(100),
    note: z.string().min(1).max(400),
});

export const AiBriefResponseSchema = z.object({
    dailyBrief: z.string().min(10).max(1500),
    keyFindings: z.array(z.string().min(1).max(600)).min(1).max(10),
    anomalies: z.array(AnomalySchema).max(10),
    recommendations: z.array(RecommendationSchema).min(1).max(10),
    chartAnnotations: z.array(ChartAnnotationSchema).max(10),
    modelConfidence: z.enum(['low', 'medium', 'high']),
    generatedAt: z.string(),
});

export type AiBriefResponse = z.infer<typeof AiBriefResponseSchema>;
// ── Analytics Chat: Conversation History ──────────────────────────────────────
const ConversationRoleSchema = z.enum(['user', 'assistant']);
const ConversationTurnSchema = z.object({
    role: ConversationRoleSchema,
    content: z.string().min(1).max(2000),
    mode: z.enum(['chat', 'reason']).optional(),
    timestamp: z.string(),
});
// ── Analytics Chat: inbound request ───────────────────────────────────────────
// The `context` field reuses the full AnalyticsBriefRequestSchema so the AI
// has the same structured data that drives the dashboard. The question is
// trimmed and bounded before it ever reaches the service layer.
// `history` allows multi-turn context (last 6 turns recommended).
export const AnalyticsChatRequestSchema = z.object({
    question: z.string()
        .trim()
        .min(3, 'Question must be at least 3 characters')
        .max(500, 'Question must not exceed 500 characters'),
    context: AnalyticsBriefRequestSchema,
    history: z.array(ConversationTurnSchema).max(10).optional(),
});
export type AnalyticsChatRequest = z.infer<typeof AnalyticsChatRequestSchema>;

// ── Analytics Chat: AI response ────────────────────────────────────────────────

const ChatHighlightSchema = z.object({
    /** Short metric name or KPI label surfaced by the AI as relevant to the question */
    label: z.string().min(1).max(100),
    /** The actual value from the data, formatted as a human-readable string */
    value: z.string().min(1).max(200),
    /** Urgency or importance of this highlight relative to the question */
    severity: z.enum(['low', 'medium', 'high']),
});

const ChatRelatedRecordSchema = z.object({
    /** Domain type — constrains what the AI is allowed to reference */
    type: z.enum(['job_card', 'department', 'expense', 'account', 'transfer']),
    /** ID exactly as it appears in the context data — AI must not fabricate */
    id: z.string().min(1).max(200),
    /** Human-readable label derived from the context data */
    label: z.string().min(1).max(200),
});

export const AnalyticsChatResponseSchema = z.object({
    /** The interaction mode used (chat = standard, reason = deep analysis) */
    mode: z.enum(['chat', 'reason']),
    /** Direct answer to the manager's question, citing specific values */
    answer: z.string().min(10).max(2000),
    /** Key metrics from the data that directly support the answer (max 8) */
    highlights: z.array(ChatHighlightSchema).max(8),
    /** Specific, data-supported next steps the manager could take (max 5) */
    recommendedActions: z.array(z.string().min(1).max(300)).max(5),
    /** Records from the context data that are directly relevant to the answer */
    relatedRecords: z.array(ChatRelatedRecordSchema).max(10),
    /** Specific questions for the manager to follow up with (max 5) */
    suggestedFollowUps: z.array(z.string().min(1).max(200)).max(5).optional(),
    /** Server-assigned timestamp — AI-provided value is overridden server-side */
    generatedAt: z.string(),
});

export type AnalyticsChatResponse = z.infer<typeof AnalyticsChatResponseSchema>;
