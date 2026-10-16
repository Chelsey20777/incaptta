<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useHrStore } from '../store/hrStore'
import { useSession } from '@/composables/useSession'
import { storeToRefs } from 'pinia'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Wallet, PlusCircle, Trash2, CheckCircle, FileDown, DollarSign, Pencil } from 'lucide-vue-next'
import { Badge } from '@/components/ui/badge'
import type { Payroll } from '../types'
import HRNav from '../components/HRNav.vue'
import AdminDeleteDialog from '@/components/AdminDeleteDialog.vue'
import { toast } from 'vue-sonner'
import { calculatePayrollDeductions } from '../utils/payrollCalculations'
import { Calculator } from 'lucide-vue-next'

import { downloadPayslipPDF } from '../utils/generatePayslipPdf'
import SalaryAdvanceModal from '../components/SalaryAdvanceModal.vue'
import SalaryAdvancesListModal from '../components/SalaryAdvancesListModal.vue'
import { useAdminStore } from '@/features/admin/store/adminStore'
import { useFinanceStore } from '@/features/fundTransfers/store/financeStore'
import { db } from '@/lib/firebase'
import { collection, query, where, getDocs, getDoc, doc } from 'firebase/firestore'

const hrStore = useHrStore()
const { hasAnyRole, user } = useSession()
const { employees, payrolls, salaryAdvances, loading } = storeToRefs(hrStore)

const adminStore = useAdminStore()

onMounted(() => { 
    hrStore.fetchEmployees()
    hrStore.fetchPayrolls()
    hrStore.fetchSalaryAdvances()
    adminStore.fetchSettings() 
})
onUnmounted(() => hrStore.cleanup())

const showAdvanceModal = ref(false)
const showAdvancesListModal = ref(false)

const { isSuperAdmin } = useSession()
const isAdminDeleteOpen = ref(false)
const selectedPayrollForAdminDelete = ref<Payroll | null>(null)
const isDeleting = ref(false)

const canManage = computed(() => hasAnyRole(['ADMIN', 'SUPER_ADMIN', 'ACCOUNTANT', 'TECHNICAL']))

const filterMonth = ref(new Date().getMonth() + 1)
const filterYear = ref(new Date().getFullYear())

const filtered = computed(() =>
    payrolls.value.filter(p => p.month === filterMonth.value && p.year === filterYear.value)
)

const totalNetPay = computed(() => filtered.value.reduce((s: number, p: Payroll) => s + (p.netPay || 0), 0))
const totalPaid = computed(() => filtered.value.filter(p => p.status === 'Paid').reduce((s: number, p: Payroll) => s + (p.netPay || 0), 0))
const totalUnpaid = computed(() => filtered.value.filter(p => p.status === 'Unpaid').reduce((s: number, p: Payroll) => s + (p.netPay || 0), 0))

const showDialog = ref(false)
const showPayDialog = ref(false)
const saving = ref(false)
const selectedPayroll = ref<Payroll | null>(null)

const showBreakdownDialog = ref(false)
const selectedBreakdownPayroll = ref<Payroll | null>(null)
const breakdownPostings = ref<any[]>([])
const loadingBreakdown = ref(false)
const selectedPayrollId = ref<string | null>(null)
const payMethod = ref('BANK')

const form = ref({
    employeeId: '',
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear(),
    basicSalary: 0,
    allowances: 0,
    aidsLevy: 0,
    nssa: 0,
    zimdef: 0,
    wcif: 0,
    paye: 0,
    damagesDeduction: 0,
    uniformDeduction: 0,
})

const totalDeductions = computed(() =>
    form.value.aidsLevy + form.value.nssa + form.value.zimdef + form.value.wcif + form.value.paye + (form.value.damagesDeduction || 0) + (form.value.uniformDeduction || 0)
)

// Detect a pre-existing payroll record for the current form selection
const existingPayrollForForm = computed(() =>
    payrolls.value.find(p =>
        p.employeeId === form.value.employeeId &&
        p.month === form.value.month &&
        p.year === form.value.year
    ) ?? null
)

const pendingAdvanceAmount = computed(() => {
    if (!form.value.employeeId) return 0
    return salaryAdvances.value
        .filter((a: any) => a.employeeId === form.value.employeeId && a.status === 'Unprocessed')
        .reduce((sum: number, a: any) => sum + a.amount, 0)
})

const formNetPay = computed(() => {
    const jcEarnings = existingPayrollForForm.value?.jobCardEarnings || 0
    return form.value.basicSalary + form.value.allowances + jcEarnings - totalDeductions.value - pendingAdvanceAmount.value
})

const activeAdvances = computed(() => salaryAdvances.value.filter((a: any) => a.status === 'Unprocessed'))
const activeAdvancesTotal = computed(() => activeAdvances.value.reduce((s: number, a: any) => s + a.amount, 0))

function openGenerate() {
    selectedPayrollId.value = null
    form.value = {
        employeeId: '',
        month: filterMonth.value,
        year: filterYear.value,
        basicSalary: 0,
        allowances: 0,
        aidsLevy: 0,
        nssa: 0,
        zimdef: 0,
        wcif: 0,
        paye: 0,
        damagesDeduction: 0,
        uniformDeduction: 0,
    }
    showDialog.value = true
}

function openEdit(p: Payroll) {
    selectedPayrollId.value = p.id || null
    form.value = {
        employeeId: p.employeeId,
        month: p.month,
        year: p.year,
        basicSalary: p.basicSalary,
        allowances: (p.allowances || 0) - (p.jobCardEarnings || 0),
        aidsLevy: p.aidsLevy || 0,
        nssa: p.nssa || 0,
        zimdef: p.zimdef || 0,
        wcif: p.wcif || 0,
        paye: p.paye || 0,
        damagesDeduction: (p as any).damagesDeduction || 0,
        uniformDeduction: (p as any).uniformDeduction || 0,
        jobCardEarnings: p.jobCardEarnings || 0,
    } as any
    showDialog.value = true
}

function onEmployeeChange() {
    const emp = employees.value.find(e => e.id === form.value.employeeId)
    if (emp) form.value.basicSalary = emp.salary || 0

    // Pre-populate from a pre-existing (e.g. auto-posted job card) record for this month
    const existing = existingPayrollForForm.value
    if (existing) {
        form.value.basicSalary = existing.basicSalary || emp?.salary || 0
        // HR's "allowances" field = non-job-card portion only
        const jcEarnings = existing.jobCardEarnings || 0
        form.value.allowances = Math.max(0, (existing.allowances || 0) - jcEarnings)
        form.value.aidsLevy = existing.aidsLevy || 0
        form.value.nssa = existing.nssa || 0
        form.value.zimdef = existing.zimdef || 0
        form.value.wcif = existing.wcif || 0
        form.value.paye = existing.paye || 0
        form.value.damagesDeduction = (existing as any).damagesDeduction || 0
        form.value.uniformDeduction = (existing as any).uniformDeduction || 0
        ;(form.value as any).jobCardEarnings = jcEarnings
    }
    runCalculations()
}

function runCalculations() {
    const gross = form.value.basicSalary + form.value.allowances + ((form.value as any).jobCardEarnings || 0)
    const results = calculatePayrollDeductions(gross)
    
    form.value.paye = results.paye
    form.value.aidsLevy = results.aidsLevy
    form.value.nssa = results.nssa
    form.value.zimdef = results.zimdef
    form.value.wcif = results.wcif
    
    toast.success('Automated deductions calculated')
}


async function generate() {
    if (!form.value.employeeId) return
    const emp = employees.value.find(e => e.id === form.value.employeeId)
    saving.value = true
    try {
        await hrStore.generatePayroll({
            ...form.value,
            deductions: totalDeductions.value,
            netPay: formNetPay.value,
            employeeName: emp?.fullName || '',
        } as any)
        showDialog.value = false
    } finally {
        saving.value = false
    }
}

function openPay(p: Payroll) {
    selectedPayroll.value = p
    payMethod.value = 'BANK'
    showPayDialog.value = true
}

async function markPaid() {
    if (!selectedPayroll.value) return
    saving.value = true
    try {
        await hrStore.markPayrollPaid(
            selectedPayroll.value.id!,
            payMethod.value,
            selectedPayroll.value.employeeName || '',
            selectedPayroll.value.netPay,
            selectedPayroll.value.month,
            selectedPayroll.value.year
        )
        showPayDialog.value = false
    } finally {
        saving.value = false
    }
}

const financeStore = useFinanceStore()

async function quickApprovePayroll(p: Payroll) {
    if (!p.ledgerEntryId) return
    if (!confirm(`Approve salary payment of $${fmt(p.netPay)} for ${p.employeeName}?`)) return
    
    saving.value = true
    toast.loading(`Approving payroll for ${p.employeeName}...`, { id: 'quick-approve' })
    try {
        await financeStore.processExpensePayment(
            p.ledgerEntryId,
            { name: user.value?.displayName || user.value?.email || 'Finance Admin', email: user.value?.email || '' },
            {
                paymentMethod: p.paymentMethod || 'SALARIES',
                ledgerAccount: p.paymentMethod || 'SALARIES',
                transactionDate: new Date().toISOString().slice(0, 10),
                referenceNumber: `PAYROLL-${p.month}-${p.year}`
            }
        )
        toast.success(`Successfully approved payroll for ${p.employeeName}`, { id: 'quick-approve' })
    } catch (err: any) {
        toast.error(err.message || 'Failed to approve payroll', { id: 'quick-approve' })
    } finally {
        saving.value = false
    }
}

function confirmStandardDelete(p: Payroll) {
    if (!confirm(`Are you sure you want to delete draft payroll for ${p.employeeName}?`)) return
    hrStore.deletePayroll(p.id!)
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December']

function fmt(n: number) {
    return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}

// Simple payslip print

async function downloadPayslip(p: Payroll) {
    const employee = employees.value.find(e => e.id === p.employeeId) || null
    const token = p.id || 'not-verified'
    
    let postings: any[] = []
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
        const rawPostings = docsSnap.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }))
        postings = await Promise.all(rawPostings.map(async (posting: any) => {
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
    } catch (e) {
        console.error('Failed to load postings breakdown for PDF download:', e)
    }
    
    await downloadPayslipPDF(
        p,
        employee,
        token,
        adminStore.appSettings,
        postings
    )
}

async function openBreakdown(p: Payroll) {
    selectedBreakdownPayroll.value = p
    showBreakdownDialog.value = true
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
        
        const rawPostings = docsSnap.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }))
        const resolvedPostings = await Promise.all(rawPostings.map(async (posting: any) => {
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
        
        breakdownPostings.value = resolvedPostings
    } catch (e) {
        console.error('Failed to load breakdown postings:', e)
    } finally {
        loadingBreakdown.value = false
    }
}

const openAdminDelete = (p: Payroll) => {
    selectedPayrollForAdminDelete.value = p
    isAdminDeleteOpen.value = true
}

const handleAdminDeleteConfirm = async () => {
    if (!selectedPayrollForAdminDelete.value) return
    const p = selectedPayrollForAdminDelete.value
    isAdminDeleteOpen.value = false
    isDeleting.value = true
    
    toast.loading('ADMIN: Force deleting payroll & ledger entry...', { id: 'admin-delete' })
    try {
        await hrStore.deletePayroll(p.id!)
        toast.success('Admin: Payroll Deleted Successfully', { id: 'admin-delete' })
    } catch (err: any) {
        toast.error('Admin Delete Failed', { id: 'admin-delete', description: err.message })
    } finally {
        isDeleting.value = false
        selectedPayrollForAdminDelete.value = null
    }
}
</script>

<template>
    <div class="space-y-5">
        <HRNav />
        <div class="flex items-center justify-between gap-4 flex-wrap">
            <div>
                <h1 class="text-2xl font-bold tracking-tight flex items-center gap-2">
                    <Wallet class="size-6" /> Payroll
                </h1>
                <p class="text-muted-foreground text-sm mt-1">Monthly salary processing</p>
            </div>
            <div class="flex items-center gap-2">
                <Button v-if="canManage" variant="outline" @click="showAdvanceModal = true" class="gap-2 border-brand-primary/20 text-brand-primary">
                    <DollarSign class="size-4" /> Record Advance
                </Button>
                <Button v-if="canManage" @click="openGenerate" class="gap-2">
                    <PlusCircle class="size-4" /> Generate Payroll
                </Button>
            </div>
        </div>

        <!-- Advances Alert -->
        <div v-if="activeAdvances.length > 0" 
             @click="showAdvancesListModal = true"
             class="p-3 rounded-lg border border-brand-primary/20 bg-brand-primary/5 flex items-center justify-between animate-in slide-in-from-top duration-500 cursor-pointer hover:bg-brand-primary/10 transition-colors">
            <div class="flex items-center gap-3">
                <div class="bg-brand-primary/20 p-1.5 rounded-full">
                    <DollarSign class="size-4 text-brand-primary" />
                </div>
                <div>
                    <p class="text-xs font-bold">Active Salary Advances</p>
                    <p class="text-[10px] text-muted-foreground">
                        {{ activeAdvances.length }} pending advances will be automatically deducted from next payslips.
                    </p>
                </div>
            </div>
            <div class="flex gap-2 font-mono font-bold text-sm text-brand-primary">
                ${{ fmt(activeAdvancesTotal) }}
            </div>
        </div>

        <!-- Period Selector -->
        <div class="flex gap-3 flex-wrap">
            <Select v-model.number="filterMonth" class="w-36">
                <SelectTrigger class="w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                    <SelectItem v-for="(m, i) in MONTHS" :key="i" :value="i + 1">{{ m }}</SelectItem>
                </SelectContent>
            </Select>
            <Input v-model.number="filterYear" type="number" class="w-24" />
        </div>

        <!-- Summary Cards -->
        <div class="grid grid-cols-3 gap-4">
            <Card>
                <CardContent class="p-4">
                    <p class="text-lg font-bold">${{ fmt(totalNetPay) }}</p>
                    <p class="text-xs text-muted-foreground">Total Net Pay</p>
                </CardContent>
            </Card>
            <Card>
                <CardContent class="p-4">
                    <p class="text-lg font-bold text-emerald-500">${{ fmt(totalPaid) }}</p>
                    <p class="text-xs text-muted-foreground">Paid</p>
                </CardContent>
            </Card>
            <Card>
                <CardContent class="p-4">
                    <p class="text-lg font-bold text-yellow-500">${{ fmt(totalUnpaid) }}</p>
                    <p class="text-xs text-muted-foreground">Outstanding</p>
                </CardContent>
            </Card>
        </div>

        <!-- Payroll Table -->
        <Card>
            <CardContent class="p-0">
                <div class="overflow-x-auto">
                    <table class="w-full text-sm">
                        <thead class="border-b bg-muted/40">
                            <tr>
                                <th class="text-left px-4 py-3 font-semibold text-xs uppercase">Employee</th>
                                <th class="text-right px-4 py-3 font-semibold text-xs uppercase hidden md:table-cell">Basic</th>
                                <th class="text-right px-4 py-3 font-semibold text-xs uppercase hidden md:table-cell">Allowances</th>
                                <th class="text-right px-4 py-3 font-semibold text-xs uppercase hidden lg:table-cell">Job Earnings</th>
                                <th class="text-right px-4 py-3 font-semibold text-xs uppercase hidden md:table-cell">Deductions</th>
                                <th class="text-right px-4 py-3 font-semibold text-xs uppercase">Net Pay</th>
                                <th class="text-center px-4 py-3 font-semibold text-xs uppercase">Status</th>
                                <th class="text-right px-4 py-3 font-semibold text-xs uppercase">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-if="filtered.length === 0">
                                <td colspan="8" class="py-10 text-center text-muted-foreground italic text-sm">
                                    No payroll records for {{ MONTHS[filterMonth - 1] }} {{ filterYear }}
                                </td>
                            </tr>
                            <tr v-for="p in filtered" :key="p.id" class="border-b last:border-0 hover:bg-muted/20 group">
                                <td class="px-4 py-3 font-medium cursor-pointer hover:underline text-brand-primary" @click="openBreakdown(p)">{{ p.employeeName }}</td>
                                <td class="px-4 py-3 text-right font-mono hidden md:table-cell">${{ fmt(p.basicSalary) }}</td>
                                <td class="px-4 py-3 text-right font-mono text-emerald-600 hidden md:table-cell">+${{ fmt(p.allowances) }}</td>
                                <td class="px-4 py-3 text-right hidden lg:table-cell cursor-pointer" @click="openBreakdown(p)">
                                    <Badge v-if="p.jobCardEarnings && p.jobCardEarnings > 0"
                                        variant="outline" class="font-mono text-amber-600 border-amber-400/40 bg-amber-50 dark:bg-amber-950/20 hover:bg-amber-100 transition-colors">
                                        +${{ fmt(p.jobCardEarnings) }}
                                    </Badge>
                                    <span v-else class="text-muted-foreground/40 text-xs">—</span>
                                </td>
                                <td class="px-4 py-3 text-right font-mono text-red-500 hidden md:table-cell">-${{ fmt(p.deductions) }}</td>
                                <td class="px-4 py-3 text-right font-mono font-bold">${{ fmt(p.netPay) }}</td>
                                <td class="px-4 py-3 text-center">
                                    <span v-if="p.status === 'Paid'" class="text-xs px-2 py-0.5 rounded-full border bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
                                        Paid
                                    </span>
                                    <span v-else-if="p.ledgerEntryId" class="text-xs px-2 py-0.5 rounded-full border bg-amber-500/10 text-amber-600 border-amber-500/20">
                                        Pending Approval
                                    </span>
                                    <span v-else class="text-xs px-2 py-0.5 rounded-full border bg-yellow-500/10 text-yellow-600 border-yellow-500/20">
                                        Unpaid
                                    </span>
                                </td>
                                <td class="px-4 py-3 text-right">
                                    <div class="flex justify-end gap-1">
                                        <Button v-if="canManage && p.status === 'Unpaid' && !p.ledgerEntryId" variant="ghost" size="icon"
                                            class="h-7 w-7 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/30" @click="openPay(p)" title="Submit Payout for Approval">
                                            <CheckCircle class="size-3.5" />
                                        </Button>
                                        <Button v-if="canManage && p.status === 'Unpaid' && p.ledgerEntryId" variant="ghost" size="icon"
                                            class="h-7 w-7 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 font-bold" @click="quickApprovePayroll(p)" title="Quick Approve Payout">
                                            <DollarSign class="size-3.5" />
                                        </Button>
                                        <Button v-if="canManage && p.status === 'Unpaid' && !p.ledgerEntryId" variant="ghost" size="icon"
                                            title="Edit Payroll"
                                            class="h-7 w-7 hover:text-amber-500" @click="openEdit(p)">
                                            <Pencil class="size-3.5" />
                                        </Button>
                                        <Button variant="ghost" size="icon" class="h-7 w-7 hover:text-primary"
                                            @click="downloadPayslip(p)" title="Download Payslip PDF">
                                            <FileDown class="size-3.5" />
                                        </Button>
                                        <Button v-if="canManage && p.status === 'Unpaid' && !p.ledgerEntryId" variant="ghost" size="icon"
                                            class="h-7 w-7 hover:text-destructive" title="Delete Draft"
                                            @click="confirmStandardDelete(p)">
                                            <Trash2 class="size-3.5" />
                                        </Button>
                                        <Button v-if="isSuperAdmin && (p.status !== 'Unpaid' || !!p.ledgerEntryId)" variant="ghost" size="icon"
                                            title="Force Delete (Admin)"
                                            class="h-7 w-7 text-destructive border border-destructive/20 bg-destructive/5"
                                            @click="openAdminDelete(p)">
                                            <Trash2 v-if="!isDeleting || selectedPayrollForAdminDelete?.id !== p.id" class="size-3.5" />
                                            <span v-else class="size-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                        </Button>
                                    </div>
                                </td>
                            </tr>
                        </tbody>
                        <tfoot v-if="filtered.length > 0" class="border-t bg-muted/20">
                            <tr>
                                <td class="px-4 py-2 font-semibold text-xs uppercase">Total</td>
                                <td colspan="4" class="hidden md:table-cell"></td>
                                <td class="px-4 py-2 text-right font-mono font-bold">${{ fmt(totalNetPay) }}</td>
                                <td colspan="2"></td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </CardContent>
        </Card>

        <!-- Generate Dialog -->
        <Dialog v-model:open="showDialog">
            <DialogContent class="sm:max-w-[900px] w-[95vw]">
                <DialogHeader>
                    <DialogTitle>{{ selectedPayrollId ? 'Edit Payroll Entry' : 'Generate Payroll Entry' }}</DialogTitle>
                </DialogHeader>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-6 py-2">
                    <!-- Left Column: Earnings & Period -->
                    <div class="space-y-4">
                        <div class="space-y-1">
                            <label class="text-xs font-medium uppercase tracking-wide text-muted-foreground">Period & Employee</label>
                            <div class="space-y-3 p-3 rounded-lg border border-border/40 bg-muted/5">
                                <div class="space-y-1">
                                    <label class="text-[10px] font-semibold">Employee *</label>
                                    <Select v-model="form.employeeId" @update:modelValue="onEmployeeChange">
                                        <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem v-for="e in employees" :key="e.id" :value="e.id!">{{ e.fullName }}</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div class="grid grid-cols-2 gap-3">
                                    <div class="space-y-1">
                                        <label class="text-[10px] font-semibold">Month</label>
                                        <Select v-model.number="form.month">
                                            <SelectTrigger><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem v-for="(m, i) in MONTHS" :key="i" :value="i + 1">{{ m }}</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div class="space-y-1">
                                        <label class="text-[10px] font-semibold">Year</label>
                                        <Input v-model.number="form.year" type="number" />
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div class="space-y-1">
                            <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Earnings</label>
                            <div class="space-y-3 p-3 rounded-lg border border-border/40 bg-muted/5">
                                <div class="space-y-1">
                                    <label class="text-[10px] font-semibold">Basic Salary ($)</label>
                                    <Input v-model.number="form.basicSalary" type="number" class="font-mono" />
                                </div>
                                <!-- Job Card Earnings banner -->
                                <div v-if="(existingPayrollForForm?.jobCardEarnings || 0) > 0"
                                    class="flex items-center justify-between rounded-lg border border-amber-400/30 bg-amber-50 dark:bg-amber-950/20 px-3 py-2">
                                    <div>
                                        <p class="text-[10px] font-semibold text-amber-700 dark:text-amber-400 uppercase">Job Card Earnings</p>
                                        <p class="text-[9px] text-muted-foreground">Auto-posted from system</p>
                                    </div>
                                    <span class="font-mono font-bold text-amber-700 dark:text-amber-400 text-sm">
                                        +${{ fmt(existingPayrollForForm!.jobCardEarnings!) }}
                                    </span>
                                </div>
                                
                                <!-- Salary Advance Deduction Banner -->
                                <div v-if="pendingAdvanceAmount > 0"
                                    class="flex items-center justify-between rounded-lg border border-red-400/30 bg-red-50 dark:bg-red-950/20 px-3 py-2">
                                    <div>
                                        <p class="text-[10px] font-semibold text-red-700 dark:text-red-400 uppercase">Salary Advance Deduction</p>
                                        <p class="text-[9px] text-muted-foreground">Pending repayment</p>
                                    </div>
                                    <span class="font-mono font-bold text-red-700 dark:text-red-400 text-sm">
                                        -${{ fmt(pendingAdvanceAmount) }}
                                    </span>
                                </div>
                                <div class="space-y-1">
                                    <div class="flex justify-between items-center">
                                        <label class="text-[10px] font-semibold">Allowances ($)</label>
                                        <Button variant="ghost" size="sm" class="h-5 text-[9px] gap-1 text-emerald-600 px-1" @click="runCalculations">
                                            <Calculator class="size-2.5" /> Auto-Calc
                                        </Button>
                                    </div>
                                    <Input v-model.number="form.allowances" type="number" class="font-mono" />
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Right Column: Deductions & Summary -->
                    <div class="space-y-4">
                        <div class="space-y-1">
                            <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Deductions</label>
                            <div class="rounded-lg border border-border/60 p-4 space-y-4 bg-muted/20">
                                <!-- Statutory Deductions -->
                                <div class="space-y-2">
                                    <h3 class="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">Statutory</h3>
                                    <div class="grid grid-cols-2 gap-x-4 gap-y-3">
                                        <div class="space-y-1">
                                            <label class="text-[10px] font-semibold">AIDS Levy ($)</label>
                                            <Input v-model.number="form.aidsLevy" type="number" min="0" class="font-mono" />
                                        </div>
                                        <div class="space-y-1">
                                            <label class="text-[10px] font-semibold">NSSA ($)</label>
                                            <Input v-model.number="form.nssa" type="number" min="0" class="font-mono" />
                                        </div>
                                        <div class="space-y-1">
                                            <label class="text-[10px] font-semibold">ZIMDEF ($)</label>
                                            <Input v-model.number="form.zimdef" type="number" min="0" class="font-mono" />
                                        </div>
                                        <div class="space-y-1">
                                            <label class="text-[10px] font-semibold">WCIF ($)</label>
                                            <Input v-model.number="form.wcif" type="number" min="0" class="font-mono" />
                                        </div>
                                        <div class="space-y-1 col-span-2">
                                            <label class="text-[10px] font-semibold">P.A.Y.E ($)</label>
                                            <Input v-model.number="form.paye" type="number" min="0" class="font-mono" />
                                        </div>
                                    </div>
                                </div>

                                <!-- Non-Statutory Deductions -->
                                <div class="space-y-2 pt-2 border-t border-border/40">
                                    <h3 class="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">Non-Statutory</h3>
                                    <div class="grid grid-cols-2 gap-x-4 gap-y-3">
                                        <div class="space-y-1">
                                            <label class="text-[10px] font-semibold">Damages ($)</label>
                                            <Input v-model.number="form.damagesDeduction" type="number" min="0" class="font-mono" />
                                        </div>
                                        <div class="space-y-1">
                                            <label class="text-[10px] font-semibold">Uniform ($)</label>
                                            <Input v-model.number="form.uniformDeduction" type="number" min="0" class="font-mono" />
                                        </div>
                                    </div>
                                </div>

                                <div class="flex justify-between items-center pt-2 border-t border-border/40">
                                    <span class="text-[10px] uppercase font-bold text-muted-foreground">Total Deductions</span>
                                    <span class="font-mono font-bold text-red-500">-${{ fmt(totalDeductions) }}</span>
                                </div>
                            </div>
                        </div>

                        <div class="p-4 rounded-xl bg-primary/5 border border-primary/10 flex flex-col gap-2 mt-auto">
                            <div class="flex justify-between items-center">
                                <span class="text-xs font-bold uppercase tracking-wider">Net Salary</span>
                                <span class="font-mono font-bold text-2xl text-primary">${{ fmt(formNetPay) }}</span>
                            </div>
                            <div v-if="(existingPayrollForForm?.jobCardEarnings || 0) > 0"
                                class="flex justify-between text-[10px] text-muted-foreground italic">
                                <span>Includes Job Card portion:</span>
                                <span class="font-mono text-amber-600">+${{ fmt(existingPayrollForForm!.jobCardEarnings!) }}</span>
                            </div>
                        </div>
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" @click="showDialog = false">Cancel</Button>
                    <Button @click="generate" :disabled="saving || !form.employeeId">
                        {{ saving ? (selectedPayrollId ? 'Updating...' : 'Generating...') : (selectedPayrollId ? 'Update' : 'Generate') }}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>

        <!-- Mark Paid Dialog -->
        <Dialog v-model:open="showPayDialog">
            <DialogContent class="w-[95vw] max-w-none">
                <DialogHeader>
                    <DialogTitle>Submit Payout for Approval</DialogTitle>
                </DialogHeader>
                <div class="space-y-4 py-2">
                    <p class="text-sm text-muted-foreground">
                        Submitting payout for <strong>{{ selectedPayroll?.employeeName }}</strong> — Net Pay:
                        <strong class="font-mono">${{ fmt(selectedPayroll?.netPay || 0) }}</strong>
                    </p>
                    <p class="text-xs text-muted-foreground">This will submit a Salaries & Wages expense request for Accountant and Manager approval before affecting the ledger.</p>
                    <div class="space-y-1">
                        <label class="text-xs font-medium">Payment Method</label>
                        <Select v-model="payMethod">
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="BANK">Bank</SelectItem>
                                <SelectItem value="CASH">Cash</SelectItem>
                                <SelectItem value="ECOCASH">EcoCash</SelectItem>
                                <SelectItem value="SALARIES">Salaries Account</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" @click="showPayDialog = false">Cancel</Button>
                    <Button @click="markPaid" :disabled="saving" class="bg-emerald-600 hover:bg-emerald-700">
                        {{ saving ? 'Submitting…' : 'Submit for Approval' }}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>

        <!-- Detailed Breakdown Dialog -->
        <Dialog v-model:open="showBreakdownDialog">
            <DialogContent class="w-[95vw] max-w-md">
                <DialogHeader>
                    <DialogTitle>Job Earnings Breakdown</DialogTitle>
                    <p class="text-xs text-muted-foreground leading-relaxed mt-1">
                        Detailed staff rates applied for <strong>{{ selectedBreakdownPayroll?.employeeName }}</strong> on {{ MONTHS[(selectedBreakdownPayroll?.month || 1) - 1] }} {{ selectedBreakdownPayroll?.year }}.
                    </p>
                </DialogHeader>
                
                <div class="space-y-3 py-4 max-h-[50vh] overflow-y-auto pr-1">
                    <div v-if="loadingBreakdown" class="flex flex-col items-center justify-center py-6">
                        <span class="size-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                        <p class="text-xs text-muted-foreground mt-2">Loading detailed staff rates...</p>
                    </div>
                    <div v-else-if="breakdownPostings.length === 0" class="text-center py-6 text-muted-foreground italic text-xs">
                        No individual staff rate postings found for this period.
                    </div>
                    <div v-else class="space-y-2">
                        <div v-for="posting in breakdownPostings" :key="posting.id" class="p-3 border rounded-lg flex justify-between items-center bg-muted/10">
                            <div class="space-y-0.5">
                                <p class="text-xs font-bold text-foreground">Jobcard: {{ posting.jobNumber }}</p>
                                <p v-if="posting.jobCardName" class="text-[10px] text-brand-primary font-medium mt-0.5">{{ posting.jobCardName }}</p>
                                <p class="text-[10px] text-muted-foreground mt-0.5">Date: {{ new Date(posting.createdAt?.seconds * 1000 || posting.postedAt?.seconds * 1000 || Date.now()).toLocaleDateString() }}</p>
                            </div>
                            <span class="font-mono font-bold text-sm text-amber-600">+${{ fmt(posting.amount) }}</span>
                        </div>
                    </div>
                </div>
                
                <DialogFooter>
                    <Button @click="showBreakdownDialog = false">Close</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    </div>

    <!-- Admin Confirmation Dialog -->
    <AdminDeleteDialog
        v-if="selectedPayrollForAdminDelete"
        v-model:open="isAdminDeleteOpen"
        title="Admin Force Delete"
        :description="`You are about to PERMANENTLY delete payroll for ${selectedPayrollForAdminDelete.employeeName}. This will also remove any linked operational expense entries.`"
        :target-id="String(selectedPayrollForAdminDelete.id).substring(0, 8).toUpperCase()"
        :loading="isDeleting"
        @confirm="handleAdminDeleteConfirm"
    />

    <SalaryAdvanceModal v-model:open="showAdvanceModal" />
    <SalaryAdvancesListModal v-model:open="showAdvancesListModal" />
</template>
