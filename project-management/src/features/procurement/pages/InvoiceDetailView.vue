<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { db } from '@/lib/firebase'
import { doc, getDoc } from 'firebase/firestore'
import { useProcurementStore } from '../store/procurementStore'
import { useSession } from '@/composables/useSession'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  ArrowLeft,
  Loader2,
  CheckCircle,
  XCircle,
  AlertCircle,
  TriangleAlert,
  FileText,
  CreditCard,
  Paperclip,
  ExternalLink,
} from 'lucide-vue-next'
import { format } from 'date-fns'
import { toast } from 'vue-sonner'
import type { SupplierInvoice, InvoiceStatus, MatchStatus } from '../types/procurement'

const route = useRoute()
const router = useRouter()
const procurementStore = useProcurementStore()
const { hasAnyRole } = useSession()

const invoiceId = route.params.id as string

const loading = ref(true)
const updating = ref(false)
const invoice = ref<SupplierInvoice | null>(null)

// Dispute dialog
const showDisputeDialog = ref(false)
const disputeReason = ref('')
const disputeSubmitting = ref(false)

onMounted(async () => {
  try {
    const snap = await getDoc(doc(db, 'procurementSupplierInvoices', invoiceId))
    if (snap.exists()) {
      invoice.value = { id: snap.id, ...snap.data() } as SupplierInvoice
    } else {
      toast.error('Invoice not found')
      router.push('/procurement/invoices')
    }
  } catch (error) {
    console.error('Error loading invoice:', error)
    toast.error('Failed to load invoice')
    router.push('/procurement/invoices')
  } finally {
    loading.value = false
  }
})

// ── Role gate ──────────────────────────────────────────────
const canActOnInvoice = computed(() =>
  hasAnyRole(['SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT', 'TECHNICAL'])
)

// ── Overdue ────────────────────────────────────────────────
function isOverdue(dateStr: string): boolean {
  if (!dateStr) return false
  try {
    return new Date(dateStr) < new Date(new Date().toDateString())
  } catch {
    return false
  }
}

// ── Formatters ─────────────────────────────────────────────
function formatDate(dateStr: string): string {
  if (!dateStr) return '—'
  try {
    return format(new Date(dateStr), 'MMM dd, yyyy')
  } catch {
    return dateStr
  }
}

function formatTimestamp(ts: any): string {
  if (!ts) return '—'
  try {
    return format(ts.toDate(), 'MMM dd, yyyy HH:mm')
  } catch {
    return '—'
  }
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(amount)
}

// ── Status badges ──────────────────────────────────────────
function getStatusClass(status: InvoiceStatus): string {
  switch (status) {
    case 'DRAFT':             return 'bg-gray-100 text-gray-700 border-gray-200'
    case 'PENDING_MATCH':     return 'bg-yellow-100 text-yellow-700 border-yellow-200'
    case 'MATCHED':           return 'bg-blue-100 text-blue-700 border-blue-200'
    case 'VARIANCE_FLAGGED':  return 'bg-amber-100 text-amber-700 border-amber-200'
    case 'APPROVED':          return 'bg-green-100 text-green-700 border-green-200'
    case 'PAYMENT_PENDING':   return 'bg-purple-100 text-purple-700 border-purple-200'
    case 'PAYMENT_PROCESSED': return 'bg-green-100 text-green-700 border-green-200'
    case 'DISPUTED':          return 'bg-red-100 text-red-700 border-red-200'
    default:                  return ''
  }
}

function getStatusLabel(status: InvoiceStatus): string {
  switch (status) {
    case 'DRAFT':             return 'Draft'
    case 'PENDING_MATCH':     return 'Pending Review'
    case 'MATCHED':           return 'Matched'
    case 'VARIANCE_FLAGGED':  return 'Variance Flagged'
    case 'APPROVED':          return 'Approved'
    case 'PAYMENT_PENDING':   return 'Payment Pending'
    case 'PAYMENT_PROCESSED': return 'Paid'
    case 'DISPUTED':          return 'Disputed'
    default:                  return status
  }
}

function getMatchStatusClass(status: MatchStatus): string {
  switch (status) {
    case 'MATCHED':                    return 'bg-green-100 text-green-700 border-green-200'
    case 'VARIANCE_WITHIN_THRESHOLD':  return 'bg-amber-100 text-amber-700 border-amber-200'
    case 'VARIANCE_EXCEEDED':          return 'bg-red-100 text-red-700 border-red-200'
    case 'OVERRIDE_APPROVED':          return 'bg-purple-100 text-purple-700 border-purple-200'
    case 'PENDING':                    return 'bg-gray-100 text-gray-700 border-gray-200'
    default:                           return ''
  }
}

function getMatchStatusLabel(status: MatchStatus): string {
  switch (status) {
    case 'MATCHED':                    return 'Matched'
    case 'VARIANCE_WITHIN_THRESHOLD':  return 'Minor Variance'
    case 'VARIANCE_EXCEEDED':          return 'Variance Exceeded'
    case 'OVERRIDE_APPROVED':          return 'Override Approved'
    case 'PENDING':                    return 'Pending'
    default:                           return status
  }
}

function getVarianceClass(variance: number): string {
  if (variance === 0) return 'text-green-600'
  if (Math.abs(variance / (invoice.value?.expectedAmount || 1)) * 100 <= 10) return 'text-amber-600'
  return 'text-red-600'
}

// ── Can approve: PENDING_MATCH, not VARIANCE_EXCEEDED without override ──
const canApprove = computed(() => {
  if (!invoice.value) return false
  if (invoice.value.status !== 'PENDING_MATCH') return false
  if (
    invoice.value.matchStatus === 'VARIANCE_EXCEEDED' &&
    !invoice.value.matchOverrideReason
  ) return false
  return true
})

// ── Actions ────────────────────────────────────────────────
async function handleApprove() {
  if (!invoice.value || !canActOnInvoice.value) return
  updating.value = true
  try {
    await procurementStore.updateSupplierInvoice(invoiceId, {
      status: 'APPROVED'
    })
    invoice.value.status = 'APPROVED'
    toast.success('Invoice approved')
  } catch (error) {
    console.error('Error approving invoice:', error)
    toast.error('Failed to approve invoice')
  } finally {
    updating.value = false
  }
}

async function handleDispute() {
  if (!invoice.value || !disputeReason.value.trim()) return
  disputeSubmitting.value = true
  try {
    await procurementStore.updateSupplierInvoice(invoiceId, {
      status: 'DISPUTED',
      notes: disputeReason.value.trim()
    })
    invoice.value.status = 'DISPUTED'
    invoice.value.notes = disputeReason.value.trim()
    showDisputeDialog.value = false
    disputeReason.value = ''
    toast.success('Invoice flagged as disputed')
  } catch (error) {
    console.error('Error flagging dispute:', error)
    toast.error('Failed to update invoice')
  } finally {
    disputeSubmitting.value = false
  }
}
</script>

<template>
  <!-- Loading -->
  <div v-if="loading" class="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-6xl mx-auto">
    <div class="space-y-4">
      <Skeleton class="h-10 w-48" />
      <Skeleton class="h-64 w-full" />
    </div>
    <Skeleton class="h-64 w-full" />
  </div>

  <div v-else-if="invoice" class="space-y-6 max-w-6xl mx-auto">

    <!-- Header -->
    <div class="flex flex-col md:flex-row md:items-start justify-between gap-4">
      <div class="flex items-start gap-4">
        <Button variant="outline" size="icon" @click="router.push('/procurement/invoices')">
          <ArrowLeft class="size-4" />
        </Button>
        <div>
          <p class="text-sm font-medium text-muted-foreground uppercase tracking-widest">Supplier Invoice</p>
          <h2 class="text-2xl font-extrabold tracking-tight flex items-center gap-3 flex-wrap">
            <span class="font-mono">{{ invoice.invoiceNumber }}</span>
            <Badge variant="outline" :class="getStatusClass(invoice.status)" class="uppercase text-xs tracking-wider font-bold">
              {{ getStatusLabel(invoice.status) }}
            </Badge>
            <Badge variant="outline" :class="getMatchStatusClass(invoice.matchStatus)" class="uppercase text-xs tracking-wider font-bold">
              {{ getMatchStatusLabel(invoice.matchStatus) }}
            </Badge>
          </h2>
          <p class="text-muted-foreground text-sm mt-0.5">{{ invoice.supplierName }}</p>
        </div>
      </div>

      <!-- Action Buttons -->
      <div v-if="canActOnInvoice" class="flex items-center gap-2 flex-wrap">
        <!-- PENDING_MATCH actions -->
        <template v-if="invoice.status === 'PENDING_MATCH'">
          <Button
            v-if="canApprove"
            variant="default"
            class="bg-green-600 hover:bg-green-700"
            :disabled="updating"
            @click="handleApprove"
          >
            <Loader2 v-if="updating" class="size-4 mr-2 animate-spin" />
            <CheckCircle v-else class="size-4 mr-2" />
            Approve Invoice
          </Button>
          <Button
            variant="outline"
            class="border-destructive text-destructive hover:bg-destructive/10"
            :disabled="updating"
            @click="showDisputeDialog = true"
          >
            <XCircle class="size-4 mr-2" />
            Flag as Disputed
          </Button>
        </template>

        <!-- APPROVED: process payment -->
        <template v-if="invoice.status === 'APPROVED'">
          <Button
            variant="default"
            :disabled="updating"
            @click="router.push(`/procurement/invoices/${invoiceId}/payment`)"
          >
            <CreditCard class="size-4 mr-2" />
            Process Payment
          </Button>
        </template>
      </div>
    </div>

    <!-- Two Column Layout -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">

      <!-- LEFT: Invoice Info Card -->
      <Card>
        <CardHeader>
          <CardTitle class="flex items-center gap-2">
            <FileText class="size-5" />
            Invoice Information
          </CardTitle>
        </CardHeader>
        <CardContent class="space-y-4">
          <div class="space-y-1">
            <p class="text-xs font-bold uppercase text-muted-foreground tracking-widest">Invoice Number</p>
            <p class="font-bold font-mono text-lg">{{ invoice.invoiceNumber }}</p>
          </div>

          <div class="space-y-1">
            <p class="text-xs font-bold uppercase text-muted-foreground tracking-widest">Supplier</p>
            <p class="font-bold">{{ invoice.supplierName }}</p>
            <p class="text-sm text-muted-foreground">{{ invoice.supplierEmail }}</p>
          </div>

          <div class="grid grid-cols-2 gap-4">
            <div class="space-y-1">
              <p class="text-xs font-bold uppercase text-muted-foreground tracking-widest">Invoice Date</p>
              <p class="font-medium">{{ formatDate(invoice.invoiceDate) }}</p>
            </div>
            <div class="space-y-1">
              <p class="text-xs font-bold uppercase text-muted-foreground tracking-widest">Due Date</p>
              <p
                class="font-medium"
                :class="isOverdue(invoice.dueDate) && invoice.status !== 'PAYMENT_PROCESSED' ? 'text-red-600 font-bold' : ''"
              >
                {{ formatDate(invoice.dueDate) }}
                <span v-if="isOverdue(invoice.dueDate) && invoice.status !== 'PAYMENT_PROCESSED'" class="text-xs ml-1">(Overdue)</span>
              </p>
            </div>
          </div>

          <div class="space-y-1">
            <p class="text-xs font-bold uppercase text-muted-foreground tracking-widest">Currency</p>
            <p class="font-mono font-bold">{{ invoice.currency }}</p>
          </div>

          <Separator />

          <div class="space-y-2">
            <p class="text-xs font-bold uppercase text-muted-foreground tracking-widest">Linked Documents</p>
            <div class="space-y-1.5 text-sm">
              <div class="flex items-center gap-2">
                <span class="text-muted-foreground w-8">PO</span>
                <button
                  class="font-mono text-primary hover:underline underline-offset-4"
                  @click="router.push(`/procurement/purchase-orders/${invoice.poId}`)"
                >
                  {{ invoice.poNumber }}
                </button>
              </div>
              <div class="flex items-center gap-2">
                <span class="text-muted-foreground w-8">GRN</span>
                <button
                  class="font-mono text-primary hover:underline underline-offset-4"
                  @click="router.push(`/procurement/grns/${invoice.grnId}`)"
                >
                  {{ invoice.grnNumber }}
                </button>
              </div>
              <div class="flex items-center gap-2">
                <span class="text-muted-foreground w-8">PR</span>
                <button
                  class="font-mono text-primary hover:underline underline-offset-4"
                  @click="router.push(`/procurement/requisitions/${invoice.prId}`)"
                >
                  {{ invoice.prNumber }}
                </button>
              </div>
            </div>
          </div>

          <div v-if="invoice.notes" class="space-y-1">
            <p class="text-xs font-bold uppercase text-muted-foreground tracking-widest">Notes</p>
            <p class="text-sm whitespace-pre-line">{{ invoice.notes }}</p>
          </div>

          <div v-if="invoice.attachmentUrl" class="space-y-1">
            <p class="text-xs font-bold uppercase text-muted-foreground tracking-widest">Attachment</p>
            <a
              :href="invoice.attachmentUrl"
              target="_blank"
              class="inline-flex items-center gap-1.5 text-sm text-primary hover:underline underline-offset-4"
            >
              <Paperclip class="size-3.5" />
              View Invoice Scan
              <ExternalLink class="size-3" />
            </a>
          </div>

          <!-- Override reason alert -->
          <Alert v-if="invoice.matchStatus === 'OVERRIDE_APPROVED' && invoice.matchOverrideReason" class="border-amber-200 bg-amber-50">
            <TriangleAlert class="size-4 text-amber-600" />
            <AlertDescription class="text-sm">
              <p class="font-bold text-amber-800 mb-1">Override Reason</p>
              <p class="text-amber-700 whitespace-pre-line">{{ invoice.matchOverrideReason }}</p>
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      <!-- RIGHT: Financial Summary Card -->
      <Card>
        <CardHeader>
          <CardTitle class="flex items-center gap-2">
            <CreditCard class="size-5" />
            Financial Summary
          </CardTitle>
        </CardHeader>
        <CardContent class="space-y-3">
          <div class="flex justify-between items-center py-1">
            <span class="text-sm text-muted-foreground">Expected Amount (from GRN)</span>
            <span class="font-mono font-medium">{{ formatCurrency(invoice.expectedAmount) }}</span>
          </div>
          <div class="flex justify-between items-center py-1">
            <span class="text-sm text-muted-foreground">Invoice Subtotal</span>
            <span class="font-mono font-medium">{{ formatCurrency(invoice.subtotal) }}</span>
          </div>
          <div class="flex justify-between items-center py-1">
            <span class="text-sm text-muted-foreground">Tax</span>
            <span class="font-mono font-medium">{{ formatCurrency(invoice.tax) }}</span>
          </div>
          <Separator />
          <div class="flex justify-between items-center py-2">
            <span class="font-bold uppercase tracking-widest text-sm">Invoice Total</span>
            <span class="font-mono font-extrabold text-2xl">{{ formatCurrency(invoice.totalAmount) }}</span>
          </div>
          <Separator />
          <div class="flex justify-between items-center py-1">
            <span class="text-sm text-muted-foreground">Variance</span>
            <span class="font-mono font-bold" :class="getVarianceClass(invoice.matchVariance)">
              {{ formatCurrency(invoice.matchVariance) }}
            </span>
          </div>
          <div class="flex justify-between items-center py-1">
            <span class="text-sm text-muted-foreground">Variance %</span>
            <span class="font-mono font-bold" :class="getVarianceClass(invoice.matchVariance)">
              {{ invoice.matchVariancePercent.toFixed(1) }}%
            </span>
          </div>
          <div class="flex justify-between items-center py-1">
            <span class="text-sm text-muted-foreground">Match Status</span>
            <Badge variant="outline" :class="getMatchStatusClass(invoice.matchStatus)" class="text-xs font-bold uppercase tracking-wider">
              {{ getMatchStatusLabel(invoice.matchStatus) }}
            </Badge>
          </div>
        </CardContent>
      </Card>
    </div>

    <!-- Full Width: Line Items -->
    <Card>
      <CardHeader>
        <CardTitle>Line Items</CardTitle>
      </CardHeader>
      <CardContent class="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead class="pl-6">Description</TableHead>
              <TableHead class="text-center">Qty</TableHead>
              <TableHead class="text-right">Unit Cost</TableHead>
              <TableHead class="text-right pr-6">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow v-for="(item, i) in invoice.items" :key="i">
              <TableCell class="pl-6">{{ item.description }}</TableCell>
              <TableCell class="text-center font-mono">{{ item.qty }}</TableCell>
              <TableCell class="text-right font-mono">{{ formatCurrency(item.unitCost) }}</TableCell>
              <TableCell class="text-right font-mono font-bold pr-6">{{ formatCurrency(item.totalCost) }}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>

    <!-- Payment Details (PAYMENT_PROCESSED only) -->
    <Card v-if="invoice.status === 'PAYMENT_PROCESSED'" class="border-green-200 bg-green-50 dark:bg-green-950/30 dark:border-green-800">
      <CardContent class="pt-5">
        <div class="flex items-center gap-2 mb-4">
          <CheckCircle class="size-5 text-green-600" />
          <span class="font-semibold text-green-700 dark:text-green-300 text-base">Payment Processed</span>
        </div>
        <div class="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
          <span class="text-muted-foreground">Payment Method</span>
          <span class="font-medium font-mono">{{ invoice.paymentMethod || '—' }}</span>

          <span class="text-muted-foreground">Reference</span>
          <span class="font-mono text-sm font-bold">{{ invoice.paymentReference || '—' }}</span>

          <span class="text-muted-foreground">Processed At</span>
          <span>{{ formatTimestamp(invoice.paymentProcessedAt) }}</span>

          <span class="text-muted-foreground">Finance Record</span>
          <RouterLink
            v-if="invoice.operationalExpenseId"
            :to="`/opex/${invoice.operationalExpenseId}`"
            class="text-blue-600 hover:underline underline-offset-4 text-sm inline-flex items-center gap-1"
          >
            View in Finance Module
            <ExternalLink class="size-3" />
          </RouterLink>
          <span v-else class="text-muted-foreground">—</span>
        </div>
      </CardContent>
    </Card>

    <!-- Variance exceeded warning (no override) -->
    <Alert
      v-if="invoice.status === 'PENDING_MATCH' && invoice.matchStatus === 'VARIANCE_EXCEEDED' && !invoice.matchOverrideReason"
      class="border-destructive/50 bg-destructive/10"
    >
      <AlertCircle class="size-4 text-destructive" />
      <AlertDescription class="text-destructive font-medium">
        This invoice has a variance exceeding 10% with no override reason. It cannot be approved until the submitter provides an override reason.
      </AlertDescription>
    </Alert>

  </div>

  <!-- Not found -->
  <div v-else class="h-[400px] flex items-center justify-center">
    <Alert variant="destructive">
      <AlertCircle class="size-4" />
      <AlertDescription>Invoice not found</AlertDescription>
    </Alert>
  </div>

  <!-- Dispute Dialog -->
  <Dialog v-model:open="showDisputeDialog">
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Flag as Disputed</DialogTitle>
        <DialogDescription>
          Provide a reason for disputing this invoice. The supplier will need to resubmit.
        </DialogDescription>
      </DialogHeader>
      <div class="space-y-2 py-2">
        <label class="text-sm font-semibold">Dispute Reason <span class="text-destructive">*</span></label>
        <textarea
          v-model="disputeReason"
          rows="4"
          placeholder="Describe the issue with this invoice…"
          class="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
        />
      </div>
      <DialogFooter>
        <Button variant="outline" @click="showDisputeDialog = false">Cancel</Button>
        <Button
          variant="destructive"
          :disabled="!disputeReason.trim() || disputeSubmitting"
          @click="handleDispute"
        >
          <Loader2 v-if="disputeSubmitting" class="size-4 mr-2 animate-spin" />
          Confirm Dispute
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
