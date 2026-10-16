<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { db } from '@/lib/firebase'
import { 
  collection, query, onSnapshot, doc, updateDoc, addDoc, 
  deleteDoc, serverTimestamp, writeBatch, Timestamp, where, getDocs, getDoc 
} from 'firebase/firestore'
import { useRouter } from 'vue-router'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { 
  ChevronLeft, Search, Loader2, Phone, ShieldAlert, User, X, 
  ShieldCheck, Calendar, Wallet, ClipboardList, Briefcase, Landmark, 
  AlertTriangle, Plus, Check, 
  Trash2, FileText, Percent
} from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import { useSession } from '@/composables/useSession'
import { useFinanceStore } from '@/stores/financeStore'
import { storeToRefs } from 'pinia'

// ─── Interfaces ─────────────────────────────────────────────────────────────
interface Employee {
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
  department?: string
  jobTitle?: string
  nationalId?: string
  startDate?: string
  salary?: number
  contractType?: string
}

interface LeaveRequest {
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

interface TaskNote {
  id: string
  userId: string
  userName: string
  text: string
  createdAt: any
}

interface Task {
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

interface KPI {
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

interface KPIScore {
  kpiId: string
  kpiName: string
  weight: number
  targetValue: number
  actualScore: number
  weightedScore: number
}

interface PerformanceReview {
  id?: string
  employeeId: string
  period: string
  kpiScores: KPIScore[]
  overallScore: number
  rating: string
  managerComments?: string
  generatedAt?: any
}

interface SalaryAdvance {
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

interface Payroll {
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

interface Applicant {
  id: string
  name: string
  email: string
  phone?: string
  status: 'Applied' | 'Interviewed' | 'Offered' | 'Hired' | 'Rejected'
  appliedAt: string
  notes?: string
}

interface JobPosting {
  id?: string
  jobTitle: string
  department: string
  description?: string
  status: 'Open' | 'Closed' | 'On Hold'
  postedDate: string
  applicants: Applicant[]
  createdAt?: any
}

// ─── Setup Composable State & Store ──────────────────────────────────────────
const router = useRouter()
const { user } = useSession()
const financeStore = useFinanceStore()
const { finalBalances } = storeToRefs(financeStore)

// Tab Navigation
const currentTab = ref('overview')
const subTabs = [
  { id: 'overview', name: 'Overview', icon: ClipboardList },
  { id: 'roster', name: 'Roster', icon: User },
  { id: 'leave', name: 'Leave & Attendance', icon: Calendar },
  { id: 'payroll', name: 'Payroll & Salary', icon: Wallet },
  { id: 'advances', name: 'Advances', icon: Wallet },
  { id: 'tasks', name: 'HR Tasks', icon: ClipboardList },
  { id: 'performance', name: 'Performance', icon: Percent },
  { id: 'recruitment', name: 'Recruitment', icon: Briefcase },
  { id: 'salaries', name: 'Salaries Account', icon: Landmark }
]

// ─── Firestore Reactive Collections ──────────────────────────────────────────
const employees = ref<Employee[]>([])
const leaveRequests = ref<LeaveRequest[]>([])
const hrTasks = ref<Task[]>([])
const kpis = ref<KPI[]>([])
const reviews = ref<PerformanceReview[]>([])
const payrolls = ref<Payroll[]>([])
const salaryAdvances = ref<SalaryAdvance[]>([])
const jobPostings = ref<JobPosting[]>([])
const salariesTransactions = ref<any[]>([])

const loading = ref(false)
const isSubmitting = ref(false)

// Unsubscribe list
let unsubs: (() => void)[] = []

onMounted(() => {
  loading.value = true
  
  // Finance store hooks
  financeStore.fetchExpenses()
  financeStore.fetchTransfers()
  financeStore.fetchJobPayments()
  financeStore.fetchTopUps()
  financeStore.fetchSalariesTransactions()
  financeStore.fetchHistoricalInventoryConsumption()

  // Real-time Firestore streams
  const qEmployees = query(collection(db, 'employees'))
  const unsubEmployees = onSnapshot(qEmployees, (snap) => {
    employees.value = snap.docs.map(d => ({ id: d.id, ...d.data() } as Employee))
    loading.value = false
  })
  unsubs.push(unsubEmployees)

  const qLeave = query(collection(db, 'leaveRequests'))
  const unsubLeave = onSnapshot(qLeave, (snap) => {
    leaveRequests.value = snap.docs.map(d => ({ id: d.id, ...d.data() } as LeaveRequest))
  })
  unsubs.push(unsubLeave)

  const qTasks = query(collection(db, 'hrTasks'))
  const unsubTasks = onSnapshot(qTasks, (snap) => {
    const now = new Date()
    hrTasks.value = snap.docs.map(d => {
      const data = d.data() as Task
      const due = data.dueDate ? new Date(data.dueDate) : null
      let status = data.status
      if (due && due < now && status !== 'Completed') {
        status = 'Overdue'
      }
      return { ...data, id: d.id, status }
    })
  })
  unsubs.push(unsubTasks)

  const qKpis = query(collection(db, 'kpis'))
  const unsubKpis = onSnapshot(qKpis, (snap) => {
    kpis.value = snap.docs.map(d => ({ id: d.id, ...d.data() } as KPI))
  })
  unsubs.push(unsubKpis)

  const qReviews = query(collection(db, 'performanceReviews'))
  const unsubReviews = onSnapshot(qReviews, (snap) => {
    reviews.value = snap.docs.map(d => ({ id: d.id, ...d.data() } as PerformanceReview))
  })
  unsubs.push(unsubReviews)

  const qPayroll = query(collection(db, 'payroll'))
  const unsubPayroll = onSnapshot(qPayroll, (snap) => {
    payrolls.value = snap.docs.map(d => ({ id: d.id, ...d.data() } as Payroll))
  })
  unsubs.push(unsubPayroll)

  const qAdvances = query(collection(db, 'salaryAdvances'))
  const unsubAdvances = onSnapshot(qAdvances, (snap) => {
    salaryAdvances.value = snap.docs.map(d => ({ id: d.id, ...d.data() } as SalaryAdvance))
  })
  unsubs.push(unsubAdvances)

  const qJobs = query(collection(db, 'recruitment'))
  const unsubJobs = onSnapshot(qJobs, (snap) => {
    jobPostings.value = snap.docs.map(d => ({ id: d.id, ...d.data() } as JobPosting))
  })
  unsubs.push(unsubJobs)

  const qSalTrans = query(collection(db, 'salariesAccountTransactions'))
  const unsubSalTrans = onSnapshot(qSalTrans, (snap) => {
    salariesTransactions.value = snap.docs.map(d => ({ id: d.id, ...d.data() }))
  })
  unsubs.push(unsubSalTrans)
})

onUnmounted(() => {
  unsubs.forEach(unsub => unsub())
  financeStore.cleanup()
})

// ─── Helpers & Formatting ──────────────────────────────────────────────────
const getEmpName = (emp?: Employee | null) => emp ? (emp.fullName || emp.name || emp.displayName || 'Unnamed Employee') : '—'
const fmt = (n?: number | null) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2
  }).format(n || 0)
}
const daysBetween = (start: string, end: string) => {
  const d = (new Date(end).getTime() - new Date(start).getTime()) / 86400000
  return isNaN(d) ? 0 : Math.round(d) + 1
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
]

const getRolesArray = (emp: Employee): string[] => {
  const r = emp.roles || emp.role || []
  if (Array.isArray(r)) return r.map(x => x.toUpperCase())
  if (typeof r === 'string') return [r.toUpperCase()]
  return []
}

// ─── Calculation Utilities (ZIM STATUTORY) ─────────────────────────────────
const calculateTaxDeductions = (gross: number) => {
  // NSSA 4.5% with $700 limit
  const nssa = Number((Math.min(gross, 700) * 0.045).toFixed(2))
  const taxable = gross - nssa

  // Progressive Tax USD Table
  let paye = 0
  if (taxable <= 100) {
    paye = 0
  } else if (taxable <= 300) {
    paye = (taxable * 0.20) - 20
  } else if (taxable <= 1000) {
    paye = (taxable * 0.25) - 35
  } else if (taxable <= 2000) {
    paye = (taxable * 0.30) - 85
  } else if (taxable <= 3000) {
    paye = (taxable * 0.35) - 185
  } else {
    paye = (taxable * 0.40) - 335
  }
  paye = Math.max(0, Number(paye.toFixed(2)))

  const aidsLevy = Number((paye * 0.03).toFixed(2))
  const zimdef = Number((gross * 0.01).toFixed(2))
  const wcif = Number((gross * 0.0125).toFixed(2))

  return { paye, aidsLevy, nssa, zimdef, wcif }
}

// ─── Leave Balance Computation ──────────────────────────────────────────────
const leaveBalances = computed(() => {
  const map: Record<string, number> = {}
  employees.value.forEach(e => {
    const approvedUsed = leaveRequests.value
      .filter(l => l.employeeId === e.id && l.status === 'Approved' && l.type === 'Annual')
      .reduce((sum, l) => sum + daysBetween(l.startDate, l.endDate), 0)
    map[e.id] = Math.max(0, 20 - approvedUsed)
  })
  return map
})

// ─── Global Search & Filters ────────────────────────────────────────────────
const searchQuery = ref('')
const roleFilter = ref('all')

const filteredEmployees = computed(() => {
  let list = [...employees.value]
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase()
    list = list.filter(e => {
      const name = getEmpName(e).toLowerCase()
      const email = (e.email || '').toLowerCase()
      const phone = (e.phone || '').toLowerCase()
      return name.includes(q) || email.includes(q) || phone.includes(q)
    })
  }
  if (roleFilter.value !== 'all') {
    list = list.filter(e => getRolesArray(e).includes(roleFilter.value.toUpperCase()))
  }
  return list
})

// ─── Modal & Dialog Controls ────────────────────────────────────────────────
const showProfileModal = ref(false)
const selectedEmp = ref<Employee | null>(null)

// 1. Employee Roster Dialogs
const showAddEmpModal = ref(false)
const showEditEmpModal = ref(false)
const empForm = ref({
  fullName: '',
  email: '',
  phone: '',
  department: '',
  jobTitle: '',
  salary: 0,
  contractType: 'Full-Time',
  nationalId: '',
  startDate: new Date().toISOString().split('T')[0]
})

// 2. Leave Dialog
const showRequestLeaveModal = ref(false)
const leaveForm = ref({
  employeeId: '',
  type: 'Annual' as LeaveRequest['type'],
  startDate: '',
  endDate: '',
  reason: ''
})

// 3. Payroll Dialogs
const showGenPayrollModal = ref(false)
const payrollForm = ref({
  employeeId: '',
  month: new Date().getMonth() + 1,
  year: new Date().getFullYear(),
  basicSalary: 0,
  allowances: 0,
  paye: 0,
  nssa: 0,
  aidsLevy: 0,
  zimdef: 0,
  wcif: 0,
  damagesDeduction: 0,
  uniformDeduction: 0
})
const filterMonth = ref(new Date().getMonth() + 1)
const filterYear = ref(new Date().getFullYear())
const showPayPayrollModal = ref(false)
const payPayrollForm = ref({
  payrollId: '',
  employeeName: '',
  netPay: 0,
  month: 1,
  year: 2026,
  paymentMethod: 'BANK'
})

// 4. Advances Dialog
const showAddAdvanceModal = ref(false)
const advanceForm = ref({
  employeeId: '',
  amount: 0,
  reason: ''
})

// 5. Tasks Dialog
const showAddTaskModal = ref(false)
const taskForm = ref({
  title: '',
  description: '',
  assignedTo: '',
  priority: 'Medium' as Task['priority'],
  dueDate: '',
  kpiCategory: ''
})
const showTaskNoteModal = ref(false)
const taskNoteText = ref('')
const selectedTaskId = ref('')

// 6. KPIs & Performance Reviews
const showAddKpiModal = ref(false)
const kpiForm = ref({
  employeeId: '',
  name: '',
  targetValue: 100,
  weight: 20,
  period: 'Monthly' as KPI['period']
})
const showGenReviewModal = ref(false)
const reviewForm = ref({
  employeeId: '',
  period: ''
})
const showReviewDetailModal = ref(false)
const selectedReview = ref<PerformanceReview | null>(null)

// 7. Recruitment Dialogs
const showAddJobModal = ref(false)
const jobForm = ref({
  jobTitle: '',
  department: '',
  description: '',
  salaryRange: '',
  status: 'Open' as JobPosting['status']
})
const showAddApplicantModal = ref(false)
const selectedJobId = ref('')
const applicantForm = ref({
  name: '',
  email: '',
  phone: '',
  notes: ''
})

// 8. Salaries Account Funding Modal
const showSalariesFundModal = ref(false)
const salariesFundForm = ref({
  fromAccount: 'BANK',
  amount: 0,
  reference: ''
})

// 9. Payslip HTML Print Preview Modal
const showPayslipPreviewModal = ref(false)
const selectedPayslipPayroll = ref<Payroll | null>(null)
const selectedPayslipPostings = ref<any[]>([])

const showBreakdownModal = ref(false)
const selectedBreakdownPayroll = ref<Payroll | null>(null)
const breakdownPostings = ref<any[]>([])
const loadingBreakdown = ref(false)

// ─── CRUD Operations ────────────────────────────────────────────────────────

// Profile suspension/activation
const toggleEmpStatus = async () => {
  if (!selectedEmp.value) return
  isSubmitting.value = true
  const nextStatus = !selectedEmp.value.isActive
  try {
    await updateDoc(doc(db, 'employees', selectedEmp.value.id), {
      isActive: nextStatus,
      status: nextStatus ? 'Active' : 'Terminated',
      updatedAt: serverTimestamp()
    })
    selectedEmp.value.isActive = nextStatus
    selectedEmp.value.status = nextStatus ? 'Active' : 'Terminated'
    toast.success(`Employee set to ${nextStatus ? 'Active' : 'Inactive'}`)
    showProfileModal.value = false
  } catch (err) {
    toast.error('Failed to change status')
  } finally {
    isSubmitting.value = false
  }
}

// Add/Edit Employees
const saveEmployee = async () => {
  if (!empForm.value.fullName || !empForm.value.email) {
    toast.error('Name and Email are required')
    return
  }
  isSubmitting.value = true
  try {
    if (showEditEmpModal.value && selectedEmp.value) {
      await updateDoc(doc(db, 'employees', selectedEmp.value.id), {
        ...empForm.value,
        updatedAt: serverTimestamp()
      })
      toast.success('Employee updated successfully')
      showEditEmpModal.value = false
    } else {
      await addDoc(collection(db, 'employees'), {
        ...empForm.value,
        isActive: true,
        status: 'Active',
        createdAt: serverTimestamp()
      })
      toast.success('Employee added successfully')
      showAddEmpModal.value = false
    }
  } catch (err) {
    toast.error('Save failed')
  } finally {
    isSubmitting.value = false
  }
}

const openEditEmp = (emp: Employee) => {
  selectedEmp.value = emp
  empForm.value = {
    fullName: emp.fullName || emp.name || '',
    email: emp.email || '',
    phone: emp.phone || '',
    department: emp.department || '',
    jobTitle: emp.jobTitle || '',
    salary: emp.salary || 0,
    contractType: emp.contractType || 'Full-Time',
    nationalId: emp.nationalId || '',
    startDate: emp.startDate || new Date().toISOString().split('T')[0]
  }
  showEditEmpModal.value = true
}

const deleteEmployee = async (id: string) => {
  if (!confirm('Are you sure you want to delete this employee?')) return
  try {
    await deleteDoc(doc(db, 'employees', id))
    toast.success('Employee deleted')
  } catch (err) {
    toast.error('Failed to delete employee')
  }
}

// Leave Requests
const openRequestLeave = () => {
  leaveForm.value = {
    employeeId: '',
    type: 'Annual',
    startDate: '',
    endDate: '',
    reason: ''
  }
  showRequestLeaveModal.value = true
}

const submitLeaveRequest = async () => {
  if (!leaveForm.value.employeeId || !leaveForm.value.startDate || !leaveForm.value.endDate) {
    toast.error('Please complete all leave fields')
    return
  }
  isSubmitting.value = true
  try {
    const emp = employees.value.find(e => e.id === leaveForm.value.employeeId)
    await addDoc(collection(db, 'leaveRequests'), {
      ...leaveForm.value,
      employeeName: getEmpName(emp),
      status: 'Pending',
      createdAt: serverTimestamp()
    })
    toast.success('Leave requested successfully')
    showRequestLeaveModal.value = false
  } catch (err) {
    toast.error('Failed to submit leave request')
  } finally {
    isSubmitting.value = false
  }
}

const updateLeave = async (reqId: string, status: 'Approved' | 'Rejected') => {
  try {
    await updateDoc(doc(db, 'leaveRequests', reqId), {
      status,
      approvedBy: user.value?.uid || '',
      approvedByName: user.value?.displayName || user.value?.email || ''
    })
    if (status === 'Approved') {
      const leave = leaveRequests.value.find(l => l.id === reqId)
      if (leave) {
        await updateDoc(doc(db, 'employees', leave.employeeId), { status: 'On Leave' })
      }
    }
    toast.success(`Leave request ${status.toLowerCase()}`)
  } catch (err) {
    toast.error('Failed to update leave status')
  }
}

// Payroll Operations
const activeAdvancesForEmp = (empId: string) => {
  return salaryAdvances.value.filter(a => a.employeeId === empId && a.status === 'Unprocessed')
}
const activeAdvancesTotalForEmp = (empId: string) => {
  return activeAdvancesForEmp(empId).reduce((sum, a) => sum + a.amount, 0)
}

const onGenPayrollEmpChange = () => {
  const emp = employees.value.find(e => e.id === payrollForm.value.employeeId)
  if (emp) {
    payrollForm.value.basicSalary = emp.salary || 0
  }
  // Auto calculate Zimbabwean progressive taxes
  const stats = calculateTaxDeductions(payrollForm.value.basicSalary + payrollForm.value.allowances)
  payrollForm.value.paye = stats.paye
  payrollForm.value.nssa = stats.nssa
  payrollForm.value.aidsLevy = stats.aidsLevy
  payrollForm.value.zimdef = stats.zimdef
  payrollForm.value.wcif = stats.wcif
}

const genPayrollNetPay = computed(() => {
  const empId = payrollForm.value.employeeId
  const advances = activeAdvancesTotalForEmp(empId)
  const earnings = payrollForm.value.basicSalary + payrollForm.value.allowances
  const statutory = payrollForm.value.paye + payrollForm.value.nssa + payrollForm.value.aidsLevy + advances
  const nonStatutory = (payrollForm.value.damagesDeduction || 0) + (payrollForm.value.uniformDeduction || 0)
  return earnings - (statutory + nonStatutory)
})

const openGenPayrollModal = () => {
  payrollForm.value = {
    employeeId: '',
    month: filterMonth.value,
    year: filterYear.value,
    basicSalary: 0,
    allowances: 0,
    paye: 0,
    nssa: 0,
    aidsLevy: 0,
    zimdef: 0,
    wcif: 0,
    damagesDeduction: 0,
    uniformDeduction: 0
  }
  showGenPayrollModal.value = true
}

const generatePayroll = async () => {
  if (!payrollForm.value.employeeId) return
  isSubmitting.value = true
  try {
    const emp = employees.value.find(e => e.id === payrollForm.value.employeeId)
    const advances = activeAdvancesForEmp(payrollForm.value.employeeId)
    const totalAdvanceDeduction = advances.reduce((s, a) => s + a.amount, 0)
    const totalDeductions = payrollForm.value.paye + payrollForm.value.nssa + payrollForm.value.aidsLevy + totalAdvanceDeduction + (payrollForm.value.damagesDeduction || 0) + (payrollForm.value.uniformDeduction || 0)

    // Generate/upsert payroll record in Firebase
    await addDoc(collection(db, 'payroll'), {
      employeeId: payrollForm.value.employeeId,
      employeeName: getEmpName(emp),
      nationalId: emp?.nationalId || '',
      month: payrollForm.value.month,
      year: payrollForm.value.year,
      basicSalary: payrollForm.value.basicSalary,
      allowances: payrollForm.value.allowances,
      deductions: totalDeductions,
      advanceDeduction: totalAdvanceDeduction,
      aidsLevy: payrollForm.value.aidsLevy,
      nssa: payrollForm.value.nssa,
      zimdef: payrollForm.value.zimdef,
      wcif: payrollForm.value.wcif,
      paye: payrollForm.value.paye,
      damagesDeduction: payrollForm.value.damagesDeduction || 0,
      uniformDeduction: payrollForm.value.uniformDeduction || 0,
      netPay: genPayrollNetPay.value,
      status: 'Unpaid',
      linkedAdvanceIds: advances.map(a => a.id!),
      generatedAt: serverTimestamp()
    })

    // Salaries obligation accumulator transaction
    await addDoc(collection(db, 'salariesAccountTransactions'), {
      type: 'ACCUMULATION',
      source: 'PAYROLL_NET',
      amount: genPayrollNetPay.value,
      month: payrollForm.value.month,
      year: payrollForm.value.year,
      description: `Payroll Obligation generated: ${getEmpName(emp)}`,
      createdAt: serverTimestamp()
    })

    toast.success('Payroll record created successfully')
    showGenPayrollModal.value = false
  } catch (err) {
    toast.error('Failed to generate payroll')
  } finally {
    isSubmitting.value = false
  }
}

const openPayPayroll = (p: Payroll) => {
  payPayrollForm.value = {
    payrollId: p.id!,
    employeeName: p.employeeName || '',
    netPay: p.netPay,
    month: p.month,
    year: p.year,
    paymentMethod: 'BANK'
  }
  showPayPayrollModal.value = true
}

const submitConfirmPayment = async () => {
  isSubmitting.value = true
  const { payrollId, paymentMethod, employeeName, netPay, month, year } = payPayrollForm.value
  
  try {
    const batch = writeBatch(db)
    const payrollRef = doc(db, 'payroll', payrollId)
    const payrollSnap = payrolls.value.find(pr => pr.id === payrollId)
    if (!payrollSnap) throw new Error('Payroll record not found')

    // 1. Mark Paid
    batch.update(payrollRef, {
      status: 'Paid',
      paymentMethod,
      updatedAt: serverTimestamp()
    })

    const periodStr = `${MONTH_NAMES[month - 1]} ${year}`

    // 2. operationalExpenses Salary payment
    const opexRef = doc(collection(db, 'operationalExpenses'))
    batch.set(opexRef, {
      type: 'PAYROLL_NET',
      description: `Salary Payment — ${employeeName} (${periodStr})`,
      amount: netPay,
      paymentMethod: paymentMethod.toUpperCase(),
      status: 'APPROVED',
      category: 'Salaries & Wages',
      payrollId,
      createdAt: serverTimestamp(),
      approvedAt: serverTimestamp()
    })

    // 3. Statutory Liabilities
    const payeTotal = (payrollSnap.paye || 0) + (payrollSnap.aidsLevy || 0)
    if (payeTotal > 0) {
      batch.set(doc(collection(db, 'operationalExpenses')), {
        type: 'STATUTORY_LIABILITY',
        description: `ZIMRA PAYE/AIDS Levy — ${employeeName} (${periodStr})`,
        amount: payeTotal,
        paymentMethod: 'PENDING',
        status: 'PENDING',
        category: 'Statutory Liabilities',
        subCategory: 'ZIMRA',
        payrollId,
        createdAt: serverTimestamp()
      })
    }

    const nssaTotal = (payrollSnap.nssa || 0) * 2
    if (nssaTotal > 0) {
      batch.set(doc(collection(db, 'operationalExpenses')), {
        type: 'STATUTORY_LIABILITY',
        description: `NSSA Liability — ${employeeName} (${periodStr})`,
        amount: nssaTotal,
        paymentMethod: 'PENDING',
        status: 'PENDING',
        category: 'Statutory Liabilities',
        subCategory: 'NSSA',
        payrollId,
        createdAt: serverTimestamp()
      })
    }

    const otherStat = (payrollSnap.zimdef || 0) + (payrollSnap.wcif || 0)
    if (otherStat > 0) {
      batch.set(doc(collection(db, 'operationalExpenses')), {
        type: 'STATUTORY_LIABILITY',
        description: `ZIMDEF/WCIF Liability — ${employeeName} (${periodStr})`,
        amount: otherStat,
        paymentMethod: 'PENDING',
        status: 'PENDING',
        category: 'Statutory Liabilities',
        subCategory: 'OTHER_STATUTORY',
        payrollId,
        createdAt: serverTimestamp()
      })
    }

    // 4. Update ledger link
    batch.update(payrollRef, { ledgerEntryId: opexRef.id })

    // 5. Update advances to Processed
    const advanceIds: string[] = payrollSnap.linkedAdvanceIds || []
    advanceIds.forEach((advId: string) => {
      batch.update(doc(db, 'salaryAdvances', advId), {
        status: 'Processed',
        payrollId,
        updatedAt: serverTimestamp()
      })
    })

    await batch.commit()

    // 6. Salaries payment transaction
    if (paymentMethod === 'SALARIES') {
      await addDoc(collection(db, 'salariesAccountTransactions'), {
        type: 'PAYMENT',
        source: 'PAYROLL_NET',
        amount: netPay,
        month,
        year,
        description: `Salary Payment: ${employeeName}`,
        referenceId: payrollId,
        createdAt: serverTimestamp()
      })
    }

    toast.success(`Disbursement completed for ${employeeName}`)
    showPayPayrollModal.value = false
  } catch (err) {
    toast.error('Payment confirmation failed')
  } finally {
    isSubmitting.value = false
  }
}

const deletePayroll = async (p: Payroll) => {
  if (!confirm('Are you sure you want to delete this payroll entry?')) return
  try {
    const batch = writeBatch(db)
    
    // Ledger expenses cleanup
    const opexQuery = query(collection(db, 'operationalExpenses'), where('payrollId', '==', p.id))
    const opexSnap = await getDocs(opexQuery)
    opexSnap.docs.forEach(doc => batch.delete(doc.ref))

    // Revert advances
    const advIds: string[] = p.linkedAdvanceIds || []
    advIds.forEach((advId: string) => {
      batch.update(doc(db, 'salaryAdvances', advId), {
        status: 'Unprocessed',
        payrollId: null,
        updatedAt: serverTimestamp()
      })
    })

    batch.delete(doc(db, 'payroll', p.id!))
    await batch.commit()
    toast.success('Payroll record deleted')
  } catch (err) {
    toast.error('Failed to delete payroll entry')
  }
}

// Salary Advances
const submitSalaryAdvance = async () => {
  if (!advanceForm.value.employeeId || advanceForm.value.amount <= 0) {
    toast.error('Invalid Employee or Amount')
    return
  }
  isSubmitting.value = true
  try {
    const emp = employees.value.find(e => e.id === advanceForm.value.employeeId)
    await addDoc(collection(db, 'salaryAdvances'), {
      employeeId: advanceForm.value.employeeId,
      employeeName: getEmpName(emp),
      amount: Number(advanceForm.value.amount),
      reason: advanceForm.value.reason,
      status: 'Pending Approval',
      date: new Date().toISOString().split('T')[0],
      createdAt: serverTimestamp()
    })
    toast.success('Salary advance requested successfully')
    showAddAdvanceModal.value = false
  } catch (err) {
    toast.error('Request failed')
  } finally {
    isSubmitting.value = false
  }
}

const approveSalaryAdvance = async (adv: SalaryAdvance) => {
  try {
    const batch = writeBatch(db)
    const advRef = doc(db, 'salaryAdvances', adv.id!)
    const opexRef = doc(collection(db, 'operationalExpenses'))

    batch.update(advRef, {
      status: 'Unprocessed',
      ledgerEntryId: opexRef.id,
      updatedAt: serverTimestamp()
    })

    batch.set(opexRef, {
      type: 'SALARY_ADVANCE',
      description: `Salary Advance — ${adv.employeeName}`,
      amount: adv.amount,
      paymentMethod: 'CASH',
      status: 'APPROVED',
      category: 'Salaries & Wages',
      subCategory: 'ADVANCE',
      employeeId: adv.employeeId,
      advanceId: adv.id!,
      createdAt: serverTimestamp(),
      approvedAt: serverTimestamp()
    })

    await batch.commit()
    toast.success('Advance request approved and recorded in cash ledger')
  } catch (err) {
    toast.error('Approval failed')
  }
}

const deleteSalaryAdvance = async (id: string) => {
  if (!confirm('Are you sure you want to cancel this advance request?')) return
  try {
    const adv = salaryAdvances.value.find(a => a.id === id)
    if (!adv) return
    const batch = writeBatch(db)
    batch.delete(doc(db, 'salaryAdvances', id))
    if (adv.ledgerEntryId) {
      batch.delete(doc(db, 'operationalExpenses', adv.ledgerEntryId))
    }
    await batch.commit()
    toast.success('Advance request deleted')
  } catch (err) {
    toast.error('Failed to delete advance request')
  }
}

// HR Tasks
const saveTask = async () => {
  if (!taskForm.value.title || !taskForm.value.assignedTo) {
    toast.error('Title and Assignment are required')
    return
  }
  isSubmitting.value = true
  try {
    const emp = employees.value.find(e => e.id === taskForm.value.assignedTo)
    await addDoc(collection(db, 'hrTasks'), {
      ...taskForm.value,
      assignedToName: getEmpName(emp),
      assignedBy: user.value?.uid || '',
      assignedByName: user.value?.displayName || user.value?.email || '',
      status: 'Pending',
      completionPercent: 0,
      notes: [],
      createdAt: serverTimestamp()
    })
    toast.success('Task created')
    showAddTaskModal.value = false
  } catch (err) {
    toast.error('Task creation failed')
  } finally {
    isSubmitting.value = false
  }
}

const updateTaskProgress = async (tId: string, pct: number, _currentStatus: string) => {
  try {
    const status = pct === 100 ? 'Completed' : (pct > 0 ? 'In Progress' : 'Pending')
    await updateDoc(doc(db, 'hrTasks', tId), {
      completionPercent: pct,
      status
    })
    toast.success('Task progress updated')
  } catch (err) {
    toast.error('Failed to update progress')
  }
}

const verifyTask = async (tId: string) => {
  try {
    await updateDoc(doc(db, 'hrTasks', tId), {
      status: 'Completed',
      completionPercent: 100,
      verifiedBy: user.value?.uid || '',
      verifiedByName: user.value?.displayName || user.value?.email || '',
      verifiedAt: serverTimestamp()
    })
    toast.success('Task verified and completed')
  } catch (err) {
    toast.error('Verification failed')
  }
}

const openAddTaskNote = (tId: string) => {
  selectedTaskId.value = tId
  taskNoteText.value = ''
  showTaskNoteModal.value = true
}

const submitTaskNote = async () => {
  if (!taskNoteText.value.trim()) return
  try {
    const task = hrTasks.value.find(t => t.id === selectedTaskId.value)
    if (!task) return
    const newNote: TaskNote = {
      id: Date.now().toString(),
      userId: user.value?.uid || '',
      userName: user.value?.displayName || user.value?.email || 'Manager',
      text: taskNoteText.value,
      createdAt: Timestamp.now()
    }
    const notes = [...(task.notes || []), newNote]
    await updateDoc(doc(db, 'hrTasks', selectedTaskId.value), { notes })
    toast.success('Note added')
    showTaskNoteModal.value = false
  } catch (err) {
    toast.error('Failed to add note')
  }
}

const deleteTask = async (tId: string) => {
  if (!confirm('Delete this task?')) return
  try {
    await deleteDoc(doc(db, 'hrTasks', tId))
    toast.success('Task deleted')
  } catch (err) {
    toast.error('Failed to delete task')
  }
}

// Performance & KPIs
const saveKpiTarget = async () => {
  if (!kpiForm.value.employeeId || !kpiForm.value.name) return
  isSubmitting.value = true
  try {
    await addDoc(collection(db, 'kpis'), {
      ...kpiForm.value,
      linkedTaskIds: [],
      createdAt: serverTimestamp()
    })
    toast.success('KPI target set')
    showAddKpiModal.value = false
  } catch (err) {
    toast.error('Failed to save KPI target')
  } finally {
    isSubmitting.value = false
  }
}

const deleteKpi = async (id: string) => {
  if (!confirm('Delete this KPI target?')) return
  try {
    await deleteDoc(doc(db, 'kpis', id))
    toast.success('KPI deleted')
  } catch (err) {
    toast.error('Failed to delete KPI')
  }
}

const calcOverallPerformanceScore = (empId: string, pKpis: KPI[], tasksList: Task[]) => {
  const empKpis = pKpis.filter(k => k.employeeId === empId)
  if (empKpis.length === 0) return { scores: [], overall: 0, rating: 'Unsatisfactory' }

  const scores: KPIScore[] = empKpis.map(k => {
    const verifiedTasks = tasksList.filter(
      t => t.kpiCategory === k.id && t.status === 'Completed' && t.verifiedBy && t.assignedTo === empId
    )
    const actualScore = verifiedTasks.length === 0 ? 0 : Math.round(
      verifiedTasks.reduce((s, t) => s + (t.completionPercent || 0), 0) / verifiedTasks.length
    )
    const weightedScore = Number(((actualScore / 100) * k.weight).toFixed(2))

    return {
      kpiId: k.id!,
      kpiName: k.name,
      weight: k.weight,
      targetValue: k.targetValue,
      actualScore,
      weightedScore
    }
  })

  const overall = Number(scores.reduce((sum, s) => sum + s.weightedScore, 0).toFixed(2))
  
  let rating = 'Unsatisfactory'
  if (overall >= 90) rating = 'Excellent'
  else if (overall >= 75) rating = 'Good'
  else if (overall >= 60) rating = 'Satisfactory'
  else if (overall >= 40) rating = 'Needs Improvement'

  return { scores, overall, rating }
}

const generatePerformanceReview = async () => {
  if (!reviewForm.value.employeeId || !reviewForm.value.period) return
  isSubmitting.value = true
  try {
    const { scores, overall, rating } = calcOverallPerformanceScore(
      reviewForm.value.employeeId, kpis.value, hrTasks.value
    )

    await addDoc(collection(db, 'performanceReviews'), {
      employeeId: reviewForm.value.employeeId,
      period: reviewForm.value.period,
      kpiScores: scores,
      overallScore: overall,
      rating,
      managerComments: '',
      generatedAt: serverTimestamp()
    })
    toast.success('Performance Review generated successfully')
    showGenReviewModal.value = false
  } catch (err) {
    toast.error('Failed to generate review')
  } finally {
    isSubmitting.value = false
  }
}

const updateReviewComments = async (rId: string, comments: string) => {
  try {
    await updateDoc(doc(db, 'performanceReviews', rId), { managerComments: comments })
    toast.success('Comments updated')
  } catch (err) {
    toast.error('Failed to update comments')
  }
}

// Recruitment
const saveJobPosting = async () => {
  if (!jobForm.value.jobTitle || !jobForm.value.department) return
  isSubmitting.value = true
  try {
    await addDoc(collection(db, 'recruitment'), {
      ...jobForm.value,
      applicants: [],
      postedDate: new Date().toISOString().split('T')[0],
      createdAt: serverTimestamp()
    })
    toast.success('Job posting created')
    showAddJobModal.value = false
  } catch (err) {
    toast.error('Failed to create job posting')
  } finally {
    isSubmitting.value = false
  }
}

const openAddApplicant = (jId: string) => {
  selectedJobId.value = jId
  applicantForm.value = { name: '', email: '', phone: '', notes: '' }
  showAddApplicantModal.value = true
}

const submitApplicant = async () => {
  if (!applicantForm.value.name || !applicantForm.value.email) return
  isSubmitting.value = true
  try {
    const job = jobPostings.value.find(j => j.id === selectedJobId.value)
    if (!job) return
    const newApplicant: Applicant = {
      id: Date.now().toString(),
      name: applicantForm.value.name,
      email: applicantForm.value.email,
      phone: applicantForm.value.phone ?? '',
      notes: applicantForm.value.notes ?? '',
      status: 'Applied',
      appliedAt: new Date().toISOString().split('T')[0]!
    }
    const applicants = [...(job.applicants || []), newApplicant]
    await updateDoc(doc(db, 'recruitment', selectedJobId.value), { applicants })
    toast.success('Applicant submitted')
    showAddApplicantModal.value = false
  } catch (err) {
    toast.error('Failed to add applicant')
  } finally {
    isSubmitting.value = false
  }
}

const updateApplicantStatus = async (jId: string, appIdx: number, status: Applicant['status']) => {
  try {
    const job = jobPostings.value.find(j => j.id === jId)
    if (!job) return
    const applicants = [...job.applicants]
    applicants[appIdx]!.status = status
    await updateDoc(doc(db, 'recruitment', jId), { applicants })
    toast.success(`Status updated to ${status}`)
  } catch (err) {
    toast.error('Failed to update applicant status')
  }
}

const deleteJobPosting = async (jId: string) => {
  if (!confirm('Are you sure you want to delete this job posting?')) return
  try {
    await deleteDoc(doc(db, 'recruitment', jId))
    toast.success('Job posting removed')
  } catch (err) {
    toast.error('Delete failed')
  }
}

// Salaries Account Funding Transfer Request
const submitSalariesFunding = async () => {
  if (salariesFundForm.value.amount <= 0) return
  isSubmitting.value = true
  try {
    await addDoc(collection(db, 'fundTransfers'), {
      fromAccount: salariesFundForm.value.fromAccount.toLowerCase(),
      toAccount: 'salaries',
      amount: Number(salariesFundForm.value.amount),
      reference: salariesFundForm.value.reference || 'Salaries Funding',
      status: 'PENDING_ACCOUNTANT',
      initiatedBy: user.value?.displayName || 'Manager',
      initiatedByEmail: user.value?.email || '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    })
    toast.success('Transfer requested', { description: 'Submitted for accountant authorization' })
    showSalariesFundModal.value = false
  } catch (err) {
    toast.error('Failed to initiate transfer')
  } finally {
    isSubmitting.value = false
  }
}

// ─── Stat Computations ───────────────────────────────────────────────────────
const stats = computed(() => {
  const activeList = employees.value.filter(e => e.isActive !== false && e.status !== 'Terminated')
  const onLeaveCount = employees.value.filter(e => e.status === 'On Leave').length
  const totalPay = payrolls.value
    .filter(p => p.month === filterMonth.value && p.year === filterYear.value)
    .reduce((sum, p) => sum + (p.netPay || 0), 0)
  const openPos = jobPostings.value.filter(j => j.status === 'Open').length
  const overdueT = hrTasks.value.filter(t => t.status === 'Overdue').length

  let mCount = 0, tCount = 0, fCount = 0
  employees.value.forEach(e => {
    const rolesArr = getRolesArray(e)
    if (rolesArr.includes('MANAGER') || rolesArr.includes('SUPER_ADMIN')) mCount++
    if (rolesArr.includes('TECHNICIAN') || rolesArr.includes('STAFF')) tCount++
    if (rolesArr.includes('ACCOUNTANT')) fCount++
  })

  return {
    total: employees.value.length,
    active: activeList.length,
    onLeave: onLeaveCount,
    payroll: totalPay,
    openPositions: openPos,
    overdueTasks: overdueT,
    managers: mCount,
    technicians: tCount,
    finances: fCount
  }
})

// Salaries account metrics
const salariesFundsAvailable = computed(() => finalBalances.value['SALARIES'] || 0)
const salariesObligations = computed(() => {
  return salariesTransactions.value
    .filter(t => t.type === 'ACCUMULATION' && t.month === filterMonth.value && t.year === filterYear.value)
    .reduce((sum, t) => sum + t.amount, 0)
})
const salariesPayments = computed(() => {
  return salariesTransactions.value
    .filter(t => t.type === 'PAYMENT' && t.month === filterMonth.value && t.year === filterYear.value)
    .reduce((sum, t) => sum + t.amount, 0)
})
const outstandingNetPay = computed(() => Math.max(0, salariesObligations.value - salariesPayments.value))
const fundingGap = computed(() => Math.max(0, outstandingNetPay.value - salariesFundsAvailable.value))

const openProfile = (emp: Employee) => {
  selectedEmp.value = emp
  showProfileModal.value = true
}

const viewPayslip = async (p: Payroll) => {
  selectedPayslipPayroll.value = p
  selectedPayslipPostings.value = []
  showPayslipPreviewModal.value = true

  try {
    let docsSnap: any = null
    if (p.id) {
      const q1 = query(
        collection(db, 'jobCardPayrollPostings'),
        where('payrollId', '==', p.id)
      )
      docsSnap = await getDocs(q1)
    }
    if (!docsSnap || docsSnap.empty) {
      const q2 = query(
        collection(db, 'jobCardPayrollPostings'),
        where('employeeId', '==', p.employeeId),
        where('month', '==', p.month),
        where('year', '==', p.year)
      )
      docsSnap = await getDocs(q2)
    }
    const rawPostings = docsSnap.docs.map((doc: any) => ({
      id: doc.id,
      ...doc.data()
    }))
    selectedPayslipPostings.value = await Promise.all(rawPostings.map(async (posting: any) => {
      let jobCardName = 'Untitled Job'
      try {
        if (posting.jobCardId) {
          const jobDoc = await getDoc(doc(db, 'jobCards', posting.jobCardId))
          if (jobDoc.exists()) {
            jobCardName = jobDoc.data()?.generalInfo?.jobTitle || jobCardName
          }
        } else if (posting.jobNumber) {
          const qJob = query(
            collection(db, 'jobCards'),
            where('generalInfo.jobNumber', '==', posting.jobNumber)
          )
          const jobSnap = await getDocs(qJob)
          if (!jobSnap.empty) {
            jobCardName = jobSnap.docs[0]?.data()?.generalInfo?.jobTitle || jobCardName
          }
        }
      } catch (err) {
        console.error('Error fetching job card title:', err)
      }
      return {
        ...posting,
        jobCardName
      }
    }))
  } catch (err) {
    console.error('Failed to load payroll postings breakdown:', err)
  }
}

const openBreakdown = async (p: Payroll) => {
  selectedBreakdownPayroll.value = p
  showBreakdownModal.value = true
  loadingBreakdown.value = true
  breakdownPostings.value = []

  try {
    let docsSnap: any = null
    if (p.id) {
      const q1 = query(
        collection(db, 'jobCardPayrollPostings'),
        where('payrollId', '==', p.id)
      )
      docsSnap = await getDocs(q1)
    }
    if (!docsSnap || docsSnap.empty) {
      const q2 = query(
        collection(db, 'jobCardPayrollPostings'),
        where('employeeId', '==', p.employeeId),
        where('month', '==', p.month),
        where('year', '==', p.year)
      )
      docsSnap = await getDocs(q2)
    }
    const rawPostings = docsSnap.docs.map((doc: any) => ({
      id: doc.id,
      ...doc.data()
    }))
    breakdownPostings.value = await Promise.all(rawPostings.map(async (posting: any) => {
      let jobCardName = 'Untitled Job'
      try {
        if (posting.jobCardId) {
          const jobDoc = await getDoc(doc(db, 'jobCards', posting.jobCardId))
          if (jobDoc.exists()) {
            jobCardName = jobDoc.data()?.generalInfo?.jobTitle || jobCardName
          }
        } else if (posting.jobNumber) {
          const qJob = query(
            collection(db, 'jobCards'),
            where('generalInfo.jobNumber', '==', posting.jobNumber)
          )
          const jobSnap = await getDocs(qJob)
          if (!jobSnap.empty) {
            jobCardName = jobSnap.docs[0]?.data()?.generalInfo?.jobTitle || jobCardName
          }
        }
      } catch (err) {
        console.error('Error fetching job card title:', err)
      }
      return {
        ...posting,
        jobCardName
      }
    }))
  } catch (err) {
    console.error('Failed to load breakdown postings:', err)
  } finally {
    loadingBreakdown.value = false
  }
}

const printPayslip = () => {
  window.print()
}

</script>

<template>
  <div class="flex-1 flex flex-col pb-20 bg-background min-h-screen">
    <!-- Header -->
    <header class="sticky top-0 z-10 bg-card border-b px-4 py-4 flex items-center gap-4 shadow-sm print:hidden">
      <Button variant="ghost" size="icon" @click="router.push('/')">
        <ChevronLeft class="size-6" />
      </Button>
      <div class="flex-1">
        <h1 class="text-xl font-black tracking-tight">Staff & HR Portal</h1>
        <p class="text-xs text-muted-foreground">Team roster, payroll & human resource suites</p>
      </div>
      <Badge class="bg-[#ff8903] text-white text-[10px] font-black h-5 px-2">
        {{ stats.active }} ACTIVE STAFF
      </Badge>
    </header>

    <!-- Sub Navigation Tabs (Scrollable Roster) -->
    <div class="border-b bg-card sticky top-[68px] z-10 overflow-x-auto no-scrollbar py-2 px-4 flex gap-2 print:hidden shadow-sm">
      <button 
        v-for="tab in subTabs" 
        :key="tab.id"
        @click="currentTab = tab.id"
        :class="[
          'px-4 py-2 text-xs font-black rounded-full shrink-0 flex items-center gap-1.5 transition-all active:scale-95 border border-border/40',
          currentTab === tab.id ? 'bg-[#ff8903] text-white border-transparent shadow-md' : 'bg-muted/30 text-muted-foreground hover:bg-muted'
        ]"
      >
        <component :is="tab.icon" class="size-3.5" />
        {{ tab.name }}
      </button>
    </div>

    <!-- MAIN VIEW CONTAINER -->
    <main class="flex-1 p-4 space-y-4 print:hidden">
      
      <!-- ─── TAB 1: OVERVIEW ─── -->
      <div v-if="currentTab === 'overview'" class="space-y-4 animate-in fade-in duration-200">
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card class="bg-card border shadow-sm">
            <CardContent class="p-4 space-y-1">
              <User class="size-5 text-[#ff8903]" />
              <p class="text-lg font-black text-foreground">{{ stats.active }}</p>
              <p class="text-[9px] uppercase font-black tracking-wider text-muted-foreground">Active Employees</p>
            </CardContent>
          </Card>
          <Card class="bg-card border shadow-sm">
            <CardContent class="p-4 space-y-1">
              <Calendar class="size-5 text-[#79c21b]" />
              <p class="text-lg font-black text-foreground">{{ stats.onLeave }}</p>
              <p class="text-[9px] uppercase font-black tracking-wider text-muted-foreground">On Leave</p>
            </CardContent>
          </Card>
          <Card class="bg-card border shadow-sm">
            <CardContent class="p-4 space-y-1">
              <Wallet class="size-5 text-blue-500" />
              <p class="text-lg font-black text-foreground">{{ fmt(stats.payroll) }}</p>
              <p class="text-[9px] uppercase font-black tracking-wider text-muted-foreground">Monthly Payroll</p>
            </CardContent>
          </Card>
          <Card class="bg-card border shadow-sm">
            <CardContent class="p-4 space-y-1">
              <AlertTriangle class="size-5 text-red-500" />
              <p class="text-lg font-black text-red-500">{{ stats.overdueTasks }}</p>
              <p class="text-[9px] uppercase font-black tracking-wider text-muted-foreground">Overdue Tasks</p>
            </CardContent>
          </Card>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <!-- Pending Leaves -->
          <Card class="border shadow-sm bg-card rounded-2xl overflow-hidden">
            <div class="p-4 border-b bg-muted/10">
              <h3 class="font-black text-xs uppercase tracking-wider text-foreground">Pending Leave Requests</h3>
            </div>
            <CardContent class="p-4 space-y-3">
              <div v-if="leaveRequests.filter(l => l.status === 'Pending').length === 0" class="text-center py-6 text-xs text-muted-foreground italic">
                No pending leave requests
              </div>
              <div v-for="l in leaveRequests.filter(l => l.status === 'Pending')" :key="l.id" class="p-3 bg-muted/20 border rounded-2xl space-y-2">
                <div class="flex justify-between items-start">
                  <div>
                    <h4 class="font-bold text-xs">{{ l.employeeName }}</h4>
                    <p class="text-[10px] text-muted-foreground">{{ l.type }} Leave · {{ l.startDate }} → {{ l.endDate }}</p>
                  </div>
                  <Badge variant="outline" class="bg-yellow-500/10 text-yellow-600 border-yellow-500/20 text-[9px] font-bold">Pending</Badge>
                </div>
                <p class="text-[10px] text-foreground border-t border-dashed pt-2 italic">"{{ l.reason }}"</p>
                <div class="flex gap-2 justify-end pt-1">
                  <Button size="sm" class="bg-green-600 hover:bg-green-700 text-white text-[10px] h-7 px-2 font-bold rounded-lg" @click="updateLeave(l.id!, 'Approved')">Approve</Button>
                  <Button size="sm" variant="outline" class="text-red-500 border-red-500/30 hover:bg-red-50 text-[10px] h-7 px-2 font-bold rounded-lg" @click="updateLeave(l.id!, 'Rejected')">Reject</Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <!-- Active Roster Task feed -->
          <Card class="border shadow-sm bg-card rounded-2xl overflow-hidden">
            <div class="p-4 border-b bg-muted/10">
              <h3 class="font-black text-xs uppercase tracking-wider text-foreground">Active Task Feeds</h3>
            </div>
            <CardContent class="p-4 space-y-3">
              <div v-if="hrTasks.filter(t => t.status !== 'Completed').length === 0" class="text-center py-6 text-xs text-muted-foreground italic">
                No active tasks assigned
              </div>
              <div v-for="t in hrTasks.filter(t => t.status !== 'Completed').slice(0, 4)" :key="t.id" class="p-3 bg-muted/20 border rounded-2xl flex justify-between items-center gap-2">
                <div>
                  <h4 class="font-bold text-xs text-foreground truncate max-w-[180px]">{{ t.title }}</h4>
                  <p class="text-[9px] text-muted-foreground mt-0.5">Assigned to: {{ t.assignedToName }} · Due: {{ t.dueDate }}</p>
                </div>
                <Badge :class="[
                  'text-[9px] font-bold',
                  t.priority === 'Critical' ? 'bg-red-500/10 text-red-500 border-red-500/20' : (t.priority === 'High' ? 'bg-orange-500/10 text-orange-500 border-orange-500/20' : 'bg-blue-500/10 text-blue-500 border-blue-500/20')
                ]">{{ t.priority }}</Badge>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <!-- ─── TAB 2: ROSTER ─── -->
      <div v-if="currentTab === 'roster'" class="space-y-4 animate-in fade-in duration-200">
        <!-- Search, Filter & Actions Row -->
        <div class="flex items-center gap-2 flex-wrap">
          <div class="relative flex-1 min-w-[200px]">
            <Search class="absolute left-3 top-2.5 size-4 text-muted-foreground" />
            <Input v-model="searchQuery" placeholder="Search team by name, phone..." class="pl-9 h-10 border bg-card" />
          </div>
          <Button class="bg-[#ff8903] hover:bg-[#ff8903]/90 text-white font-bold h-10 gap-1 rounded-xl" @click="showAddEmpModal = true">
            <Plus class="size-4" /> Add Employee
          </Button>
        </div>

        <!-- Filter Roles pills -->
        <div class="flex gap-1.5 overflow-x-auto no-scrollbar pb-1">
          <Button 
            v-for="r in ['all', 'MANAGER', 'ACCOUNTANT', 'TECHNICIAN', 'STAFF']" 
            :key="r"
            variant="secondary"
            size="sm"
            :class="roleFilter === r.toLowerCase() ? 'bg-[#ff8903] text-white' : ''"
            class="capitalize text-[10px] font-black px-3 rounded-full shrink-0"
            @click="roleFilter = r.toLowerCase()"
          >
            {{ r }}
          </Button>
        </div>

        <!-- Roster Grid -->
        <div class="space-y-3">
          <Card 
            v-for="emp in filteredEmployees" 
            :key="emp.id" 
            class="border shadow-sm bg-card hover:shadow-md transition-shadow cursor-pointer rounded-2xl overflow-hidden"
            @click="openProfile(emp)"
          >
            <CardContent class="p-4 space-y-3">
              <div class="flex justify-between items-start">
                <div class="flex items-center gap-3 min-w-0">
                  <div class="size-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0 border border-primary/20">
                    <span class="text-primary font-bold text-base">{{ getEmpName(emp).charAt(0) }}</span>
                  </div>
                  <div class="min-w-0">
                    <h3 class="font-black text-sm tracking-tight text-foreground truncate">{{ getEmpName(emp) }}</h3>
                    <p class="text-[10px] text-muted-foreground">{{ emp.jobTitle }} · {{ emp.department }}</p>
                  </div>
                </div>
                <Badge :class="[
                  'text-[9px] font-bold h-4 px-1.5 rounded uppercase',
                  emp.isActive !== false ? 'bg-green-500/10 text-green-500 border-green-500/25' : 'bg-red-500/10 text-red-500 border-red-500/25'
                ]">{{ emp.isActive !== false ? 'Active' : 'Inactive' }}</Badge>
              </div>
              <div class="flex items-center justify-between text-[10px] border-t border-dashed pt-3 text-muted-foreground">
                <span class="flex items-center gap-1 shrink-0"><Phone class="size-3" /> {{ emp.phone || '—' }}</span>
                <div class="flex gap-2">
                  <Button variant="ghost" size="icon" class="h-6 w-6 text-amber-500 hover:text-amber-600" @click.stop="openEditEmp(emp)"><FileText class="size-3.5" /></Button>
                  <Button variant="ghost" size="icon" class="h-6 w-6 text-red-500 hover:text-red-600" @click.stop="deleteEmployee(emp.id)"><Trash2 class="size-3.5" /></Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <!-- ─── TAB 3: LEAVE & ATTENDANCE ─── -->
      <div v-if="currentTab === 'leave'" class="space-y-4 animate-in fade-in duration-200">
        <div class="flex justify-between items-center">
          <h2 class="text-xs font-black uppercase tracking-widest text-muted-foreground">Leave Balances & Tracker</h2>
          <Button size="sm" class="bg-[#ff8903] hover:bg-[#ff8903]/90 text-white font-bold h-8 rounded-lg" @click="openRequestLeave">Apply Leave</Button>
        </div>

        <!-- Roster Leave balances table -->
        <Card class="border shadow-sm bg-card rounded-2xl overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full text-xs text-left">
              <thead class="border-b bg-muted/40 font-bold uppercase text-[9px] tracking-wider text-muted-foreground">
                <tr>
                  <th class="p-3">Staff Name</th>
                  <th class="p-3 text-center">Days Used</th>
                  <th class="p-3 text-center">Remaining Balance</th>
                  <th class="p-3">Roster Meter</th>
                </tr>
              </thead>
              <tbody class="divide-y">
                <tr v-for="emp in employees.filter(e => e.isActive !== false)" :key="emp.id" class="hover:bg-muted/10">
                  <td class="p-3 font-bold text-foreground">{{ getEmpName(emp) }}</td>
                  <td class="p-3 text-center font-mono">{{ 20 - (leaveBalances[emp.id] ?? 20) }}</td>
                  <td class="p-3 text-center font-mono font-bold" :class="(leaveBalances[emp.id] ?? 20) < 5 ? 'text-red-500' : 'text-green-500'">
                    {{ leaveBalances[emp.id] ?? 20 }} Days
                  </td>
                  <td class="p-3">
                    <div class="w-20 bg-muted rounded-full h-1.5 overflow-hidden">
                      <div class="h-1.5 bg-[#ff8903] rounded-full" :style="{ width: `${((leaveBalances[emp.id] ?? 20) / 20) * 100}%` }"></div>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </Card>

        <!-- Leave Request logs -->
        <div class="space-y-2">
          <h3 class="text-xs font-black uppercase tracking-widest text-muted-foreground mt-2">All Leave Applications</h3>
          <Card 
            v-for="l in leaveRequests" 
            :key="l.id" 
            class="border shadow-sm bg-card rounded-2xl overflow-hidden p-4 space-y-3"
          >
            <div class="flex justify-between items-start">
              <div>
                <h4 class="font-black text-sm">{{ l.employeeName }}</h4>
                <p class="text-[10px] text-muted-foreground">{{ l.type }} Leave · {{ l.startDate }} to {{ l.endDate }} ({{ daysBetween(l.startDate, l.endDate) }} days)</p>
              </div>
              <Badge :class="[
                'text-[9px] font-bold uppercase',
                l.status === 'Approved' ? 'bg-green-500/10 text-green-600 border-green-500/20' : (l.status === 'Rejected' ? 'bg-red-500/10 text-red-600 border-red-500/20' : 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20')
              ]">{{ l.status }}</Badge>
            </div>
            <p class="text-xs text-foreground bg-muted/20 border p-3 rounded-xl italic">"{{ l.reason }}"</p>
            <div v-if="l.status === 'Pending'" class="flex justify-end gap-2 border-t border-dashed pt-3">
              <Button size="sm" class="bg-green-600 hover:bg-green-700 text-white font-bold h-8 text-xs rounded-xl" @click="updateLeave(l.id!, 'Approved')">Approve</Button>
              <Button size="sm" variant="outline" class="text-red-500 border-red-500/30 hover:bg-red-50 font-bold h-8 text-xs rounded-xl" @click="updateLeave(l.id!, 'Rejected')">Reject</Button>
            </div>
          </Card>
        </div>
      </div>

      <!-- ─── TAB 4: PAYROLL ─── -->
      <div v-if="currentTab === 'payroll'" class="space-y-4 animate-in fade-in duration-200">
        <!-- Date Filters and Gen -->
        <div class="flex items-center gap-3 justify-between flex-wrap">
          <div class="flex items-center gap-2">
            <select v-model.number="filterMonth" class="h-9 px-3 rounded-lg border bg-card text-xs font-bold">
              <option v-for="(m, i) in MONTH_NAMES" :key="i" :value="i+1">{{ m }}</option>
            </select>
            <Input v-model.number="filterYear" type="number" class="w-16 h-9 text-xs font-bold bg-card" />
          </div>
          <Button size="sm" class="bg-[#ff8903] hover:bg-[#ff8903]/90 text-white font-bold h-9 rounded-lg" @click="openGenPayrollModal">
            <Plus class="size-4" /> Run Payroll
          </Button>
        </div>

        <!-- Metrics cards -->
        <div class="grid grid-cols-3 gap-2">
          <div class="p-3 border bg-card rounded-2xl text-center shadow-sm">
            <p class="text-sm font-black text-foreground">{{ fmt(payrolls.filter(p => p.month === filterMonth && p.year === filterYear).reduce((s, p) => s + p.netPay, 0)) }}</p>
            <p class="text-[8px] uppercase tracking-wider font-bold text-muted-foreground mt-0.5">Total Net Pay</p>
          </div>
          <div class="p-3 border bg-card rounded-2xl text-center shadow-sm">
            <p class="text-sm font-black text-green-500">{{ fmt(payrolls.filter(p => p.month === filterMonth && p.year === filterYear && p.status === 'Paid').reduce((s, p) => s + p.netPay, 0)) }}</p>
            <p class="text-[8px] uppercase tracking-wider font-bold text-muted-foreground mt-0.5">Paid Disbursements</p>
          </div>
          <div class="p-3 border bg-card rounded-2xl text-center shadow-sm">
            <p class="text-sm font-black text-amber-500">{{ fmt(payrolls.filter(p => p.month === filterMonth && p.year === filterYear && p.status === 'Unpaid').reduce((s, p) => s + p.netPay, 0)) }}</p>
            <p class="text-[8px] uppercase tracking-wider font-bold text-muted-foreground mt-0.5">Outstanding</p>
          </div>
        </div>

        <!-- Payroll Records list -->
        <div class="space-y-3">
          <Card 
            v-for="p in payrolls.filter(p => p.month === filterMonth && p.year === filterYear)" 
            :key="p.id" 
            class="border shadow-sm bg-card rounded-2xl overflow-hidden p-4 space-y-3"
          >
            <div class="flex justify-between items-start">
              <div>
                <h4 class="font-black text-sm cursor-pointer hover:text-[#ff8903] transition-colors" @click="openBreakdown(p)">{{ p.employeeName }}</h4>
                <p class="text-[9px] text-muted-foreground">Basic: {{ fmt(p.basicSalary) }} · Allowances: {{ fmt(p.allowances) }} · Deductions: -{{ fmt(p.deductions) }}</p>
              </div>
              <Badge :class="[
                'text-[9px] font-bold uppercase',
                p.status === 'Paid' ? 'bg-green-500/10 text-green-600 border-green-500/20' : 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20'
              ]">{{ p.status }}</Badge>
            </div>
            
            <div class="flex justify-between items-center border-t border-dashed pt-3">
              <span class="text-xs font-black text-foreground">Net Pay: <span class="font-mono text-sm text-[#ff8903]">{{ fmt(p.netPay) }}</span></span>
              
              <div class="flex gap-2">
                <Button size="icon" variant="outline" class="size-8 rounded-lg border-border/40 text-muted-foreground hover:text-foreground" @click="viewPayslip(p)">
                  <FileText class="size-4" />
                </Button>
                <Button v-if="p.status === 'Unpaid'" size="sm" class="bg-green-600 hover:bg-green-700 text-white font-bold h-8 text-xs rounded-xl" @click="openPayPayroll(p)">
                  Disburse
                </Button>
                <Button size="icon" variant="ghost" class="size-8 text-red-500 hover:text-red-600" @click="deletePayroll(p)">
                  <Trash2 class="size-4" />
                </Button>
              </div>
            </div>
          </Card>
        </div>
      </div>

      <!-- ─── TAB 5: SALARY ADVANCES ─── -->
      <div v-if="currentTab === 'advances'" class="space-y-4 animate-in fade-in duration-200">
        <div class="flex justify-between items-center">
          <h2 class="text-xs font-black uppercase tracking-widest text-muted-foreground">Cash Advances & Loans</h2>
          <Button size="sm" class="bg-[#ff8903] hover:bg-[#ff8903]/90 text-white font-bold h-8 rounded-lg" @click="showAddAdvanceModal = true">
            Request Advance
          </Button>
        </div>

        <div class="space-y-3">
          <Card 
            v-for="adv in salaryAdvances" 
            :key="adv.id" 
            class="border shadow-sm bg-card rounded-2xl overflow-hidden p-4 space-y-3"
          >
            <div class="flex justify-between items-start">
              <div>
                <h4 class="font-black text-sm">{{ adv.employeeName }}</h4>
                <p class="text-[10px] text-muted-foreground">Request Date: {{ adv.date }}</p>
              </div>
              <Badge :class="[
                'text-[9px] font-bold uppercase',
                adv.status === 'Processed' ? 'bg-green-500/10 text-green-600 border-green-500/20' : (adv.status === 'Unprocessed' ? 'bg-blue-500/10 text-blue-600 border-blue-500/20' : 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20')
              ]">{{ adv.status }}</Badge>
            </div>
            
            <p v-if="adv.reason" class="text-xs text-foreground bg-muted/20 border p-3 rounded-xl italic">"{{ adv.reason }}"</p>

            <div class="flex justify-between items-center border-t border-dashed pt-3">
              <span class="text-xs font-black text-foreground">Advance Amount: <span class="font-mono text-sm text-[#ff8903]">{{ fmt(adv.amount) }}</span></span>
              
              <div class="flex gap-2">
                <Button v-if="adv.status === 'Pending Approval'" size="sm" class="bg-green-600 hover:bg-green-700 text-white font-bold h-8 text-xs rounded-xl" @click="approveSalaryAdvance(adv)">
                  Approve
                </Button>
                <Button size="icon" variant="ghost" class="size-8 text-red-500 hover:text-red-600" @click="deleteSalaryAdvance(adv.id!)">
                  <Trash2 class="size-4" />
                </Button>
              </div>
            </div>
          </Card>
        </div>
      </div>

      <!-- ─── TAB 6: HR TASKS ─── -->
      <div v-if="currentTab === 'tasks'" class="space-y-4 animate-in fade-in duration-200">
        <div class="flex justify-between items-center">
          <h2 class="text-xs font-black uppercase tracking-widest text-muted-foreground">Operational Checklists</h2>
          <Button size="sm" class="bg-[#ff8903] hover:bg-[#ff8903]/90 text-white font-bold h-8 rounded-lg" @click="showAddTaskModal = true">
            Create HR Task
          </Button>
        </div>

        <div class="space-y-3">
          <Card 
            v-for="task in hrTasks" 
            :key="task.id" 
            class="border shadow-sm bg-card rounded-2xl overflow-hidden p-4 space-y-4"
          >
            <div class="flex justify-between items-start">
              <div>
                <h4 class="font-black text-sm">{{ task.title }}</h4>
                <p class="text-[10px] text-muted-foreground">Assignee: {{ task.assignedToName }} · Due: {{ task.dueDate }}</p>
              </div>
              <Badge :class="[
                'text-[9px] font-bold uppercase',
                task.status === 'Completed' ? 'bg-green-500/10 text-green-600 border-green-500/20' : (task.status === 'Overdue' ? 'bg-red-500/10 text-red-600 border-red-500/20' : 'bg-blue-500/10 text-blue-600 border-blue-500/20')
              ]">{{ task.status }}</Badge>
            </div>
            
            <p class="text-xs text-foreground leading-relaxed">{{ task.description }}</p>

            <!-- Task Progress Meter slider -->
            <div class="space-y-1.5">
              <div class="flex justify-between text-[10px] font-bold text-muted-foreground uppercase">
                <span>Task Progress</span>
                <span>{{ task.completionPercent }}%</span>
              </div>
              <div class="flex items-center gap-2">
                <input 
                  type="range" 
                  min="0" max="100" step="10" 
                  :value="task.completionPercent"
                  @change="e => updateTaskProgress(task.id!, Number((e.target as HTMLInputElement).value), task.status)"
                  class="flex-1 accent-[#ff8903]" 
                />
                <Button v-if="task.status !== 'Completed'" size="icon" variant="outline" class="size-6 text-green-500" @click="verifyTask(task.id!)">
                  <Check class="size-3.5" />
                </Button>
              </div>
            </div>

            <!-- Notes Section -->
            <div class="border-t pt-3 space-y-2">
              <div class="flex justify-between items-center text-[10px] uppercase font-black tracking-wider text-muted-foreground">
                <span>Task Logs / Notes</span>
                <button class="text-primary hover:underline" @click="openAddTaskNote(task.id!)">+ Add Note</button>
              </div>
              <div v-for="note in task.notes" :key="note.id" class="p-2 bg-muted/30 border rounded-xl text-[10px]">
                <p class="font-bold text-foreground">{{ note.userName }}:</p>
                <p class="text-muted-foreground mt-0.5">{{ note.text }}</p>
              </div>
            </div>

            <div class="flex justify-end pt-1">
              <Button size="icon" variant="ghost" class="size-6 text-red-500 hover:text-red-600" @click="deleteTask(task.id!)">
                <Trash2 class="size-4" />
              </Button>
            </div>
          </Card>
        </div>
      </div>

      <!-- ─── TAB 7: PERFORMANCE ─── -->
      <div v-if="currentTab === 'performance'" class="space-y-4 animate-in fade-in duration-200">
        <div class="flex justify-between items-center">
          <h2 class="text-xs font-black uppercase tracking-widest text-muted-foreground">KPI Objectives & Targets</h2>
          <div class="flex gap-2">
            <Button size="sm" variant="outline" class="border-[#ff8903]/30 text-[#ff8903] font-bold h-8 rounded-lg" @click="showAddKpiModal = true">Set Target</Button>
            <Button size="sm" class="bg-[#ff8903] hover:bg-[#ff8903]/90 text-white font-bold h-8 rounded-lg" @click="showGenReviewModal = true">Gen Review</Button>
          </div>
        </div>

        <!-- KPIs list -->
        <div class="space-y-2">
          <h3 class="text-xs font-bold text-muted-foreground uppercase tracking-widest mt-2">Active Targets</h3>
          <Card 
            v-for="k in kpis" 
            :key="k.id" 
            class="border shadow-sm bg-card rounded-2xl overflow-hidden p-4 flex justify-between items-center"
          >
            <div>
              <h4 class="font-black text-sm">{{ k.name }}</h4>
              <p class="text-[9px] text-muted-foreground">Target: {{ k.targetValue }} · Weight: {{ k.weight }}% · Period: {{ k.period }}</p>
            </div>
            <Button size="icon" variant="ghost" class="size-8 text-red-500" @click="deleteKpi(k.id!)">
              <Trash2 class="size-4" />
            </Button>
          </Card>
        </div>

        <!-- Reviews generated -->
        <div class="space-y-2">
          <h3 class="text-xs font-bold text-muted-foreground uppercase tracking-widest mt-4">Performance Reviews</h3>
          <Card 
            v-for="r in reviews" 
            :key="r.id" 
            class="border shadow-sm bg-card rounded-2xl overflow-hidden p-4 space-y-3 cursor-pointer hover:border-primary/40"
            @click="selectedReview = r; showReviewDetailModal = true"
          >
            <div class="flex justify-between items-start">
              <div>
                <h4 class="font-bold text-sm">{{ getEmpName(employees.find(e => e.id === r.employeeId)) }}</h4>
                <p class="text-[10px] text-muted-foreground">Period: {{ r.period }} · Overall Weighted Score: {{ r.overallScore }}%</p>
              </div>
              <Badge class="bg-blue-500 text-white font-bold text-[9px] uppercase">{{ r.rating }}</Badge>
            </div>
          </Card>
        </div>
      </div>

      <!-- ─── TAB 8: RECRUITMENT ─── -->
      <div v-if="currentTab === 'recruitment'" class="space-y-4 animate-in fade-in duration-200">
        <div class="flex justify-between items-center">
          <h2 class="text-xs font-black uppercase tracking-widest text-muted-foreground">Job Openings</h2>
          <Button size="sm" class="bg-[#ff8903] hover:bg-[#ff8903]/90 text-white font-bold h-8 rounded-lg" @click="showAddJobModal = true">
            New Posting
          </Button>
        </div>

        <div class="space-y-3">
          <Card 
            v-for="job in jobPostings" 
            :key="job.id" 
            class="border shadow-sm bg-card rounded-2xl overflow-hidden p-4 space-y-4"
          >
            <div class="flex justify-between items-start">
              <div>
                <h4 class="font-black text-sm">{{ job.jobTitle }}</h4>
                <p class="text-[10px] text-muted-foreground">Department: {{ job.department }} · Posted: {{ job.postedDate }}</p>
              </div>
              <Badge :class="[
                'text-[9px] font-bold uppercase',
                job.status === 'Open' ? 'bg-green-500/10 text-green-500 border-green-500/20' : 'bg-muted text-muted-foreground'
              ]">{{ job.status }}</Badge>
            </div>

            <p v-if="job.description" class="text-xs text-foreground font-medium leading-relaxed">{{ job.description }}</p>

            <!-- Applicants list -->
            <div class="border-t pt-3 space-y-2">
              <div class="flex justify-between items-center text-[10px] uppercase font-black tracking-wider text-muted-foreground">
                <span>Applicants ({{ job.applicants?.length || 0 }})</span>
                <button class="text-primary hover:underline" @click="openAddApplicant(job.id!)">+ Add Applicant</button>
              </div>
              <div v-for="(app, idx) in job.applicants" :key="app.id" class="p-3 bg-muted/20 border rounded-2xl space-y-2">
                <div class="flex justify-between items-center">
                  <div>
                    <h5 class="font-bold text-xs">{{ app.name }}</h5>
                    <p class="text-[9px] text-muted-foreground">{{ app.email }} · {{ app.phone }}</p>
                  </div>
                  <select 
                    :value="app.status" 
                    @change="e => updateApplicantStatus(job.id!, idx, (e.target as HTMLSelectElement).value as any)"
                    class="h-7 text-[10px] font-bold border rounded-lg bg-card"
                  >
                    <option v-for="st in ['Applied', 'Interviewed', 'Offered', 'Hired', 'Rejected']" :key="st" :value="st">{{ st }}</option>
                  </select>
                </div>
              </div>
            </div>

            <div class="flex justify-end pt-1">
              <Button size="icon" variant="ghost" class="size-6 text-red-500 hover:text-red-600" @click="deleteJobPosting(job.id!)">
                <Trash2 class="size-4" />
              </Button>
            </div>
          </Card>
        </div>
      </div>

      <!-- ─── TAB 9: SALARIES ACCOUNT ─── -->
      <div v-if="currentTab === 'salaries'" class="space-y-4 animate-in fade-in duration-200">
        <!-- Live account statistics -->
        <div class="rounded-3xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white p-6 shadow-xl relative overflow-hidden group">
          <p class="text-[10px] font-black uppercase tracking-widest text-white/80">Salaries Available Balance</p>
          <p class="text-4xl font-black mt-2 tracking-tight">
            {{ fmt(salariesFundsAvailable) }}
          </p>
          <div class="flex justify-between items-center mt-6">
            <span class="text-xs text-white/70">Outstanding Month Obligations: {{ fmt(outstandingNetPay) }}</span>
            <Button class="bg-white/20 hover:bg-white/30 text-white border border-white/10 rounded-xl h-9 text-xs font-bold" @click="showSalariesFundModal = true">
              <Landmark class="size-4 mr-1" /> Fund Salaries
            </Button>
          </div>
        </div>

        <div v-if="fundingGap > 0" class="p-4 rounded-2xl bg-red-500/5 border border-red-500/10 text-red-500 text-xs font-bold flex items-center gap-2">
          <AlertTriangle class="size-4 animate-pulse shrink-0" />
          <span>Funding gap detected! Salaries Account is underfunded by {{ fmt(fundingGap) }}</span>
        </div>

        <!-- Recent Transactions -->
        <div class="space-y-2">
          <h3 class="text-xs font-bold text-muted-foreground uppercase tracking-widest">Recent Transactions</h3>
          <Card class="border bg-card rounded-2xl overflow-hidden p-0">
            <div class="overflow-x-auto">
              <table class="w-full text-xs text-left">
                <thead class="border-b bg-muted/40 font-bold uppercase text-[9px] tracking-wider text-muted-foreground">
                  <tr>
                    <th class="p-3">Description</th>
                    <th class="p-3 text-right">Amount</th>
                    <th class="p-3 text-center">Type</th>
                  </tr>
                </thead>
                <tbody class="divide-y">
                  <tr v-for="t in salariesTransactions" :key="t.id" class="hover:bg-muted/10">
                    <td class="p-3">
                      <p class="font-bold">{{ t.description }}</p>
                      <p class="text-[9px] text-muted-foreground uppercase mt-0.5">{{ t.source }}</p>
                    </td>
                    <td class="p-3 text-right font-mono font-bold" :class="t.type === 'PAYMENT' ? 'text-red-500' : 'text-emerald-500'">
                      {{ t.type === 'PAYMENT' ? '-' : '+' }}{{ fmt(t.amount) }}
                    </td>
                    <td class="p-3 text-center">
                      <Badge :variant="t.type === 'PAYMENT' ? 'destructive' : 'default'" class="text-[8px] px-1 py-0.5 rounded uppercase font-bold">{{ t.type }}</Badge>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      </div>

    </main>

    <!-- ─── MODALS & DIALOG WINDOWS (VUE DIRECT IMPLEMENTATIONS) ─── -->

    <!-- Roster profile dialog -->
    <div v-if="showProfileModal && selectedEmp" class="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 print:hidden">
      <Card class="w-full max-w-sm bg-card border shadow-2xl rounded-3xl overflow-hidden animate-in zoom-in-95 duration-200">
        <div class="p-4 border-b flex justify-between items-center">
          <h2 class="text-base font-black tracking-tight">Employee Profile</h2>
          <Button variant="ghost" size="icon" class="rounded-full" @click="showProfileModal = false">
            <X class="size-5" />
          </Button>
        </div>
        <CardContent class="p-6 space-y-6 text-center">
          <div class="flex flex-col items-center space-y-2">
            <div class="size-16 rounded-full bg-primary/10 flex items-center justify-center border-2 border-primary/20 shadow-md">
              <span class="text-primary font-black text-2xl">{{ getEmpName(selectedEmp).charAt(0) }}</span>
            </div>
            <div>
              <h3 class="font-black text-lg tracking-tight text-foreground">{{ getEmpName(selectedEmp) }}</h3>
              <p class="text-xs text-muted-foreground">{{ selectedEmp.jobTitle }} · {{ selectedEmp.department }}</p>
            </div>
          </div>
          <div class="text-left bg-muted/20 rounded-2xl p-4 space-y-3 text-xs">
            <div>
              <span class="block text-[8px] uppercase font-black text-muted-foreground">Contract Details</span>
              <span class="font-bold text-foreground">{{ selectedEmp.contractType || 'Full-Time' }} · Started {{ selectedEmp.startDate || '—' }}</span>
            </div>
            <div class="border-t pt-2.5">
              <span class="block text-[8px] uppercase font-black text-muted-foreground">Base Salary</span>
              <span class="font-bold text-foreground">{{ fmt(selectedEmp.salary) }}</span>
            </div>
            <div class="border-t pt-2.5">
              <span class="block text-[8px] uppercase font-black text-muted-foreground">National ID</span>
              <span class="font-bold text-foreground">{{ selectedEmp.nationalId || '—' }}</span>
            </div>
          </div>
          <div class="flex gap-3 pt-2">
            <Button variant="outline" class="flex-1 rounded-xl h-10 font-bold" @click="showProfileModal = false">Close</Button>
            <Button 
              :variant="selectedEmp.isActive ? 'destructive' : 'default'"
              class="flex-1 rounded-xl h-10 font-bold"
              :class="selectedEmp.isActive ? 'bg-red-600 hover:bg-red-700 text-white' : 'bg-green-600 hover:bg-green-700 text-white'"
              :disabled="isSubmitting"
              @click="toggleEmpStatus"
            >
              <Loader2 v-if="isSubmitting" class="size-4 animate-spin mr-1" />
              <template v-if="selectedEmp.isActive">
                <ShieldAlert class="size-4 mr-1.5" /> Suspend
              </template>
              <template v-else>
                <ShieldCheck class="size-4 mr-1.5" /> Activate
              </template>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>

    <!-- Add Employee Modal -->
    <div v-if="showAddEmpModal || showEditEmpModal" class="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 print:hidden">
      <Card class="w-full max-w-sm bg-card border shadow-2xl rounded-3xl overflow-hidden animate-in zoom-in-95 duration-200">
        <div class="p-4 border-b flex justify-between items-center">
          <h2 class="text-base font-black tracking-tight">{{ showEditEmpModal ? 'Edit Employee' : 'Add Employee' }}</h2>
          <Button variant="ghost" size="icon" class="rounded-full" @click="showAddEmpModal = false; showEditEmpModal = false">
            <X class="size-5" />
          </Button>
        </div>
        <CardContent class="p-6 space-y-4 overflow-y-auto max-h-[70vh]">
          <div class="space-y-1">
            <label class="text-[10px] uppercase font-black text-muted-foreground">Full Name *</label>
            <Input v-model="empForm.fullName" placeholder="e.g. Martin Chenganse" class="h-10 text-sm" />
          </div>
          <div class="space-y-1">
            <label class="text-[10px] uppercase font-black text-muted-foreground">Email Address *</label>
            <Input v-model="empForm.email" type="email" placeholder="e.g. mc@incaptta.com" class="h-10 text-sm" />
          </div>
          <div class="space-y-1">
            <label class="text-[10px] uppercase font-black text-muted-foreground">Phone Number</label>
            <Input v-model="empForm.phone" placeholder="e.g. 0772876193" class="h-10 text-sm" />
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div class="space-y-1">
              <label class="text-[10px] uppercase font-black text-muted-foreground">Department</label>
              <Input v-model="empForm.department" placeholder="e.g. Technicians" class="h-10 text-sm" />
            </div>
            <div class="space-y-1">
              <label class="text-[10px] uppercase font-black text-muted-foreground">Job Title</label>
              <Input v-model="empForm.jobTitle" placeholder="e.g. Installer" class="h-10 text-sm" />
            </div>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div class="space-y-1">
              <label class="text-[10px] uppercase font-black text-muted-foreground">Contract Type</label>
              <select v-model="empForm.contractType" class="w-full h-10 border rounded-xl bg-card text-xs px-2">
                <option value="Full-Time">Full-Time</option>
                <option value="Part-Time">Part-Time</option>
                <option value="Contract">Contract</option>
              </select>
            </div>
            <div class="space-y-1">
              <label class="text-[10px] uppercase font-black text-muted-foreground">Base Salary (USD)</label>
              <Input v-model.number="empForm.salary" type="number" class="h-10 text-sm" />
            </div>
          </div>
          <div class="space-y-1">
            <label class="text-[10px] uppercase font-black text-muted-foreground">National ID / Passport</label>
            <Input v-model="empForm.nationalId" placeholder="e.g. 63-123456X-99" class="h-10 text-sm" />
          </div>
          <div class="space-y-1">
            <label class="text-[10px] uppercase font-black text-muted-foreground">Start Date</label>
            <Input v-model="empForm.startDate" type="date" class="h-10 text-sm" />
          </div>
          <div class="flex gap-3 pt-2">
            <Button variant="outline" class="flex-1 rounded-xl h-10 font-bold" @click="showAddEmpModal = false; showEditEmpModal = false">Cancel</Button>
            <Button class="flex-1 rounded-xl h-10 font-bold bg-[#ff8903] hover:bg-[#ff8903]/90 text-white" :disabled="isSubmitting" @click="saveEmployee">
              <Loader2 v-if="isSubmitting" class="size-4 animate-spin mr-1" />
              Save
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>

    <!-- Apply Leave Modal -->
    <div v-if="showRequestLeaveModal" class="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 print:hidden">
      <Card class="w-full max-w-sm bg-card border shadow-2xl rounded-3xl overflow-hidden animate-in zoom-in-95 duration-200">
        <div class="p-4 border-b flex justify-between items-center">
          <h2 class="text-base font-black tracking-tight">Request Leave Application</h2>
          <Button variant="ghost" size="icon" class="rounded-full" @click="showRequestLeaveModal = false">
            <X class="size-5" />
          </Button>
        </div>
        <CardContent class="p-6 space-y-4">
          <div class="space-y-1">
            <label class="text-[10px] uppercase font-black text-muted-foreground">Employee Selection</label>
            <select v-model="leaveForm.employeeId" class="w-full h-10 border rounded-xl bg-card text-xs px-2">
              <option value="" disabled>Select Employee</option>
              <option v-for="e in employees.filter(e => e.isActive !== false)" :key="e.id" :value="e.id">{{ getEmpName(e) }}</option>
            </select>
          </div>
          <div class="space-y-1">
            <label class="text-[10px] uppercase font-black text-muted-foreground">Leave Type</label>
            <select v-model="leaveForm.type" class="w-full h-10 border rounded-xl bg-card text-xs px-2">
              <option value="Annual">Annual</option>
              <option value="Sick">Sick</option>
              <option value="Emergency">Emergency</option>
              <option value="Study">Study</option>
              <option value="Maternity/Paternity">Maternity/Paternity</option>
            </select>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div class="space-y-1">
              <label class="text-[10px] uppercase font-black text-muted-foreground">Start Date</label>
              <Input v-model="leaveForm.startDate" type="date" class="h-10 text-sm" />
            </div>
            <div class="space-y-1">
              <label class="text-[10px] uppercase font-black text-muted-foreground">End Date</label>
              <Input v-model="leaveForm.endDate" type="date" class="h-10 text-sm" />
            </div>
          </div>
          <div class="space-y-1">
            <label class="text-[10px] uppercase font-black text-muted-foreground">Reason Description</label>
            <textarea v-model="leaveForm.reason" placeholder="Notes for leave approval..." class="w-full h-20 border rounded-xl bg-card p-3 text-xs"></textarea>
          </div>
          <div class="flex gap-3 pt-2">
            <Button variant="outline" class="flex-1 rounded-xl h-10 font-bold" @click="showRequestLeaveModal = false">Cancel</Button>
            <Button class="flex-1 rounded-xl h-10 font-bold bg-[#ff8903] hover:bg-[#ff8903]/90 text-white" :disabled="isSubmitting" @click="submitLeaveRequest">
              <Loader2 v-if="isSubmitting" class="size-4 animate-spin mr-1" /> Apply
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>

    <!-- Generate Payroll Modal -->
    <div v-if="showGenPayrollModal" class="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 print:hidden">
      <Card class="w-full max-w-sm bg-card border shadow-2xl rounded-3xl overflow-hidden animate-in zoom-in-95 duration-200">
        <div class="p-4 border-b flex justify-between items-center">
          <h2 class="text-base font-black tracking-tight">Run Payroll Generation</h2>
          <Button variant="ghost" size="icon" class="rounded-full" @click="showGenPayrollModal = false">
            <X class="size-5" />
          </Button>
        </div>
        <CardContent class="p-6 space-y-4 overflow-y-auto max-h-[75vh]">
          <div class="space-y-1">
            <label class="text-[10px] uppercase font-black text-muted-foreground">Select Employee</label>
            <select v-model="payrollForm.employeeId" @change="onGenPayrollEmpChange" class="w-full h-10 border rounded-xl bg-card text-xs px-2">
              <option value="" disabled>Select Employee</option>
              <option v-for="e in employees.filter(e => e.isActive !== false)" :key="e.id" :value="e.id">{{ getEmpName(e) }}</option>
            </select>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div class="space-y-1">
              <label class="text-[10px] uppercase font-black text-muted-foreground">Basic Salary</label>
              <Input v-model.number="payrollForm.basicSalary" type="number" @input="onGenPayrollEmpChange" class="h-10 text-sm font-bold font-mono" />
            </div>
            <div class="space-y-1">
              <label class="text-[10px] uppercase font-black text-muted-foreground">Allowances (USD)</label>
              <Input v-model.number="payrollForm.allowances" type="number" @input="onGenPayrollEmpChange" class="h-10 text-sm font-mono" />
            </div>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div class="space-y-1">
              <label class="text-[10px] uppercase font-black text-muted-foreground">Damages Deduction ($)</label>
              <Input v-model.number="payrollForm.damagesDeduction" type="number" class="h-10 text-sm font-mono text-red-500" />
            </div>
            <div class="space-y-1">
              <label class="text-[10px] uppercase font-black text-muted-foreground">Uniform Deduction ($)</label>
              <Input v-model.number="payrollForm.uniformDeduction" type="number" class="h-10 text-sm font-mono text-red-500" />
            </div>
          </div>

          <!-- Auto Deduction Summaries -->
          <div class="p-3 bg-muted/20 border rounded-2xl space-y-2 text-xs">
            <div class="flex justify-between">
              <span class="text-muted-foreground">NSSA (Statutory Portion):</span>
              <span class="font-mono font-bold text-red-500">-{{ fmt(payrollForm.nssa) }}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-muted-foreground">ZIMRA PAYE Tax:</span>
              <span class="font-mono font-bold text-red-500">-{{ fmt(payrollForm.paye) }}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-muted-foreground">AIDS Levy (3%):</span>
              <span class="font-mono font-bold text-red-500">-{{ fmt(payrollForm.aidsLevy) }}</span>
            </div>
            <div class="flex justify-between" v-if="payrollForm.employeeId && activeAdvancesTotalForEmp(payrollForm.employeeId) > 0">
              <span class="text-muted-foreground">Cash Advance Deductions:</span>
              <span class="font-mono font-bold text-red-500">-{{ fmt(activeAdvancesTotalForEmp(payrollForm.employeeId)) }}</span>
            </div>
          </div>

          <div class="p-3 bg-[#ff8903]/5 border border-[#ff8903]/20 rounded-2xl flex justify-between items-center">
            <span class="text-xs font-black uppercase text-foreground">Estimated Net Salary:</span>
            <span class="font-mono text-lg font-black text-[#ff8903]">{{ fmt(genPayrollNetPay) }}</span>
          </div>

          <div class="flex gap-3 pt-2">
            <Button variant="outline" class="flex-1 rounded-xl h-10 font-bold" @click="showGenPayrollModal = false">Cancel</Button>
            <Button class="flex-1 rounded-xl h-10 font-bold bg-[#ff8903] hover:bg-[#ff8903]/90 text-white" :disabled="isSubmitting || !payrollForm.employeeId" @click="generatePayroll">
              <Loader2 v-if="isSubmitting" class="size-4 animate-spin mr-1" /> Save Entry
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>

    <!-- Confirm Disbursement Modal -->
    <div v-if="showPayPayrollModal" class="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 print:hidden">
      <Card class="w-full max-w-sm bg-card border shadow-2xl rounded-3xl overflow-hidden animate-in zoom-in-95 duration-200">
        <div class="p-4 border-b flex justify-between items-center">
          <h2 class="text-base font-black tracking-tight">Confirm Payroll Disbursement</h2>
          <Button variant="ghost" size="icon" class="rounded-full" @click="showPayPayrollModal = false">
            <X class="size-5" />
          </Button>
        </div>
        <CardContent class="p-6 space-y-4">
          <p class="text-xs text-muted-foreground leading-relaxed">
            Confirming disbursement to <span class="font-bold text-foreground">{{ payPayrollForm.employeeName }}</span> for the amount of 
            <span class="font-bold text-[#ff8903] font-mono text-sm">{{ fmt(payPayrollForm.netPay) }}</span>.
            This action will automatically register statutory liabilities and Net Pay operational expenses.
          </p>
          <div class="space-y-1">
            <label class="text-[10px] uppercase font-black text-muted-foreground">Source Account</label>
            <select v-model="payPayrollForm.paymentMethod" class="w-full h-10 border rounded-xl bg-card text-xs px-2">
              <option value="BANK">Bank</option>
              <option value="CASH">Cash</option>
              <option value="ECOCASH">EcoCash</option>
              <option value="SALARIES">Salaries Account</option>
            </select>
          </div>
          <div class="flex gap-3 pt-2">
            <Button variant="outline" class="flex-1 rounded-xl h-10 font-bold" @click="showPayPayrollModal = false">Cancel</Button>
            <Button class="flex-1 rounded-xl h-10 font-bold bg-green-600 hover:bg-green-700 text-white" :disabled="isSubmitting" @click="submitConfirmPayment">
              <Loader2 v-if="isSubmitting" class="size-4 animate-spin mr-1" /> Confirm Paid
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>

    <!-- Request Advance Modal -->
    <div v-if="showAddAdvanceModal" class="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 print:hidden">
      <Card class="w-full max-w-sm bg-card border shadow-2xl rounded-3xl overflow-hidden animate-in zoom-in-95 duration-200">
        <div class="p-4 border-b flex justify-between items-center">
          <h2 class="text-base font-black tracking-tight">Record Salary Advance</h2>
          <Button variant="ghost" size="icon" class="rounded-full" @click="showAddAdvanceModal = false">
            <X class="size-5" />
          </Button>
        </div>
        <CardContent class="p-6 space-y-4">
          <div class="space-y-1">
            <label class="text-[10px] uppercase font-black text-muted-foreground">Select Employee</label>
            <select v-model="advanceForm.employeeId" class="w-full h-10 border rounded-xl bg-card text-xs px-2">
              <option value="" disabled>Select Employee</option>
              <option v-for="e in employees.filter(e => e.isActive !== false)" :key="e.id" :value="e.id">{{ getEmpName(e) }}</option>
            </select>
          </div>
          <div class="space-y-1">
            <label class="text-[10px] uppercase font-black text-muted-foreground">Advance Amount (USD)</label>
            <Input v-model.number="advanceForm.amount" type="number" class="h-10 text-sm font-bold font-mono text-[#ff8903]" />
          </div>
          <div class="space-y-1">
            <label class="text-[10px] uppercase font-black text-muted-foreground">Reason / Note</label>
            <textarea v-model="advanceForm.reason" placeholder="Brief explanation of request..." class="w-full h-20 border rounded-xl bg-card p-3 text-xs"></textarea>
          </div>
          <div class="flex gap-3 pt-2">
            <Button variant="outline" class="flex-1 rounded-xl h-10 font-bold" @click="showAddAdvanceModal = false">Cancel</Button>
            <Button class="flex-1 rounded-xl h-10 font-bold bg-[#ff8903] hover:bg-[#ff8903]/90 text-white" :disabled="isSubmitting" @click="submitSalaryAdvance">
              <Loader2 v-if="isSubmitting" class="size-4 animate-spin mr-1" /> Submit
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>

    <!-- Create HR Task Modal -->
    <div v-if="showAddTaskModal" class="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 print:hidden">
      <Card class="w-full max-w-sm bg-card border shadow-2xl rounded-3xl overflow-hidden animate-in zoom-in-95 duration-200">
        <div class="p-4 border-b flex justify-between items-center">
          <h2 class="text-base font-black tracking-tight">Create HR Operational Task</h2>
          <Button variant="ghost" size="icon" class="rounded-full" @click="showAddTaskModal = false">
            <X class="size-5" />
          </Button>
        </div>
        <CardContent class="p-6 space-y-4">
          <div class="space-y-1">
            <label class="text-[10px] uppercase font-black text-muted-foreground">Task Title *</label>
            <Input v-model="taskForm.title" placeholder="e.g. Submit Safety Roster Reports" class="h-10 text-sm" />
          </div>
          <div class="space-y-1">
            <label class="text-[10px] uppercase font-black text-muted-foreground">Assigned Employee *</label>
            <select v-model="taskForm.assignedTo" class="w-full h-10 border rounded-xl bg-card text-xs px-2">
              <option value="" disabled>Select Employee</option>
              <option v-for="e in employees.filter(e => e.isActive !== false)" :key="e.id" :value="e.id">{{ getEmpName(e) }}</option>
            </select>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div class="space-y-1">
              <label class="text-[10px] uppercase font-black text-muted-foreground">Priority</label>
              <select v-model="taskForm.priority" class="w-full h-10 border rounded-xl bg-card text-xs px-2">
                <option value="Low">Low</option>
                <option value="Medium">Medium</option>
                <option value="High">High</option>
                <option value="Critical">Critical</option>
              </select>
            </div>
            <div class="space-y-1">
              <label class="text-[10px] uppercase font-black text-muted-foreground">Due Date</label>
              <Input v-model="taskForm.dueDate" type="date" class="h-10 text-sm" />
            </div>
          </div>
          <div class="space-y-1">
            <label class="text-[10px] uppercase font-black text-muted-foreground">Linked Target Category (KPI)</label>
            <select v-model="taskForm.kpiCategory" class="w-full h-10 border rounded-xl bg-card text-xs px-2">
              <option value="">None</option>
              <option v-for="k in kpis" :key="k.id" :value="k.id">{{ k.name }}</option>
            </select>
          </div>
          <div class="space-y-1">
            <label class="text-[10px] uppercase font-black text-muted-foreground">Description Details</label>
            <textarea v-model="taskForm.description" placeholder="Specify instructions..." class="w-full h-20 border rounded-xl bg-card p-3 text-xs"></textarea>
          </div>
          <div class="flex gap-3 pt-2">
            <Button variant="outline" class="flex-1 rounded-xl h-10 font-bold" @click="showAddTaskModal = false">Cancel</Button>
            <Button class="flex-1 rounded-xl h-10 font-bold bg-[#ff8903] hover:bg-[#ff8903]/90 text-white" :disabled="isSubmitting" @click="saveTask">
              <Loader2 v-if="isSubmitting" class="size-4 animate-spin mr-1" /> Create
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>

    <!-- Task Add Note Modal -->
    <div v-if="showTaskNoteModal" class="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 print:hidden">
      <Card class="w-full max-w-sm bg-card border shadow-2xl rounded-3xl overflow-hidden animate-in zoom-in-95 duration-200">
        <div class="p-4 border-b flex justify-between items-center">
          <h2 class="text-base font-black tracking-tight">Add Task Progress Note</h2>
          <Button variant="ghost" size="icon" class="rounded-full" @click="showTaskNoteModal = false">
            <X class="size-5" />
          </Button>
        </div>
        <CardContent class="p-6 space-y-4">
          <textarea v-model="taskNoteText" placeholder="Enter notes..." class="w-full h-24 border rounded-xl bg-card p-3 text-xs"></textarea>
          <div class="flex gap-3">
            <Button variant="outline" class="flex-1 rounded-xl h-10 font-bold" @click="showTaskNoteModal = false">Cancel</Button>
            <Button class="flex-1 rounded-xl h-10 font-bold bg-[#ff8903]" @click="submitTaskNote">Save Note</Button>
          </div>
        </CardContent>
      </Card>
    </div>

    <!-- Set KPI Target Modal -->
    <div v-if="showAddKpiModal" class="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 print:hidden">
      <Card class="w-full max-w-sm bg-card border shadow-2xl rounded-3xl overflow-hidden animate-in zoom-in-95 duration-200">
        <div class="p-4 border-b flex justify-between items-center">
          <h2 class="text-base font-black tracking-tight">Set Employee KPI Objective</h2>
          <Button variant="ghost" size="icon" class="rounded-full" @click="showAddKpiModal = false">
            <X class="size-5" />
          </Button>
        </div>
        <CardContent class="p-6 space-y-4">
          <div class="space-y-1">
            <label class="text-[10px] uppercase font-black text-muted-foreground">Select Employee</label>
            <select v-model="kpiForm.employeeId" class="w-full h-10 border rounded-xl bg-card text-xs px-2">
              <option value="" disabled>Select Employee</option>
              <option v-for="e in employees.filter(e => e.isActive !== false)" :key="e.id" :value="e.id">{{ getEmpName(e) }}</option>
            </select>
          </div>
          <div class="space-y-1">
            <label class="text-[10px] uppercase font-black text-muted-foreground">Objective Name *</label>
            <Input v-model="kpiForm.name" placeholder="e.g. Solar Installation Efficiency" class="h-10 text-sm" />
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div class="space-y-1">
              <label class="text-[10px] uppercase font-black text-muted-foreground">Target Score (%)</label>
              <Input v-model.number="kpiForm.targetValue" type="number" class="h-10 text-sm" />
            </div>
            <div class="space-y-1">
              <label class="text-[10px] uppercase font-black text-muted-foreground">Weight Value (%)</label>
              <Input v-model.number="kpiForm.weight" type="number" class="h-10 text-sm" />
            </div>
          </div>
          <div class="space-y-1">
            <label class="text-[10px] uppercase font-black text-muted-foreground">Evaluation Cycle</label>
            <select v-model="kpiForm.period" class="w-full h-10 border rounded-xl bg-card text-xs px-2">
              <option value="Monthly">Monthly</option>
              <option value="Quarterly">Quarterly</option>
              <option value="Annual">Annual</option>
            </select>
          </div>
          <div class="flex gap-3 pt-2">
            <Button variant="outline" class="flex-1 rounded-xl h-10 font-bold" @click="showAddKpiModal = false">Cancel</Button>
            <Button class="flex-1 rounded-xl h-10 font-bold bg-[#ff8903] hover:bg-[#ff8903]/90 text-white" :disabled="isSubmitting" @click="saveKpiTarget">
              <Loader2 v-if="isSubmitting" class="size-4 animate-spin mr-1" /> Save Target
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>

    <!-- Generate Performance Review Modal -->
    <div v-if="showGenReviewModal" class="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 print:hidden">
      <Card class="w-full max-w-sm bg-card border shadow-2xl rounded-3xl overflow-hidden animate-in zoom-in-95 duration-200">
        <div class="p-4 border-b flex justify-between items-center">
          <h2 class="text-base font-black tracking-tight">Compile Performance Review</h2>
          <Button variant="ghost" size="icon" class="rounded-full" @click="showGenReviewModal = false">
            <X class="size-5" />
          </Button>
        </div>
        <CardContent class="p-6 space-y-4">
          <div class="space-y-1">
            <label class="text-[10px] uppercase font-black text-muted-foreground">Select Employee</label>
            <select v-model="reviewForm.employeeId" class="w-full h-10 border rounded-xl bg-card text-xs px-2">
              <option value="" disabled>Select Employee</option>
              <option v-for="e in employees.filter(e => e.isActive !== false)" :key="e.id" :value="e.id">{{ getEmpName(e) }}</option>
            </select>
          </div>
          <div class="space-y-1">
            <label class="text-[10px] uppercase font-black text-muted-foreground">Evaluation Cycle Label</label>
            <Input v-model="reviewForm.period" placeholder="e.g. Q1 2026" class="h-10 text-sm" />
          </div>
          <p class="text-[10px] text-muted-foreground leading-relaxed italic">
            This aggregates and weights completed tasks linked to this employee's KPIs for the target period.
          </p>
          <div class="flex gap-3 pt-2">
            <Button variant="outline" class="flex-1 rounded-xl h-10 font-bold" @click="showGenReviewModal = false">Cancel</Button>
            <Button class="flex-1 rounded-xl h-10 font-bold bg-[#ff8903]" :disabled="isSubmitting" @click="generatePerformanceReview">
              <Loader2 v-if="isSubmitting" class="size-4 animate-spin mr-1" /> Compile
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>

    <!-- Review Details Modal -->
    <div v-if="showReviewDetailModal && selectedReview" class="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 print:hidden">
      <Card class="w-full max-w-sm bg-card border shadow-2xl rounded-3xl overflow-hidden animate-in zoom-in-95 duration-200">
        <div class="p-4 border-b flex justify-between items-center">
          <h2 class="text-base font-black tracking-tight">Review Score Details</h2>
          <Button variant="ghost" size="icon" class="rounded-full" @click="showReviewDetailModal = false">
            <X class="size-5" />
          </Button>
        </div>
        <CardContent class="p-6 space-y-4 overflow-y-auto max-h-[70vh]">
          <div class="flex justify-between items-center">
            <div>
              <h3 class="font-bold text-sm">{{ getEmpName(employees.find(e => e.id === selectedReview!.employeeId)) }}</h3>
              <p class="text-[10px] text-muted-foreground">Period: {{ selectedReview!.period }}</p>
            </div>
            <Badge class="bg-[#ff8903] text-white font-bold text-xs uppercase">{{ selectedReview!.rating }}</Badge>
          </div>
          <div class="p-3 bg-muted/20 border rounded-2xl text-center space-y-1">
            <span class="block text-[10px] uppercase font-black tracking-wider text-muted-foreground">Overall Weighted Score</span>
            <span class="text-3xl font-black text-primary">{{ selectedReview!.overallScore }}%</span>
          </div>

          <!-- KPI score rows -->
          <div class="space-y-2 pt-2">
            <span class="block text-[10px] uppercase font-black tracking-wider text-muted-foreground">Metrics & Objectives Breakdown</span>
            <div v-for="s in selectedReview!.kpiScores" :key="s.kpiId" class="p-2 border rounded-xl space-y-1 bg-card text-xs">
              <div class="flex justify-between font-bold text-foreground">
                <span>{{ s.kpiName }}</span>
                <span>{{ s.actualScore }}%</span>
              </div>
              <div class="flex justify-between text-[10px] text-muted-foreground uppercase">
                <span>Weight: {{ s.weight }}%</span>
                <span>Weighted Score: {{ s.weightedScore }}%</span>
              </div>
            </div>
          </div>

          <!-- Manager Comments -->
          <div class="space-y-1 pt-2">
            <label class="text-[10px] uppercase font-black text-muted-foreground">Manager Remarks / Feedback</label>
            <textarea 
              v-model="selectedReview!.managerComments" 
              @change="updateReviewComments(selectedReview!.id!, selectedReview!.managerComments || '')"
              placeholder="Record comments..." 
              class="w-full h-20 border rounded-xl bg-card p-3 text-xs"
            ></textarea>
          </div>

          <Button variant="outline" class="w-full rounded-xl h-10 font-bold" @click="showReviewDetailModal = false">Close</Button>
        </CardContent>
      </Card>
    </div>

    <!-- Create Recruitment Job posting Modal -->
    <div v-if="showAddJobModal" class="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 print:hidden">
      <Card class="w-full max-w-sm bg-card border shadow-2xl rounded-3xl overflow-hidden animate-in zoom-in-95 duration-200">
        <div class="p-4 border-b flex justify-between items-center">
          <h2 class="text-base font-black tracking-tight">Create Job Posting</h2>
          <Button variant="ghost" size="icon" class="rounded-full" @click="showAddJobModal = false">
            <X class="size-5" />
          </Button>
        </div>
        <CardContent class="p-6 space-y-4">
          <div class="space-y-1">
            <label class="text-[10px] uppercase font-black text-muted-foreground">Job Title *</label>
            <Input v-model="jobForm.jobTitle" placeholder="e.g. Lead Accountant" class="h-10 text-sm" />
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div class="space-y-1">
              <label class="text-[10px] uppercase font-black text-muted-foreground">Department</label>
              <Input v-model="jobForm.department" placeholder="e.g. Finance" class="h-10 text-sm" />
            </div>
            <div class="space-y-1">
              <label class="text-[10px] uppercase font-black text-muted-foreground">Salary Range (USD)</label>
              <Input v-model="jobForm.salaryRange" placeholder="e.g. 1000 - 1500" class="h-10 text-sm" />
            </div>
          </div>
          <div class="space-y-1">
            <label class="text-[10px] uppercase font-black text-muted-foreground">Job Description</label>
            <textarea v-model="jobForm.description" placeholder="Requirements..." class="w-full h-24 border rounded-xl bg-card p-3 text-xs"></textarea>
          </div>
          <div class="flex gap-3 pt-2">
            <Button variant="outline" class="flex-1 rounded-xl h-10 font-bold" @click="showAddJobModal = false">Cancel</Button>
            <Button class="flex-1 rounded-xl h-10 font-bold bg-[#ff8903]" :disabled="isSubmitting" @click="saveJobPosting">
              <Loader2 v-if="isSubmitting" class="size-4 animate-spin mr-1" /> Post
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>

    <!-- Job add applicant modal -->
    <div v-if="showAddApplicantModal" class="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 print:hidden">
      <Card class="w-full max-w-sm bg-card border shadow-2xl rounded-3xl overflow-hidden animate-in zoom-in-95 duration-200">
        <div class="p-4 border-b flex justify-between items-center">
          <h2 class="text-base font-black tracking-tight">Record Applicant Details</h2>
          <Button variant="ghost" size="icon" class="rounded-full" @click="showAddApplicantModal = false">
            <X class="size-5" />
          </Button>
        </div>
        <CardContent class="p-6 space-y-4">
          <div class="space-y-1">
            <label class="text-[10px] uppercase font-black text-muted-foreground">Full Name *</label>
            <Input v-model="applicantForm.name" placeholder="Applicant Name" class="h-10 text-sm" />
          </div>
          <div class="space-y-1">
            <label class="text-[10px] uppercase font-black text-muted-foreground">Email *</label>
            <Input v-model="applicantForm.email" type="email" placeholder="Email" class="h-10 text-sm" />
          </div>
          <div class="space-y-1">
            <label class="text-[10px] uppercase font-black text-muted-foreground">Phone Number</label>
            <Input v-model="applicantForm.phone" placeholder="Phone" class="h-10 text-sm" />
          </div>
          <div class="space-y-1">
            <label class="text-[10px] uppercase font-black text-muted-foreground">Notes / Comments</label>
            <textarea v-model="applicantForm.notes" placeholder="Qualifications notes..." class="w-full h-20 border rounded-xl bg-card p-3 text-xs"></textarea>
          </div>
          <div class="flex gap-3 pt-2">
            <Button variant="outline" class="flex-1 rounded-xl h-10 font-bold" @click="showAddApplicantModal = false">Cancel</Button>
            <Button class="flex-1 rounded-xl h-10 font-bold bg-[#ff8903]" :disabled="isSubmitting" @click="submitApplicant">
              <Loader2 v-if="isSubmitting" class="size-4 animate-spin mr-1" /> Submit
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>

    <!-- Detailed Breakdown Modal -->
    <div v-if="showBreakdownModal && selectedBreakdownPayroll" class="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 print:hidden">
      <Card class="w-full max-w-sm bg-card border shadow-2xl rounded-3xl overflow-hidden animate-in zoom-in-95 duration-200">
        <div class="p-4 border-b flex justify-between items-center bg-muted/20">
          <h2 class="text-base font-black tracking-tight">Job Earnings Breakdown</h2>
          <Button variant="ghost" size="icon" class="rounded-full animate-hover" @click="showBreakdownModal = false">
            <X class="size-5" />
          </Button>
        </div>
        <CardContent class="p-6 space-y-4">
          <p class="text-xs text-slate-500 leading-relaxed">
            Detailed staff rates applied for <span class="font-bold text-slate-700">{{ selectedBreakdownPayroll.employeeName }}</span> on 
            <span class="font-bold text-primary">{{ MONTH_NAMES[selectedBreakdownPayroll.month - 1] }} {{ selectedBreakdownPayroll.year }}</span>.
          </p>
          
          <div class="space-y-2 max-h-[40vh] overflow-y-auto pr-1 text-xs">
            <div v-if="loadingBreakdown" class="flex flex-col items-center justify-center py-6">
                <Loader2 class="size-6 animate-spin text-primary" />
                <p class="text-[10px] text-muted-foreground mt-2">Loading detailed staff rates...</p>
            </div>
            <div v-else-if="breakdownPostings.length === 0" class="text-center py-6 text-muted-foreground italic">
                No individual staff rate postings found for this period.
            </div>
            <div v-else class="space-y-2">
                <div v-for="posting in breakdownPostings" :key="posting.id" class="p-3 border rounded-2xl flex justify-between items-center bg-muted/20">
                    <div class="space-y-0.5">
                        <p class="font-bold text-foreground">Jobcard: {{ posting.jobNumber }}</p>
                        <p v-if="posting.jobCardName" class="text-[10px] text-primary font-bold mt-0.5">{{ posting.jobCardName }}</p>
                        <p class="text-[10px] text-muted-foreground/75 mt-0.5">Date: {{ new Date(posting.createdAt?.seconds * 1000 || posting.postedAt?.seconds * 1000 || Date.now()).toLocaleDateString() }}</p>
                    </div>
                    <span class="font-mono font-black text-sm text-[#ff8903]">+${{ fmt(posting.amount) }}</span>
                </div>
            </div>
          </div>
          
          <Button class="w-full rounded-xl h-10 font-bold" variant="outline" @click="showBreakdownModal = false">Close</Button>
        </CardContent>
      </Card>
    </div>

    <!-- Salaries Fund Modal -->
    <div v-if="showSalariesFundModal" class="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 print:hidden">
      <Card class="w-full max-w-sm bg-card border shadow-2xl rounded-3xl overflow-hidden animate-in zoom-in-95 duration-200">
        <div class="p-4 border-b flex justify-between items-center">
          <h2 class="text-base font-black tracking-tight">Request Salaries Funding</h2>
          <Button variant="ghost" size="icon" class="rounded-full" @click="showSalariesFundModal = false">
            <X class="size-5" />
          </Button>
        </div>
        <CardContent class="p-6 space-y-4">
          <div class="space-y-1">
            <label class="text-[10px] uppercase font-black text-muted-foreground">Source Account</label>
            <select v-model="salariesFundForm.fromAccount" class="w-full h-10 border rounded-xl bg-card text-xs px-2">
              <option value="BANK">Bank Account</option>
              <option value="ECOCASH">EcoCash</option>
              <option value="CASH">Cash Account</option>
            </select>
          </div>
          <div class="space-y-1">
            <label class="text-[10px] uppercase font-black text-muted-foreground">Amount to Transfer (USD)</label>
            <div class="relative">
              <Input v-model.number="salariesFundForm.amount" type="number" step="0.01" class="h-12 text-lg font-black font-mono pl-4 text-emerald-500" />
            </div>
            <button @click="salariesFundForm.amount = fundingGap" class="text-[10px] text-primary hover:underline font-bold mt-1 text-left">
              Request exact funding gap ({{ fmt(fundingGap) }})
            </button>
          </div>
          <div class="space-y-1">
            <label class="text-[10px] uppercase font-black text-muted-foreground">Reference Rationale</label>
            <Input v-model="salariesFundForm.reference" placeholder="e.g. Salaries Funding Q1" class="h-10 text-sm" />
          </div>
          <div class="flex gap-3 pt-2">
            <Button variant="outline" class="flex-1 rounded-xl h-10 font-bold" @click="showSalariesFundModal = false">Cancel</Button>
            <Button class="flex-1 rounded-xl h-10 font-bold bg-[#ff8903] hover:bg-[#ff8903]/90 text-white" :disabled="isSubmitting" @click="submitSalariesFunding">
              <Loader2 v-if="isSubmitting" class="size-4 animate-spin mr-1" /> Submit
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>

    <!-- ─── PAYSILP PRINT PREVIEW MODAL ─── -->
    <div v-if="showPayslipPreviewModal && selectedPayslipPayroll" class="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-start overflow-y-auto p-4 md:p-8 print:p-0 print:bg-white print:absolute print:inset-0">
      <!-- Preview Header Controls (hidden in printing) -->
      <div class="w-full max-w-2xl bg-card border rounded-3xl p-4 flex justify-between items-center gap-4 mb-6 shadow-2xl print:hidden">
        <h3 class="font-black text-sm text-foreground uppercase tracking-wider">Payslip Live Preview</h3>
        <div class="flex gap-2">
          <Button size="sm" class="bg-[#ff8903] hover:bg-[#ff8903]/90 text-white font-bold rounded-xl px-4" @click="printPayslip">Print / PDF</Button>
          <Button size="sm" variant="outline" class="rounded-xl" @click="showPayslipPreviewModal = false">Close</Button>
        </div>
      </div>

      <!-- PRINT LAYOUT (Visible in both print and preview, centered on desk) -->
      <div id="print-payslip-area" class="w-full max-w-2xl bg-white text-slate-900 border rounded-none p-8 md:p-12 shadow-2xl space-y-6 print:border-none print:shadow-none print:p-0 print:text-black">
        
        <!-- Header -->
        <div class="flex justify-between items-center border-b pb-4 border-[#79c21b]">
          <div>
            <h1 class="text-2xl font-black tracking-tighter text-[#79c21b]">
              INCAPTTA<span class="text-[#ff8903]">PRO</span>
            </h1>
            <p class="text-[8px] uppercase tracking-widest text-slate-500 font-bold">Harare, Zimbabwe</p>
          </div>
          <div class="text-right">
            <h2 class="text-base font-black tracking-tight text-slate-800">EMPLOYEE PAYSLIP</h2>
            <p class="text-xs font-bold text-slate-500 uppercase tracking-widest mt-0.5">
              {{ MONTH_NAMES[selectedPayslipPayroll.month - 1] }} {{ selectedPayslipPayroll.year }}
            </p>
          </div>
        </div>

        <!-- Info Grid -->
        <div class="grid grid-cols-2 gap-x-6 gap-y-3 bg-slate-50 p-4 border text-xs print:bg-transparent">
          <div>
            <span class="block text-[8px] uppercase font-black text-slate-400">Employee Full Name</span>
            <span class="font-bold text-slate-800">{{ selectedPayslipPayroll.employeeName }}</span>
          </div>
          <div>
            <span class="block text-[8px] uppercase font-black text-slate-400">Employee Identifier</span>
            <span class="font-bold text-slate-800">{{ selectedPayslipPayroll.employeeId.substring(0, 8).toUpperCase() }}</span>
          </div>
          <div class="border-t pt-2 border-slate-200">
            <span class="block text-[8px] uppercase font-black text-slate-400">National Registration ID</span>
            <span class="font-bold text-slate-800">{{ selectedPayslipPayroll.nationalId || '—' }}</span>
          </div>
          <div class="border-t pt-2 border-slate-200">
            <span class="block text-[8px] uppercase font-black text-slate-400">Payment Status</span>
            <span class="font-bold uppercase text-slate-800">{{ selectedPayslipPayroll.status }}</span>
          </div>
        </div>

        <!-- Details columns -->
        <div class="grid grid-cols-2 gap-8 pt-4">
          <!-- Earnings -->
          <div class="space-y-3">
            <h3 class="text-[10px] font-black uppercase text-slate-400 border-b pb-1">Earnings Breakdown</h3>
            <div class="space-y-2 text-xs">
              <div class="flex justify-between">
                <span>Basic Salary</span>
                <span class="font-mono">{{ fmt(selectedPayslipPayroll.basicSalary) }}</span>
              </div>
              <div class="flex justify-between" v-if="selectedPayslipPayroll.allowances">
                <span>Allowances</span>
                <span class="font-mono">{{ fmt(selectedPayslipPayroll.allowances) }}</span>
              </div>
              <div class="flex justify-between" v-if="selectedPayslipPayroll.jobCardEarnings">
                <span>Job card incentives</span>
                <span class="font-mono">{{ fmt(selectedPayslipPayroll.jobCardEarnings) }}</span>
              </div>
              <div class="flex flex-col text-[9px] text-slate-500 pl-4 mt-0.5 border-l-2 border-slate-200" v-if="selectedPayslipPayroll.jobCardReferences && selectedPayslipPayroll.jobCardReferences.length">
                <span class="font-bold text-slate-600">Allocated Job Cards:</span>
                <span class="font-mono text-slate-500">{{ selectedPayslipPayroll.jobCardReferences.join(', ') }}</span>
                <div class="mt-1 space-y-0.5 border-t border-slate-100 pt-1" v-if="selectedPayslipPostings && selectedPayslipPostings.length">
                  <div v-for="posting in selectedPayslipPostings" :key="posting.id" class="flex justify-between font-mono text-[8px] text-slate-400">
                    <span>↳ Job {{ posting.jobNumber }}</span>
                    <span>${{ fmt(posting.amount) }}</span>
                  </div>
                </div>
              </div>
              <div class="flex justify-between font-bold border-t pt-2 border-slate-200">
                <span>Gross Earnings</span>
                <span class="font-mono">{{ fmt((selectedPayslipPayroll.basicSalary || 0) + (selectedPayslipPayroll.allowances || 0) + (selectedPayslipPayroll.jobCardEarnings || 0)) }}</span>
              </div>
            </div>
          </div>

          <!-- Deductions -->
          <div class="space-y-3">
            <h3 class="text-[10px] font-black uppercase text-slate-400 border-b pb-1">Deductions Breakdown</h3>
            <div class="space-y-2 text-xs">
              <div class="flex justify-between" v-if="selectedPayslipPayroll.paye">
                <span>ZIMRA PAYE Tax</span>
                <span class="font-mono text-red-600">-{{ fmt(selectedPayslipPayroll.paye) }}</span>
              </div>
              <div class="flex justify-between" v-if="selectedPayslipPayroll.nssa">
                <span>NSSA portion</span>
                <span class="font-mono text-red-600">-{{ fmt(selectedPayslipPayroll.nssa) }}</span>
              </div>
              <div class="flex justify-between" v-if="selectedPayslipPayroll.aidsLevy">
                <span>AIDS Levy (3%)</span>
                <span class="font-mono text-red-600">-{{ fmt(selectedPayslipPayroll.aidsLevy) }}</span>
              </div>
              <div class="flex justify-between" v-if="selectedPayslipPayroll.advanceDeduction">
                <span>Cash Advance recover</span>
                <span class="font-mono text-red-600">-{{ fmt(selectedPayslipPayroll.advanceDeduction) }}</span>
              </div>
              <div class="flex justify-between" v-if="selectedPayslipPayroll.damagesDeduction">
                <span>Damages Deduction</span>
                <span class="font-mono text-red-600">-{{ fmt(selectedPayslipPayroll.damagesDeduction) }}</span>
              </div>
              <div class="flex justify-between" v-if="selectedPayslipPayroll.uniformDeduction">
                <span>Uniform Deduction</span>
                <span class="font-mono text-red-600">-{{ fmt(selectedPayslipPayroll.uniformDeduction) }}</span>
              </div>
              <div class="flex justify-between font-bold border-t pt-2 border-slate-200">
                <span>Total Deductions</span>
                <span class="font-mono text-red-600">-{{ fmt(selectedPayslipPayroll.deductions) }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Net Takehome Box -->
        <div class="bg-slate-900 text-white p-6 flex justify-between items-center rounded-none print:bg-slate-100 print:text-black print:border">
          <span class="text-xs font-black uppercase tracking-wider print:text-black">NET TAKE HOME (USD)</span>
          <span class="font-mono text-xl font-black text-[#ff8903] print:text-black">{{ fmt(selectedPayslipPayroll.netPay) }}</span>
        </div>

        <!-- Signatures -->
        <div class="grid grid-cols-2 gap-8 pt-10 text-[10px] text-slate-500">
          <div>
            <div class="border-b border-slate-300 h-6"></div>
            <span class="block mt-1 font-bold">Employee Signature</span>
          </div>
          <div>
            <div class="border-b border-slate-300 h-6"></div>
            <span class="block mt-1 font-bold">Authorized Signatory</span>
          </div>
        </div>

        <!-- Audit Disclaimer -->
        <div class="text-[8px] text-slate-400 text-center border-t pt-4 border-dashed uppercase font-bold tracking-wider mt-6">
          System Generated Audit Verification: {{ selectedPayslipPayroll.id?.toUpperCase() }}
        </div>
      </div>
    </div>

  </div>
</template>

<style scoped>
.no-scrollbar::-webkit-scrollbar {
  display: none;
}
.no-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}

/* HIGH FIDELITY PRINT STYLES */
@media print {
  body * {
    visibility: hidden;
    background: white !important;
    color: black !important;
  }
  #print-payslip-area, #print-payslip-area * {
    visibility: visible;
  }
  #print-payslip-area {
    position: absolute;
    left: 0;
    top: 0;
    width: 100% !important;
    max-width: 100% !important;
    box-shadow: none !important;
    border: none !important;
    padding: 0 !important;
    margin: 0 !important;
  }
}
</style>
