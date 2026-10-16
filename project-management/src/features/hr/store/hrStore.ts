import { defineStore } from 'pinia'
import { ref, onUnmounted } from 'vue'
import { db } from '@/lib/firebase'
import {
    collection, query, onSnapshot, addDoc, updateDoc, deleteDoc,
    doc, serverTimestamp, orderBy, where, getDocs, getDoc, setDoc, writeBatch, Timestamp
} from 'firebase/firestore'
import type { Employee, LeaveRequest, Task, KPI, PerformanceReview, Payroll, JobPosting, SalaryAdvance } from '../types'
import { buildPerformanceReview } from '../utils/kpiCalculations'

export const useHrStore = defineStore('hr', () => {
    // ─── State ────────────────────────────────────────────────────────────────
    const employees = ref<Employee[]>([])
    const leaveRequests = ref<LeaveRequest[]>([])
    const tasks = ref<Task[]>([])
    const kpis = ref<KPI[]>([])
    const performanceReviews = ref<PerformanceReview[]>([])
    const payrolls = ref<Payroll[]>([])
    const salaryAdvances = ref<SalaryAdvance[]>([])
    const jobPostings = ref<JobPosting[]>([])
    const loading = ref(false)
    const error = ref<string | null>(null)

    // ─── Subscriptions ────────────────────────────────────────────────────────
    let unsubEmployees: (() => void) | null = null
    let unsubLeave: (() => void) | null = null
    let unsubTasks: (() => void) | null = null
    let unsubKpis: (() => void) | null = null
    let unsubReviews: (() => void) | null = null
    let unsubPayroll: (() => void) | null = null
    let unsubAdvances: (() => void) | null = null
    let unsubRecruitment: (() => void) | null = null

    // ─── Employees ────────────────────────────────────────────────────────────
    function fetchEmployees() {
        loading.value = true
        const q = query(collection(db, 'employees'), orderBy('createdAt', 'desc'))
        unsubEmployees = onSnapshot(q, (snap) => {
            employees.value = snap.docs.map(d => ({ id: d.id, ...d.data() } as Employee))
            loading.value = false
        })
    }

    async function saveEmployee(data: Omit<Employee, 'id' | 'createdAt'>, id?: string) {
        if (id) {
            await updateDoc(doc(db, 'employees', id), { ...data })
        } else {
            await addDoc(collection(db, 'employees'), { ...data, createdAt: serverTimestamp() })
        }
    }

    async function deleteEmployee(id: string) {
        await deleteDoc(doc(db, 'employees', id))
    }

    // ─── Leave ────────────────────────────────────────────────────────────────
    function fetchLeaveRequests() {
        const q = query(collection(db, 'leaveRequests'), orderBy('createdAt', 'desc'))
        unsubLeave = onSnapshot(q, (snap) => {
            leaveRequests.value = snap.docs.map(d => ({ id: d.id, ...d.data() } as LeaveRequest))
        })
    }

    async function submitLeaveRequest(data: Omit<LeaveRequest, 'id' | 'status' | 'createdAt'>) {
        await addDoc(collection(db, 'leaveRequests'), {
            ...data,
            status: 'Pending',
            createdAt: serverTimestamp()
        })
    }

    async function updateLeaveStatus(id: string, status: 'Approved' | 'Rejected', approvedBy: string, approvedByName: string) {
        await updateDoc(doc(db, 'leaveRequests', id), { status, approvedBy, approvedByName })
        if (status === 'Approved') {
            const req = leaveRequests.value.find(l => l.id === id)
            if (req) {
                await updateDoc(doc(db, 'employees', req.employeeId), { status: 'On Leave' })
            }
        }
    }

    // ─── Tasks ────────────────────────────────────────────────────────────────
    function fetchTasks() {
        const q = query(collection(db, 'hrTasks'), orderBy('createdAt', 'desc'))
        unsubTasks = onSnapshot(q, (snap) => {
            const now = new Date()
            tasks.value = snap.docs.map(d => {
                const data = d.data() as Task
                // Auto-mark overdue
                const due = data.dueDate ? new Date(data.dueDate) : null
                let status = data.status
                if (due && due < now && status !== 'Completed') {
                    status = 'Overdue'
                }
                return { ...data, id: d.id, status }
            })
        })
    }

    async function saveTask(data: Omit<Task, 'id' | 'createdAt'>, id?: string) {
        if (id) {
            await updateDoc(doc(db, 'hrTasks', id), { ...data })
        } else {
            await addDoc(collection(db, 'hrTasks'), {
                ...data,
                notes: [],
                completionPercent: 0,
                createdAt: serverTimestamp()
            })
        }
    }

    async function updateTaskProgress(id: string, completionPercent: number, status: string) {
        await updateDoc(doc(db, 'hrTasks', id), { completionPercent, status })
    }

    async function verifyTask(id: string, verifiedBy: string, verifiedByName: string) {
        await updateDoc(doc(db, 'hrTasks', id), {
            verifiedBy,
            verifiedByName,
            verifiedAt: serverTimestamp(),
            status: 'Completed',
            completionPercent: 100
        })
    }

    async function addTaskNote(taskId: string, userId: string, userName: string, text: string) {
        const task = tasks.value.find(t => t.id === taskId)
        if (!task) return
        const note = {
            id: Date.now().toString(),
            userId,
            userName,
            text,
            createdAt: Timestamp.now()
        }
        const updatedNotes = [...(task.notes || []), note]
        await updateDoc(doc(db, 'hrTasks', taskId), { notes: updatedNotes })
    }

    async function deleteTask(id: string) {
        await deleteDoc(doc(db, 'hrTasks', id))
    }

    // ─── KPIs ─────────────────────────────────────────────────────────────────
    function fetchKpis() {
        const q = query(collection(db, 'kpis'), orderBy('createdAt', 'desc'))
        unsubKpis = onSnapshot(q, (snap) => {
            kpis.value = snap.docs.map(d => ({ id: d.id, ...d.data() } as KPI))
        })
    }

    async function saveKpi(data: Omit<KPI, 'id' | 'createdAt'>, id?: string) {
        if (id) {
            await updateDoc(doc(db, 'kpis', id), { ...data })
        } else {
            await addDoc(collection(db, 'kpis'), { ...data, linkedTaskIds: [], createdAt: serverTimestamp() })
        }
    }

    async function deleteKpi(id: string) {
        await deleteDoc(doc(db, 'kpis', id))
    }

    async function updateKpiComment(id: string, comment: string) {
        await updateDoc(doc(db, 'kpis', id), { managerComment: comment })
    }

    // ─── Performance Reviews ───────────────────────────────────────────────────
    function fetchPerformanceReviews() {
        const q = query(collection(db, 'performanceReviews'), orderBy('generatedAt', 'desc'))
        unsubReviews = onSnapshot(q, (snap) => {
            performanceReviews.value = snap.docs.map(d => ({ id: d.id, ...d.data() } as PerformanceReview))
        })
    }

    async function generateReview(employeeId: string, period: string) {
        const empKpis = kpis.value.filter(k => k.employeeId === employeeId && k.period === period)
        const allTasks = tasks.value
        const review = buildPerformanceReview(employeeId, period, empKpis, allTasks)
        await addDoc(collection(db, 'performanceReviews'), {
            ...review,
            generatedAt: serverTimestamp()
        })
    }

    async function updateReviewComments(id: string, comments: string) {
        await updateDoc(doc(db, 'performanceReviews', id), { managerComments: comments })
    }

    // ─── Payroll ──────────────────────────────────────────────────────────────
    function fetchPayrolls() {
        const q = query(collection(db, 'payroll'), orderBy('generatedAt', 'desc'))
        unsubPayroll = onSnapshot(q, (snap) => {
            payrolls.value = snap.docs.map(d => ({ id: d.id, ...d.data() } as Payroll))
        })
    }

    async function generatePayroll(data: Omit<Payroll, 'id' | 'status' | 'generatedAt'>) {
        // 1. Check for unprocessed advances
        const advancesSnap = await getDocs(query(
            collection(db, 'salaryAdvances'),
            where('employeeId', '==', data.employeeId),
            where('status', '==', 'Unprocessed')
        ))
        
        const pendingAdvances = advancesSnap.docs.map(d => ({ id: d.id, ...d.data() } as SalaryAdvance))
        const totalAdvanceAmount = pendingAdvances.reduce((sum, a) => sum + a.amount, 0)
        const linkedAdvanceIds = pendingAdvances.map(a => a.id!)

        // Adjusted deductions and net pay
        const finalDeductions = data.deductions + totalAdvanceAmount
        const advanceDeduction = totalAdvanceAmount

        // 2. Upsert logic
        const existing = await getDocs(query(
            collection(db, 'payroll'),
            where('employeeId', '==', data.employeeId),
            where('month', '==', data.month),
            where('year', '==', data.year)
        ))

        let accumulationAmount = data.basicSalary + data.allowances
        let payrollId = ''

        if (!existing.empty) {
            const existingDoc = existing.docs[0]!
            const existingData = existingDoc.data() as Payroll
            payrollId = existingDoc.id
            const preserved = existingData.jobCardEarnings || 0
            const totalAllowances = data.allowances + preserved
            const netPay = data.basicSalary + totalAllowances - finalDeductions
            
            // Calculate delta for accumulation
            const oldFixed = (existingData.basicSalary || 0) + ((existingData.allowances || 0) - (existingData.jobCardEarnings || 0))
            accumulationAmount = (data.basicSalary + data.allowances) - oldFixed

            await updateDoc(doc(db, 'payroll', existingDoc.id), {
                basicSalary: data.basicSalary,
                allowances: totalAllowances,
                deductions: finalDeductions,
                advanceDeduction,
                linkedAdvanceIds,
                aidsLevy: data.aidsLevy ?? 0,
                nssa: data.nssa ?? 0,
                zimdef: data.zimdef ?? 0,
                wcif: data.wcif ?? 0,
                paye: data.paye ?? 0,
                damagesDeduction: data.damagesDeduction ?? 0,
                uniformDeduction: data.uniformDeduction ?? 0,
                netPay,
                employeeName: data.employeeName,
                updatedAt: serverTimestamp(),
            })
        } else {
            const netPay = data.basicSalary + data.allowances - finalDeductions
            const docRef = await addDoc(collection(db, 'payroll'), {
                ...data,
                deductions: finalDeductions,
                advanceDeduction,
                linkedAdvanceIds,
                netPay,
                jobCardEarnings: 0,
                status: 'Unpaid',
                generatedAt: serverTimestamp(),
            })
            payrollId = docRef.id
        }

        // Record accumulation in Salaries Account
        if (Math.abs(accumulationAmount) > 0.01) {
            try {
                await addDoc(collection(db, 'salariesAccountTransactions'), {
                    type: 'ACCUMULATION',
                    source: 'PAYROLL_NET',
                    amount: accumulationAmount,
                    month: data.month,
                    year: data.year,
                    description: `Payroll Generated/Updated: ${data.employeeName}`,
                    referenceId: payrollId,
                    createdAt: serverTimestamp()
                })
            } catch (err) {
                console.error('Failed to accumulate payroll in Salaries Account:', err)
            }
        }
    }

    async function markPayrollPaid(id: string, paymentMethod: string, employeeName: string, netPay: number, month: number, year: number) {
        const payrollRef = doc(db, 'payroll', id)
        const snap = await getDocs(query(collection(db, 'payroll'), where('__name__', '==', id)))
        if (snap.empty) throw new Error('Payroll record not found')
        const payrollData = snap.docs[0]!.data() as Payroll

        const batch = writeBatch(db)

        // 1. Log payment method, keep status as Unpaid until approved & processed in finance
        batch.update(payrollRef, { paymentMethod, updatedAt: serverTimestamp() })

        const periodStr = `${MONTH_NAMES[month - 1]} ${year}`

        // 2. Add main Salary Payment to operationalExpenses in PENDING_ACCOUNTANT status
        const netPayEntryRef = doc(collection(db, 'operationalExpenses'))
        batch.set(netPayEntryRef, {
            type: 'PAYROLL_NET',
            description: `Salary Payment — ${employeeName} (${periodStr})`,
            amount: netPay,
            paymentMethod: paymentMethod.toUpperCase(),
            status: 'PENDING_ACCOUNTANT',
            category: 'Salaries & Wages',
            payrollId: id,
            createdAt: serverTimestamp()
        })

        // 3. Add Statutory Liabilities (ZIMRA: PAYE + AIDS Levy) in PENDING_ACCOUNTANT status
        const payeTotal = (payrollData.paye || 0) + (payrollData.aidsLevy || 0)
        if (payeTotal > 0) {
            const payeEntryRef = doc(collection(db, 'operationalExpenses'))
            batch.set(payeEntryRef, {
                type: 'STATUTORY_LIABILITY',
                description: `ZIMRA PAYE/AIDS Levy — ${employeeName} (${periodStr})`,
                amount: payeTotal,
                paymentMethod: 'PENDING',
                status: 'PENDING_ACCOUNTANT',
                category: 'Statutory Liabilities',
                subCategory: 'ZIMRA',
                payrollId: id,
                createdAt: serverTimestamp()
            })
        }

        // 4. Add NSSA Liability (Employee + Employer portions) in PENDING_ACCOUNTANT status
        const nssaTotal = (payrollData.nssa || 0) * 2
        if (nssaTotal > 0) {
            const nssaEntryRef = doc(collection(db, 'operationalExpenses'))
            batch.set(nssaEntryRef, {
                type: 'STATUTORY_LIABILITY',
                description: `NSSA Liability — ${employeeName} (${periodStr})`,
                amount: nssaTotal,
                paymentMethod: 'PENDING',
                status: 'PENDING_ACCOUNTANT',
                category: 'Statutory Liabilities',
                subCategory: 'NSSA',
                payrollId: id,
                createdAt: serverTimestamp()
            })
        }

        // 5. Add Other Employer Costs (ZIMDEF & WCIF) in PENDING_ACCOUNTANT status
        const otherStatTotal = (payrollData.zimdef || 0) + (payrollData.wcif || 0)
        if (otherStatTotal > 0) {
            const otherStatRef = doc(collection(db, 'operationalExpenses'))
            batch.set(otherStatRef, {
                type: 'STATUTORY_LIABILITY',
                description: `ZIMDEF/WCIF Liability — ${employeeName} (${periodStr})`,
                amount: otherStatTotal,
                paymentMethod: 'PENDING',
                status: 'PENDING_ACCOUNTANT',
                category: 'Statutory Liabilities',
                subCategory: 'OTHER_STATUTORY',
                payrollId: id,
                createdAt: serverTimestamp()
            })
        }

        // 6. Link main entry back to payroll for tracking
        batch.update(payrollRef, { ledgerEntryId: netPayEntryRef.id })

        await batch.commit()
    }

    async function deletePayroll(id: string) {
        const payrollRef = doc(db, 'payroll', id)
        const snap = await getDoc(payrollRef)
        
        if (snap.exists()) {
            const payrollData = snap.data() as Payroll
            const batch = writeBatch(db)
            
            // 1. Find all linked entries in operationalExpenses
            const ledgerSnap = await getDocs(query(
                collection(db, 'operationalExpenses'),
                where('payrollId', '==', id)
            ))
            ledgerSnap.docs.forEach(d => batch.delete(d.ref))
            
            // 2. Revert linked advances to Unprocessed
            const linkedAdvanceIds = payrollData.linkedAdvanceIds || []
            linkedAdvanceIds.forEach(advId => {
                batch.update(doc(db, 'salaryAdvances', advId), {
                    status: 'Unprocessed',
                    payrollId: null,
                    updatedAt: serverTimestamp()
                })
            })

            // 3. Find and delete linked job card postings
            const postingsSnap = await getDocs(query(
                collection(db, 'jobCardPayrollPostings'),
                where('payrollId', '==', id)
            ))
            postingsSnap.docs.forEach(d => batch.delete(d.ref))

            // 4. Find and delete linked Salaries Account transactions (PAYROLL_NET)
            const salTxSnap = await getDocs(query(
                collection(db, 'salariesAccountTransactions'),
                where('referenceId', '==', id)
            ))
            salTxSnap.docs.forEach(d => batch.delete(d.ref))

            // 5. Delete STAFF_RATE accumulations for this employee & month & year
            if (payrollData.employeeName && payrollData.month && payrollData.year) {
                const staffTxSnap = await getDocs(query(
                    collection(db, 'salariesAccountTransactions'),
                    where('month', '==', payrollData.month),
                    where('year', '==', payrollData.year),
                    where('source', '==', 'STAFF_RATE')
                ))
                staffTxSnap.docs.forEach(d => {
                    const desc = d.data().description || ''
                    if (desc.includes(payrollData.employeeName)) {
                        batch.delete(d.ref)
                    }
                })
            }

            // 6. Delete payroll record
            batch.delete(payrollRef)
            
            await batch.commit()
        }
    }

    // ─── Salary Advances ──────────────────────────────────────────────────────
    function fetchSalaryAdvances() {
        const q = query(collection(db, 'salaryAdvances'), orderBy('createdAt', 'desc'))
        unsubAdvances = onSnapshot(q, (snap) => {
            salaryAdvances.value = snap.docs.map(d => ({ id: d.id, ...d.data() } as SalaryAdvance))
        })
    }

    async function recordSalaryAdvance(data: Omit<SalaryAdvance, 'id' | 'status' | 'createdAt'>) {
        const advanceRef = doc(collection(db, 'salaryAdvances'))
        
        // 1. Save Advance Record as Pending Approval
        await setDoc(advanceRef, {
            ...data,
            status: 'Pending Approval',
            ledgerEntryId: null,
            createdAt: serverTimestamp()
        })
    }

    async function approveSalaryAdvance(id: string) {
        const adv = salaryAdvances.value.find((a: SalaryAdvance) => a.id === id)
        if (!adv || adv.status !== 'Pending Approval') return

        const advanceRef = doc(db, 'salaryAdvances', id)
        const expenseRef = doc(collection(db, 'operationalExpenses'))
        
        const batch = writeBatch(db)
        
        // 1. Approve Advance Record
        batch.update(advanceRef, {
            status: 'Unprocessed',
            ledgerEntryId: expenseRef.id,
            updatedAt: serverTimestamp()
        })
        
        // 2. Post to Accounting Ledger
        batch.set(expenseRef, {
            type: 'SALARY_ADVANCE',
            description: `Salary Advance — ${adv.employeeName}`,
            amount: adv.amount,
            paymentMethod: 'CASH', 
            status: 'APPROVED',
            category: 'Salaries & Wages',
            subCategory: 'ADVANCE',
            employeeId: adv.employeeId,
            advanceId: id,
            createdAt: serverTimestamp(),
            approvedAt: serverTimestamp()
        })
        
        await batch.commit()
    }

    async function deleteSalaryAdvance(id: string) {
        const adv = salaryAdvances.value.find((a: SalaryAdvance) => a.id === id)
        if (!adv || adv.status === 'Processed') return
        
        const batch = writeBatch(db)
        batch.delete(doc(db, 'salaryAdvances', id))
        if (adv.ledgerEntryId) {
            batch.delete(doc(db, 'operationalExpenses', adv.ledgerEntryId))
        }
        await batch.commit()
    }

    // ─── Recruitment ──────────────────────────────────────────────────────────
    function fetchJobPostings() {
        const q = query(collection(db, 'recruitment'), orderBy('createdAt', 'desc'))
        unsubRecruitment = onSnapshot(q, (snap) => {
            jobPostings.value = snap.docs.map(d => ({ id: d.id, ...d.data() } as JobPosting))
        })
    }

    async function saveJobPosting(data: Omit<JobPosting, 'id' | 'createdAt'>, id?: string) {
        if (id) {
            await updateDoc(doc(db, 'recruitment', id), { ...data })
        } else {
            await addDoc(collection(db, 'recruitment'), {
                ...data,
                applicants: [],
                createdAt: serverTimestamp()
            })
        }
    }

    async function addApplicant(jobId: string, applicant: Omit<import('../types').Applicant, 'id' | 'appliedAt'>) {
        const job = jobPostings.value.find(j => j.id === jobId)
        if (!job) return
        const newApplicant = {
            ...applicant,
            id: Date.now().toString(),
            appliedAt: new Date().toISOString().split('T')[0],
            status: 'Applied'
        }
        await updateDoc(doc(db, 'recruitment', jobId), {
            applicants: [...job.applicants, newApplicant]
        })
    }

    async function updateApplicantStatus(jobId: string, applicantId: string, status: import('../types').Applicant['status']) {
        const job = jobPostings.value.find(j => j.id === jobId)
        if (!job) return
        const updated = job.applicants.map(a => a.id === applicantId ? { ...a, status } : a)
        await updateDoc(doc(db, 'recruitment', jobId), { applicants: updated })
    }

    async function deleteJobPosting(id: string) {
        await deleteDoc(doc(db, 'recruitment', id))
    }

    // ─── Cleanup ──────────────────────────────────────────────────────────────
    function fetchAll() {
        fetchEmployees()
        fetchLeaveRequests()
        fetchTasks()
        fetchKpis()
        fetchPerformanceReviews()
        fetchPayrolls()
        fetchSalaryAdvances()
        fetchJobPostings()
    }

    function cleanup() {
        unsubEmployees?.()
        unsubLeave?.()
        unsubTasks?.()
        unsubKpis?.()
        unsubReviews?.()
        unsubPayroll?.()
        unsubAdvances?.()
        unsubRecruitment?.()
    }

    onUnmounted(cleanup)

    return {
        // State
        employees, leaveRequests, tasks, kpis, performanceReviews, payrolls, jobPostings, loading, error,
        // Employee
        fetchEmployees, saveEmployee, deleteEmployee,
        // Leave
        fetchLeaveRequests, submitLeaveRequest, updateLeaveStatus,
        // Tasks
        fetchTasks, saveTask, updateTaskProgress, verifyTask, addTaskNote, deleteTask,
        // KPIs
        fetchKpis, saveKpi, deleteKpi, updateKpiComment,
        // Performance
        fetchPerformanceReviews, generateReview, updateReviewComments,
        // Payroll
        fetchPayrolls, generatePayroll, markPayrollPaid, deletePayroll,
        // Salary Advances
        salaryAdvances, fetchSalaryAdvances, recordSalaryAdvance, approveSalaryAdvance, deleteSalaryAdvance,
        // Recruitment
        fetchJobPostings, saveJobPosting, addApplicant, updateApplicantStatus, deleteJobPosting,
        // All
        fetchAll, cleanup
    }
})

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December']
