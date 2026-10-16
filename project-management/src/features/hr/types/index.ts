export interface Employee {
    id?: string
    fullName: string
    nationalId: string
    department: string
    jobTitle: string
    contractType: 'Full-Time' | 'Part-Time' | 'Contract'
    startDate: string
    salary: number
    phone: string
    email: string
    status: 'Active' | 'On Leave' | 'Probation' | 'Terminated'
    createdAt?: any
}

export interface LeaveRequest {
    id?: string
    employeeId: string
    employeeName?: string
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

export interface Task {
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
    verifiedAt?: any
    notes: TaskNote[]
    createdAt?: any
}

export interface KPI {
    id?: string
    employeeId: string
    name: string
    targetValue: number
    weight: number
    period: 'Monthly' | 'Quarterly' | 'Annual'
    linkedTaskIds: string[]
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
    payrollId?: string // ID of the payroll where this was recovered
    ledgerEntryId?: string // Link to the cash outflow record
    createdAt?: any
}

export interface Payroll {
    id?: string
    employeeId: string
    employeeName?: string
    month: number
    year: number
    basicSalary: number
    allowances: number
    deductions: number       // total deductions (sum of statutory + advances)
    advanceDeduction?: number // specific portion from salary advances
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
    jobCardEarnings?: number   // cumulative earnings posted from job cards this month
    necEmployee?: number       // NEC employee contribution
    taxableIncome?: number     // used by payslip PDF
    linkedAdvanceIds?: string[] // internal tracking of recovered advances
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

export const RATING_LABELS: Record<string, string> = {
    Excellent: '90–100%',
    Good: '75–89%',
    Satisfactory: '60–74%',
    'Needs Improvement': '40–59%',
    Unsatisfactory: 'Below 40%'
}

export function getRating(score: number): string {
    if (score >= 90) return 'Excellent'
    if (score >= 75) return 'Good'
    if (score >= 60) return 'Satisfactory'
    if (score >= 40) return 'Needs Improvement'
    return 'Unsatisfactory'
}

export function getRatingColor(rating: string): string {
    const map: Record<string, string> = {
        Excellent: 'text-emerald-500',
        Good: 'text-blue-500',
        Satisfactory: 'text-yellow-500',
        'Needs Improvement': 'text-orange-500',
        Unsatisfactory: 'text-red-500'
    }
    return map[rating] || 'text-muted-foreground'
}
