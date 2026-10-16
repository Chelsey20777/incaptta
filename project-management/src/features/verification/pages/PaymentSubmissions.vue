<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useVerificationStore, type PaymentSubmission } from '../store/verificationStore'
import { useSession } from '@/composables/useSession'
import { toast } from 'vue-sonner'
import {
    CheckCircle2, XCircle, Clock, ExternalLink, Eye, Loader2,
    CreditCard, Filter, Search, RefreshCw, AlertTriangle
} from 'lucide-vue-next'

const store = useVerificationStore()
const { user } = useSession()

// ── State ────────────────────────────────────────────────────────────────

const filterStatus = ref<'ALL' | 'PENDING_REVIEW' | 'CONFIRMED' | 'REJECTED'>('ALL')
const searchQuery = ref('')
const reviewingId = ref<string | null>(null)
const rejectDialogId = ref<string | null>(null)
const rejectionReason = ref('')
const confirmingId = ref<string | null>(null)

// ── Computed ─────────────────────────────────────────────────────────────

const filtered = computed(() => {
    let list = store.submissions
    if (filterStatus.value !== 'ALL') {
        list = list.filter(s => s.status === filterStatus.value)
    }
    if (searchQuery.value.trim()) {
        const q = searchQuery.value.trim().toLowerCase()
        list = list.filter(s =>
            s.docRef?.toLowerCase().includes(q) ||
            s.payerName?.toLowerCase().includes(q) ||
            s.referenceNumber?.toLowerCase().includes(q)
        )
    }
    return list
})

const counts = computed(() => ({
    pending:   store.submissions.filter(s => s.status === 'PENDING_REVIEW').length,
    confirmed: store.submissions.filter(s => s.status === 'CONFIRMED').length,
    rejected:  store.submissions.filter(s => s.status === 'REJECTED').length
}))

// ── Lifecycle ─────────────────────────────────────────────────────────────

onMounted(() => store.fetchSubmissions())
onUnmounted(() => store.unsubscribeAll())

// ── Actions ───────────────────────────────────────────────────────────────

async function handleConfirm(submission: PaymentSubmission) {
    if (!submission.id) return
    confirmingId.value = submission.id
    try {
        await store.confirmPayment(
            submission.id,
            user.value?.displayName || user.value?.email || 'Admin',
            submission.token,
            submission.docId
        )
        toast.success(`Payment confirmed for ${submission.docRef}`)
    } catch {
        toast.error('Failed to confirm payment. Try again.')
    } finally {
        confirmingId.value = null
    }
}

function openRejectDialog(submission: PaymentSubmission) {
    rejectDialogId.value = submission.id || null
    rejectionReason.value = ''
}

async function handleReject(submission: PaymentSubmission) {
    if (!submission.id) return
    if (!rejectionReason.value.trim()) {
        toast.error('Please provide a rejection reason.')
        return
    }
    reviewingId.value = submission.id
    try {
        await store.rejectPayment(
            submission.id,
            user.value?.displayName || user.value?.email || 'Admin',
            rejectionReason.value.trim(),
            submission.token,
            submission.docId
        )
        toast.success(`Payment proof rejected for ${submission.docRef}`)
        rejectDialogId.value = null
    } catch {
        toast.error('Failed to reject. Try again.')
    } finally {
        reviewingId.value = null
    }
}

// ── Helpers ───────────────────────────────────────────────────────────────

function toDate(ts: any): string {
    if (!ts) return '—'
    if (ts.toDate) return ts.toDate().toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })
    return new Date(ts).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })
}

function statusConfig(status: string) {
    if (status === 'PENDING_REVIEW') return { label: 'Pending Review', icon: Clock,        class: 'bg-amber-100 text-amber-800 border-amber-200' }
    if (status === 'CONFIRMED')     return { label: 'Confirmed',       icon: CheckCircle2, class: 'bg-emerald-100 text-emerald-800 border-emerald-200' }
    if (status === 'REJECTED')      return { label: 'Rejected',        icon: XCircle,      class: 'bg-red-100 text-red-800 border-red-200' }
    return                                 { label: status,            icon: AlertTriangle, class: 'bg-slate-100 text-slate-700 border-slate-200' }
}

function isImage(type: string) {
    return type?.startsWith('image/')
}
</script>

<template>
    <div class="space-y-6">

        <!-- Page header -->
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
                <h1 class="text-2xl font-bold tracking-tight">Payment Submissions</h1>
                <p class="text-sm text-muted-foreground mt-1">
                    Review payment proofs submitted via document QR code verification.
                </p>
            </div>
            <button @click="store.fetchSubmissions()"
                class="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground border rounded-lg px-3 py-1.5 transition-colors">
                <RefreshCw class="size-3" /> Refresh
            </button>
        </div>

        <!-- Summary tiles -->
        <div class="grid grid-cols-3 gap-3">
            <div class="bg-card border rounded-xl p-4 text-center">
                <p class="text-2xl font-bold text-amber-500">{{ counts.pending }}</p>
                <p class="text-xs text-muted-foreground mt-1 font-medium">Pending Review</p>
            </div>
            <div class="bg-card border rounded-xl p-4 text-center">
                <p class="text-2xl font-bold text-emerald-500">{{ counts.confirmed }}</p>
                <p class="text-xs text-muted-foreground mt-1 font-medium">Confirmed</p>
            </div>
            <div class="bg-card border rounded-xl p-4 text-center">
                <p class="text-2xl font-bold text-red-500">{{ counts.rejected }}</p>
                <p class="text-xs text-muted-foreground mt-1 font-medium">Rejected</p>
            </div>
        </div>

        <!-- Filters -->
        <div class="flex flex-col sm:flex-row gap-2">
            <div class="relative flex-1">
                <Search class="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                <input v-model="searchQuery" type="text" placeholder="Search by reference, payer, or doc…"
                    class="w-full pl-8 pr-4 py-2 text-sm border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/40" />
            </div>
            <div class="flex items-center gap-1.5">
                <Filter class="size-3.5 text-muted-foreground" />
                <select v-model="filterStatus"
                    class="text-sm border rounded-lg px-3 py-2 bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40">
                    <option value="ALL" class="text-neutral-900 bg-white dark:text-white dark:bg-zinc-800">All Statuses</option>
                    <option value="PENDING_REVIEW" class="text-neutral-900 bg-white dark:text-white dark:bg-zinc-800">Pending Review</option>
                    <option value="CONFIRMED" class="text-neutral-900 bg-white dark:text-white dark:bg-zinc-800">Confirmed</option>
                    <option value="REJECTED" class="text-neutral-900 bg-white dark:text-white dark:bg-zinc-800">Rejected</option>
                </select>
            </div>
        </div>

        <!-- Empty state -->
        <div v-if="filtered.length === 0"
            class="bg-card border rounded-xl p-12 text-center text-muted-foreground space-y-2">
            <CreditCard class="size-10 mx-auto opacity-30" />
            <p class="text-sm font-medium">No payment submissions found.</p>
            <p v-if="filterStatus !== 'ALL' || searchQuery" class="text-xs">
                Try clearing the filters.
            </p>
        </div>

        <!-- Submissions list -->
        <div class="space-y-3">
            <div v-for="sub in filtered" :key="sub.id"
                class="bg-card border rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow">

                <!-- Card header -->
                <div class="flex items-center justify-between px-5 py-3 border-b bg-muted/30">
                    <div class="flex items-center gap-2 min-w-0">
                        <span class="text-sm font-bold text-foreground truncate">{{ sub.docRef }}</span>
                        <span class="text-xs text-muted-foreground hidden sm:block">·</span>
                        <span class="text-xs text-muted-foreground hidden sm:block">{{ sub.payerName }}</span>
                    </div>
                    <!-- Status badge -->
                    <span class="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border shrink-0"
                        :class="statusConfig(sub.status).class">
                        <component :is="statusConfig(sub.status).icon" class="size-3" />
                        {{ statusConfig(sub.status).label }}
                    </span>
                </div>

                <!-- Card body -->
                <div class="px-5 py-4 grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                    <div>
                        <p class="text-xs font-medium text-muted-foreground mb-0.5">Amount</p>
                        <p class="font-bold text-foreground">${{ Number(sub.amount).toFixed(2) }}</p>
                    </div>
                    <div>
                        <p class="text-xs font-medium text-muted-foreground mb-0.5">Method</p>
                        <p class="font-medium text-foreground">{{ sub.paymentMethod }}</p>
                    </div>
                    <div>
                        <p class="text-xs font-medium text-muted-foreground mb-0.5">Reference</p>
                        <p class="font-medium text-foreground truncate">{{ sub.referenceNumber }}</p>
                    </div>
                    <div>
                        <p class="text-xs font-medium text-muted-foreground mb-0.5">Submitted</p>
                        <p class="text-foreground">{{ toDate(sub.submittedAt) }}</p>
                    </div>
                    <div v-if="sub.note" class="col-span-2 sm:col-span-4">
                        <p class="text-xs font-medium text-muted-foreground mb-0.5">Note</p>
                        <p class="text-muted-foreground italic text-xs">{{ sub.note }}</p>
                    </div>
                    <div v-if="sub.rejectionReason" class="col-span-2 sm:col-span-4">
                        <p class="text-xs font-medium text-red-500 mb-0.5">Rejection Reason</p>
                        <p class="text-red-600 text-xs">{{ sub.rejectionReason }}</p>
                    </div>
                    <div v-if="sub.reviewedBy" class="col-span-2 sm:col-span-4 text-xs text-muted-foreground">
                        Reviewed by <strong>{{ sub.reviewedBy }}</strong> · {{ toDate(sub.reviewedAt) }}
                    </div>
                </div>

                <!-- Proof + actions row -->
                <div class="px-5 pb-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-t pt-3">
                    <!-- Proof preview/link -->
                    <a :href="sub.proofFileUrl" target="_blank" rel="noopener noreferrer"
                        class="inline-flex items-center gap-1.5 text-xs text-primary hover:underline font-medium">
                        <Eye class="size-3.5" />
                        View Proof: {{ sub.proofFileName }}
                        <ExternalLink class="size-3" />
                    </a>

                    <!-- Actions (only for PENDING_REVIEW) -->
                    <div v-if="sub.status === 'PENDING_REVIEW'" class="flex items-center gap-2">
                        <!-- Confirm -->
                        <button
                            @click="handleConfirm(sub)"
                            :disabled="confirmingId === sub.id"
                            class="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors">
                            <Loader2 v-if="confirmingId === sub.id" class="size-3 animate-spin" />
                            <CheckCircle2 v-else class="size-3" />
                            Confirm Payment
                        </button>
                        <!-- Reject -->
                        <button
                            @click="openRejectDialog(sub)"
                            class="inline-flex items-center gap-1.5 border border-red-300 text-red-600 hover:bg-red-50 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors">
                            <XCircle class="size-3" />
                            Reject
                        </button>
                    </div>
                </div>

                <!-- Inline reject dialog -->
                <div v-if="rejectDialogId === sub.id"
                    class="border-t bg-red-50 px-5 py-4 space-y-3">
                    <p class="text-sm font-semibold text-red-800">Provide Rejection Reason</p>
                    <textarea v-model="rejectionReason" rows="2"
                        placeholder="Explain why the payment proof is being rejected…"
                        class="w-full border border-red-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 resize-none bg-white" />
                    <div class="flex gap-2">
                        <button
                            @click="handleReject(sub)"
                            :disabled="reviewingId === sub.id"
                            class="inline-flex items-center gap-1.5 bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors">
                            <Loader2 v-if="reviewingId === sub.id" class="size-3 animate-spin" />
                            <XCircle v-else class="size-3" />
                            Confirm Rejection
                        </button>
                        <button @click="rejectDialogId = null"
                            class="text-xs text-muted-foreground hover:text-foreground px-3 py-1.5 border rounded-lg transition-colors">
                            Cancel
                        </button>
                    </div>
                </div>

            </div>
        </div>

    </div>
</template>
