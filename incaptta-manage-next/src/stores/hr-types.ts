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
  status: 'Pending Approval' | 'Unprocessed' | 'Processed'
  payrollId?: string
  ledgerEntryId?: string
  createdAt?: any
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
  status: 'Unpaid' | 'Paid'
  paymentMethod?: string
  ledgerEntryId?: string
  linkedAdvanceIds?: string[]
  jobCardEarnings?: number
  jobCardReferences?: string[]
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
