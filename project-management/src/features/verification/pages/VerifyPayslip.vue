<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useVerificationStore } from '../store/verificationStore'
import { db } from '@/lib/firebase'
import { doc, getDoc } from 'firebase/firestore'
import {
    CheckCircle2, XCircle, Loader2, ShieldCheck, ShieldX,
    QrCode, User, Calendar, DollarSign, Building, Briefcase,
    FileText, AlertTriangle
} from 'lucide-vue-next'
import type { Payroll } from '@/features/hr/types'

const route = useRoute()
const verificationStore = useVerificationStore()

// ── State ────────────────────────────────────────────────────────────────

const token = computed(() => route.params.token as string)
const loading = ref(true)
const error = ref<string | null>(null)
const verification = ref<any>(null)
const payroll = ref<Payroll | null>(null)
const employee = ref<any>(null)

// ── Computed ─────────────────────────────────────────────────────────────

const isValid = computed(() =>
    verification.value !== null && !verification.value.isVoid
)

const periodText = computed(() => {
    if (!payroll.value) return 'N/A'
    const months = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
    ]
    return `${months[(payroll.value.month || 1) - 1]} ${payroll.value.year}`
})

const formattedAmount = computed(() => {
    if (!payroll.value?.netPay) return 'N/A'
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2
    }).format(payroll.value.netPay)
})

// ── Lifecycle ─────────────────────────────────────────────────────────────

onMounted(async () => {
    loading.value = true
    try {
        // Fetch verification record
        const ver = await verificationStore.fetchVerificationByToken(token.value)
        if (!ver) {
            error.value = 'INVALID'
            loading.value = false
            return
        }
        verification.value = ver

        // Log the scan
        await verificationStore.logScan(token.value)

        // Fetch payroll data
        if (ver.docId) {
            const payrollRef = doc(db, 'payroll', ver.docId)
            const payrollSnap = await getDoc(payrollRef)
            if (payrollSnap.exists()) {
                payroll.value = { id: payrollSnap.id, ...payrollSnap.data() } as Payroll

                // Fetch employee data if available
                if (payroll.value.employeeId) {
                    const empRef = doc(db, 'employees', payroll.value.employeeId)
                    const empSnap = await getDoc(empRef)
                    if (empSnap.exists()) {
                        employee.value = { id: empSnap.id, ...empSnap.data() }
                    }
                }
            }
        }
    } catch (e: any) {
        error.value = 'ERROR'
    } finally {
        loading.value = false
    }
})

// ── Helpers ───────────────────────────────────────────────────────────────

function formatCurrency(amount: number | undefined): string {
    if (amount === undefined || amount === null) return '$0.00'
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2
    }).format(amount)
}

function toDate(ts: any): string {
    if (!ts) return 'N/A'
    if (ts.toDate) return ts.toDate().toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: 'numeric' })
    return new Date(ts).toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: 'numeric' })
}
</script>

<template>
    <!-- Standalone layout — no AppLayout wrapper -->
    <div class="min-h-screen bg-gray-50 font-sans">

        <!-- Header bar -->
        <header class="bg-white border-b shadow-sm sticky top-0 z-50">
            <div class="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
                <div class="flex items-center gap-2">
                    <QrCode class="size-5 text-orange-500" />
                    <span class="font-bold text-gray-900 text-sm tracking-tight">
                        <span class="text-orange-500">INCAPTTA</span><span class="text-green-600">PRO</span>
                    </span>
                </div>
                <span class="text-xs text-gray-400 font-medium uppercase tracking-widest">Payslip Verification</span>
            </div>
        </header>

        <main class="max-w-2xl mx-auto px-4 py-6 space-y-4">

            <!-- Loading -->
            <div v-if="loading" class="flex flex-col items-center justify-center py-20 gap-3">
                <Loader2 class="size-8 text-orange-500 animate-spin" />
                <p class="text-sm text-gray-500">Verifying payslip…</p>
            </div>

            <!-- Error: invalid token -->
            <template v-else-if="error === 'INVALID' || !verification">
                <div class="bg-red-50 border border-red-200 rounded-2xl p-6 text-center space-y-3">
                    <ShieldX class="size-12 text-red-400 mx-auto" />
                    <h2 class="text-xl font-bold text-red-700">Invalid Payslip</h2>
                    <p class="text-sm text-red-600">
                        This QR code is not linked to any valid payslip in the system.<br>
                        The payslip may have been voided or the QR code is invalid.
                    </p>
                    <div class="inline-flex items-center gap-1.5 bg-red-100 text-red-700 text-xs font-bold px-3 py-1.5 rounded-full border border-red-200 uppercase tracking-widest">
                        <XCircle class="size-3.5" />
                        INVALID / VOID
                    </div>
                </div>
            </template>

            <!-- Error: fetch error -->
            <template v-else-if="error === 'ERROR'">
                <div class="bg-amber-50 border border-amber-200 rounded-2xl p-6 text-center space-y-2">
                    <AlertTriangle class="size-10 text-amber-400 mx-auto" />
                    <h2 class="text-lg font-bold text-amber-700">Verification Unavailable</h2>
                    <p class="text-sm text-amber-600">Unable to verify payslip at this time. Please try again.</p>
                </div>
            </template>

            <!-- Voided payslip -->
            <template v-else-if="verification.isVoid">
                <div class="bg-slate-50 border border-slate-200 rounded-2xl p-6 text-center space-y-3">
                    <ShieldX class="size-12 text-slate-400 mx-auto" />
                    <h2 class="text-xl font-bold text-slate-700">Voided Payslip</h2>
                    <p class="text-sm text-slate-500">This payslip has been voided and is no longer valid.</p>
                    <div class="inline-flex items-center gap-1.5 bg-slate-100 text-slate-600 text-xs font-bold px-3 py-1.5 rounded-full border border-slate-200 uppercase tracking-widest">
                        <XCircle class="size-3.5" />
                        VOID DOCUMENT
                    </div>
                </div>
            </template>

            <!-- Valid payslip -->
            <template v-else>

                <!-- Valid badge -->
                <div class="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex items-center gap-3">
                    <ShieldCheck class="size-8 text-emerald-500 shrink-0" />
                    <div>
                        <div class="inline-flex items-center gap-1.5 bg-emerald-100 text-emerald-800 text-xs font-bold px-2.5 py-1 rounded-full border border-emerald-200 uppercase tracking-widest mb-1">
                            <CheckCircle2 class="size-3" />
                            VERIFIED PAYSLIP
                        </div>
                        <p class="text-xs text-emerald-600">
                            This payslip is authentic and verified in the Incaptta Pro system.
                        </p>
                    </div>
                </div>

                <!-- Payslip details card -->
                <div class="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
                    <div class="bg-gradient-to-r from-orange-500 to-green-500 px-5 py-3 flex items-center gap-2">
                        <FileText class="size-4 text-white" />
                        <h2 class="text-sm font-bold text-white uppercase tracking-widest">Payslip Details</h2>
                    </div>

                    <!-- Employee Information -->
                    <div class="divide-y divide-gray-100">
                        <div class="px-5 py-4 bg-gray-50/50">
                            <h3 class="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">Employee Information</h3>
                            <div class="grid grid-cols-2 gap-4">
                                <div class="flex items-start gap-2">
                                    <User class="size-4 text-gray-400 mt-0.5 shrink-0" />
                                    <div>
                                        <p class="text-xs text-gray-500">Name</p>
                                        <p class="text-sm font-semibold text-gray-900">{{ payroll?.employeeName || 'N/A' }}</p>
                                    </div>
                                </div>
                                <div class="flex items-start gap-2">
                                    <Building class="size-4 text-gray-400 mt-0.5 shrink-0" />
                                    <div>
                                        <p class="text-xs text-gray-500">Department</p>
                                        <p class="text-sm text-gray-700">{{ employee?.department || 'N/A' }}</p>
                                    </div>
                                </div>
                                <div class="flex items-start gap-2">
                                    <Briefcase class="size-4 text-gray-400 mt-0.5 shrink-0" />
                                    <div>
                                        <p class="text-xs text-gray-500">Job Title</p>
                                        <p class="text-sm text-gray-700">{{ employee?.jobTitle || 'N/A' }}</p>
                                    </div>
                                </div>
                                <div class="flex items-start gap-2">
                                    <Calendar class="size-4 text-gray-400 mt-0.5 shrink-0" />
                                    <div>
                                        <p class="text-xs text-gray-500">Pay Period</p>
                                        <p class="text-sm text-gray-700">{{ periodText }}</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Earnings -->
                        <div class="px-5 py-4">
                            <h3 class="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">Earnings</h3>
                            <div class="space-y-2">
                                <div class="flex justify-between items-center">
                                    <span class="text-sm text-gray-600">Basic Salary</span>
                                    <span class="text-sm font-mono font-medium text-gray-900">{{ formatCurrency(payroll?.basicSalary) }}</span>
                                </div>
                                <div class="flex justify-between items-center">
                                    <span class="text-sm text-gray-600">Allowances</span>
                                    <span class="text-sm font-mono font-medium text-emerald-600">+{{ formatCurrency(payroll?.allowances) }}</span>
                                </div>
                            </div>
                        </div>

                        <!-- Deductions -->
                        <div v-if="payroll?.deductions && payroll.deductions > 0" class="px-5 py-4">
                            <h3 class="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">Deductions</h3>
                            <div class="space-y-2">
                                <div v-if="payroll?.aidsLevy" class="flex justify-between items-center">
                                    <span class="text-sm text-gray-600">AIDS Levy</span>
                                    <span class="text-sm font-mono font-medium text-red-500">-{{ formatCurrency(payroll.aidsLevy) }}</span>
                                </div>
                                <div v-if="payroll?.nssa" class="flex justify-between items-center">
                                    <span class="text-sm text-gray-600">NSSA</span>
                                    <span class="text-sm font-mono font-medium text-red-500">-{{ formatCurrency(payroll.nssa) }}</span>
                                </div>
                                <div v-if="payroll?.zimdef" class="flex justify-between items-center">
                                    <span class="text-sm text-gray-600">ZIMDEF</span>
                                    <span class="text-sm font-mono font-medium text-red-500">-{{ formatCurrency(payroll.zimdef) }}</span>
                                </div>
                                <div v-if="payroll?.wcif" class="flex justify-between items-center">
                                    <span class="text-sm text-gray-600">WCIF</span>
                                    <span class="text-sm font-mono font-medium text-red-500">-{{ formatCurrency(payroll.wcif) }}</span>
                                </div>
                                <div v-if="payroll?.paye" class="flex justify-between items-center">
                                    <span class="text-sm text-gray-600">P.A.Y.E</span>
                                    <span class="text-sm font-mono font-medium text-red-500">-{{ formatCurrency(payroll.paye) }}</span>
                                </div>
                            </div>
                        </div>

                        <!-- Net Pay -->
                        <div class="px-5 py-4 bg-gradient-to-r from-emerald-50 to-green-50">
                            <div class="flex justify-between items-center">
                                <div class="flex items-center gap-2">
                                    <DollarSign class="size-5 text-emerald-600" />
                                    <span class="text-base font-bold text-emerald-800">NET PAY</span>
                                </div>
                                <span class="text-xl font-bold text-emerald-700 font-mono">{{ formattedAmount }}</span>
                            </div>
                        </div>

                        <!-- Payment Status -->
                        <div class="px-5 py-3">
                            <div class="flex items-start gap-3">
                                <span class="text-xs font-semibold text-gray-400 uppercase tracking-wide w-24 mt-0.5">Payment Status</span>
                                <span class="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full border"
                                    :class="payroll?.status === 'Paid'
                                        ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
                                        : 'bg-amber-100 text-amber-700 border-amber-200'">
                                    <CheckCircle2 v-if="payroll?.status === 'Paid'" class="size-3" />
                                    <span v-else class="size-3">○</span>
                                    {{ payroll?.status === 'Paid' ? 'PAID' : 'PENDING PAYMENT' }}
                                </span>
                            </div>
                        </div>

                        <!-- Document Reference -->
                        <div class="px-5 py-3 bg-gray-50">
                            <div class="flex items-start gap-3">
                                <span class="text-xs font-semibold text-gray-400 uppercase tracking-wide w-24 mt-0.5">Reference</span>
                                <span class="text-sm font-mono text-gray-600">{{ verification.docRef }}</span>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Note -->
                <div class="bg-blue-50 border border-blue-100 rounded-xl p-4 flex items-start gap-3">
                    <FileText class="size-5 text-blue-500 shrink-0 mt-0.5" />
                    <div>
                        <p class="text-sm font-semibold text-blue-800">What is this?</p>
                        <p class="text-xs text-blue-600 mt-1">
                            This is a secure verification page for payslips generated by Incaptta Pro HR system.
                            Employees can scan the QR code on their payslip to verify its authenticity and view their payment details.
                        </p>
                    </div>
                </div>

            </template>

        </main>

        <!-- Footer -->
        <footer class="text-center py-8 text-xs text-gray-400">
            Incaptta Pro · Payslip Verification System · {{ new Date().getFullYear() }}
        </footer>

    </div>
</template>
