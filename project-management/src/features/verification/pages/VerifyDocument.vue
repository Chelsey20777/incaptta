<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useVerificationStore, type DocVerification, type PaymentSubmission } from '../store/verificationStore'
import {
    CheckCircle2, XCircle, Clock, AlertTriangle, Upload, Loader2,
    ShieldCheck, ShieldX, FileText, CreditCard, QrCode, ChevronDown
} from 'lucide-vue-next'

const route = useRoute()
const store = useVerificationStore()

// ── State ────────────────────────────────────────────────────────────────

const token = computed(() => route.params.token as string)
const loading = ref(true)
const error = ref<string | null>(null)
const verification = ref<DocVerification | null>(null)
const expense = ref<any | null>(null)
const existingSubmissions = ref<PaymentSubmission[]>([])

// Form state
const showUploadForm = ref(false)
const uploading = ref(false)
const uploadSuccess = ref(false)
const uploadError = ref<string | null>(null)
const form = ref({
    payerName: '',
    amount: '',
    paymentMethod: 'CASH',
    referenceNumber: '',
    note: ''
})
const proofFile = ref<File | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)
const dragOver = ref(false)

// ── Computed ─────────────────────────────────────────────────────────────

const isValid = computed(() =>
    verification.value !== null && !verification.value.isVoid
)

const docStatus = computed(() => {
    if (!expense.value) return null
    const s = expense.value.status
    const map: Record<string, { label: string; color: string }> = {
        PENDING_ACCOUNTANT:  { label: 'Pending Accounting', color: 'amber' },
        APPROVED_ACCOUNTANT: { label: 'Pending Manager',    color: 'blue' },
        APPROVED_FOR_PAYMENT:{ label: 'Approved',           color: 'green' },
        REJECTED_ACCOUNTANT: { label: 'Rejected',           color: 'red' },
        REJECTED_MANAGER:    { label: 'Rejected',           color: 'red' },
        PAYMENT_PROCESSED:   { label: 'Payment Processed',  color: 'emerald' },
        APPROVED:            { label: 'Approved',           color: 'green' },
        VOID:                { label: 'Void',               color: 'slate' }
    }
    return map[s] || { label: s, color: 'slate' }
})

const paymentProofStatus = computed(() => {
    if (!expense.value) return null
    const s = expense.value.paymentProofStatus
    if (!s) return null
    const map: Record<string, { label: string; color: string }> = {
        PENDING_REVIEW: { label: 'Payment Submitted — Pending Review', color: 'amber' },
        CONFIRMED:      { label: 'Payment Confirmed',                  color: 'emerald' },
        REJECTED:       { label: 'Payment Proof Rejected',             color: 'red' }
    }
    return map[s] || null
})

const canSubmitProof = computed(() => {
    if (!isValid.value) return false
    if (!expense.value) return false
    const blockedStatuses = ['REJECTED_ACCOUNTANT', 'REJECTED_MANAGER', 'VOID']
    if (blockedStatuses.includes(expense.value.status)) return false
    if (expense.value.paymentProofStatus === 'CONFIRMED') return false
    if (expense.value.paymentProofStatus === 'PENDING_REVIEW') return false
    return true
})

const pendingSubmission = computed(() =>
    existingSubmissions.value.find(s => s.status === 'PENDING_REVIEW') || null
)

const formattedAmount = computed(() => {
    if (!expense.value?.amount) return 'N/A'
    return `$${Number(expense.value.amount).toLocaleString(undefined, {
        minimumFractionDigits: 2, maximumFractionDigits: 2
    })}`
})

// ── Lifecycle ─────────────────────────────────────────────────────────────

onMounted(async () => {
    loading.value = true
    try {
        const ver = await store.fetchVerificationByToken(token.value)
        if (!ver) {
            error.value = 'INVALID'
            loading.value = false
            return
        }
        verification.value = ver
        await store.logScan(token.value)

        const exp = await store.fetchExpenseByDocId(ver.docId)
        expense.value = exp

        existingSubmissions.value = await store.getSubmissionsForToken(token.value)
    } catch (e: any) {
        error.value = 'ERROR'
    } finally {
        loading.value = false
    }
})

// ── File handling ─────────────────────────────────────────────────────────

function onFileChange(e: Event) {
    const input = e.target as HTMLInputElement
    if (input.files?.[0]) setFile(input.files[0])
}

function onDrop(e: DragEvent) {
    dragOver.value = false
    const file = e.dataTransfer?.files?.[0]
    if (file) setFile(file)
}

function setFile(file: File) {
    const err = store.validateProofFile(file)
    if (err) { uploadError.value = err; return }
    proofFile.value = file
    uploadError.value = null
}

function formatBytes(b: number) {
    if (b < 1024) return `${b} B`
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`
    return `${(b / (1024 * 1024)).toFixed(1)} MB`
}

// ── Submit ────────────────────────────────────────────────────────────────

async function handleSubmit() {
    uploadError.value = null
    if (!proofFile.value) { uploadError.value = 'Please attach proof of payment.'; return }
    if (!form.value.payerName.trim()) { uploadError.value = 'Payer name is required.'; return }
    if (!form.value.amount || Number(form.value.amount) <= 0) { uploadError.value = 'Enter a valid amount.'; return }
    if (!form.value.referenceNumber.trim()) { uploadError.value = 'Reference/transaction number is required.'; return }
    if (!verification.value || !expense.value) return

    uploading.value = true
    try {
        await store.submitPaymentProof(
            token.value,
            verification.value.docId,
            verification.value.docRef,
            {
                payerName: form.value.payerName.trim(),
                amount: Number(form.value.amount),
                paymentMethod: form.value.paymentMethod,
                referenceNumber: form.value.referenceNumber.trim(),
                note: form.value.note.trim()
            },
            proofFile.value
        )
        uploadSuccess.value = true
        showUploadForm.value = false
        // Refresh expense to show updated status
        expense.value = await store.fetchExpenseByDocId(verification.value.docId)
        existingSubmissions.value = await store.getSubmissionsForToken(token.value)
    } catch (e: any) {
        uploadError.value = e.message || 'Upload failed. Please try again.'
    } finally {
        uploading.value = false
    }
}

// ── Helpers ───────────────────────────────────────────────────────────────

function statusBadgeClass(color: string) {
    const map: Record<string, string> = {
        amber:   'bg-amber-100 text-amber-800 border-amber-200',
        blue:    'bg-blue-100 text-blue-800 border-blue-200',
        green:   'bg-green-100 text-green-800 border-green-200',
        emerald: 'bg-emerald-100 text-emerald-800 border-emerald-200',
        red:     'bg-red-100 text-red-800 border-red-200',
        slate:   'bg-slate-100 text-slate-700 border-slate-200'
    }
    return map[color] || map.slate
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
                <span class="text-xs text-gray-400 font-medium uppercase tracking-widest">Document Verification</span>
            </div>
        </header>

        <main class="max-w-2xl mx-auto px-4 py-6 space-y-4">

            <!-- Loading -->
            <div v-if="loading" class="flex flex-col items-center justify-center py-20 gap-3">
                <Loader2 class="size-8 text-orange-500 animate-spin" />
                <p class="text-sm text-gray-500">Verifying document…</p>
            </div>

            <!-- Error: invalid token -->
            <template v-else-if="error === 'INVALID' || !verification">
                <div class="bg-red-50 border border-red-200 rounded-2xl p-6 text-center space-y-3">
                    <ShieldX class="size-12 text-red-400 mx-auto" />
                    <h2 class="text-xl font-bold text-red-700">Invalid Document</h2>
                    <p class="text-sm text-red-600">
                        This QR code is not linked to any active document in the system.<br>
                        The document may have been voided or the QR code is invalid.
                    </p>
                    <div class="inline-flex items-center gap-1.5 bg-red-100 text-red-700 text-xs font-bold px-3 py-1.5 rounded-full border border-red-200 uppercase tracking-widest">
                        <XCircle class="size-3.5" />
                        INVALID / VOID DOCUMENT
                    </div>
                </div>
            </template>

            <!-- Error: fetch error -->
            <template v-else-if="error === 'ERROR'">
                <div class="bg-amber-50 border border-amber-200 rounded-2xl p-6 text-center space-y-2">
                    <AlertTriangle class="size-10 text-amber-400 mx-auto" />
                    <h2 class="text-lg font-bold text-amber-700">Verification Unavailable</h2>
                    <p class="text-sm text-amber-600">Unable to verify document at this time. Please try again.</p>
                </div>
            </template>

            <!-- Voided document -->
            <template v-else-if="verification.isVoid">
                <div class="bg-slate-50 border border-slate-200 rounded-2xl p-6 text-center space-y-3">
                    <ShieldX class="size-12 text-slate-400 mx-auto" />
                    <h2 class="text-xl font-bold text-slate-700">Voided Document</h2>
                    <p class="text-sm text-slate-500">This document has been voided and is no longer valid.</p>
                    <div class="inline-flex items-center gap-1.5 bg-slate-100 text-slate-600 text-xs font-bold px-3 py-1.5 rounded-full border border-slate-200 uppercase tracking-widest">
                        <XCircle class="size-3.5" />
                        VOID DOCUMENT
                    </div>
                </div>
            </template>

            <!-- Valid document -->
            <template v-else>

                <!-- Valid badge -->
                <div class="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex items-center gap-3">
                    <ShieldCheck class="size-8 text-emerald-500 shrink-0" />
                    <div>
                        <div class="inline-flex items-center gap-1.5 bg-emerald-100 text-emerald-800 text-xs font-bold px-2.5 py-1 rounded-full border border-emerald-200 uppercase tracking-widest mb-1">
                            <CheckCircle2 class="size-3" />
                            VALID DOCUMENT
                        </div>
                        <p class="text-xs text-emerald-600">
                            This document is active and verified in the Incaptta Pro system.
                        </p>
                    </div>
                </div>

                <!-- Document details card -->
                <div class="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
                    <div class="bg-orange-500 px-5 py-3 flex items-center gap-2">
                        <FileText class="size-4 text-white" />
                        <h2 class="text-sm font-bold text-white uppercase tracking-widest">Document Details</h2>
                    </div>
                    <div class="divide-y divide-gray-100">
                        <div class="flex items-start px-5 py-3 gap-3">
                            <span class="text-xs font-semibold text-gray-400 uppercase tracking-wide w-32 shrink-0 mt-0.5">Reference</span>
                            <span class="text-sm font-bold text-gray-900">{{ verification.docRef }}</span>
                        </div>
                        <div class="flex items-start px-5 py-3 gap-3">
                            <span class="text-xs font-semibold text-gray-400 uppercase tracking-wide w-32 shrink-0 mt-0.5">Document Type</span>
                            <span class="text-sm text-gray-700">{{ verification.docType }}</span>
                        </div>
                        <div class="flex items-start px-5 py-3 gap-3">
                            <span class="text-xs font-semibold text-gray-400 uppercase tracking-wide w-32 shrink-0 mt-0.5">Title</span>
                            <span class="text-sm text-gray-700">{{ expense?.title || expense?.description || verification.docTitle || 'N/A' }}</span>
                        </div>
                        <div class="flex items-start px-5 py-3 gap-3">
                            <span class="text-xs font-semibold text-gray-400 uppercase tracking-wide w-32 shrink-0 mt-0.5">Issue Date</span>
                            <span class="text-sm text-gray-700">{{ toDate(expense?.createdAt || verification.createdAt) }}</span>
                        </div>
                        <div class="flex items-start px-5 py-3 gap-3">
                            <span class="text-xs font-semibold text-gray-400 uppercase tracking-wide w-32 shrink-0 mt-0.5">Amount</span>
                            <span class="text-sm font-bold text-gray-900">{{ formattedAmount }}</span>
                        </div>
                        <div class="flex items-start px-5 py-3 gap-3">
                            <span class="text-xs font-semibold text-gray-400 uppercase tracking-wide w-32 shrink-0 mt-0.5">Department</span>
                            <span class="text-sm text-gray-700">{{ expense?.department || 'N/A' }}</span>
                        </div>
                        <div class="flex items-start px-5 py-3 gap-3">
                            <span class="text-xs font-semibold text-gray-400 uppercase tracking-wide w-32 shrink-0 mt-0.5">Beneficiary</span>
                            <span class="text-sm text-gray-700">{{ expense?.beneficiary || 'N/A' }}</span>
                        </div>
                        <div class="flex items-start px-5 py-3 gap-3">
                            <span class="text-xs font-semibold text-gray-400 uppercase tracking-wide w-32 shrink-0 mt-0.5">Approval Status</span>
                            <span v-if="docStatus"
                                class="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border"
                                :class="statusBadgeClass(docStatus.color)">
                                {{ docStatus.label }}
                            </span>
                        </div>
                        <div v-if="paymentProofStatus" class="flex items-start px-5 py-3 gap-3">
                            <span class="text-xs font-semibold text-gray-400 uppercase tracking-wide w-32 shrink-0 mt-0.5">Payment Status</span>
                            <span class="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border"
                                :class="statusBadgeClass(paymentProofStatus.color)">
                                {{ paymentProofStatus.label }}
                            </span>
                        </div>
                        <div class="flex items-start px-5 py-3 gap-3">
                            <span class="text-xs font-semibold text-gray-400 uppercase tracking-wide w-32 shrink-0 mt-0.5">Validity</span>
                            <span class="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border bg-emerald-50 text-emerald-700 border-emerald-200">
                                <CheckCircle2 class="size-3" /> Active
                            </span>
                        </div>
                    </div>
                </div>

                <!-- Upload success banner -->
                <div v-if="uploadSuccess"
                    class="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex items-center gap-3">
                    <CheckCircle2 class="size-6 text-emerald-500 shrink-0" />
                    <div>
                        <p class="text-sm font-semibold text-emerald-800">Payment proof submitted successfully.</p>
                        <p class="text-xs text-emerald-600 mt-0.5">Our accounting team will review and confirm your payment shortly.</p>
                    </div>
                </div>

                <!-- Already pending review notice -->
                <div v-else-if="pendingSubmission && !canSubmitProof"
                    class="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center gap-3">
                    <Clock class="size-6 text-amber-500 shrink-0" />
                    <div>
                        <p class="text-sm font-semibold text-amber-800">Payment Proof Under Review</p>
                        <p class="text-xs text-amber-600 mt-0.5">
                            A payment proof was submitted on {{ toDate(pendingSubmission.submittedAt) }} and is pending accounting review.
                        </p>
                    </div>
                </div>

                <!-- Already confirmed -->
                <div v-else-if="expense?.paymentProofStatus === 'CONFIRMED'"
                    class="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex items-center gap-3">
                    <CheckCircle2 class="size-6 text-emerald-500 shrink-0" />
                    <div>
                        <p class="text-sm font-semibold text-emerald-800">Payment Confirmed</p>
                        <p class="text-xs text-emerald-600 mt-0.5">Payment has been confirmed by the accounting team.</p>
                    </div>
                </div>

                <!-- Upload payment proof section -->
                <div v-if="canSubmitProof" class="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
                    <button
                        @click="showUploadForm = !showUploadForm"
                        class="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors">
                        <div class="flex items-center gap-3">
                            <div class="size-9 rounded-full bg-orange-100 flex items-center justify-center">
                                <CreditCard class="size-4 text-orange-600" />
                            </div>
                            <div class="text-left">
                                <p class="text-sm font-semibold text-gray-900">Upload Payment Proof</p>
                                <p class="text-xs text-gray-500 mt-0.5">Attach receipt or transaction screenshot</p>
                            </div>
                        </div>
                        <ChevronDown class="size-4 text-gray-400 transition-transform"
                            :class="{ 'rotate-180': showUploadForm }" />
                    </button>

                    <div v-if="showUploadForm" class="border-t border-gray-100 px-5 py-5 space-y-4">

                        <!-- Upload error -->
                        <div v-if="uploadError"
                            class="bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-center gap-2">
                            <XCircle class="size-4 text-red-500 shrink-0" />
                            <p class="text-xs text-red-700">{{ uploadError }}</p>
                        </div>

                        <!-- Payer Name -->
                        <div class="space-y-1.5">
                            <label class="text-xs font-semibold text-gray-600 uppercase tracking-wide">Payer Name *</label>
                            <input v-model="form.payerName" type="text" placeholder="Full name of payer"
                                class="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 bg-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent transition" />
                        </div>

                        <!-- Amount -->
                        <div class="space-y-1.5">
                            <label class="text-xs font-semibold text-gray-600 uppercase tracking-wide">Payment Amount (USD) *</label>
                            <input v-model="form.amount" type="number" min="0.01" step="0.01" placeholder="0.00"
                                class="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 bg-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent transition" />
                        </div>

                        <!-- Payment Method -->
                        <div class="space-y-1.5">
                            <label class="text-xs font-semibold text-gray-600 uppercase tracking-wide">Payment Method *</label>
                            <select v-model="form.paymentMethod"
                                class="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-neutral-900 bg-white focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent transition">
                                <option value="CASH" class="text-neutral-900 bg-white">Cash</option>
                                <option value="BANK_TRANSFER" class="text-neutral-900 bg-white">Bank Transfer</option>
                                <option value="ECOCASH" class="text-neutral-900 bg-white">EcoCash</option>
                                <option value="SWIPE" class="text-neutral-900 bg-white">Swipe / Card</option>
                                <option value="RTGS" class="text-neutral-900 bg-white">RTGS</option>
                                <option value="OTHER" class="text-neutral-900 bg-white">Other</option>
                            </select>
                        </div>

                        <!-- Transaction Reference -->
                        <div class="space-y-1.5">
                            <label class="text-xs font-semibold text-gray-600 uppercase tracking-wide">Transaction / Reference Number *</label>
                            <input v-model="form.referenceNumber" type="text" placeholder="e.g. TXN-12345 or receipt number"
                                class="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 bg-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent transition" />
                        </div>

                        <!-- Proof file drop zone -->
                        <div class="space-y-1.5">
                            <label class="text-xs font-semibold text-gray-600 uppercase tracking-wide">Proof of Payment *</label>
                            <div
                                @click="fileInputRef?.click()"
                                @dragover.prevent="dragOver = true"
                                @dragleave="dragOver = false"
                                @drop.prevent="onDrop"
                                class="border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors"
                                :class="dragOver ? 'border-orange-400 bg-orange-50' : proofFile ? 'border-emerald-400 bg-emerald-50' : 'border-gray-200 hover:border-orange-300 hover:bg-orange-50/50'">
                                <input ref="fileInputRef" type="file" class="hidden"
                                    accept="image/jpeg,image/png,image/webp,application/pdf"
                                    @change="onFileChange" />
                                <template v-if="proofFile">
                                    <CheckCircle2 class="size-8 text-emerald-500 mx-auto mb-2" />
                                    <p class="text-sm font-semibold text-emerald-700">{{ proofFile.name }}</p>
                                    <p class="text-xs text-emerald-600">{{ formatBytes(proofFile.size) }} — tap to change</p>
                                </template>
                                <template v-else>
                                    <Upload class="size-8 text-gray-300 mx-auto mb-2" />
                                    <p class="text-sm font-medium text-gray-500">Tap to upload or drag & drop</p>
                                    <p class="text-xs text-gray-400 mt-1">JPG, PNG, WebP or PDF · Max 5 MB</p>
                                </template>
                            </div>
                        </div>

                        <!-- Note (optional) -->
                        <div class="space-y-1.5">
                            <label class="text-xs font-semibold text-gray-600 uppercase tracking-wide">Note <span class="text-gray-400 normal-case font-normal">(optional)</span></label>
                            <textarea v-model="form.note" rows="2" placeholder="Any additional information…"
                                class="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 bg-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent transition resize-none" />
                        </div>

                        <!-- Submit button -->
                        <button
                            @click="handleSubmit"
                            :disabled="uploading"
                            class="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold rounded-xl py-3 text-sm transition-colors flex items-center justify-center gap-2">
                            <Loader2 v-if="uploading" class="size-4 animate-spin" />
                            <Upload v-else class="size-4" />
                            {{ uploading ? 'Uploading…' : 'Submit Payment Proof' }}
                        </button>

                    </div>
                </div>

            </template>

        </main>

        <!-- Footer -->
        <footer class="text-center py-8 text-xs text-gray-400">
            Incaptta Pro · Document Verification System · {{ new Date().getFullYear() }}
        </footer>

    </div>
</template>
