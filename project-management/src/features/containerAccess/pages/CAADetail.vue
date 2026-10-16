<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { db } from '@/lib/firebase'
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { ArrowLeft, Download, LogIn, CheckCircle, XCircle, Loader2, ShieldCheck } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { toast } from 'vue-sonner'
import { useSession } from '@/composables/useSession'
import { useContainerAccessStore } from '../store/containerAccessStore'
import { useAdminStore } from '@/features/admin/store/adminStore'
import { generateCaaPdf } from '../utils/generateCaaPdf'
import type { ContainerAccessRequest, ContainerAccessLog } from '../types'

const route = useRoute()
const router = useRouter()
const store = useContainerAccessStore()
const adminStore = useAdminStore()
const { user, claims, hasAnyRole } = useSession()

const requestId = route.params.id as string
const request = ref<ContainerAccessRequest | null>(null)
const loading = ref(true)

const showApproveDialog = ref(false)
const showRejectDialog = ref(false)
const showLogAccessDialog = ref(false)
const approvalNotes = ref('')
const rejectionReason = ref('')
const logNotes = ref('')
const isProcessing = ref(false)
const isDownloading = ref(false)
const isLoggingAccess = ref(false)

onMounted(async () => {
    store.fetchLogs()
    adminStore.fetchSettings()
    try {
        const snap = await getDoc(doc(db, 'containerAccessRequests', requestId))
        if (!snap.exists()) {
            toast.error('Request not found')
            router.push('/container-access')
            return
        }
        request.value = { id: snap.id, ...snap.data() } as ContainerAccessRequest
    } catch (err: any) {
        toast.error('Failed to load request', { description: err.message })
        router.push('/container-access')
    } finally {
        loading.value = false
    }
})

// ── Role-gated computed flags ──────────────────────────────────────────────

const canApproveReject = computed(() =>
    hasAnyRole(['MANAGER', 'ADMIN', 'SUPER_ADMIN']) &&
    request.value?.status === 'PENDING'
)

const canCancel = computed(() =>
    request.value?.status === 'PENDING' &&
    request.value?.requestedByUid === user.value?.uid
)

const canDownloadPdf = computed(() => request.value?.status === 'APPROVED' && !request.value?.pdfGenerated)

const canLogAccess = computed(() => request.value?.status === 'APPROVED')

// ── Logs for this request ─────────────────────────────────────────────────

const requestLogs = computed<ContainerAccessLog[]>(() =>
    store.logs
        .filter((l) => l.requestId === requestId)
        .slice()
        .sort((a, b) => {
            const tA = (a.loggedAt as any)?.toDate?.()?.getTime?.() ?? 0
            const tB = (b.loggedAt as any)?.toDate?.()?.getTime?.() ?? 0
            return tB - tA
        })
)

// ── Status badge helper ───────────────────────────────────────────────────

function statusClass(status: string) {
    switch (status) {
        case 'PENDING':   return 'bg-yellow-100 text-yellow-800 border border-yellow-200'
        case 'APPROVED':  return 'bg-green-100 text-green-800 border border-green-200'
        case 'REJECTED':  return 'bg-red-100 text-red-800 border border-red-200'
        case 'CANCELLED': return 'bg-gray-100 text-gray-600 border border-gray-200'
        default:          return 'bg-gray-100 text-gray-600 border border-gray-200'
    }
}

function actionClass(action: string) {
    switch (action) {
        case 'REQUEST_SUBMITTED': return 'bg-blue-100 text-blue-800'
        case 'APPROVED':          return 'bg-green-100 text-green-800'
        case 'REJECTED':          return 'bg-red-100 text-red-800'
        case 'CANCELLED':         return 'bg-gray-100 text-gray-600'
        case 'CONTAINER_ACCESSED': return 'bg-purple-100 text-purple-800'
        default:                  return 'bg-gray-100 text-gray-600'
    }
}

function formatTs(ts: any): string {
    if (!ts) return '—'
    const d = ts?.toDate ? ts.toDate() : new Date(ts)
    return d.toLocaleString()
}

// ── Action handlers ───────────────────────────────────────────────────────

async function handleApprove() {
    if (!request.value) return
    isProcessing.value = true
    try {
        await store.approveRequest(
            requestId,
            request.value.requestNumber,
            request.value.containerName,
            {
                uid: user.value!.uid,
                name: user.value!.displayName || user.value!.email || 'Manager',
            },
            approvalNotes.value
        )
        // Re-fetch for freshness
        const snap = await getDoc(doc(db, 'containerAccessRequests', requestId))
        request.value = { id: snap.id, ...snap.data() } as ContainerAccessRequest
        showApproveDialog.value = false
        approvalNotes.value = ''
        toast.success('Request approved successfully')
    } catch (err: any) {
        toast.error('Failed to approve request', { description: err.message })
    } finally {
        isProcessing.value = false
    }
}

async function handleReject() {
    if (!request.value || !rejectionReason.value.trim()) {
        toast.error('Please provide a rejection reason')
        return
    }
    isProcessing.value = true
    try {
        await store.rejectRequest(
            requestId,
            request.value.requestNumber,
            request.value.containerName,
            {
                uid: user.value!.uid,
                name: user.value!.displayName || user.value!.email || 'Manager',
            },
            rejectionReason.value.trim()
        )
        const snap = await getDoc(doc(db, 'containerAccessRequests', requestId))
        request.value = { id: snap.id, ...snap.data() } as ContainerAccessRequest
        showRejectDialog.value = false
        rejectionReason.value = ''
        toast.success('Request rejected')
    } catch (err: any) {
        toast.error('Failed to reject request', { description: err.message })
    } finally {
        isProcessing.value = false
    }
}

async function handleCancel() {
    if (!request.value) return
    isProcessing.value = true
    try {
        const rolesRaw = claims.value?.roles
        const role = Array.isArray(rolesRaw) ? rolesRaw[0] : String(rolesRaw || 'UNKNOWN')
        await store.cancelRequest(
            requestId,
            request.value.requestNumber,
            request.value.containerName,
            {
                uid: user.value!.uid,
                name: user.value!.displayName || user.value!.email || 'User',
                role,
            }
        )
        const snap = await getDoc(doc(db, 'containerAccessRequests', requestId))
        request.value = { id: snap.id, ...snap.data() } as ContainerAccessRequest
        toast.success('Request cancelled')
    } catch (err: any) {
        toast.error('Failed to cancel request', { description: err.message })
    } finally {
        isProcessing.value = false
    }
}

async function handleDownloadPdf() {
    if (!request.value) return
    isDownloading.value = true
    try {
        await generateCaaPdf(request.value, adminStore.appSettings as any)
        if (!request.value.pdfGenerated) {
            await updateDoc(doc(db, 'containerAccessRequests', requestId), {
                pdfGenerated: true,
                updatedAt: serverTimestamp(),
            })
            request.value.pdfGenerated = true
        }
        toast.success('PDF downloaded')
    } catch (err: any) {
        toast.error('PDF generation failed', { description: err.message })
    } finally {
        isDownloading.value = false
    }
}

async function handleLogAccess() {
    if (!request.value) return
    isLoggingAccess.value = true
    try {
        const rolesRaw = claims.value?.roles
        const role = Array.isArray(rolesRaw) ? rolesRaw[0] : String(rolesRaw || 'UNKNOWN')
        await store.logContainerAccess(
            requestId,
            request.value.requestNumber,
            request.value.containerName,
            {
                uid: user.value!.uid,
                name: user.value!.displayName || user.value!.email || 'User',
                role,
            },
            logNotes.value.trim() || undefined
        )
        logNotes.value = ''
        showLogAccessDialog.value = false
        toast.success('Container access recorded')
    } catch (err: any) {
        toast.error('Failed to log access', { description: err.message })
    } finally {
        isLoggingAccess.value = false
    }
}
</script>

<template>
    <div class="p-4 md:p-6 max-w-3xl mx-auto">
        <Button variant="ghost" size="sm" class="mb-4 gap-1" @click="router.push('/container-access')">
            <ArrowLeft class="h-4 w-4" />
            Back
        </Button>

        <!-- Loading -->
        <div v-if="loading" class="flex items-center justify-center py-20">
            <Loader2 class="h-8 w-8 animate-spin text-muted-foreground" />
        </div>

        <template v-else-if="request">
            <!-- Header Card -->
            <Card class="mb-4">
                <CardHeader>
                    <div class="flex items-start justify-between gap-4">
                        <div>
                            <div class="flex items-center gap-2 mb-1">
                                <ShieldCheck class="h-5 w-5 text-primary" />
                                <CardTitle class="text-lg">{{ request.requestNumber }}</CardTitle>
                            </div>
                            <p class="text-sm text-muted-foreground">{{ request.containerName }}</p>
                        </div>
                        <span class="text-xs font-semibold px-2.5 py-1 rounded-full" :class="statusClass(request.status)">
                            {{ request.status }}
                        </span>
                    </div>
                </CardHeader>

                <CardContent>
                    <!-- Details Grid -->
                    <!-- Job Card Reference -->
                    <div v-if="request.jobCardRef" class="mb-4 flex items-center gap-2 text-sm bg-muted/40 border rounded-md px-3 py-2">
                        <span class="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Job Card Ref</span>
                        <span class="font-semibold text-primary">{{ request.jobCardRef.jobNumber }}</span>
                        <span class="text-muted-foreground">·</span>
                        <span>{{ request.jobCardRef.clientName }}</span>
                        <span class="text-muted-foreground">·</span>
                        <span class="text-muted-foreground">{{ request.jobCardRef.location }}</span>
                    </div>

                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3 text-sm mb-5">
                        <div>
                            <p class="text-xs text-muted-foreground font-medium uppercase tracking-wide">Requestor</p>
                            <p class="font-medium">{{ request.requestedByName }}</p>
                            <p class="text-muted-foreground">{{ request.requestedByRole }}</p>
                        </div>
                        <div>
                            <p class="text-xs text-muted-foreground font-medium uppercase tracking-wide">Submitted</p>
                            <p>{{ formatTs(request.requestedAt) }}</p>
                        </div>
                        <div>
                            <p class="text-xs text-muted-foreground font-medium uppercase tracking-wide">Container Location</p>
                            <p>{{ request.containerLocation }}</p>
                        </div>
                        <div>
                            <p class="text-xs text-muted-foreground font-medium uppercase tracking-wide">Access Date</p>
                            <p>{{ request.accessDate }}</p>
                        </div>
                        <div>
                            <p class="text-xs text-muted-foreground font-medium uppercase tracking-wide">Time Window</p>
                            <p>{{ request.accessTimeFrom }} – {{ request.accessTimeTo }}</p>
                        </div>
                        <div class="sm:col-span-2">
                            <p class="text-xs text-muted-foreground font-medium uppercase tracking-wide">Purpose of Access</p>
                            <p class="whitespace-pre-wrap">{{ request.purposeOfAccess }}</p>
                        </div>
                    </div>

                    <!-- Approval details -->
                    <div v-if="request.status === 'APPROVED'" class="border-t pt-4 mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3 text-sm">
                        <div>
                            <p class="text-xs text-muted-foreground font-medium uppercase tracking-wide">Approved By</p>
                            <p>{{ request.approvedByName }}</p>
                        </div>
                        <div>
                            <p class="text-xs text-muted-foreground font-medium uppercase tracking-wide">Approved On</p>
                            <p>{{ formatTs(request.approvedAt) }}</p>
                        </div>
                        <div v-if="request.approvalNotes" class="sm:col-span-2">
                            <p class="text-xs text-muted-foreground font-medium uppercase tracking-wide">Approval Notes</p>
                            <p>{{ request.approvalNotes }}</p>
                        </div>
                    </div>

                    <!-- Rejection details -->
                    <div v-if="request.status === 'REJECTED'" class="border-t pt-4 mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3 text-sm">
                        <div>
                            <p class="text-xs text-muted-foreground font-medium uppercase tracking-wide">Rejected By</p>
                            <p>{{ request.rejectedByName }}</p>
                        </div>
                        <div>
                            <p class="text-xs text-muted-foreground font-medium uppercase tracking-wide">Rejected On</p>
                            <p>{{ formatTs(request.rejectedAt) }}</p>
                        </div>
                        <div class="sm:col-span-2">
                            <p class="text-xs text-muted-foreground font-medium uppercase tracking-wide">Rejection Reason</p>
                            <p class="text-red-700">{{ request.rejectionReason }}</p>
                        </div>
                    </div>

                    <!-- Action buttons -->
                    <div class="flex flex-wrap gap-2 mt-5 pt-4 border-t">
                        <!-- Manager: Approve / Reject -->
                        <template v-if="canApproveReject">
                            <Button class="gap-1.5" @click="showApproveDialog = true">
                                <CheckCircle class="h-4 w-4" />
                                Approve
                            </Button>
                            <Button variant="destructive" class="gap-1.5" @click="showRejectDialog = true">
                                <XCircle class="h-4 w-4" />
                                Reject
                            </Button>
                        </template>

                        <!-- Requestor: Cancel -->
                        <Button
                            v-if="canCancel"
                            variant="outline"
                            :disabled="isProcessing"
                            class="gap-1.5"
                            @click="handleCancel"
                        >
                            <Loader2 v-if="isProcessing" class="h-4 w-4 animate-spin" />
                            Cancel Request
                        </Button>

                        <!-- Download PDF -->
                        <Button
                            v-if="canDownloadPdf"
                            variant="outline"
                            :disabled="isDownloading"
                            class="gap-1.5"
                            @click="handleDownloadPdf"
                        >
                            <Loader2 v-if="isDownloading" class="h-4 w-4 animate-spin" />
                            <Download v-else class="h-4 w-4" />
                            Download Authorization PDF
                        </Button>

                        <!-- Log Container Access -->
                        <Button
                            v-if="canLogAccess"
                            variant="secondary"
                            class="gap-1.5"
                            @click="showLogAccessDialog = true"
                        >
                            <LogIn class="h-4 w-4" />
                            Log Container Access
                        </Button>
                    </div>
                </CardContent>
            </Card>

            <!-- Access Logs Card -->
            <Card>
                <CardHeader>
                    <CardTitle class="text-base">Access Log History</CardTitle>
                </CardHeader>
                <CardContent>
                    <div v-if="store.logsLoading" class="flex justify-center py-8">
                        <Loader2 class="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                    <div v-else-if="requestLogs.length === 0" class="text-sm text-muted-foreground text-center py-8">
                        No log entries yet.
                    </div>
                    <div v-else class="overflow-x-auto">
                        <table class="w-full text-sm">
                            <thead>
                                <tr class="border-b text-xs text-muted-foreground">
                                    <th class="text-left py-2 pr-4 font-medium">Date / Time</th>
                                    <th class="text-left py-2 pr-4 font-medium">User</th>
                                    <th class="text-left py-2 pr-4 font-medium">Role</th>
                                    <th class="text-left py-2 pr-4 font-medium">Action</th>
                                    <th class="text-left py-2 font-medium">Notes</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr
                                    v-for="log in requestLogs"
                                    :key="log.id"
                                    class="border-b last:border-0 hover:bg-muted/30"
                                >
                                    <td class="py-2 pr-4 whitespace-nowrap">{{ formatTs(log.loggedAt) }}</td>
                                    <td class="py-2 pr-4">{{ log.loggedByName }}</td>
                                    <td class="py-2 pr-4">{{ log.loggedByRole }}</td>
                                    <td class="py-2 pr-4">
                                        <span class="text-xs font-semibold px-2 py-0.5 rounded-full" :class="actionClass(log.action)">
                                            {{ log.action.replace(/_/g, ' ') }}
                                        </span>
                                    </td>
                                    <td class="py-2 text-muted-foreground">{{ log.notes || '—' }}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>
        </template>

        <!-- Approve Dialog -->
        <Dialog :open="showApproveDialog" @update:open="showApproveDialog = $event">
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Approve Access Request</DialogTitle>
                </DialogHeader>
                <div class="space-y-3 py-2">
                    <p class="text-sm text-muted-foreground">
                        You are approving access to <strong>{{ request?.containerName }}</strong> for
                        <strong>{{ request?.requestedByName }}</strong> on {{ request?.accessDate }}.
                    </p>
                    <div class="space-y-1.5">
                        <Label for="approvalNotes">Approval Notes (optional)</Label>
                        <Textarea
                            id="approvalNotes"
                            v-model="approvalNotes"
                            placeholder="Any instructions or conditions..."
                            rows="3"
                        />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" @click="showApproveDialog = false">Cancel</Button>
                    <Button :disabled="isProcessing" @click="handleApprove">
                        <Loader2 v-if="isProcessing" class="h-4 w-4 mr-2 animate-spin" />
                        Confirm Approval
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>

        <!-- Reject Dialog -->
        <Dialog :open="showRejectDialog" @update:open="showRejectDialog = $event">
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Reject Access Request</DialogTitle>
                </DialogHeader>
                <div class="space-y-3 py-2">
                    <p class="text-sm text-muted-foreground">
                        Provide a reason for rejecting this request.
                    </p>
                    <div class="space-y-1.5">
                        <Label for="rejectionReason">Rejection Reason <span class="text-red-500">*</span></Label>
                        <Textarea
                            id="rejectionReason"
                            v-model="rejectionReason"
                            placeholder="Why is this request being rejected?"
                            rows="3"
                        />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" @click="showRejectDialog = false">Cancel</Button>
                    <Button variant="destructive" :disabled="isProcessing || !rejectionReason.trim()" @click="handleReject">
                        <Loader2 v-if="isProcessing" class="h-4 w-4 mr-2 animate-spin" />
                        Confirm Rejection
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>

        <!-- Log Container Access Dialog -->
        <Dialog :open="showLogAccessDialog" @update:open="showLogAccessDialog = $event">
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Log Container Access</DialogTitle>
                </DialogHeader>
                <div class="space-y-3 py-2">
                    <p class="text-sm text-muted-foreground">
                        Record that you are physically opening <strong>{{ request?.containerName }}</strong>.
                        This will be saved as an access log entry.
                    </p>
                    <div class="space-y-1.5">
                        <Label for="logNotes">Notes (optional)</Label>
                        <Textarea
                            id="logNotes"
                            v-model="logNotes"
                            placeholder="e.g. Retrieved item X for job card JC-2026-0012"
                            rows="2"
                        />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" @click="showLogAccessDialog = false">Cancel</Button>
                    <Button :disabled="isLoggingAccess" @click="handleLogAccess">
                        <Loader2 v-if="isLoggingAccess" class="h-4 w-4 mr-2 animate-spin" />
                        Record Access
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    </div>
</template>
