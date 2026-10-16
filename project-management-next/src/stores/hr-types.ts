export interface Employee {
  id: string
  fullName?: string
  name?: string
  displayName?: string
  email?: string
  phone?: string
  role?: string
  roles?: string | string[]
  status?: string
  isActive?: boolean
  employeeId?: string
  /** Linked Firebase Auth / Firestore users doc uid (optional). */
  userId?: string | null
  department?: string
  jobTitle?: string
  position?: string
  nationalId?: string
  startDate?: string
  salary?: number
  contractType?: string
}

export interface LeaveRequest {
  id?: string
  employeeId: string
  employeeName: string
  type: 'Annual' | 'Sick' | 'Emergency' | 'Study' | 'Maternity/Paternity'
  startDate: string
  endDate: string
  reason: string
  status: 'Pending' | 'Approved' | 'Rejected'
  approvedBy?: string
  approvedByName?: string
  createdAt?: any
}

export interface TaskNote {
  id: string
  userId: string
  userName: string
  text: string
  createdAt: any
}

export interface HrTask {
  id?: string
  title: string
  description: string
  assignedTo: string
  assignedToName?: string
  assignedBy: string
  assignedByName?: string
  department: string
  priority: 'Low' | 'Medium' | 'High' | 'Critical'
  dueDate: string
  status: 'Pending' | 'In Progress' | 'Completed' | 'Overdue'
  completionPercent: number
  kpiCategory?: string
  verifiedBy?: string
  verifiedByName?: string
  verifiedAt?: any
  notes?: TaskNote[]
  createdAt?: any
}

export interface KPI {
  id?: string
  employeeId: string
  name: string
  targetValue: number
  weight: number
  period: 'Monthly' | 'Quarterly' | 'Annual'
  linkedTaskIds?: string[]
  managerComment?: string
  createdAt?: any
}

export interface KPIScore {
  kpiId: string
  kpiName: string
  weight: number
  targetValue: number
  actualScore: number
  weightedScore: number
}

export interface PerformanceReview {
  id?: string
  employeeId: string
  period: string
  kpiScores: KPIScore[]
  overallScore: number
  rating: string
  managerComments?: string
  generatedAt?: any
}

export interface SalaryAdvance {
  id?: string
  employeeId: string
  employeeName: string
  amount: number
  date: string
  reason?: string
  status: SalaryAdvanceStatus
  originalAmount?: number
  outstandingBalance?: number
  recoveredAmount?: number
  reservedBalance?: number
  urgencyNotes?: string
  supportingDocumentUrl?: string
  requestedBy?: WorkflowActor
  verifiedBy?: WorkflowActor
  approvedBy?: WorkflowActor
  paidBy?: WorkflowActor
  rejectedBy?: WorkflowActor
  reversedBy?: WorkflowActor
  requestedAt?: any
  verifiedAt?: any
  approvedAt?: any
  paidAt?: any
  rejectedAt?: any
  reversedAt?: any
  rejectionReason?: string
  reversalReason?: string
  disbursementReference?: string
  walletTransactionId?: string
  legacy?: boolean
  payrollId?: string
  ledgerEntryId?: string
  createdAt?: any
}

export type SalaryAdvanceStatus =
  | 'PENDING_ACCOUNTANT'
  | 'PENDING_MANAGER'
  | 'APPROVED_FOR_PAYMENT'
  | 'ACTIVE'
  | 'SETTLED'
  | 'REJECTED'
  | 'REVERSED'
  // Read-only legacy states until migration review is completed.
  | 'Pending Approval'
  | 'Unprocessed'
  | 'Processed'

export interface WorkflowActor {
  uid: string
  name: string
  email?: string
}

export interface SalaryAdvanceRecovery {
  id?: string
  advanceId: string
  payrollId: string
  employeeId: string
  month: number
  year: number
  amount: number
  balanceBefore: number
  balanceAfter?: number
  status: 'RESERVED' | 'RECOVERED' | 'RELEASED' | 'REVERSED'
  createdBy: WorkflowActor
  createdAt?: any
  recoveredAt?: any
  releasedAt?: any
}

/** Manager gate before an accountant may pay a generated payroll. */
export type PayrollApprovalStatus = 'PENDING_MANAGER' | 'APPROVED_MANAGER'

export interface PayrollGenerationInput {
  employeeId: string
  employeeName: string
  month: number
  year: number
  basicSalary: number
  /** Accountant-entered allowance only; persisted allowances also include job-card earnings. */
  allowances: number
  paye: number
  nssa: number
  aidsLevy: number
  zimdef: number
  wcif: number
  damagesDeduction: number
  uniformDeduction: number
  advanceInstallments?: Record<string, number>
  actor?: WorkflowActor
}

export interface Payroll {
  id?: string
  employeeId: string
  employeeName?: string
  nationalId?: string
  month: number
  year: number
  basicSalary: number
  allowances: number
  deductions: number
  advanceDeduction?: number
  aidsLevy?: number
  nssa?: number
  zimdef?: number
  wcif?: number
  paye?: number
  damagesDeduction?: number
  uniformDeduction?: number
  netPay: number
  status: 'Unpaid' | 'Partially paid' | 'Paid'
  schemaVersion?: number
  recognized?: boolean
  revision?: number
  currency?: string
  paidAmount?: number
  outstanding?: number
  dueDate?: string
  effectiveDate?: string
  employerNssa?: number
  employerCost?: number
  /**
   * Manager approval before payment.
   * Job-earnings-only payrolls (already approved on the job card) are auto-set
   * to APPROVED_MANAGER. Basic salary / manual allowances require PENDING → APPROVED.
   */
  approvalStatus?: PayrollApprovalStatus
  /** Why APPROVED_MANAGER was set without a live manager click. */
  approvalSource?: 'JOB_CARD' | 'MANAGER' | 'LEGACY'
  approvedAt?: any
  approvedBy?: string
  paymentMethod?: string
  ledgerEntryId?: string
  linkedAdvanceIds?: string[]
  advanceInstallments?: Record<string, number>
  advanceRecoveryDetails?: Array<{ advanceId: string; amount: number; balanceBefore: number; balanceAfter: number }>
  jobCardEarnings?: number
  jobCardReferences?: string[]
  jobCardRateIds?: string[]
  /** False for skeleton records created by job-card postings before HR generates payroll. */
  generated?: boolean
  /** Basic salary + manual allowances already accumulated to the Salaries Account. */
  accumulatedFixed?: number
  generatedAt?: any
  updatedAt?: any
}

export interface Applicant {
  id: string
  name: string
  email: string
  phone?: string
  status: 'Applied' | 'Interviewed' | 'Offered' | 'Hired' | 'Rejected'
  appliedAt: string
  notes?: string
}

export interface JobPosting {
  id?: string
  jobTitle: string
  department: string
  description?: string
  status: 'Open' | 'Closed' | 'On Hold'
  postedDate: string
  applicants: Applicant[]
  createdAt?: any
}

export interface SalariesTransaction {
  id?: string
  type: string
  source: string
  amount: number
  month: number
  year: number
  description: string
  referenceId?: string
  createdAt?: any
}
