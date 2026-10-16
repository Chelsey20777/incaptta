'use client'

import { accrualPayrollEnabled } from '@/lib/payroll/client'
import { create } from 'zustand'
import { db } from '@/lib/firebase'
import {
  collection,
  query,
  orderBy,
  getDocs,
  getDoc,
  addDoc,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  writeBatch,
  runTransaction,
  onSnapshot,
  Unsubscribe,
  where
} from 'firebase/firestore'
import { toast } from 'sonner'
import { assertSufficientFunds, useFinanceStore } from '@/stores/finance-store'

import { Employee, LeaveRequest, TaskNote, HrTask, KPI, KPIScore, PerformanceReview, SalaryAdvance, SalaryAdvanceRecovery, WorkflowActor, Payroll, PayrollGenerationInput, Applicant, JobPosting, SalariesTransaction } from './hr-types'
import { getEmpName, fmt, daysBetween, calculateTaxDeductions, approvalStatusOnGenerate, effectivePayrollApproval } from './hr-utils'
import {
  autoLinkByEmail,
  emailsMatch,
  linkPair,
  unlinkPair,
} from '@/lib/user-employee-link'

export interface HrState {
  employees: Employee[]
  leaveRequests: LeaveRequest[]
  hrTasks: HrTask[]
  kpis: KPI[]
  reviews: PerformanceReview[]
  performanceReviews: PerformanceReview[]
  payrolls: Payroll[]
  salaryAdvances: SalaryAdvance[]
  salaryAdvanceRecoveries: SalaryAdvanceRecovery[]
  jobPostings: JobPosting[]
  salariesTransactions: SalariesTransaction[]
  loading: boolean
  isSubmitting: boolean
  error: string | null

  startListeners: () => void
  fetchEmployees: () => void
  cleanup: () => void

  addEmployee: (data: any) => Promise<void>
  updateEmployee: (id: string, data: any) => Promise<void>
  deleteEmployee: (id: string) => Promise<void>
  toggleEmployeeStatus: (id: string, currentActive: boolean) => Promise<void>
  linkEmployeeToUser: (employeeId: string, userId: string | null) => Promise<void>
  unlinkEmployee: (employeeId: string) => Promise<void>

  submitLeaveRequest: (data: any) => Promise<void>
  updateLeaveStatus: (id: string, status: 'Approved' | 'Rejected', userId?: string, userName?: string) => Promise<void>

  addTask: (data: any, userId?: string, userName?: string) => Promise<void>
  addTaskNote: (taskId: string, note: Omit<TaskNote, 'id' | 'createdAt'>) => Promise<void>
  updateTaskStatus: (id: string, data: Partial<HrTask>) => Promise<void>

  addKpi: (data: any) => Promise<void>
  generateReview: (employeeId: string, period: string) => Promise<PerformanceReview>

  addSalaryAdvance: (data: any, actor: WorkflowActor) => Promise<void>
  verifySalaryAdvance: (id: string, actor: WorkflowActor) => Promise<void>
  approveSalaryAdvance: (id: string, actor: WorkflowActor) => Promise<void>
  disburseSalaryAdvance: (id: string, reference: string, actor: WorkflowActor) => Promise<void>
  rejectSalaryAdvance: (id: string, reason: string, actor: WorkflowActor) => Promise<void>
  reverseSalaryAdvance: (id: string, reason: string, actor: WorkflowActor) => Promise<void>
  deleteSalaryAdvance: (id: string) => Promise<void>

  generatePayroll: (data: PayrollGenerationInput) => Promise<void>
  approvePayroll: (payrollId: string, approvedBy?: string) => Promise<void>
  payPayroll: (payrollId: string, paymentMethod: string) => Promise<void>
  deletePayrollRecord: (p: Payroll) => Promise<void>

  addJobPosting: (data: any) => Promise<void>
  addApplicant: (jobId: string, data: any) => Promise<void>
  updateApplicantStatus: (jobId: string, applicantId: string, status: Applicant['status']) => Promise<void>

  fundSalariesAccount: (fromAccount: string, amount: number, reference: string) => Promise<void>

  calculateTaxDeductions: (gross: number) => { paye: number; aidsLevy: number; nssa: number; zimdef: number; wcif: number }
  daysBetween: (start: string, end: string) => number
  getEmpName: (emp?: Employee | null) => string
  fmt: (n?: number | null) => string
  activeAdvancesForEmp: (empId: string) => SalaryAdvance[]
  activeAdvancesTotalForEmp: (empId: string) => number
  leaveBalanceForEmp: (empId: string) => number
}

let unsubEmployees: Unsubscribe | null = null
let unsubLeave: Unsubscribe | null = null
let unsubTasks: Unsubscribe | null = null
let unsubKpis: Unsubscribe | null = null
let unsubReviews: Unsubscribe | null = null
let unsubPayroll: Unsubscribe | null = null
let unsubAdvances: Unsubscribe | null = null
let unsubAdvanceRecoveries: Unsubscribe | null = null
let unsubJobs: Unsubscribe | null = null
let unsubSalTrans: Unsubscribe | null = null

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
]

export const useHrStore = create<HrState>((set, get) => ({
  employees: [],
  leaveRequests: [],
  hrTasks: [],
  kpis: [],
  reviews: [],
  performanceReviews: [],
  payrolls: [],
  salaryAdvances: [],
  salaryAdvanceRecoveries: [],
  jobPostings: [],
  salariesTransactions: [],
  loading: false,
  isSubmitting: false,
  error: null,

  fetchEmployees: () => get().startListeners(),
  startListeners: () => {
    set({ loading: true })
    if (!unsubEmployees) { unsubEmployees = onSnapshot(query(collection(db, 'employees')), (snap) => { set({ employees: snap.docs.map(d => ({ id: d.id, ...d.data() } as Employee)), loading: false }) }, (err) => { console.error(err); set({ loading: false }) }) }
    if (!unsubLeave) { unsubLeave = onSnapshot(query(collection(db, 'leaveRequests')), (snap) => set({ leaveRequests: snap.docs.map(d => ({ id: d.id, ...d.data() } as LeaveRequest)) }), (err) => console.error(err)) }
    if (!unsubTasks) { unsubTasks = onSnapshot(query(collection(db, 'hrTasks')), (snap) => { const now = new Date(); set({ hrTasks: snap.docs.map(d => { const data = d.data() as HrTask; const due = data.dueDate ? new Date(data.dueDate) : null; let s = data.status; if (due && due < now && s !== 'Completed') s = 'Overdue'; return { ...data, id: d.id, status: s } }) }) }, (err) => console.error(err)) }
    if (!unsubKpis) { unsubKpis = onSnapshot(query(collection(db, 'kpis')), (snap) => set({ kpis: snap.docs.map(d => ({ id: d.id, ...d.data() } as KPI)) }), (err) => console.error(err)) }
    if (!unsubReviews) { unsubReviews = onSnapshot(query(collection(db, 'performanceReviews')), (snap) => { const mapped = snap.docs.map(d => ({ id: d.id, ...d.data() } as PerformanceReview)); set({ reviews: mapped, performanceReviews: mapped }) }, (err) => console.error(err)) }
    if (!unsubPayroll) { unsubPayroll = onSnapshot(query(collection(db, 'payroll')), (snap) => set({ payrolls: snap.docs.map(d => ({ id: d.id, ...d.data() } as Payroll)) }), (err) => console.error(err)) }
    if (!unsubAdvances) { unsubAdvances = onSnapshot(query(collection(db, 'salaryAdvances')), (snap) => set({ salaryAdvances: snap.docs.map(d => ({ id: d.id, ...d.data() } as SalaryAdvance)) }), (err) => console.error(err)) }
    if (!unsubAdvanceRecoveries) { unsubAdvanceRecoveries = onSnapshot(query(collection(db, 'salaryAdvanceRecoveries')), (snap) => set({ salaryAdvanceRecoveries: snap.docs.map(d => ({ id: d.id, ...d.data() } as SalaryAdvanceRecovery)) }), (err) => console.error(err)) }
    if (!unsubJobs) { unsubJobs = onSnapshot(query(collection(db, 'recruitment')), (snap) => set({ jobPostings: snap.docs.map(d => ({ id: d.id, ...d.data() } as JobPosting)) }), (err) => console.error(err)) }
    if (!unsubSalTrans) { unsubSalTrans = onSnapshot(query(collection(db, 'salariesAccountTransactions')), (snap) => set({ salariesTransactions: snap.docs.map(d => ({ id: d.id, ...d.data() } as SalariesTransaction)) }), (err) => console.error(err)) }
  },

  cleanup: () => {
    if (unsubEmployees) { unsubEmployees(); unsubEmployees = null }
    if (unsubLeave) { unsubLeave(); unsubLeave = null }
    if (unsubTasks) { unsubTasks(); unsubTasks = null }
    if (unsubKpis) { unsubKpis(); unsubKpis = null }
    if (unsubReviews) { unsubReviews(); unsubReviews = null }
    if (unsubPayroll) { unsubPayroll(); unsubPayroll = null }
    if (unsubAdvances) { unsubAdvances(); unsubAdvances = null }
    if (unsubAdvanceRecoveries) { unsubAdvanceRecoveries(); unsubAdvanceRecoveries = null }
    if (unsubJobs) { unsubJobs(); unsubJobs = null }
    if (unsubSalTrans) { unsubSalTrans(); unsubSalTrans = null }
  },

  getEmpName,
  fmt,
  daysBetween,
  calculateTaxDeductions,

  activeAdvancesForEmp: (empId) => get().salaryAdvances.filter(a => a.employeeId === empId && a.status === 'ACTIVE' && Number(a.outstandingBalance || 0) > 0),
  activeAdvancesTotalForEmp: (empId) => get().activeAdvancesForEmp(empId).reduce((s, a) => s + Number(a.outstandingBalance || 0), 0),
  leaveBalanceForEmp: (empId) => {
    const s = get()
    return Math.max(0, 20 - s.leaveRequests.filter(l => l.employeeId === empId && l.status === 'Approved' && l.type === 'Annual').reduce((sum, l) => sum + s.daysBetween(l.startDate, l.endDate), 0))
  },

  addEmployee: async (d) => {
    set({ isSubmitting: true })
    try {
      const { linkedUserId, ...payload } = d || {}
      const ref = await addDoc(collection(db, 'employees'), {
        ...payload,
        isActive: true,
        status: 'Active',
        userId: linkedUserId || null,
        createdAt: serverTimestamp(),
      })
      if (linkedUserId) {
        await linkPair({ userId: linkedUserId, employeeId: ref.id })
      } else if (payload.email) {
        await autoLinkByEmail({ email: payload.email, employeeId: ref.id })
      }
      toast.success('Employee added')
    } catch {
      toast.error('Failed')
    } finally {
      set({ isSubmitting: false })
    }
  },
  updateEmployee: async (id, d) => {
    set({ isSubmitting: true })
    try {
      const existing = get().employees.find((e) => e.id === id)
      const { linkedUserId, ...payload } = d || {}
      const emailChanged =
        payload.email !== undefined &&
        !emailsMatch(existing?.email, payload.email)

      await updateDoc(doc(db, 'employees', id), {
        ...payload,
        updatedAt: serverTimestamp(),
      })

      if (linkedUserId === null) {
        await unlinkPair({ employeeId: id })
      } else if (typeof linkedUserId === 'string' && linkedUserId) {
        await linkPair({ userId: linkedUserId, employeeId: id })
      } else if (emailChanged) {
        if (existing?.userId) {
          await unlinkPair({ employeeId: id, userId: existing.userId })
        }
        if (payload.email) {
          await autoLinkByEmail({ email: payload.email, employeeId: id })
        }
      } else if (payload.email && !existing?.userId) {
        await autoLinkByEmail({ email: payload.email, employeeId: id })
      }
      toast.success('Updated')
    } catch {
      toast.error('Failed')
    } finally {
      set({ isSubmitting: false })
    }
  },
  deleteEmployee: async (id) => {
    try {
      await unlinkPair({ employeeId: id })
      await deleteDoc(doc(db, 'employees', id))
      toast.success('Deleted')
    } catch {
      toast.error('Failed')
    }
  },
  toggleEmployeeStatus: async (id, a) => { set({ isSubmitting: true }); try { const n = !a; await updateDoc(doc(db, 'employees', id), { isActive: n, status: n ? 'Active' : 'Inactive', updatedAt: serverTimestamp() }); toast.success(`Set ${n ? 'Active' : 'Inactive'}`) } catch { toast.error('Failed') } finally { set({ isSubmitting: false }) } },
  linkEmployeeToUser: async (employeeId, userId) => {
    try {
      if (!userId) {
        await unlinkPair({ employeeId })
        toast.success('Employee unlinked from app user')
        return
      }
      await linkPair({ userId, employeeId })
      toast.success('Employee linked to app user')
    } catch (err: any) {
      toast.error(err?.message || 'Failed to link')
      throw err
    }
  },
  unlinkEmployee: async (employeeId) => {
    try {
      await unlinkPair({ employeeId })
      toast.success('Employee unlinked from app user')
    } catch (err: any) {
      toast.error(err?.message || 'Failed to unlink')
      throw err
    }
  },
  submitLeaveRequest: async (d) => { set({ isSubmitting: true }); try { await addDoc(collection(db, 'leaveRequests'), { ...d, status: 'Pending', createdAt: serverTimestamp() }); toast.success('Leave requested') } catch { toast.error('Failed') } finally { set({ isSubmitting: false }) } },
  updateLeaveStatus: async (id, st, uid, un) => { try { await updateDoc(doc(db, 'leaveRequests', id), { status: st, approvedBy: uid || '', approvedByName: un || '', updatedAt: serverTimestamp() }); if (st === 'Approved') { const l = get().leaveRequests.find(x => x.id === id); if (l) await updateDoc(doc(db, 'employees', l.employeeId), { status: 'On Leave', updatedAt: serverTimestamp() }) } toast.success(`Leave ${st.toLowerCase()}`) } catch { toast.error('Failed') } },
  addTask: async (d, uid, un) => { set({ isSubmitting: true }); try { await addDoc(collection(db, 'hrTasks'), { ...d, status: 'Pending', completionPercent: 0, notes: [], assignedBy: uid || '', assignedByName: un || '', createdAt: serverTimestamp() }); toast.success('Task created') } catch { toast.error('Failed') } finally { set({ isSubmitting: false }) } },
  addTaskNote: async (tid, n) => { try { const t = get().hrTasks.find(x => x.id === tid); const notes = t?.notes || []; notes.push({ ...n, id: Date.now().toString(), createdAt: serverTimestamp() } as any); await updateDoc(doc(db, 'hrTasks', tid), { notes, updatedAt: serverTimestamp() }); toast.success('Note added') } catch { toast.error('Failed') } },
  updateTaskStatus: async (id, d) => { try { await updateDoc(doc(db, 'hrTasks', id), { ...d, updatedAt: serverTimestamp() }) } catch { toast.error('Failed') } },
  addKpi: async (d) => { set({ isSubmitting: true }); try { await addDoc(collection(db, 'kpis'), { ...d, createdAt: serverTimestamp() }); toast.success('KPI added') } catch { toast.error('Failed') } finally { set({ isSubmitting: false }) } },
  generateReview: async (eid, p) => { const s = get(); const ks = s.kpis.filter(k => k.employeeId === eid && k.period === p); const scs = ks.map(k => ({ kpiId: k.id!, kpiName: k.name, weight: k.weight, targetValue: k.targetValue, actualScore: 0, weightedScore: 0 })); const tw = scs.reduce((a, sc) => a + sc.weight, 0); const os = tw > 0 ? scs.reduce((a, sc) => a + sc.weightedScore, 0) / tw * 100 : 0; let r = 'Needs Improvement'; if (os >= 90) r = 'Excellent'; else if (os >= 75) r = 'Good'; else if (os >= 50) r = 'Satisfactory'; const rv = { employeeId: eid, period: p, kpiScores: scs, overallScore: os, rating: r, generatedAt: serverTimestamp() }; const dr = await addDoc(collection(db, 'performanceReviews'), rv); toast.success('Review generated'); return { id: dr.id, ...rv } },
  addSalaryAdvance: async (d, actor) => {
    set({ isSubmitting: true })
    try {
      const amount = Number(d.amount)
      const employee = get().employees.find(e => e.id === d.employeeId)
      if (!employee) throw new Error('Select a valid employee')
      if (!Number.isFinite(amount) || amount <= 0) throw new Error('Advance amount must be greater than zero')
      await addDoc(collection(db, 'salaryAdvances'), {
        employeeId: employee.id,
        employeeName: getEmpName(employee),
        employeeNumber: employee.employeeId || null,
        originalAmount: amount,
        amount,
        outstandingBalance: 0,
        recoveredAmount: 0,
        reason: String(d.reason || '').trim(),
        urgencyNotes: String(d.urgencyNotes || '').trim(),
        supportingDocumentUrl: d.supportingDocumentUrl || null,
        status: 'PENDING_ACCOUNTANT',
        requestedBy: actor,
        requestedAt: serverTimestamp(),
        date: new Date().toISOString().split('T')[0],
        createdAt: serverTimestamp()
      })
      toast.success('Advance sent to the accountant')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to request advance')
      throw err
    } finally { set({ isSubmitting: false }) }
  },
  verifySalaryAdvance: async (id, actor) => {
    try {
      await runTransaction(db, async tx => {
        const ref = doc(db, 'salaryAdvances', id)
        const snap = await tx.get(ref)
        if (!snap.exists()) throw new Error('Advance not found')
        const data = snap.data() as SalaryAdvance
        if (data.status !== 'PENDING_ACCOUNTANT') throw new Error('Advance is no longer pending accountant verification')
        if (data.requestedBy?.uid === actor.uid) throw new Error('Requester cannot verify the same advance')
        tx.update(ref, { status: 'PENDING_MANAGER', verifiedBy: actor, verifiedAt: serverTimestamp(), updatedAt: serverTimestamp() })
      })
      toast.success('Advance verified and sent to manager')
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Verification failed'); throw err }
  },
  approveSalaryAdvance: async (id, actor) => {
    try {
      await runTransaction(db, async tx => {
        const ref = doc(db, 'salaryAdvances', id)
        const snap = await tx.get(ref)
        if (!snap.exists()) throw new Error('Advance not found')
        const data = snap.data() as SalaryAdvance
        if (data.status !== 'PENDING_MANAGER') throw new Error('Advance is no longer pending manager approval')
        if (data.verifiedBy?.uid === actor.uid) throw new Error('Verifier cannot approve the same advance')
        tx.update(ref, { status: 'APPROVED_FOR_PAYMENT', approvedBy: actor, approvedAt: serverTimestamp(), updatedAt: serverTimestamp() })
      })
      toast.success('Advance approved for payment')
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Approval failed'); throw err }
  },
  disburseSalaryAdvance: async (id, reference, actor) => {
    try {
      const walletBalance = get().salariesTransactions.reduce((sum, item) => {
        const amount = Number(item.amount || 0)
        if (item.type === 'FUNDING' || item.type === 'TRANSFER') return sum + amount
        if (item.type === 'PAYMENT') return sum - amount
        return sum
      }, 0)
      const advance = get().salaryAdvances.find(a => a.id === id)
      if (!advance) throw new Error('Advance not found')
      const amount = Number(advance.originalAmount || advance.amount || 0)
      if (walletBalance < amount) throw new Error(`Insufficient Salaries balance. Available: ${fmt(walletBalance)}`)
      const walletRef = doc(db, 'salariesAccountTransactions', `salary-advance-${id}`)
      await runTransaction(db, async tx => {
        const advanceRef = doc(db, 'salaryAdvances', id)
        const [advanceSnap, walletSnap] = await Promise.all([tx.get(advanceRef), tx.get(walletRef)])
        if (!advanceSnap.exists()) throw new Error('Advance not found')
        const data = advanceSnap.data() as SalaryAdvance
        if (data.status === 'ACTIVE' && walletSnap.exists()) return
        if (data.status !== 'APPROVED_FOR_PAYMENT') throw new Error('Advance is not approved for payment')
        if (data.approvedBy?.uid === actor.uid) throw new Error('Approver cannot disburse the same advance')
        tx.set(walletRef, {
          type: 'PAYMENT', source: 'SALARY_ADVANCE', amount,
          description: `Salary advance: ${data.employeeName}`,
          referenceId: id, reference: reference.trim(), createdAt: serverTimestamp()
        })
        tx.update(advanceRef, {
          status: 'ACTIVE', outstandingBalance: amount, recoveredAmount: 0,
          paidBy: actor, paidAt: serverTimestamp(), disbursementReference: reference.trim(),
          walletTransactionId: walletRef.id, updatedAt: serverTimestamp()
        })
      })
      toast.success('Advance paid from the Salaries account')
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Disbursement failed'); throw err }
  },
  rejectSalaryAdvance: async (id, reason, actor) => {
    if (!reason.trim()) throw new Error('A rejection reason is required')
    await runTransaction(db, async tx => {
      const ref = doc(db, 'salaryAdvances', id)
      const snap = await tx.get(ref)
      if (!snap.exists()) throw new Error('Advance not found')
      const data = snap.data() as SalaryAdvance
      if (!['PENDING_ACCOUNTANT', 'PENDING_MANAGER', 'APPROVED_FOR_PAYMENT'].includes(data.status)) throw new Error('This advance can no longer be rejected')
      tx.update(ref, { status: 'REJECTED', rejectedBy: actor, rejectedAt: serverTimestamp(), rejectionReason: reason.trim(), updatedAt: serverTimestamp() })
    })
    toast.success('Advance rejected')
  },
  reverseSalaryAdvance: async (id, reason, actor) => {
    if (!reason.trim()) throw new Error('A reversal reason is required')
    const reversalRef = doc(db, 'salariesAccountTransactions', `salary-advance-reversal-${id}`)
    await runTransaction(db, async tx => {
      const ref = doc(db, 'salaryAdvances', id)
      const [snap, reversalSnap] = await Promise.all([tx.get(ref), tx.get(reversalRef)])
      if (!snap.exists()) throw new Error('Advance not found')
      const data = snap.data() as SalaryAdvance
      if (data.status === 'REVERSED' && reversalSnap.exists()) return
      if (data.status !== 'ACTIVE' || Number(data.recoveredAmount || 0) > 0) throw new Error('Only an unrecovered active advance can be reversed')
      const amount = Number(data.outstandingBalance || 0)
      tx.set(reversalRef, { type: 'FUNDING', source: 'SALARY_ADVANCE_REVERSAL', amount, description: `Reversal: ${data.employeeName}`, referenceId: id, reason: reason.trim(), createdAt: serverTimestamp() })
      tx.update(ref, { status: 'REVERSED', outstandingBalance: 0, reversedBy: actor, reversedAt: serverTimestamp(), reversalReason: reason.trim(), updatedAt: serverTimestamp() })
    })
    toast.success('Advance reversed')
  },
  deleteSalaryAdvance: async (id) => {
    try {
      const a = get().salaryAdvances.find(x => x.id === id)
      if (!a) return
      if (!['PENDING_ACCOUNTANT', 'REJECTED'].includes(a.status)) throw new Error('Issued advances cannot be deleted; use an audited reversal')
      await deleteDoc(doc(db, 'salaryAdvances', id))
      toast.success('Draft advance deleted')
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Delete failed'); throw err }
  },
  generatePayroll: async (d) => {
    if (accrualPayrollEnabled) { toast.error('Use the staging Payroll and salary arrears screen for audited payroll operations'); return }
    set({ isSubmitting: true })
    try {
      const s = get()
      // Salary advances are selected explicitly by payroll. Legacy advances are
      // intentionally excluded until the reconciliation migration reviews them.
      const installments: Record<string, number> = Object.fromEntries(
        Object.entries(d.advanceInstallments || {})
          .map(([id, value]) => [id, Number(value)] as const)
          .filter((entry) => Number.isFinite(entry[1]) && entry[1] > 0)
      ) as Record<string, number>
      const snapAdvances = s.salaryAdvances.filter(a => a.employeeId === d.employeeId && a.status === 'ACTIVE')
      const selectedAdvances = snapAdvances.filter(a => installments[a.id!] > 0)
      for (const advance of selectedAdvances) {
        const amount = installments[advance.id!]
        const available = Number(advance.outstandingBalance || 0) - Number(advance.reservedBalance || 0)
        const existingForPayroll = s.payrolls.find(p => p.employeeId === d.employeeId && p.month === d.month && p.year === d.year)?.advanceInstallments?.[advance.id!] || 0
        if (amount > available + existingForPayroll + 0.001) throw new Error(`Advance instalment for ${advance.employeeName} exceeds the available balance`)
      }
      const totalAdvanceAmount = Object.values(installments).reduce((sum, amount) => sum + amount, 0)
      const linkedAdvanceIds = Object.keys(installments)
      const advanceRecoveryDetails = selectedAdvances.map(advance => ({
        advanceId: advance.id!, amount: installments[advance.id!],
        balanceBefore: Number(advance.outstandingBalance || 0),
        balanceAfter: Math.max(0, Number(advance.outstandingBalance || 0) - installments[advance.id!])
      }))

      const finalDeductions = d.paye + d.nssa + d.aidsLevy + d.zimdef + d.wcif + totalAdvanceAmount + (d.damagesDeduction || 0) + (d.uniformDeduction || 0)
      const advanceDeduction = totalAdvanceAmount

      // 2. Query existing
      const existingQuery = query(
        collection(db, 'payroll'),
        where('employeeId', '==', d.employeeId),
        where('month', '==', d.month),
        where('year', '==', d.year)
      )
      const existingSnap = await getDocs(existingQuery)
      const existingJobEarnings = existingSnap.empty ? 0 : Number((existingSnap.docs[0].data() as Payroll).jobCardEarnings || 0)
      if (d.basicSalary + d.allowances + existingJobEarnings - finalDeductions < -0.001) {
        throw new Error('Salary advance instalments cannot make net payroll negative')
      }

      const newFixed = d.basicSalary + d.allowances
      let accumulationAmount = newFixed
      let payrollId = ''
      let previousInstallments: Record<string, number> = {}
      let finalApproval = approvalStatusOnGenerate({
        basicSalary: d.basicSalary,
        allowances: d.allowances,
        jobCardEarnings: 0,
        deductions: finalDeductions
      })

      if (!existingSnap.empty) {
        const existingDoc = existingSnap.docs[0]
        const existingData = existingDoc.data() as Payroll
        previousInstallments = existingData.advanceInstallments || {}

        if (existingData.status === 'Paid') {
          toast.error('This payroll has already been paid and cannot be regenerated. Delete it first if a correction is required.')
          return
        }

        payrollId = existingDoc.id
        const preserved = existingData.jobCardEarnings || 0
        const totalAllowances = d.allowances + preserved
        const netPay = d.basicSalary + totalAllowances - finalDeductions
        const approval = approvalStatusOnGenerate({
          basicSalary: d.basicSalary,
          allowances: totalAllowances,
          jobCardEarnings: preserved,
          deductions: finalDeductions
        })
        finalApproval = approval

        // Delta for the Salaries Account: compare against what was actually
        // accumulated before. `accumulatedFixed` is tracked explicitly —
        // records created by job-card postings start at 0, so their basic
        // salary is accumulated in full here. Legacy records without the
        // field fall back to the old inference.
        const previouslyAccumulated = typeof existingData.accumulatedFixed === 'number'
          ? existingData.accumulatedFixed
          : (existingData.basicSalary || 0) + ((existingData.allowances || 0) - preserved)
        accumulationAmount = newFixed - previouslyAccumulated

        await updateDoc(doc(db, 'payroll', existingDoc.id), {
          basicSalary: d.basicSalary,
          allowances: totalAllowances,
          deductions: finalDeductions,
          advanceDeduction,
          linkedAdvanceIds,
          advanceInstallments: installments,
          advanceRecoveryDetails,
          aidsLevy: d.aidsLevy || 0,
          nssa: d.nssa || 0,
          zimdef: d.zimdef || 0,
          wcif: d.wcif || 0,
          paye: d.paye || 0,
          damagesDeduction: d.damagesDeduction || 0,
          uniformDeduction: d.uniformDeduction || 0,
          netPay,
          employeeName: d.employeeName,
          generated: true,
          accumulatedFixed: newFixed,
          approvalStatus: approval.approvalStatus,
          approvalSource: approval.approvalSource,
          approvedAt: approval.approvalStatus === 'APPROVED_MANAGER' ? serverTimestamp() : null,
          approvedBy: approval.approvalStatus === 'APPROVED_MANAGER' ? 'Job Card (pre-approved)' : null,
          updatedAt: serverTimestamp()
        })
      } else {
        // Deterministic ID prevents duplicate records when a job-card posting
        // creates the same employee/month concurrently. Re-read by ID in case a
        // skeleton was created between the query and now — never wipe
        // jobCardEarnings with a merge that forces 0.
        const newRef = doc(db, 'payroll', `${d.employeeId}_${d.year}_${d.month}`)
        const atIdSnap = await getDoc(newRef)
        if (atIdSnap.exists()) {
          const existingData = atIdSnap.data() as Payroll
          previousInstallments = existingData.advanceInstallments || {}
          if (existingData.status === 'Paid') {
            toast.error('This payroll has already been paid and cannot be regenerated. Delete it first if a correction is required.')
            return
          }
          payrollId = newRef.id
          const preserved = existingData.jobCardEarnings || 0
          const totalAllowances = d.allowances + preserved
          const netPay = d.basicSalary + totalAllowances - finalDeductions
          const approval = approvalStatusOnGenerate({
            basicSalary: d.basicSalary,
            allowances: totalAllowances,
            jobCardEarnings: preserved,
            deductions: finalDeductions
          })
          finalApproval = approval
          const previouslyAccumulated = typeof existingData.accumulatedFixed === 'number'
            ? existingData.accumulatedFixed
            : (existingData.basicSalary || 0) + ((existingData.allowances || 0) - preserved)
          accumulationAmount = newFixed - previouslyAccumulated
          await updateDoc(newRef, {
            basicSalary: d.basicSalary,
            allowances: totalAllowances,
            deductions: finalDeductions,
            advanceDeduction,
            linkedAdvanceIds,
            advanceInstallments: installments,
            advanceRecoveryDetails,
            aidsLevy: d.aidsLevy || 0,
            nssa: d.nssa || 0,
            zimdef: d.zimdef || 0,
            wcif: d.wcif || 0,
            paye: d.paye || 0,
            damagesDeduction: d.damagesDeduction || 0,
            uniformDeduction: d.uniformDeduction || 0,
            netPay,
            employeeName: d.employeeName,
            generated: true,
            accumulatedFixed: newFixed,
            approvalStatus: approval.approvalStatus,
            approvalSource: approval.approvalSource,
            approvedAt: approval.approvalStatus === 'APPROVED_MANAGER' ? serverTimestamp() : null,
            approvedBy: approval.approvalStatus === 'APPROVED_MANAGER' ? 'Job Card (pre-approved)' : null,
            updatedAt: serverTimestamp()
          })
        } else {
          const netPay = d.basicSalary + d.allowances - finalDeductions
          const approval = approvalStatusOnGenerate({
            basicSalary: d.basicSalary,
            allowances: d.allowances,
            jobCardEarnings: 0,
            deductions: finalDeductions
          })
          finalApproval = approval
          await setDoc(newRef, {
            ...d,
            deductions: finalDeductions,
            advanceDeduction,
            linkedAdvanceIds,
            advanceInstallments: installments,
            advanceRecoveryDetails,
            netPay,
            jobCardEarnings: 0,
            status: 'Unpaid',
            generated: true,
            accumulatedFixed: newFixed,
            approvalStatus: approval.approvalStatus,
            approvalSource: approval.approvalSource,
            approvedAt: approval.approvalStatus === 'APPROVED_MANAGER' ? serverTimestamp() : null,
            approvedBy: approval.approvalStatus === 'APPROVED_MANAGER' ? 'Job Card (pre-approved)' : null,
            generatedAt: serverTimestamp()
          })
          payrollId = newRef.id
        }
      }

      // Reserve each instalment against this deterministic payroll. The
      // advance document carries the aggregate reservation, preventing another
      // payroll from consuming the same outstanding balance.
      const oldInstallments = previousInstallments
      const touchedAdvanceIds = new Set([...Object.keys(oldInstallments), ...Object.keys(installments)])
      if (touchedAdvanceIds.size > 0) {
        await runTransaction(db, async tx => {
          for (const advanceId of touchedAdvanceIds) {
            const advanceRef = doc(db, 'salaryAdvances', advanceId)
            const recoveryRef = doc(db, 'salaryAdvanceRecoveries', `${payrollId}_${advanceId}`)
            const advanceSnap = await tx.get(advanceRef)
            if (!advanceSnap.exists()) throw new Error('Linked salary advance no longer exists')
            const advance = advanceSnap.data() as SalaryAdvance
            const oldAmount = Number(oldInstallments[advanceId] || 0)
            const newAmount = Number(installments[advanceId] || 0)
            const reserved = Number(advance.reservedBalance || 0)
            const available = Number(advance.outstandingBalance || 0) - reserved + oldAmount
            if (newAmount > available + 0.001) throw new Error('Salary advance balance was reserved by another payroll')
            tx.update(advanceRef, { reservedBalance: Math.max(0, reserved - oldAmount + newAmount), updatedAt: serverTimestamp() })
            if (newAmount > 0) {
              tx.set(recoveryRef, {
                advanceId, payrollId, employeeId: d.employeeId, month: d.month, year: d.year,
                amount: newAmount, balanceBefore: Number(advance.outstandingBalance || 0),
                status: 'RESERVED', createdBy: d.actor || { uid: 'unknown', name: 'Payroll operator' },
                createdAt: serverTimestamp()
              }, { merge: true })
            } else {
              tx.set(recoveryRef, { status: 'RELEASED', releasedAt: serverTimestamp() }, { merge: true })
            }
          }
        })
      }

      // Record accumulation in Salaries Account
      if (Math.abs(accumulationAmount) > 0.01) {
        await addDoc(collection(db, 'salariesAccountTransactions'), {
          type: 'ACCUMULATION',
          source: 'PAYROLL_NET',
          amount: accumulationAmount,
          month: d.month,
          year: d.year,
          description: `Payroll Generated/Updated: ${d.employeeName}`,
          referenceId: payrollId,
          createdAt: serverTimestamp()
        })
      }

      toast.success(
        finalApproval.approvalStatus === 'PENDING_MANAGER'
          ? 'Payroll generated — awaiting manager approval before payment'
          : 'Payroll generated — ready to pay (job-card earnings pre-approved)'
      )
    } catch (e) {
      console.error(e)
      toast.error('Failed to generate payroll')
    } finally {
      set({ isSubmitting: false })
    }
  },
  approvePayroll: async (payrollId, approvedBy) => {
    if (accrualPayrollEnabled) { toast.error('Use the staging Payroll and salary arrears screen for audited payroll operations'); return }
    try {
      const p = get().payrolls.find(pr => pr.id === payrollId)
      if (!p) throw new Error('Payroll not found')
      if (p.status === 'Paid') {
        toast.error('This payroll is already paid')
        return
      }
      if (p.generated === false) {
        toast.error('Generate payroll before approving')
        return
      }
      if (effectivePayrollApproval(p) === 'APPROVED_MANAGER') {
        toast.message('Already approved for payment')
        return
      }
      await updateDoc(doc(db, 'payroll', payrollId), {
        approvalStatus: 'APPROVED_MANAGER',
        approvalSource: 'MANAGER',
        approvedAt: serverTimestamp(),
        approvedBy: approvedBy || 'Manager',
        updatedAt: serverTimestamp()
      })
      toast.success(`Approved ${p.employeeName} for payment`)
    } catch (e) {
      console.error(e)
      toast.error('Approval failed')
    }
  },
  payPayroll: async (pid, pm) => {
    if (accrualPayrollEnabled) { toast.error('Use the staging Payroll and salary arrears screen for audited payroll operations'); return }
    set({ isSubmitting: true })
    try {
      const s = get()
      const p = s.payrolls.find(pr => pr.id === pid)
      if (!p) throw new Error('Not found')
      if (p.status === 'Paid') {
        toast.error('This payroll has already been paid')
        return
      }
      // Taxes/deductions are not mandatory yet: job-card-earnings-only records
      // (generated === false) are payable directly. They are pre-approved on
      // the job card, so no manager gate applies to them.
      if (effectivePayrollApproval(p) !== 'APPROVED_MANAGER') {
        toast.error('Manager approval required before payment', {
          description: 'Basic salary payroll must be approved by a manager. Job-card staff rates are pre-approved on the job card.'
        })
        return
      }

      // Job-card-only payroll must fulfill from the Salaries wallet (where staff rates accrue).
      const isJobCardOnly =
        Number(p.jobCardEarnings || 0) > 0 && Number(p.basicSalary || 0) === 0
      const method = isJobCardOnly ? 'SALARIES' : String(pm || '').toUpperCase()

      assertSufficientFunds(method, p.netPay, useFinanceStore.getState())

      const b = writeBatch(db)
      const pr = doc(db, 'payroll', pid)
      b.update(pr, {
        status: 'Paid',
        paymentMethod: method,
        paidAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      })
      const ps = `${MONTH_NAMES[p.month - 1]} ${p.year}`
      const or = doc(collection(db, 'operationalExpenses'))
      b.set(or, {
        type: 'PAYROLL_NET',
        description: `Salary — ${p.employeeName} (${ps})`,
        amount: p.netPay,
        paymentMethod: method,
        status: 'APPROVED',
        category: 'Salaries & Wages',
        payrollId: pid,
        createdAt: serverTimestamp(),
        approvedAt: serverTimestamp()
      })
      const pt = (p.paye || 0) + (p.aidsLevy || 0)
      if (pt > 0) {
        b.set(doc(collection(db, 'operationalExpenses')), {
          type: 'STATUTORY_LIABILITY',
          description: `PAYE/AIDS — ${p.employeeName} (${ps})`,
          amount: pt,
          paymentMethod: 'PENDING',
          status: 'PENDING',
          category: 'Statutory Liabilities',
          subCategory: 'ZIMRA',
          payrollId: pid,
          createdAt: serverTimestamp()
        })
      }
      const nt = (p.nssa || 0) * 2
      if (nt > 0) {
        b.set(doc(collection(db, 'operationalExpenses')), {
          type: 'STATUTORY_LIABILITY',
          description: `NSSA — ${p.employeeName} (${ps})`,
          amount: nt,
          paymentMethod: 'PENDING',
          status: 'PENDING',
          category: 'Statutory Liabilities',
          subCategory: 'NSSA',
          payrollId: pid,
          createdAt: serverTimestamp()
        })
      }
      const ot = (p.zimdef || 0) + (p.wcif || 0)
      if (ot > 0) {
        b.set(doc(collection(db, 'operationalExpenses')), {
          type: 'STATUTORY_LIABILITY',
          description: `ZIMDEF/WCIF — ${p.employeeName} (${ps})`,
          amount: ot,
          paymentMethod: 'PENDING',
          status: 'PENDING',
          category: 'Statutory Liabilities',
          subCategory: 'OTHER_STATUTORY',
          payrollId: pid,
          createdAt: serverTimestamp()
        })
      }
      b.update(pr, { ledgerEntryId: or.id })
      const installments = p.advanceInstallments || {}
      Object.entries(installments).forEach(([advanceId, rawAmount]) => {
        const amount = Number(rawAmount || 0)
        const advance = s.salaryAdvances.find(a => a.id === advanceId)
        if (!advance || amount <= 0) return
        const outstanding = Math.max(0, Number(advance.outstandingBalance || 0) - amount)
        const recovered = Number(advance.recoveredAmount || 0) + amount
        b.update(doc(db, 'salaryAdvances', advanceId), {
          status: outstanding <= 0.001 ? 'SETTLED' : 'ACTIVE',
          outstandingBalance: outstanding,
          recoveredAmount: recovered,
          reservedBalance: Math.max(0, Number(advance.reservedBalance || 0) - amount),
          updatedAt: serverTimestamp()
        })
        b.update(doc(db, 'salaryAdvanceRecoveries', `${pid}_${advanceId}`), {
          status: 'RECOVERED', balanceAfter: outstanding, recoveredAt: serverTimestamp()
        })
      })
      await b.commit()
      if (method === 'SALARIES') {
        await addDoc(collection(db, 'salariesAccountTransactions'), {
          type: 'PAYMENT',
          source: 'PAYROLL_NET',
          amount: p.netPay,
          month: p.month,
          year: p.year,
          description: `Payment: ${p.employeeName}`,
          referenceId: pid,
          createdAt: serverTimestamp()
        })
      }
      toast.success(`Paid ${p.employeeName}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Payment failed')
    } finally {
      set({ isSubmitting: false })
    }
  },
  deletePayrollRecord: async (p) => {
    if (accrualPayrollEnabled) { toast.error('Use the staging Payroll and salary arrears screen for audited payroll operations'); return }
    try {
      const b = writeBatch(db)

      // Ledger entries created at payment time
      const oq = query(collection(db, 'operationalExpenses'), where('payrollId', '==', p.id))
      const os = await getDocs(oq)
      os.docs.forEach(d => b.delete(d.ref))

      if (p.status === 'Paid') throw new Error('Paid payroll cannot be deleted; use an audited payroll reversal')
      Object.entries(p.advanceInstallments || {}).forEach(([advanceId, rawAmount]) => {
        const amount = Number(rawAmount || 0)
        const advance = get().salaryAdvances.find(a => a.id === advanceId)
        if (!advance || amount <= 0) return
        b.update(doc(db, 'salaryAdvances', advanceId), {
          reservedBalance: Math.max(0, Number(advance.reservedBalance || 0) - amount), updatedAt: serverTimestamp()
        })
        b.set(doc(db, 'salaryAdvanceRecoveries', `${p.id}_${advanceId}`), {
          status: 'RELEASED', releasedAt: serverTimestamp()
        }, { merge: true })
      })

      // Reverse Salaries Account accumulations so the account does not stay
      // inflated after the record is gone. `accumulatedFixed` tracks the
      // fixed-salary portion; legacy records infer it from the stored fields.
      const jobEarnings = p.jobCardEarnings || 0
      const fixedAccumulated = typeof p.accumulatedFixed === 'number'
        ? p.accumulatedFixed
        : (p.basicSalary || 0) + ((p.allowances || 0) - jobEarnings)
      if (fixedAccumulated > 0.01) {
        b.set(doc(collection(db, 'salariesAccountTransactions')), {
          type: 'ACCUMULATION', source: 'PAYROLL_NET', amount: -fixedAccumulated,
          month: p.month, year: p.year,
          description: `Reversal — Payroll Deleted: ${p.employeeName}`,
          referenceId: p.id, createdAt: serverTimestamp()
        })
      }
      if (jobEarnings > 0.01) {
        b.set(doc(collection(db, 'salariesAccountTransactions')), {
          type: 'ACCUMULATION', source: 'STAFF_RATE', amount: -jobEarnings,
          month: p.month, year: p.year,
          description: `Reversal — Payroll Deleted: ${p.employeeName}`,
          referenceId: p.id, createdAt: serverTimestamp()
        })
      }

      // Delete posting logs so the job earnings can be re-posted, and record
      // which job cards need their `payrollPosted` flags cleared.
      const pq = query(collection(db, 'jobCardPayrollPostings'), where('payrollId', '==', p.id))
      const postingsSnap = await getDocs(pq)
      const rateIdsByJobCard = new Map<string, Set<string>>()
      postingsSnap.docs.forEach(d => {
        const data = d.data() as any
        if (data.jobCardId && data.rateId) {
          if (!rateIdsByJobCard.has(data.jobCardId)) rateIdsByJobCard.set(data.jobCardId, new Set())
          rateIdsByJobCard.get(data.jobCardId)!.add(data.rateId)
        }
        b.delete(d.ref)
      })

      b.delete(doc(db, 'payroll', p.id!))
      await b.commit()

      // Clear posted flags so the rates re-post on the next approval action.
      for (const [jobCardId, rateIds] of rateIdsByJobCard) {
        try {
          await runTransaction(db, async (transaction) => {
            const ref = doc(db, 'jobCards', jobCardId)
            const snap = await transaction.get(ref)
            if (!snap.exists()) return
            const updated = (snap.data().staffRates || []).map((r: any) =>
              rateIds.has(r.id) ? { ...r, payrollPosted: false, payrollPostedAt: null } : r
            )
            transaction.update(ref, { staffRates: updated, updatedAt: serverTimestamp() })
          })
        } catch (err) {
          console.error(`Failed to reset payroll flags on job card ${jobCardId}:`, err)
        }
      }

      toast.success('Payroll deleted', {
        description: rateIdsByJobCard.size > 0
          ? 'Linked job card earnings were unlocked and will re-post on the next staff rate approval.'
          : undefined
      })
    } catch {
      toast.error('Failed')
    }
  },
  addJobPosting: async (d) => { set({ isSubmitting: true }); try { await addDoc(collection(db, 'recruitment'), { ...d, applicants: [], postedDate: new Date().toISOString().split('T')[0], createdAt: serverTimestamp() }); toast.success('Job posted') } catch { toast.error('Failed') } finally { set({ isSubmitting: false }) } },
  addApplicant: async (jid, d) => { set({ isSubmitting: true }); try { const j = get().jobPostings.find(x => x.id === jid); const apps = j?.applicants || []; apps.push({ id: Date.now().toString(), name: d.name, email: d.email, phone: d.phone, status: 'Applied', appliedAt: new Date().toISOString(), notes: d.notes }); await updateDoc(doc(db, 'recruitment', jid), { applicants: apps, updatedAt: serverTimestamp() }); toast.success('Applicant added') } catch { toast.error('Failed') } finally { set({ isSubmitting: false }) } },
  updateApplicantStatus: async (jid, aid, st) => { try { const j = get().jobPostings.find(x => x.id === jid); if (!j) return; const apps = j.applicants.map(x => x.id === aid ? { ...x, status: st } : x); await updateDoc(doc(db, 'recruitment', jid), { applicants: apps, updatedAt: serverTimestamp() }); toast.success(`Status: ${st}`) } catch { toast.error('Failed') } },
  fundSalariesAccount: async (fa, amt, ref) => {
    set({ isSubmitting: true })
    try {
      assertSufficientFunds(fa, amt, useFinanceStore.getState())
      const b = writeBatch(db)
      const tr = doc(collection(db, 'operationalExpenses'))
      b.set(tr, {
        type: 'TRANSFER',
        description: `Salaries Top-Up from ${fa}`,
        amount: amt,
        paymentMethod: fa.toUpperCase(),
        status: 'APPROVED',
        category: 'Salaries & Wages',
        subCategory: 'FUNDING',
        reference: ref,
        createdAt: serverTimestamp(),
        approvedAt: serverTimestamp()
      })
      const sr = doc(collection(db, 'salariesAccountTransactions'))
      b.set(sr, {
        type: 'FUNDING',
        source: fa.toUpperCase(),
        amount: amt,
        description: ref || `Top-up from ${fa}`,
        referenceId: tr.id,
        createdAt: serverTimestamp()
      })
      await b.commit()
      toast.success(`Funded ${amt.toLocaleString()} USD`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Funding failed')
    } finally {
      set({ isSubmitting: false })
    }
  }
}))
