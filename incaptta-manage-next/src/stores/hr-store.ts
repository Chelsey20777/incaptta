'use client'

import { create } from 'zustand'
import { db } from '@/lib/firebase'
import {
  collection,
  query,
  orderBy,
  getDocs,
  addDoc,
  doc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  writeBatch,
  onSnapshot,
  Unsubscribe,
  where
} from 'firebase/firestore'
import { toast } from 'sonner'

import { Employee, LeaveRequest, TaskNote, HrTask, KPI, KPIScore, PerformanceReview, SalaryAdvance, Payroll, Applicant, JobPosting, SalariesTransaction } from './hr-types'
import { getEmpName, fmt, daysBetween, calculateTaxDeductions } from './hr-utils'
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
  payrolls: Payroll[]
  salaryAdvances: SalaryAdvance[]
  jobPostings: JobPosting[]
  salariesTransactions: SalariesTransaction[]
  loading: boolean
  isSubmitting: boolean
  error: string | null

  startListeners: () => void
  cleanup: () => void

  // CRUD
  addEmployee: (data: any) => Promise<void>
  updateEmployee: (id: string, data: any) => Promise<void>
  deleteEmployee: (id: string) => Promise<void>
  toggleEmployeeStatus: (id: string, currentActive: boolean) => Promise<void>

  submitLeaveRequest: (data: any) => Promise<void>
  updateLeaveStatus: (id: string, status: 'Approved' | 'Rejected', userId?: string, userName?: string) => Promise<void>

  addTask: (data: any, userId?: string, userName?: string) => Promise<void>
  addTaskNote: (taskId: string, note: Omit<TaskNote, 'id' | 'createdAt'>) => Promise<void>
  updateTaskStatus: (id: string, data: Partial<HrTask>) => Promise<void>

  addKpi: (data: any) => Promise<void>
  generateReview: (employeeId: string, period: string) => Promise<PerformanceReview>

  addSalaryAdvance: (data: any) => Promise<void>
  approveSalaryAdvance: (adv: SalaryAdvance) => Promise<void>
  deleteSalaryAdvance: (id: string) => Promise<void>

  generatePayroll: (data: any) => Promise<void>
  payPayroll: (payrollId: string, paymentMethod: string) => Promise<void>
  deletePayrollRecord: (p: Payroll) => Promise<void>

  addJobPosting: (data: any) => Promise<void>
  addApplicant: (jobId: string, data: any) => Promise<void>
  updateApplicantStatus: (jobId: string, applicantId: string, status: Applicant['status']) => Promise<void>

  fundSalariesAccount: (fromAccount: string, amount: number, reference: string) => Promise<void>

  // Utilities
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
  payrolls: [],
  salaryAdvances: [],
  jobPostings: [],
  salariesTransactions: [],
  loading: false,
  isSubmitting: false,
  error: null,

  startListeners: () => {
    set({ loading: true })

    if (!unsubEmployees) {
      unsubEmployees = onSnapshot(
        query(collection(db, 'employees')),
        (snap) => {
          set({ employees: snap.docs.map(d => ({ id: d.id, ...d.data() } as Employee)) })
          set({ loading: false })
        },
        (err) => { console.error('employees listener error:', err); set({ loading: false }) }
      )
    }

    if (!unsubLeave) {
      unsubLeave = onSnapshot(
        query(collection(db, 'leaveRequests')),
        (snap) => set({ leaveRequests: snap.docs.map(d => ({ id: d.id, ...d.data() } as LeaveRequest)) }),
        (err) => console.error('leaveRequests listener error:', err)
      )
    }

    if (!unsubTasks) {
      unsubTasks = onSnapshot(
        query(collection(db, 'hrTasks')),
        (snap) => {
          const now = new Date()
          const tasks = snap.docs.map(d => {
            const data = d.data() as HrTask
            const due = data.dueDate ? new Date(data.dueDate) : null
            let status = data.status
            if (due && due < now && status !== 'Completed') {
              status = 'Overdue'
            }
            return { ...data, id: d.id, status }
          })
          set({ hrTasks: tasks })
        },
        (err) => console.error('hrTasks listener error:', err)
      )
    }

    if (!unsubKpis) {
      unsubKpis = onSnapshot(
        query(collection(db, 'kpis')),
        (snap) => set({ kpis: snap.docs.map(d => ({ id: d.id, ...d.data() } as KPI)) }),
        (err) => console.error('kpis listener error:', err)
      )
    }

    if (!unsubReviews) {
      unsubReviews = onSnapshot(
        query(collection(db, 'performanceReviews')),
        (snap) => set({ reviews: snap.docs.map(d => ({ id: d.id, ...d.data() } as PerformanceReview)) }),
        (err) => console.error('reviews listener error:', err)
      )
    }

    if (!unsubPayroll) {
      unsubPayroll = onSnapshot(
        query(collection(db, 'payroll')),
        (snap) => set({ payrolls: snap.docs.map(d => ({ id: d.id, ...d.data() } as Payroll)) }),
        (err) => console.error('payroll listener error:', err)
      )
    }

    if (!unsubAdvances) {
      unsubAdvances = onSnapshot(
        query(collection(db, 'salaryAdvances')),
        (snap) => set({ salaryAdvances: snap.docs.map(d => ({ id: d.id, ...d.data() } as SalaryAdvance)) }),
        (err) => console.error('salaryAdvances listener error:', err)
      )
    }

    if (!unsubJobs) {
      unsubJobs = onSnapshot(
        query(collection(db, 'recruitment')),
        (snap) => set({ jobPostings: snap.docs.map(d => ({ id: d.id, ...d.data() } as JobPosting)) }),
        (err) => console.error('recruitment listener error:', err)
      )
    }

    if (!unsubSalTrans) {
      unsubSalTrans = onSnapshot(
        query(collection(db, 'salariesAccountTransactions')),
        (snap) => set({ salariesTransactions: snap.docs.map(d => ({ id: d.id, ...d.data() } as SalariesTransaction)) }),
        (err) => console.error('salariesAccountTransactions listener error:', err)
      )
    }
  },

  cleanup: () => {
    if (unsubEmployees) { unsubEmployees(); unsubEmployees = null }
    if (unsubLeave) { unsubLeave(); unsubLeave = null }
    if (unsubTasks) { unsubTasks(); unsubTasks = null }
    if (unsubKpis) { unsubKpis(); unsubKpis = null }
    if (unsubReviews) { unsubReviews(); unsubReviews = null }
    if (unsubPayroll) { unsubPayroll(); unsubPayroll = null }
    if (unsubAdvances) { unsubAdvances(); unsubAdvances = null }
    if (unsubJobs) { unsubJobs(); unsubJobs = null }
    if (unsubSalTrans) { unsubSalTrans(); unsubSalTrans = null }
  },

  // ─── Utility Functions ──────────────────────────────────────────────────
  getEmpName,
  fmt,
  daysBetween,
  calculateTaxDeductions,

  activeAdvancesForEmp: (empId) => {
    return get().salaryAdvances.filter(a => a.employeeId === empId && a.status === 'Unprocessed')
  },

  activeAdvancesTotalForEmp: (empId) => {
    return get().activeAdvancesForEmp(empId).reduce((sum, a) => sum + a.amount, 0)
  },

  leaveBalanceForEmp: (empId) => {
    const state = get()
    const approvedUsed = state.leaveRequests
      .filter(l => l.employeeId === empId && l.status === 'Approved' && l.type === 'Annual')
      .reduce((sum, l) => sum + state.daysBetween(l.startDate, l.endDate), 0)
    return Math.max(0, 20 - approvedUsed)
  },

  // ─── Employee CRUD ──────────────────────────────────────────────────────
  addEmployee: async (data) => {
    set({ isSubmitting: true })
    try {
      const { linkedUserId, ...payload } = data || {}
      const ref = await addDoc(collection(db, 'employees'), {
        ...payload,
        isActive: true,
        status: 'Active',
        userId: linkedUserId || null,
        createdAt: serverTimestamp()
      })
      if (linkedUserId) {
        await linkPair({ userId: linkedUserId, employeeId: ref.id })
      } else if (payload.email) {
        await autoLinkByEmail({ email: payload.email, employeeId: ref.id })
      }
      toast.success('Employee added successfully')
    } catch (err) {
      toast.error('Failed to add employee')
      throw err
    } finally { set({ isSubmitting: false }) }
  },

  updateEmployee: async (id, data) => {
    set({ isSubmitting: true })
    try {
      const existing = get().employees.find((e) => e.id === id)
      const { linkedUserId, ...payload } = data || {}
      const emailChanged =
        payload.email !== undefined &&
        !emailsMatch(existing?.email, payload.email)

      await updateDoc(doc(db, 'employees', id), { ...payload, updatedAt: serverTimestamp() })

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
      toast.success('Employee updated successfully')
    } catch (err) {
      toast.error('Failed to update employee')
      throw err
    } finally { set({ isSubmitting: false }) }
  },

  deleteEmployee: async (id) => {
    try {
      await unlinkPair({ employeeId: id })
      await deleteDoc(doc(db, 'employees', id))
      toast.success('Employee deleted')
    } catch (err) {
      toast.error('Failed to delete employee')
      throw err
    }
  },

  toggleEmployeeStatus: async (id, currentActive) => {
    set({ isSubmitting: true })
    try {
      const nextActive = !currentActive
      await updateDoc(doc(db, 'employees', id), {
        isActive: nextActive,
        status: nextActive ? 'Active' : 'Inactive',
        updatedAt: serverTimestamp()
      })
      toast.success(`Employee set to ${nextActive ? 'Active' : 'Inactive'}`)
    } catch (err) {
      toast.error('Failed to change status')
    } finally { set({ isSubmitting: false }) }
  },

  // ─── Leave Requests ────────────────────────────────────────────────────
  submitLeaveRequest: async (data) => {
    set({ isSubmitting: true })
    try {
      await addDoc(collection(db, 'leaveRequests'), {
        ...data,
        status: 'Pending',
        createdAt: serverTimestamp()
      })
      toast.success('Leave requested successfully')
    } catch (err) {
      toast.error('Failed to submit leave request')
      throw err
    } finally { set({ isSubmitting: false }) }
  },

  updateLeaveStatus: async (id, status, userId, userName) => {
    try {
      await updateDoc(doc(db, 'leaveRequests', id), {
        status,
        approvedBy: userId || '',
        approvedByName: userName || '',
        updatedAt: serverTimestamp()
      })
      if (status === 'Approved') {
        const leave = get().leaveRequests.find(l => l.id === id)
        if (leave) {
          await updateDoc(doc(db, 'employees', leave.employeeId), { status: 'On Leave', updatedAt: serverTimestamp() })
        }
      }
      toast.success(`Leave request ${status.toLowerCase()}`)
    } catch (err) {
      toast.error('Failed to update leave status')
    }
  },

  // ─── HR Tasks ──────────────────────────────────────────────────────────
  addTask: async (data, userId, userName) => {
    set({ isSubmitting: true })
    try {
      await addDoc(collection(db, 'hrTasks'), {
        ...data,
        status: 'Pending',
        completionPercent: 0,
        notes: [],
        assignedBy: userId || '',
        assignedByName: userName || '',
        createdAt: serverTimestamp()
      })
      toast.success('Task created successfully')
    } catch (err) {
      toast.error('Failed to create task')
      throw err
    } finally { set({ isSubmitting: false }) }
  },

  addTaskNote: async (taskId, note) => {
    try {
      const taskRef = doc(db, 'hrTasks', taskId)
      const task = get().hrTasks.find(t => t.id === taskId)
      const notes = task?.notes || []
      notes.push({ ...note, id: Date.now().toString(), createdAt: serverTimestamp() } as any)
      await updateDoc(taskRef, { notes, updatedAt: serverTimestamp() })
      toast.success('Note added')
    } catch (err) {
      toast.error('Failed to add note')
    }
  },

  updateTaskStatus: async (id, data) => {
    try {
      await updateDoc(doc(db, 'hrTasks', id), { ...data, updatedAt: serverTimestamp() })
    } catch (err) {
      toast.error('Failed to update task')
    }
  },

  // ─── KPIs & Performance ────────────────────────────────────────────────
  addKpi: async (data) => {
    set({ isSubmitting: true })
    try {
      await addDoc(collection(db, 'kpis'), { ...data, createdAt: serverTimestamp() })
      toast.success('KPI added')
    } catch (err) {
      toast.error('Failed to add KPI')
    } finally { set({ isSubmitting: false }) }
  },

  generateReview: async (employeeId, period) => {
    const state = get()
    const empKpis = state.kpis.filter(k => k.employeeId === employeeId && k.period === period)
    const scores: KPIScore[] = empKpis.map(k => ({
      kpiId: k.id!,
      kpiName: k.name,
      weight: k.weight,
      targetValue: k.targetValue,
      actualScore: 0,
      weightedScore: 0
    }))
    const totalWeight = scores.reduce((s, sc) => s + sc.weight, 0)
    const overallScore = totalWeight > 0 ? scores.reduce((s, sc) => s + sc.weightedScore, 0) / totalWeight * 100 : 0
    let rating = 'Needs Improvement'
    if (overallScore >= 90) rating = 'Excellent'
    else if (overallScore >= 75) rating = 'Good'
    else if (overallScore >= 50) rating = 'Satisfactory'

    const review: Omit<PerformanceReview, 'id'> = {
      employeeId,
      period,
      kpiScores: scores,
      overallScore,
      rating,
      generatedAt: serverTimestamp()
    }
    const docRef = await addDoc(collection(db, 'performanceReviews'), review)
    toast.success('Performance review generated')
    return { id: docRef.id, ...review }
  },

  // ─── Salary Advances ───────────────────────────────────────────────────
  addSalaryAdvance: async (data) => {
    set({ isSubmitting: true })
    try {
      await addDoc(collection(db, 'salaryAdvances'), {
        ...data,
        status: 'Pending Approval',
        date: new Date().toISOString().split('T')[0],
        createdAt: serverTimestamp()
      })
      toast.success('Salary advance requested')
    } catch (err) {
      toast.error('Failed to request advance')
    } finally { set({ isSubmitting: false }) }
  },

  approveSalaryAdvance: async (adv) => {
    try {
      const batch = writeBatch(db)
      const advRef = doc(db, 'salaryAdvances', adv.id!)
      const opexRef = doc(collection(db, 'operationalExpenses'))

      batch.update(advRef, { status: 'Unprocessed', ledgerEntryId: opexRef.id, updatedAt: serverTimestamp() })
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
      toast.success('Advance approved and recorded')
    } catch (err) {
      toast.error('Approval failed')
    }
  },

  deleteSalaryAdvance: async (id) => {
    try {
      const adv = get().salaryAdvances.find(a => a.id === id)
      if (!adv) return
      const batch = writeBatch(db)
      batch.delete(doc(db, 'salaryAdvances', id))
      if (adv.ledgerEntryId) {
        batch.delete(doc(db, 'operationalExpenses', adv.ledgerEntryId))
      }
      await batch.commit()
      toast.success('Advance request deleted')
    } catch (err) {
      toast.error('Failed to delete advance')
    }
  },

  // ─── Payroll ───────────────────────────────────────────────────────────
  generatePayroll: async (data) => {
    set({ isSubmitting: true })
    try {
      const state = get()
      const advances = state.activeAdvancesForEmp(data.employeeId)
      const totalAdvanceDeduction = advances.reduce((s, a) => s + a.amount, 0)
      const totalDeductions = data.paye + data.nssa + data.aidsLevy + totalAdvanceDeduction +
        (data.damagesDeduction || 0) + (data.uniformDeduction || 0)

      await addDoc(collection(db, 'payroll'), {
        ...data,
        deductions: totalDeductions,
        advanceDeduction: totalAdvanceDeduction,
        netPay: data.basicSalary + data.allowances - totalDeductions,
        status: 'Unpaid',
        linkedAdvanceIds: advances.map(a => a.id!),
        generatedAt: serverTimestamp()
      })

      // Salaries obligation accumulator
      await addDoc(collection(db, 'salariesAccountTransactions'), {
        type: 'ACCUMULATION',
        source: 'PAYROLL_NET',
        amount: data.basicSalary + data.allowances - totalDeductions,
        month: data.month,
        year: data.year,
        description: `Payroll Obligation: ${data.employeeName}`,
        createdAt: serverTimestamp()
      })

      toast.success('Payroll record created')
    } catch (err) {
      toast.error('Failed to generate payroll')
    } finally { set({ isSubmitting: false }) }
  },

  payPayroll: async (payrollId, paymentMethod) => {
    set({ isSubmitting: true })
    try {
      const state = get()
      const p = state.payrolls.find(pr => pr.id === payrollId)
      if (!p) throw new Error('Payroll not found')
      const batch = writeBatch(db)
      const payrollRef = doc(db, 'payroll', payrollId)

      batch.update(payrollRef, { status: 'Paid', paymentMethod, updatedAt: serverTimestamp() })

      const periodStr = `${MONTH_NAMES[p.month - 1]} ${p.year}`
      const opexRef = doc(collection(db, 'operationalExpenses'))
      batch.set(opexRef, {
        type: 'PAYROLL_NET',
        description: `Salary Payment — ${p.employeeName} (${periodStr})`,
        amount: p.netPay,
        paymentMethod: paymentMethod.toUpperCase(),
        status: 'APPROVED',
        category: 'Salaries & Wages',
        payrollId,
        createdAt: serverTimestamp(),
        approvedAt: serverTimestamp()
      })

      // Statutory liabilities
      const payeTotal = (p.paye || 0) + (p.aidsLevy || 0)
      if (payeTotal > 0) {
        batch.set(doc(collection(db, 'operationalExpenses')), {
          type: 'STATUTORY_LIABILITY',
          description: `ZIMRA PAYE/AIDS Levy — ${p.employeeName} (${periodStr})`,
          amount: payeTotal,
          paymentMethod: 'PENDING',
          status: 'PENDING',
          category: 'Statutory Liabilities',
          subCategory: 'ZIMRA',
          payrollId,
          createdAt: serverTimestamp()
        })
      }

      const nssaTotal = (p.nssa || 0) * 2
      if (nssaTotal > 0) {
        batch.set(doc(collection(db, 'operationalExpenses')), {
          type: 'STATUTORY_LIABILITY',
          description: `NSSA Liability — ${p.employeeName} (${periodStr})`,
          amount: nssaTotal,
          paymentMethod: 'PENDING',
          status: 'PENDING',
          category: 'Statutory Liabilities',
          subCategory: 'NSSA',
          payrollId,
          createdAt: serverTimestamp()
        })
      }

      const otherStat = (p.zimdef || 0) + (p.wcif || 0)
      if (otherStat > 0) {
        batch.set(doc(collection(db, 'operationalExpenses')), {
          type: 'STATUTORY_LIABILITY',
          description: `ZIMDEF/WCIF Liability — ${p.employeeName} (${periodStr})`,
          amount: otherStat,
          paymentMethod: 'PENDING',
          status: 'PENDING',
          category: 'Statutory Liabilities',
          subCategory: 'OTHER_STATUTORY',
          payrollId,
          createdAt: serverTimestamp()
        })
      }

      batch.update(payrollRef, { ledgerEntryId: opexRef.id })

      const advanceIds: string[] = p.linkedAdvanceIds || []
      advanceIds.forEach((advId: string) => {
        batch.update(doc(db, 'salaryAdvances', advId), { status: 'Processed', payrollId, updatedAt: serverTimestamp() })
      })

      await batch.commit()

      if (paymentMethod === 'SALARIES') {
        await addDoc(collection(db, 'salariesAccountTransactions'), {
          type: 'PAYMENT',
          source: 'PAYROLL_NET',
          amount: p.netPay,
          month: p.month,
          year: p.year,
          description: `Salary Payment: ${p.employeeName}`,
          referenceId: payrollId,
          createdAt: serverTimestamp()
        })
      }

      toast.success(`Payment completed for ${p.employeeName}`)
    } catch (err) {
      toast.error('Payment failed')
    } finally { set({ isSubmitting: false }) }
  },

  deletePayrollRecord: async (p) => {
    try {
      const batch = writeBatch(db)
      const opexQuery = query(collection(db, 'operationalExpenses'), where('payrollId', '==', p.id))
      const opexSnap = await getDocs(opexQuery)
      opexSnap.docs.forEach(doc => batch.delete(doc.ref))

      const advIds: string[] = p.linkedAdvanceIds || []
      advIds.forEach((advId: string) => {
        batch.update(doc(db, 'salaryAdvances', advId), { status: 'Unprocessed', payrollId: null, updatedAt: serverTimestamp() })
      })

      batch.delete(doc(db, 'payroll', p.id!))
      await batch.commit()
      toast.success('Payroll record deleted')
    } catch (err) {
      toast.error('Failed to delete payroll')
    }
  },

  // ─── Recruitment ───────────────────────────────────────────────────────
  addJobPosting: async (data) => {
    set({ isSubmitting: true })
    try {
      await addDoc(collection(db, 'recruitment'), {
        ...data,
        applicants: [],
        postedDate: new Date().toISOString().split('T')[0],
        createdAt: serverTimestamp()
      })
      toast.success('Job posting created')
    } catch (err) {
      toast.error('Failed to create job posting')
    } finally { set({ isSubmitting: false }) }
  },

  addApplicant: async (jobId, data) => {
    set({ isSubmitting: true })
    try {
      const job = get().jobPostings.find(j => j.id === jobId)
      const applicants = job?.applicants || []
      const newApplicant: Applicant = {
        id: Date.now().toString(),
        name: data.name,
        email: data.email,
        phone: data.phone,
        status: 'Applied',
        appliedAt: new Date().toISOString(),
        notes: data.notes
      }
      applicants.push(newApplicant)
      await updateDoc(doc(db, 'recruitment', jobId), { applicants, updatedAt: serverTimestamp() })
      toast.success('Applicant added')
    } catch (err) {
      toast.error('Failed to add applicant')
    } finally { set({ isSubmitting: false }) }
  },

  updateApplicantStatus: async (jobId, applicantId, status) => {
    try {
      const job = get().jobPostings.find(j => j.id === jobId)
      if (!job) return
      const applicants = job.applicants.map(a => a.id === applicantId ? { ...a, status } : a)
      await updateDoc(doc(db, 'recruitment', jobId), { applicants, updatedAt: serverTimestamp() })
      toast.success(`Applicant status updated to ${status}`)
    } catch (err) {
      toast.error('Failed to update applicant status')
    }
  },

  // ─── Salaries Account ──────────────────────────────────────────────────
  fundSalariesAccount: async (fromAccount, amount, reference) => {
    set({ isSubmitting: true })
    try {
      const batch = writeBatch(db)

      // Create transfer in operationalExpenses
      const transferRef = doc(collection(db, 'operationalExpenses'))
      batch.set(transferRef, {
        type: 'TRANSFER',
        description: `Salaries Account Top-Up from ${fromAccount}`,
        amount,
        paymentMethod: fromAccount.toUpperCase(),
        status: 'APPROVED',
        category: 'Salaries & Wages',
        subCategory: 'FUNDING',
        reference,
        createdAt: serverTimestamp(),
        approvedAt: serverTimestamp()
      })

      // Record in salariesAccountTransactions
      const salTransRef = doc(collection(db, 'salariesAccountTransactions'))
      batch.set(salTransRef, {
        type: 'FUNDING',
        source: fromAccount.toUpperCase(),
        amount,
        description: reference || `Top-up from ${fromAccount}`,
        referenceId: transferRef.id,
        createdAt: serverTimestamp()
      })

      await batch.commit()
      toast.success(`Salaries account funded with ${amount.toLocaleString()} USD`)
    } catch (err) {
      toast.error('Funding failed')
    } finally { set({ isSubmitting: false }) }
  }
}))