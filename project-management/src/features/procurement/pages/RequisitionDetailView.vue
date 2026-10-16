<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useProcurementStore } from '../store/procurementStore'
import { useSession } from '@/composables/useSession'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import CreatePOFromPRButton from '../components/CreatePOFromPRButton.vue'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import {
  ArrowLeft,
  Download,
  Edit,
  CheckCircle2,
  XCircle,
  Loader2,
  Calendar,
  User,
  FileText,
  ShoppingCart,
  DollarSign,
  Package,
  Briefcase,
  Building,
  Truck,
  AlertTriangle,
  Clock,
  Plus,
  Trash2,
  Eye,
  Printer,
  Mail,
  Pencil,
  Send,
  CheckCircle
} from 'lucide-vue-next'
import { format } from 'date-fns'
import { toast } from 'vue-sonner'
import type { ProcurementRequisition, ProcurementType, PRStatus, ProcurementLineItem } from '../types'

const route = useRoute()
const router = useRouter()
const procurementStore = useProcurementStore()
const { user: currentUser, hasAnyRole } = useSession()

const requisitionId = route.params.id as string
const loading = ref(true)
const requisition = ref<ProcurementRequisition | null>(null)
const isSubmitting = ref(false)
const isApproving = ref(false)
const isRejecting = ref(false)
const showRejectDialog = ref(false)
const rejectionReason = ref('')
const rejectionReasonError = ref('')
const isDeleting = ref(false)
const showDeleteConfirm = ref(false)
const activeTab = ref('overview')

// Fetch requisition on mount
onMounted(async () => {
  // Start the store listener (keeps list view reactive)
  procurementStore.fetchRequisitions()

  // Fetch this specific document directly — no waiting
  const docRef = doc(db, 'procurementRequisitions', requisitionId)
  const docSnap = await getDoc(docRef)

  if (!docSnap.exists()) {
    toast.error('Requisition not found')
    router.push('/procurement/requisitions')
    return
  }

  requisition.value = { 
    id: docSnap.id, 
    ...docSnap.data() 
  } as ProcurementRequisition
  loading.value = false
})

// Cleanup listeners on unmount
onUnmounted(() => {
  procurementStore.cleanupListeners()
})

// Format date
function formatDate(date: any) {
  if (!date) return 'N/A'
  try {
    return format(date.toDate(), 'MMM dd, yyyy HH:mm')
  } catch {
    return 'Invalid date'
  }
}

// Format currency
function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

// Get procurement type badge variant
function getProcurementTypeVariant(type: ProcurementType) {
  switch (type) {
    case 'PROJECT_MATERIAL': return 'blue'
    case 'INVENTORY': return 'purple'
    case 'CAPEX': return 'orange'
    case 'SERVICE': return 'teal'
    case 'ADHOC': return 'gray'
    default: return 'outline'
  }
}

// Get procurement type label
function getProcurementTypeLabel(type: ProcurementType) {
  switch (type) {
    case 'PROJECT_MATERIAL': return 'Project Material'
    case 'INVENTORY': return 'Inventory'
    case 'CAPEX': return 'CAPEX'
    case 'SERVICE': return 'Service'
    case 'ADHOC': return 'Ad-hoc'
    default: return type
  }
}

// Get procurement type badge classes
function getProcurementTypeClasses(type: ProcurementType) {
  switch (type) {
    case 'PROJECT_MATERIAL': return 'bg-blue-100 text-blue-800 border-blue-200'
    case 'INVENTORY': return 'bg-purple-100 text-purple-800 border-purple-200'
    case 'CAPEX': return 'bg-orange-100 text-orange-800 border-orange-200'
    case 'SERVICE': return 'bg-teal-100 text-teal-800 border-teal-200'
    case 'ADHOC': return 'bg-gray-100 text-gray-800 border-gray-200'
    default: return ''
  }
}

// Get procurement type icon
function getProcurementTypeIcon(type: ProcurementType) {
  switch (type) {
    case 'PROJECT_MATERIAL': return Package
    case 'INVENTORY': return ShoppingCart
    case 'CAPEX': return Briefcase
    case 'SERVICE': return Truck
    case 'ADHOC': return AlertTriangle
    default: return FileText
  }
}

// Get status badge variant
function getStatusVariant(status: PRStatus) {
  switch (status) {
    case 'DRAFT': return 'secondary'
    case 'SUBMITTED': return 'default'  // blue/primary
    case 'APPROVED': return 'default'  // will use class binding for green
    case 'REJECTED': return 'destructive'
    default: return 'secondary'
  }
}

// Get status label
function getStatusLabel(status: PRStatus) {
  switch (status) {
    case 'DRAFT': return 'Draft'
    case 'SUBMITTED': return 'Submitted'
    case 'APPROVED': return 'Approved'
    case 'REJECTED': return 'Rejected'
    default: return status
  }
}

// Get status icon
function getStatusIcon(status: PRStatus) {
  switch (status) {
    case 'DRAFT': return Clock
    case 'SUBMITTED': return Clock
    case 'APPROVED': return CheckCircle2
    case 'REJECTED': return XCircle
    default: return Clock
  }
}

// Calculate totals
const lineItemTotals = computed(() => {
  if (!requisition.value) return { totalCost: 0, totalSellingPrice: 0 }
  return requisition.value.items.reduce(
    (acc, item) => ({
      totalCost: acc.totalCost + item.totalCost,
      totalSellingPrice: acc.totalSellingPrice + item.sellingPrice,
    }),
    { totalCost: 0, totalSellingPrice: 0 }
  )
})

// Handle submit (DRAFT → SUBMITTED)
async function handleSubmit() {
  if (!requisition.value) return
  if (requisition.value.status !== 'DRAFT') return

  isSubmitting.value = true
  try {
    const { doc, updateDoc, serverTimestamp } =
      await import('firebase/firestore')

    await updateDoc(
      doc(db, 'procurementRequisitions', requisition.value.id),
      {
        status: 'SUBMITTED',
        updatedAt: serverTimestamp()
      }
    )

    requisition.value.status = 'SUBMITTED'

    toast.success('Requisition submitted', {
      description:
        `${requisition.value.prNumber} is now pending approval.`
    })
  } catch (e) {
    console.error('Submit error:', e)
    toast.error('Failed to submit requisition')
  } finally {
    isSubmitting.value = false
  }
}

// Handle approve
async function handleApprove() {
  if (!hasAnyRole(['SUPER_ADMIN', 'ADMIN', 'MANAGER'])) {
    toast.error('Insufficient permissions')
    return
  }
  if (!requisition.value) return
  if (requisition.value.status !== 'SUBMITTED') {
    toast.error('Only submitted requisitions can be approved')
    return
  }

  isApproving.value = true
  try {
    const { doc, updateDoc, serverTimestamp } =
      await import('firebase/firestore')

    await updateDoc(
      doc(db, 'procurementRequisitions', requisition.value.id),
      {
        status: 'APPROVED',
        approvedBy: currentUser.value?.uid ?? null,
        approvedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      }
    )

    // Update local state — do NOT use new Date()
    // Let the reactive getDoc refetch drive the UI
    // Just update status locally for immediate feedback
    requisition.value.status = 'APPROVED'

    toast.success('Requisition approved', {
      description: `${requisition.value.prNumber} has been
        approved and is ready for Purchase Order creation.`
    })
  } catch (e) {
    console.error('Approve error:', e)
    toast.error('Failed to approve requisition')
  } finally {
    isApproving.value = false
  }
}

// Handle reject (opens dialog)
function handleReject() {
  if (!hasAnyRole(['SUPER_ADMIN', 'ADMIN', 'MANAGER'])) {
    toast.error('Insufficient permissions')
    return
  }
  if (!requisition.value) return
  if (requisition.value.status !== 'SUBMITTED') {
    toast.error('Only submitted requisitions can be rejected')
    return
  }
  // Open rejection reason dialog — don't write yet
  rejectionReason.value = ''
  rejectionReasonError.value = ''
  showRejectDialog.value = true
}

// Confirm rejection
async function confirmReject() {
  if (!rejectionReason.value.trim()) {
    rejectionReasonError.value =
      'A rejection reason is required'
    return
  }
  if (rejectionReason.value.trim().length < 10) {
    rejectionReasonError.value =
      'Please provide a more detailed reason (min 10 chars)'
    return
  }
  if (!requisition.value) return

  isRejecting.value = true
  try {
    const { doc, updateDoc, serverTimestamp } =
      await import('firebase/firestore')

    await updateDoc(
      doc(db, 'procurementRequisitions', requisition.value.id),
      {
        status: 'REJECTED',
        rejectionReason: rejectionReason.value.trim(),
        rejectedBy: currentUser.value?.uid ?? null,
        rejectedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      }
    )

    requisition.value.status = 'REJECTED'
    requisition.value.rejectionReason =
      rejectionReason.value.trim()

    showRejectDialog.value = false
    rejectionReason.value = ''

    toast.error('Requisition rejected', {
      description: `${requisition.value.prNumber} has been
        rejected. The requester will be notified.`
    })
  } catch (e) {
    console.error('Reject error:', e)
    toast.error('Failed to reject requisition')
  } finally {
    isRejecting.value = false
  }
}

// Handle delete
async function handleDelete() {
  if (!requisition.value) return
  if (!canDelete.value) {
    toast.error('Insufficient permissions')
    return
  }
  if (hasExistingPO.value) {
    toast.error('Cannot delete: Requisition has a linked Purchase Order')
    return
  }

  isDeleting.value = true
  try {
    await procurementStore.deleteRequisition(requisition.value.id)
    toast.success('Requisition Deleted', {
      description: `${requisition.value.prNumber} has been removed.`
    })
    router.push('/procurement/requisitions')
  } catch (error: any) {
    console.error('Delete error:', error)
    toast.error('Delete Failed', { description: error.message || 'Please try again.' })
  } finally {
    isDeleting.value = false
    showDeleteConfirm.value = false
  }
}


// Navigation
function navigateBack() {
  router.push('/procurement/requisitions')
}

// Check permissions
const canSubmit = computed(() =>
  hasAnyRole(['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'STOREKEEPER', 'SALES', 'TECHNICAL']) &&
  requisition.value?.status === 'DRAFT'
)

const canApprove = computed(() =>
  hasAnyRole(['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'TECHNICAL']) &&
  requisition.value?.status === 'SUBMITTED'
)

const canReject = computed(() =>
  hasAnyRole(['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'TECHNICAL']) &&
  requisition.value?.status === 'SUBMITTED'
)

const canDelete = computed(() => 
  hasAnyRole(['SUPER_ADMIN'])
)

// Get inventory item status badge
function getInventoryItemStatusVariant(status: string) {
  switch (status) {
    case 'EXISTING': return 'default'
    case 'NEW_PENDING': return 'secondary'
    case 'ADHOC': return 'outline'
    default: return 'outline'
  }
}

function getInventoryItemStatusLabel(status: string) {
  switch (status) {
    case 'EXISTING': return 'Existing'
    case 'NEW_PENDING': return 'New Pending'
    case 'ADHOC': return 'Ad-hoc'
    default: return status
  }
}

// Check if PO already exists for this requisition
const hasExistingPO = computed(() => {
  return requisition.value?.linkedPoId
})

// Check if user can create PO from this requisition
const canCreatePO = computed(() => {
  if (!hasAnyRole(['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'TECHNICAL'])) return false
  if (!requisition.value) return false
  if (requisition.value.status !== 'APPROVED') return false
  if (hasExistingPO.value) return false
  if (!requisition.value.supplierId) return false
  return true
})

// Quick Actions — Generate PO button
function handleGeneratePO() {
  if (!requisition.value) return
  if (hasExistingPO.value) {
    router.push(`/procurement/purchase-orders/${requisition.value.linkedPoId}`)
    return
  }
  if (!requisition.value.supplierId) {
    activeTab.value = 'supplier'
    toast.warning('Assign a supplier first', {
      description: 'Go to the Supplier tab, assign a supplier, then you can generate the PO.'
    })
    return
  }
  // supplierId is set — scroll user to the Create PO button at the top
  toast.info('Use the "Create Purchase Order" button at the top of the page to generate the PO.')
}
</script>

<template>
  <div v-if="loading" class="h-[400px] flex items-center justify-center">
    <Loader2 class="size-8 animate-spin text-primary" />
  </div>

  <div v-else-if="requisition" class="space-y-6 max-w-6xl mx-auto">
    <!-- Delete Confirmation -->
    <div v-if="showDeleteConfirm" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div class="bg-card border rounded-xl shadow-2xl p-6 max-w-sm w-full mx-4 space-y-4">
        <div class="flex items-center gap-3">
          <div class="p-2 rounded-full bg-destructive/10 text-destructive"><Trash2 class="size-5" /></div>
          <div>
            <h3 class="font-bold text-base">Delete Requisition?</h3>
            <p class="text-xs text-muted-foreground mt-0.5">This action cannot be undone.</p>
          </div>
        </div>
        <p class="text-sm text-muted-foreground">
          You are about to permanently delete <span class="font-semibold text-foreground">{{ requisition.prNumber }} - {{ requisition.title }}</span>.
        </p>
        <div class="flex justify-end gap-3 pt-2">
          <Button variant="outline" @click="showDeleteConfirm = false" :disabled="isDeleting">Cancel</Button>
          <Button class="bg-destructive hover:bg-destructive/90 text-white" @click="handleDelete" :disabled="isDeleting">
            <Loader2 v-if="isDeleting" class="size-4 animate-spin mr-2" />
            <Trash2 v-else class="mr-2 size-4" />
            {{ isDeleting ? 'Deleting...' : 'Yes, Delete' }}
          </Button>
        </div>
      </div>
    </div>

    <!-- Header -->
    <div class="flex flex-col md:flex-row md:items-start justify-between gap-4">
      <div class="flex items-start gap-4">
        <Button variant="outline" size="icon" @click="navigateBack"><ArrowLeft class="size-4" /></Button>
        <div>
          <p class="text-sm font-medium text-muted-foreground uppercase tracking-widest">Purchase Requisition</p>
          <h2 class="text-2xl font-extrabold tracking-tight flex items-center gap-3 flex-wrap">
            {{ requisition.prNumber }} - {{ requisition.title }}
            <Badge :class="getProcurementTypeClasses(requisition.procurementType)" class="uppercase text-xs tracking-wider font-bold">
              {{ getProcurementTypeLabel(requisition.procurementType) }}
            </Badge>
            <Badge 
              :variant="getStatusVariant(requisition.status)" 
              class="uppercase text-xs tracking-wider font-bold"
              :class="{
                'bg-green-100 text-green-700 border-green-200':
                  requisition.status === 'APPROVED',
                'bg-red-100 text-red-700 border-red-200':
                  requisition.status === 'REJECTED',
                'bg-yellow-100 text-yellow-700 border-yellow-200':
                  requisition.status === 'SUBMITTED',
                'bg-gray-100 text-gray-600 border-gray-200':
                  requisition.status === 'DRAFT'
              }"
            >
              {{ getStatusLabel(requisition.status) }}
            </Badge>
          </h2>
          <p class="text-muted-foreground">{{ requisition.description }}</p>
        </div>
      </div>

      <div class="flex items-center gap-2 flex-wrap">
        <!-- DRAFT: requester can edit or submit -->
        <template v-if="requisition.status === 'DRAFT'
          && requisition.requestedBy === currentUser?.uid">
          <Button
            variant="outline"
            @click="router.push(
              `/procurement/requisitions/${requisition.id}/edit`
            )"
          >
            <Pencil :size="16" class="mr-2" />
            Edit
          </Button>
          <Button @click="handleSubmit" :disabled="isSubmitting">
            <Loader2 v-if="isSubmitting" :size="16" class="mr-2 animate-spin" />
            <Send v-else :size="16" class="mr-2" />
            {{ isSubmitting ? 'Submitting...' : 'Submit for Approval' }}
          </Button>
        </template>

        <!-- SUBMITTED: managers can approve or reject -->
        <template v-if="requisition.status === 'SUBMITTED'
          && hasAnyRole(['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'TECHNICAL'])">
          <Button
            variant="destructive"
            @click="handleReject"
            :disabled="isRejecting || isApproving"
          >
            <XCircle :size="16" class="mr-2" />
            Reject
          </Button>
          <Button
            variant="default"
            @click="handleApprove"
            :disabled="isApproving || isRejecting"
            class="bg-green-600 hover:bg-green-700"
          >
            <Loader2
              v-if="isApproving"
              :size="16"
              class="mr-2 animate-spin"
            />
            <CheckCircle v-else :size="16" class="mr-2" />
            {{ isApproving ? 'Approving...' : 'Approve' }}
          </Button>
        </template>

        <!-- APPROVED: show next step hint or create PO button -->
        <template v-if="requisition.status === 'APPROVED'">
          <div v-if="hasExistingPO" class="flex items-center gap-2 text-sm text-blue-700 bg-blue-50 border border-blue-200 rounded-md px-3 py-2">
            <CheckCircle :size="16" />
            PO created: 
            <Button variant="link" class="p-0 h-auto" @click="router.push(`/procurement/purchase-orders/${requisition!.linkedPoId}`)">
              View PO
            </Button>
          </div>
          <CreatePOFromPRButton
            v-else-if="canCreatePO"
            :requisition="requisition"
            @created="(poId) => requisition!.linkedPoId = poId"
          />
          <div v-else class="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-md px-3 py-2">
            <CheckCircle :size="16" />
            Approved — ready for Purchase Order creation
          </div>
        </template>

        <!-- REJECTED: show rejection reason -->
        <template v-if="requisition.status === 'REJECTED'">
          <div class="flex items-start gap-2 text-sm
                      text-red-700 bg-red-50 border
                      border-red-200 rounded-md px-3 py-2">
            <XCircle :size="16" class="shrink-0 mt-0.5" />
            <div>
              <p class="font-semibold">Rejected</p>
              <p class="text-xs mt-0.5">
                {{ requisition.rejectionReason ?? 'No reason provided' }}
              </p>
            </div>
          </div>
        </template>

        <!-- Print/Download -->
        <Button variant="outline" class="shadow-sm">
          <Printer class="mr-2 size-4" />Print
        </Button>

        <!-- Back to List -->
        <Button variant="outline" @click="navigateBack">
          <ArrowLeft class="mr-2 size-4" />Back to List
        </Button>
      </div>
    </div>

    <!-- Main Content Tabs -->
    <Tabs v-model="activeTab" class="w-full">
      <TabsList class="bg-muted/50 p-1 w-full justify-start overflow-x-auto">
        <TabsTrigger value="overview" class="px-6">Overview</TabsTrigger>
        <TabsTrigger value="line-items" class="px-6">Line Items</TabsTrigger>
        <TabsTrigger value="supplier" class="px-6">Supplier</TabsTrigger>
        <TabsTrigger value="history" class="px-6">History</TabsTrigger>
      </TabsList>

      <!-- Overview Tab -->
      <TabsContent value="overview" class="space-y-6 pt-6">
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
          <!-- Left Column -->
          <div class="md:col-span-2 space-y-6">
            <!-- General Information -->
            <Card>
              <CardHeader>
                <CardTitle class="flex items-center gap-2 text-lg">
                  <FileText class="size-5" />General Information
                </CardTitle>
              </CardHeader>
              <CardContent class="grid grid-cols-2 gap-6">
                <div class="space-y-1">
                  <p class="text-xs font-bold uppercase text-muted-foreground tracking-widest">Department</p>
                  <p class="font-bold text-lg">{{ requisition.department }}</p>
                </div>
                <div class="space-y-1">
                  <p class="text-xs font-bold uppercase text-muted-foreground tracking-widest">Procurement Type</p>
                  <div class="flex items-center gap-2">
                    <component :is="getProcurementTypeIcon(requisition.procurementType)" class="size-4 text-muted-foreground" />
                    <span class="font-bold">{{ getProcurementTypeLabel(requisition.procurementType) }}</span>
                  </div>
                </div>
                <div class="space-y-1">
                  <p class="text-xs font-bold uppercase text-muted-foreground tracking-widest">Job Card</p>
                  <p v-if="requisition.jobCardTitle" class="font-bold">{{ requisition.jobCardTitle }}</p>
                  <p v-else class="text-muted-foreground italic">Not linked</p>
                </div>
                <div class="space-y-1">
                  <p class="text-xs font-bold uppercase text-muted-foreground tracking-widest">Total Estimated Cost</p>
                  <p class="font-bold text-2xl text-brand-secondary">{{ formatCurrency(requisition.totalEstimatedCost) }}</p>
                </div>

                <!-- Approved Metadata -->
                <template v-if="requisition.status === 'APPROVED'">
                  <div class="space-y-1">
                    <p class="text-xs font-bold uppercase text-muted-foreground tracking-widest">Approved By</p>
                    <p class="font-medium">{{ requisition.approvedBy || 'Approver' }}</p>
                  </div>
                  <div class="space-y-1">
                    <p class="text-xs font-bold uppercase text-muted-foreground tracking-widest">Approved At</p>
                    <p class="font-medium">{{ formatDate(requisition.approvedAt) }}</p>
                  </div>
                </template>

                <!-- Rejected Metadata -->
                <template v-if="requisition.status === 'REJECTED'">
                  <div class="space-y-1">
                    <p class="text-xs font-bold uppercase text-muted-foreground tracking-widest">Rejected By</p>
                    <p class="font-medium">{{ requisition.rejectedBy || 'Rejecter' }}</p>
                  </div>
                  <div class="space-y-1">
                    <p class="text-xs font-bold uppercase text-muted-foreground tracking-widest">Rejected At</p>
                    <p class="font-medium">{{ formatDate(requisition.rejectedAt) }}</p>
                  </div>
                  <div class="col-span-2 space-y-1">
                    <p class="text-xs font-bold uppercase text-muted-foreground tracking-widest">Rejection Reason</p>
                    <p class="text-foreground">{{ requisition.rejectionReason || 'No reason provided' }}</p>
                  </div>
                </template>

                <div class="col-span-2 space-y-1">
                  <p class="text-xs font-bold uppercase text-muted-foreground tracking-widest">Description</p>
                  <p class="text-foreground">{{ requisition.description }}</p>
                </div>
              </CardContent>
            </Card>

            <!-- Financial Summary -->
            <Card>
              <CardHeader>
                <CardTitle class="flex items-center gap-2 text-lg">
                  <DollarSign class="size-5" />Financial Summary
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div class="bg-muted/30 p-4 rounded-lg">
                    <p class="text-xs font-bold uppercase text-muted-foreground tracking-widest">Total Cost</p>
                    <p class="text-2xl font-bold">{{ formatCurrency(lineItemTotals.totalCost) }}</p>
                  </div>
                  <div class="bg-muted/30 p-4 rounded-lg">
                    <p class="text-xs font-bold uppercase text-muted-foreground tracking-widest">Total Selling Price</p>
                    <p class="text-2xl font-bold text-green-600">{{ formatCurrency(lineItemTotals.totalSellingPrice) }}</p>
                  </div>
                  <div class="bg-muted/30 p-4 rounded-lg">
                    <p class="text-xs font-bold uppercase text-muted-foreground tracking-widest">Margin</p>
                    <p class="text-2xl font-bold text-blue-600">
                      {{ lineItemTotals.totalCost > 0 ? (((lineItemTotals.totalSellingPrice - lineItemTotals.totalCost) / lineItemTotals.totalCost) * 100).toFixed(1) : '0' }}%
                    </p>
                  </div>
                  <div class="bg-muted/30 p-4 rounded-lg">
                    <p class="text-xs font-bold uppercase text-muted-foreground tracking-widest">Items</p>
                    <p class="text-2xl font-bold">{{ requisition.items.length }}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <!-- Right Column -->
          <div class="space-y-6">
            <!-- Status Timeline -->
            <Card>
              <CardHeader>
                <CardTitle class="flex items-center gap-2 text-lg">
                  <Clock class="size-5" />Status Timeline
                </CardTitle>
              </CardHeader>
              <CardContent class="space-y-4">
                <div class="flex items-start gap-3">
                  <div class="mt-0.5 p-1.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600">
                    <Clock class="size-3" />
                  </div>
                  <div>
                    <p class="font-bold text-xs uppercase text-blue-600">Created</p>
                    <p class="font-medium">{{ formatDate(requisition.createdAt) }}</p>
                    <p class="text-xs text-muted-foreground mt-0.5">{{ requisition.requestedByName || requisition.requestedBy }}</p>
                  </div>
                </div>

                <div v-if="requisition.status === 'SUBMITTED'" class="flex items-start gap-3">
                  <div class="mt-0.5 p-1.5 rounded-full bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600">
                    <Clock class="size-3" />
                  </div>
                  <div>
                    <p class="font-bold text-xs uppercase text-yellow-600">Submitted for Approval</p>
                    <p class="text-xs text-muted-foreground mt-0.5">Awaiting approval</p>
                  </div>
                </div>

                <div v-if="requisition.status === 'APPROVED'" class="flex items-start gap-3">
                  <div class="mt-0.5 p-1.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-600">
                    <CheckCircle2 class="size-3" />
                  </div>
                  <div>
                    <p class="font-bold text-xs uppercase text-green-600">Approved</p>
                    <p v-if="requisition.approvedAt" class="font-medium">{{ formatDate(requisition.approvedAt) }}</p>
                    <p class="text-xs text-muted-foreground mt-0.5">{{ requisition.approvedBy || 'Approver' }}</p>
                  </div>
                </div>

                <div v-if="requisition.status === 'REJECTED'" class="flex items-start gap-3">
                  <div class="mt-0.5 p-1.5 rounded-full bg-red-100 dark:bg-red-900/30 text-destructive">
                    <XCircle class="size-3" />
                  </div>
                  <div>
                    <p class="font-bold text-xs uppercase text-destructive">Rejected</p>
                    <p class="text-xs text-muted-foreground mt-0.5">{{ requisition.requestedByName || requisition.requestedBy }}</p>
                  </div>
                </div>

                <div v-if="requisition.updatedAt" class="flex items-start gap-3">
                  <div class="mt-0.5 p-1.5 rounded-full bg-muted text-muted-foreground">
                    <Clock class="size-3" />
                  </div>
                  <div>
                    <p class="font-bold text-xs uppercase text-muted-foreground">Last Updated</p>
                    <p class="font-medium">{{ formatDate(requisition.updatedAt) }}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <!-- Quick Actions -->
            <Card>
              <CardHeader>
                <CardTitle class="flex items-center gap-2 text-lg">
                  <Briefcase class="size-5" />Quick Actions
                </CardTitle>
              </CardHeader>
              <CardContent class="space-y-3">
                <Button variant="outline" class="w-full justify-start gap-2">
                  <Mail class="size-4" />Email Supplier
                </Button>
                <Button variant="outline" class="w-full justify-start gap-2">
                  <Download class="size-4" />Export as PDF
                </Button>
                <Button variant="outline" class="w-full justify-start gap-2" @click="handleGeneratePO">
                  <FileText class="size-4" />Generate PO
                </Button>
                <Separator />
                <Button 
                  variant="outline" 
                  class="w-full justify-start gap-2 text-destructive hover:text-destructive hover:bg-destructive/10" 
                  @click="showDeleteConfirm = true"
                  v-if="canDelete && !hasExistingPO"
                >
                  <Trash2 class="size-4" />Delete Requisition
                </Button>
                <div v-else-if="canDelete && hasExistingPO" class="text-[10px] text-muted-foreground px-2 italic">
                  Delete disabled: PO already linked
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </TabsContent>

      <!-- Line Items Tab -->
      <TabsContent value="line-items" class="space-y-6 pt-6">
        <Card>
          <CardHeader>
            <CardTitle class="flex items-center gap-2 text-lg">
              <Package class="size-5" />Line Items ({{ requisition.items.length }})
            </CardTitle>
            <CardDescription>Detailed breakdown of requested items</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Description</TableHead>
                  <TableHead class="text-center">UOM</TableHead>
                  <TableHead class="text-center">Qty</TableHead>
                  <TableHead class="text-right">Unit Cost</TableHead>
                  <TableHead class="text-right">Freight/Duty</TableHead>
                  <TableHead class="text-right">Total Cost</TableHead>
                  <TableHead class="text-right">Markup</TableHead>
                  <TableHead class="text-right">Selling Price</TableHead>
                  <TableHead class="text-center">Inventory Status</TableHead>
                  <TableHead class="text-center">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow v-for="(item, index) in requisition.items" :key="index">
                  <TableCell class="font-medium">
                    <div>
                      <p>{{ item.description }}</p>
                      <p v-if="item.notes" class="text-xs text-muted-foreground mt-1">{{ item.notes }}</p>
                    </div>
                  </TableCell>
                  <TableCell class="text-center font-mono">{{ item.uom }}</TableCell>
                  <TableCell class="text-center font-mono">{{ item.qty }}</TableCell>
                  <TableCell class="text-right font-mono">{{ formatCurrency(item.unitCostPrice) }}</TableCell>
                  <TableCell class="text-right font-mono">{{ formatCurrency(item.freightDuty) }}</TableCell>
                  <TableCell class="text-right font-bold">{{ formatCurrency(item.totalCost) }}</TableCell>
                  <TableCell class="text-right font-mono">{{ item.markupPercent }}%</TableCell>
                  <TableCell class="text-right font-bold text-green-600">{{ formatCurrency(item.sellingPrice) }}</TableCell>
                  <TableCell class="text-center">
                    <Badge :variant="getInventoryItemStatusVariant(item.inventoryItemStatus)">
                      {{ getInventoryItemStatusLabel(item.inventoryItemStatus) }}
                    </Badge>
                    <div v-if="item.sku" class="text-xs text-muted-foreground mt-1">SKU: {{ item.sku }}</div>
                  </TableCell>
                  <TableCell class="text-center">
                    <Button variant="ghost" size="icon">
                      <Eye class="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>

            <!-- Totals Footer -->
            <div class="mt-6 border-t pt-4">
              <div class="flex justify-end">
                <div class="w-64 space-y-2">
                  <div class="flex justify-between">
                    <span class="font-medium">Total Cost:</span>
                    <span class="font-bold">{{ formatCurrency(lineItemTotals.totalCost) }}</span>
                  </div>
                  <div class="flex justify-between">
                    <span class="font-medium">Total Selling Price:</span>
                    <span class="font-bold text-green-600">{{ formatCurrency(lineItemTotals.totalSellingPrice) }}</span>
                  </div>
                  <div class="flex justify-between border-t pt-2">
                    <span class="font-medium">Gross Margin:</span>
                    <span class="font-bold text-blue-600">
                      {{ lineItemTotals.totalCost > 0 ? (((lineItemTotals.totalSellingPrice - lineItemTotals.totalCost) / lineItemTotals.totalCost) * 100).toFixed(1) : '0' }}%
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      <!-- Supplier Tab -->
      <TabsContent value="supplier" class="space-y-6 pt-6">
        <Card>
          <CardHeader>
            <CardTitle class="flex items-center gap-2 text-lg">
              <Truck class="size-5" />Supplier Information
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div v-if="requisition.supplierName" class="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div class="space-y-4">
                <div class="space-y-1">
                  <p class="text-xs font-bold uppercase text-muted-foreground tracking-widest">Supplier Name</p>
                  <p class="text-xl font-bold">{{ requisition.supplierName }}</p>
                </div>
                <div class="space-y-1">
                  <p class="text-xs font-bold uppercase text-muted-foreground tracking-widest">Contact Person</p>
                  <div class="flex items-center gap-2">
                    <User class="size-4 text-muted-foreground" />
                    <span class="font-medium">{{ requisition.supplierName }}</span>
                  </div>
                </div>
                <div class="space-y-1">
                  <p class="text-xs font-bold uppercase text-muted-foreground tracking-widest">Contact Details</p>
                  <div class="space-y-1">
                    <p class="font-medium">Email: {{ requisition.supplierName }}</p>
                    <p class="font-medium">Phone: {{ requisition.supplierName }}</p>
                  </div>
                </div>
              </div>
              <div class="space-y-4">
                <div class="space-y-1">
                  <p class="text-xs font-bold uppercase text-muted-foreground tracking-widest">Address</p>
                  <p class="text-foreground">{{ requisition.supplierName }}</p>
                </div>
                <div class="space-y-1">
                  <p class="text-xs font-bold uppercase text-muted-foreground tracking-widest">Payment Terms</p>
                  <Badge variant="outline">{{ requisition.supplierName }}</Badge>
                </div>
                <div class="space-y-1">
                  <p class="text-xs font-bold uppercase text-muted-foreground tracking-widest">Categories</p>
                  <div class="flex flex-wrap gap-2">
                    <Badge v-for="(cat, idx) in ['Material', 'Equipment']" :key="idx" variant="secondary">{{ cat }}</Badge>
                  </div>
                </div>
              </div>
            </div>
            <div v-else class="text-center py-8">
              <Truck class="size-12 mx-auto text-muted-foreground/50 mb-4" />
              <h3 class="text-lg font-semibold">No Supplier Assigned</h3>
              <p class="text-muted-foreground max-w-md mx-auto mt-2">This requisition doesn't have a supplier assigned yet. You can assign a supplier when editing the requisition.</p>
              <Button
                v-if="['DRAFT', 'APPROVED'].includes(requisition?.status) && hasAnyRole(['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'STOREKEEPER'])"
                @click="router.push(`/procurement/requisitions/${requisition.id}/edit`)"
                class="mt-4"
              >
                <Edit class="mr-2 size-4" />Edit to Assign Supplier
              </Button>
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      <!-- History Tab -->
      <TabsContent value="history" class="space-y-6 pt-6">
        <Card>
          <CardHeader>
            <CardTitle class="flex items-center gap-2 text-lg">
              <FileText class="size-5" />Audit Trail
            </CardTitle>
          </CardHeader>
          <CardContent class="space-y-4">
            <div class="space-y-4">
              <div class="flex items-start gap-3">
                <div class="mt-0.5 p-1.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600">
                  <Clock class="size-3" />
                </div>
                <div class="flex-1">
                  <p class="font-bold text-sm">Requisition Created</p>
                  <p class="text-sm text-muted-foreground">{{ formatDate(requisition.createdAt) }}</p>
                  <p class="text-xs text-muted-foreground">By {{ requisition.requestedByName || requisition.requestedBy }}</p>
                </div>
              </div>

              <div v-if="requisition.updatedAt" class="flex items-start gap-3">
                <div class="mt-0.5 p-1.5 rounded-full bg-muted text-muted-foreground">
                  <Edit class="size-3" />
                </div>
                <div class="flex-1">
                  <p class="font-bold text-sm">Last Updated</p>
                  <p class="text-sm text-muted-foreground">{{ formatDate(requisition.updatedAt) }}</p>
                </div>
              </div>

              <div v-if="requisition.status === 'SUBMITTED'" class="flex items-start gap-3">
                <div class="mt-0.5 p-1.5 rounded-full bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600">
                  <CheckCircle2 class="size-3" />
                </div>
                <div class="flex-1">
                  <p class="font-bold text-sm">Submitted for Approval</p>
                  <p class="text-sm text-muted-foreground">Awaiting approval from management</p>
                </div>
              </div>

              <div v-if="requisition.status === 'APPROVED'" class="flex items-start gap-3">
                <div class="mt-0.5 p-1.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-600">
                  <CheckCircle2 class="size-3" />
                </div>
                <div class="flex-1">
                  <p class="font-bold text-sm">Approved</p>
                  <p v-if="requisition.approvedAt" class="text-sm text-muted-foreground">{{ formatDate(requisition.approvedAt) }}</p>
                  <p class="text-xs text-muted-foreground">By {{ requisition.approvedBy || 'Approver' }}</p>
                </div>
              </div>

              <div v-if="requisition.status === 'REJECTED'" class="flex items-start gap-3">
                <div class="mt-0.5 p-1.5 rounded-full bg-red-100 dark:bg-red-900/30 text-destructive">
                  <XCircle class="size-3" />
                </div>
                <div class="flex-1">
                  <p class="font-bold text-sm">Rejected</p>
                  <p v-if="requisition.rejectionReason" class="text-sm text-muted-foreground">Reason: {{ requisition.rejectionReason }}</p>
                  <p class="text-xs text-muted-foreground">By {{ requisition.requestedByName || requisition.requestedBy }}</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>

    <!-- Rejection Dialog -->
    <Dialog
      :open="showRejectDialog"
      @update:open="(value: boolean) => showRejectDialog = value"
    >
      <DialogContent class="max-w-md">
        <DialogHeader>
          <DialogTitle class="flex items-center gap-2">
            <XCircle
              class="text-destructive"
              :size="20"
            />
            Reject Requisition
          </DialogTitle>
        </DialogHeader>

        <div class="py-2 space-y-2">
          <p class="text-sm text-muted-foreground">
            Please provide a reason for rejecting
            <span class="font-semibold">
              {{ requisition?.prNumber }}
            </span>.
            The requester will see this reason.
          </p>
          <Textarea
            v-model="rejectionReason"
            placeholder="e.g. Budget not approved for this
              period. Please resubmit in Q3..."
            rows="4"
            class="resize-none"
            :class="{
              'border-destructive': rejectionReasonError
            }"
          />
          <p
            v-if="rejectionReasonError"
            class="text-xs text-destructive"
          >
            {{ rejectionReasonError }}
          </p>
        </div>

        <DialogFooter class="gap-2">
          <Button
            variant="outline"
            @click="showRejectDialog = false"
            :disabled="isRejecting"
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            @click="confirmReject"
            :disabled="isRejecting"
          >
            <Loader2
              v-if="isRejecting"
              class="mr-2 animate-spin"
              :size="16"
            />
            {{ isRejecting ? 'Rejecting...' : 'Confirm Reject' }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>

<style scoped>
@reference "@/styles/main.css";
/* Custom badge variants for procurement types */
.badge-blue {
  @apply bg-blue-100 text-blue-800 border-blue-200;
}
.badge-purple {
  @apply bg-purple-100 text-purple-800 border-purple-200;
}
.badge-orange {
  @apply bg-orange-100 text-orange-800 border-orange-200;
}
.badge-teal {
  @apply bg-teal-100 text-teal-800 border-teal-200;
}
.badge-gray {
  @apply bg-gray-100 text-gray-800 border-gray-200;
}
</style>