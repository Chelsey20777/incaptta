<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { db } from '@/lib/firebase'
import { doc, getDoc, collection, query, where, getDocs, serverTimestamp } from 'firebase/firestore'
import { useProcurementStore } from '../store/procurementStore'
import { useSession } from '@/composables/useSession'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import {
  ArrowLeft,
  Loader2,
  CheckCircle,
  XCircle,
  TriangleAlert,
  Plus,
  Trash2,
  Paperclip,
} from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import type { GoodsReceiptNote, PurchaseOrder, InvoiceLineItem, InvoiceStatus } from '../types/procurement'

const route = useRoute()
const router = useRouter()
const procurementStore = useProcurementStore()
const { user: currentUser } = useSession()

// ── Route param ────────────────────────────────────────────
const grnId = route.query.grnId as string

// ── Loading state ──────────────────────────────────────────
const loading = ref(true)
const saving = ref(false)
const uploading = ref(false)

// ── Source documents ───────────────────────────────────────
const grn = ref<GoodsReceiptNote | null>(null)
const po = ref<PurchaseOrder | null>(null)

// ── Form fields ────────────────────────────────────────────
const invoiceNumber = ref('')
const invoiceDate = ref(new Date().toISOString().split('T')[0] ?? '')
const dueDate = ref('')
const currency = ref<'USD' | 'ZWL' | 'ZAR'>('USD')
const notes = ref('')
const attachmentUrl = ref<string | null>(null)
const attachmentFile = ref<File | null>(null)
const overrideReason = ref('')

// ── Line items (editable) ──────────────────────────────────
const lineItems = ref<InvoiceLineItem[]>([])

// ── Tax ───────────────────────────────────────────────────
const tax = ref(0)

// ── Computed totals ────────────────────────────────────────
const subtotal = computed(() =>
  lineItems.value.reduce((sum, item) => sum + item.totalCost, 0)
)

const totalAmount = computed(() => subtotal.value + tax.value)

function computeExpectedAmount(): number {
  if (!grn.value) return 0
  return grn.value.items.reduce((sum, item) => {
    if (item.qtyReceived > 0) {
      return sum + item.qtyReceived * item.unitCostPrice
    }
    return sum
  }, 0)
}

const expectedAmount = computed(() => computeExpectedAmount())

const matchResult = computed(() =>
  procurementStore.computeInvoiceMatch(totalAmount.value, expectedAmount.value)
)

// ── Payment terms → suggested due date ────────────────────
function suggestDueDate(paymentTerms: string): string {
  const daysMap: Record<string, number> = {
    COD: 0, NET30: 30, NET60: 60, NET90: 90
  }
  const days = daysMap[paymentTerms] ?? 0
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0] ?? ''
}

// ── Mount: load GRN + PO, validate ────────────────────────
onMounted(async () => {
  if (!grnId) {
    toast.error('No GRN specified')
    router.push('/procurement/grns')
    return
  }

  try {
    // Load GRN
    const grnSnap = await getDoc(doc(db, 'procurementGrns', grnId))
    if (!grnSnap.exists()) {
      toast.error('GRN not found')
      router.push('/procurement/grns')
      return
    }
    grn.value = { id: grnSnap.id, ...grnSnap.data() } as GoodsReceiptNote

    // Validate: must be CONFIRMED
    if (grn.value.status !== 'CONFIRMED') {
      toast.error('Invoices can only be created for confirmed GRNs')
      router.push('/procurement/grns')
      return
    }

    // Check: no existing invoice for this GRN
    const existingSnap = await getDocs(
      query(
        collection(db, 'procurementSupplierInvoices'),
        where('grnId', '==', grnId)
      )
    )
    if (!existingSnap.empty) {
      const existingId = existingSnap.docs[0]!.id
      toast.error('An invoice already exists for this GRN')
      router.push(`/procurement/invoices/${existingId}`)
      return
    }

    // Load PO
    const poSnap = await getDoc(doc(db, 'procurementPurchaseOrders', grn.value.poId))
    if (poSnap.exists()) {
      po.value = { id: poSnap.id, ...poSnap.data() } as PurchaseOrder
    }

    // Pre-populate line items from GRN items where qtyReceived > 0
    lineItems.value = grn.value.items
      .filter(item => item.qtyReceived > 0)
      .map(item => ({
        description: item.description,
        qty: item.qtyReceived,
        unitCost: item.unitCostPrice,
        totalCost: item.qtyReceived * item.unitCostPrice,
      }))

    // Suggest due date from PO payment terms
    if (po.value?.paymentTerms) {
      dueDate.value = suggestDueDate(po.value.paymentTerms)
    }
  } catch (error) {
    console.error('Error loading GRN/PO:', error)
    toast.error('Failed to load GRN data')
    router.push('/procurement/grns')
  } finally {
    loading.value = false
  }
})

// ── Line item helpers ──────────────────────────────────────
function updateLineItemTotal(index: number) {
  const item = lineItems.value[index]
  if (!item) return
  item.totalCost = item.qty * item.unitCost
}

function addLineItem() {
  lineItems.value.push({ description: '', qty: 1, unitCost: 0, totalCost: 0 })
}

function removeLineItem(index: number) {
  lineItems.value.splice(index, 1)
}

// ── File upload ────────────────────────────────────────────
async function handleFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  if (!input.files?.length) return
  attachmentFile.value = input.files[0] ?? null
}

async function uploadAttachment(): Promise<string | null> {
  if (!attachmentFile.value) return null

  uploading.value = true
  try {
    const { getStorage, ref: storageRef, uploadBytes, getDownloadURL } =
      await import('firebase/storage')
    const storage = getStorage()
    const fileName = `procurement/invoices/${grnId}_${Date.now()}_${attachmentFile.value.name}`
    const ref = storageRef(storage, fileName)
    await uploadBytes(ref, attachmentFile.value)
    return await getDownloadURL(ref)
  } catch (error) {
    console.error('Upload error:', error)
    toast.error('Failed to upload attachment')
    return null
  } finally {
    uploading.value = false
  }
}

// ── Save invoice ───────────────────────────────────────────
async function saveInvoice(status: InvoiceStatus) {
  if (!grn.value || !po.value) return

  // Validation for submit
  if (status !== 'DRAFT') {
    if (!invoiceNumber.value.trim()) {
      toast.error('Invoice number is required')
      return
    }
    if (!invoiceDate.value) {
      toast.error('Invoice date is required')
      return
    }
    if (!dueDate.value) {
      toast.error('Due date is required')
      return
    }
    if (matchResult.value.matchStatus === 'VARIANCE_EXCEEDED' && overrideReason.value.trim().length < 10) {
      toast.error('Override reason required (min 10 characters) for variance exceeded')
      return
    }
  }

  saving.value = true
  try {
    // Upload attachment if selected
    if (attachmentFile.value && !attachmentUrl.value) {
      const url = await uploadAttachment()
      if (url) attachmentUrl.value = url
    }

    const expAmt = computeExpectedAmount()
    const { matchVariance, matchVariancePercent, matchStatus } =
      procurementStore.computeInvoiceMatch(totalAmount.value, expAmt)

    const isOverride =
      matchStatus === 'VARIANCE_EXCEEDED' &&
      overrideReason.value.trim().length >= 10

    const newInvoiceId = await procurementStore.addSupplierInvoice({
      invoiceNumber: invoiceNumber.value.trim(),
      poId: po.value.id,
      poNumber: po.value.poNumber,
      grnId: grn.value.id,
      grnNumber: grn.value.grnNumber,
      prId: grn.value.prId,
      prNumber: grn.value.prNumber,
      supplierId: grn.value.supplierId,
      supplierName: grn.value.supplierName,
      supplierEmail: po.value.supplierEmail,
      department: grn.value.department,
      currency: currency.value,
      invoiceDate: invoiceDate.value,
      dueDate: dueDate.value,
      items: lineItems.value,
      subtotal: subtotal.value,
      tax: tax.value,
      totalAmount: totalAmount.value,
      expectedAmount: expAmt,
      matchVariance,
      matchVariancePercent,
      matchStatus: isOverride ? 'OVERRIDE_APPROVED' : matchStatus,
      matchOverrideReason: isOverride ? overrideReason.value.trim() : null,
      matchOverrideBy: isOverride ? (currentUser.value?.uid ?? null) : null,
      matchOverrideAt: isOverride ? serverTimestamp() : null,
      status,
      notes: notes.value,
      attachmentUrl: attachmentUrl.value,
      operationalExpenseId: null,
      paymentMethod: null,
      paymentReference: null,
      paymentProcessedAt: null,
      createdBy: currentUser.value?.uid ?? '',
    })

    // Write linkedInvoiceId back to GRN
    await procurementStore.updateGrn(grn.value.id, {
      linkedInvoiceId: newInvoiceId
    })

    toast.success(
      status === 'DRAFT'
        ? 'Invoice saved as draft'
        : 'Invoice submitted for approval'
    )
    router.push(`/procurement/invoices/${newInvoiceId}`)
  } catch (error) {
    console.error('Error saving invoice:', error)
    toast.error('Failed to save invoice')
  } finally {
    saving.value = false
  }
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(amount)
}
</script>

<template>
  <!-- Loading -->
  <div v-if="loading" class="space-y-4 max-w-4xl mx-auto">
    <Skeleton class="h-10 w-64" />
    <Skeleton class="h-48 w-full" />
    <Skeleton class="h-64 w-full" />
  </div>

  <div v-else-if="grn && po" class="space-y-6 max-w-4xl mx-auto">
    <!-- Header -->
    <div class="flex items-start gap-4">
      <Button variant="outline" size="icon" @click="router.push(`/procurement/grns/${grn.id}`)">
        <ArrowLeft class="size-4" />
      </Button>
      <div>
        <p class="text-sm font-medium text-muted-foreground uppercase tracking-widest">New Supplier Invoice</p>
        <h2 class="text-2xl font-extrabold tracking-tight">Create Supplier Invoice</h2>
        <p class="text-muted-foreground text-sm mt-0.5">
          For <span class="font-mono font-bold">{{ grn.grnNumber }}</span> — {{ grn.supplierName }}
        </p>
      </div>
    </div>

    <!-- Section 1: Invoice Details -->
    <Card>
      <CardHeader>
        <CardTitle>Invoice Details</CardTitle>
      </CardHeader>
      <CardContent class="space-y-4">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <!-- Invoice Number -->
          <div class="space-y-1.5 sm:col-span-2">
            <label class="text-sm font-semibold">Supplier Invoice Number <span class="text-destructive">*</span></label>
            <input
              v-model="invoiceNumber"
              type="text"
              placeholder="e.g. INV-2026-001"
              class="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <p class="text-xs text-muted-foreground">As shown on the supplier's invoice document</p>
          </div>

          <!-- Invoice Date -->
          <div class="space-y-1.5">
            <label class="text-sm font-semibold">Invoice Date <span class="text-destructive">*</span></label>
            <input
              v-model="invoiceDate"
              type="date"
              class="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <!-- Due Date -->
          <div class="space-y-1.5">
            <label class="text-sm font-semibold">Due Date <span class="text-destructive">*</span></label>
            <input
              v-model="dueDate"
              type="date"
              class="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <p class="text-xs text-muted-foreground">
              Payment terms: <span class="font-mono font-bold">{{ po.paymentTerms }}</span>
            </p>
          </div>

          <!-- Currency -->
          <div class="space-y-1.5">
            <label class="text-sm font-semibold">Currency</label>
            <select
              v-model="currency"
              class="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="USD">USD</option>
              <option value="ZWL">ZWL</option>
              <option value="ZAR">ZAR</option>
            </select>
          </div>

          <!-- Attachment -->
          <div class="space-y-1.5">
            <label class="text-sm font-semibold">Upload Invoice Scan</label>
            <div class="flex items-center gap-2">
              <label
                class="flex items-center gap-2 cursor-pointer rounded-md border bg-background px-3 py-2 text-sm hover:bg-muted transition-colors"
                :class="uploading ? 'opacity-50 pointer-events-none' : ''"
              >
                <Paperclip class="size-4" />
                <span>{{ attachmentFile ? attachmentFile.name : 'Choose file…' }}</span>
                <input type="file" class="hidden" accept="image/*,.pdf" @change="handleFileChange" />
              </label>
              <Loader2 v-if="uploading" class="size-4 animate-spin text-muted-foreground" />
            </div>
            <a
              v-if="attachmentUrl"
              :href="attachmentUrl"
              target="_blank"
              class="text-xs text-primary underline"
            >
              View uploaded file
            </a>
          </div>
        </div>

        <!-- Notes -->
        <div class="space-y-1.5">
          <label class="text-sm font-semibold">Notes</label>
          <textarea
            v-model="notes"
            rows="2"
            placeholder="Optional notes…"
            class="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
          />
        </div>
      </CardContent>
    </Card>

    <!-- Section 2: GRN Reference (read-only) -->
    <Card class="bg-muted/50">
      <CardHeader>
        <div class="flex items-center gap-3">
          <CardTitle>GRN Reference</CardTitle>
          <Badge variant="outline" class="font-mono">{{ grn.grnNumber }}</Badge>
        </div>
        <CardDescription>Received quantities used to compute expected invoice total</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Description</TableHead>
              <TableHead class="text-center">Ordered</TableHead>
              <TableHead class="text-center">Received</TableHead>
              <TableHead class="text-right">Unit Cost</TableHead>
              <TableHead class="text-right">Line Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow v-for="(item, i) in grn.items" :key="i">
              <TableCell>{{ item.description }}</TableCell>
              <TableCell class="text-center font-mono">{{ item.qtyOrdered }}</TableCell>
              <TableCell class="text-center font-mono">{{ item.qtyReceived }}</TableCell>
              <TableCell class="text-right font-mono">{{ formatCurrency(item.unitCostPrice) }}</TableCell>
              <TableCell class="text-right font-mono">
                {{ formatCurrency(item.qtyReceived * item.unitCostPrice) }}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
        <div class="mt-4 border-t pt-3 flex justify-end">
          <div class="text-right">
            <p class="text-xs text-muted-foreground uppercase tracking-widest font-bold mb-1">Expected Invoice Total</p>
            <p class="text-2xl font-extrabold font-mono">{{ formatCurrency(expectedAmount) }}</p>
          </div>
        </div>
      </CardContent>
    </Card>

    <!-- Section 3: Invoice Line Items (editable) -->
    <Card>
      <CardHeader>
        <div class="flex items-center justify-between">
          <div>
            <CardTitle>Invoice Line Items</CardTitle>
            <CardDescription>Pre-filled from GRN — edit if supplier invoice differs</CardDescription>
          </div>
          <Button variant="outline" size="sm" @click="addLineItem">
            <Plus class="size-4 mr-1" />
            Add Row
          </Button>
        </div>
      </CardHeader>
      <CardContent class="space-y-0 p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead class="pl-6">Description</TableHead>
              <TableHead class="text-center w-24">Qty</TableHead>
              <TableHead class="text-center w-32">Unit Cost</TableHead>
              <TableHead class="text-right w-32">Total</TableHead>
              <TableHead class="w-10 pr-4"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow v-for="(item, index) in lineItems" :key="index">
              <TableCell class="pl-6">
                <input
                  v-model="item.description"
                  type="text"
                  class="w-full rounded border-0 bg-transparent px-0 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-primary rounded-sm px-2"
                />
              </TableCell>
              <TableCell class="text-center">
                <input
                  v-model.number="item.qty"
                  type="number"
                  min="0"
                  step="any"
                  class="w-20 text-center rounded border bg-background px-2 py-1 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                  @input="updateLineItemTotal(index)"
                />
              </TableCell>
              <TableCell class="text-center">
                <input
                  v-model.number="item.unitCost"
                  type="number"
                  min="0"
                  step="any"
                  class="w-28 text-right rounded border bg-background px-2 py-1 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                  @input="updateLineItemTotal(index)"
                />
              </TableCell>
              <TableCell class="text-right font-mono font-bold pr-4">
                {{ formatCurrency(item.totalCost) }}
              </TableCell>
              <TableCell class="pr-4">
                <button
                  @click="removeLineItem(index)"
                  class="text-muted-foreground hover:text-destructive transition-colors"
                  :disabled="lineItems.length <= 1"
                >
                  <Trash2 class="size-4" />
                </button>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>

        <!-- Totals -->
        <div class="border-t px-6 py-4 space-y-2">
          <div class="flex justify-end gap-8 text-sm">
            <span class="text-muted-foreground">Subtotal</span>
            <span class="font-mono font-bold w-32 text-right">{{ formatCurrency(subtotal) }}</span>
          </div>
          <div class="flex justify-end gap-8 text-sm items-center">
            <span class="text-muted-foreground">Tax</span>
            <div class="w-32 flex justify-end">
              <input
                v-model.number="tax"
                type="number"
                min="0"
                step="any"
                class="w-28 text-right rounded border bg-background px-2 py-1 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>
          <Separator />
          <div class="flex justify-end gap-8">
            <span class="font-bold uppercase tracking-widest text-sm">Total</span>
            <span class="font-mono font-extrabold text-xl w-32 text-right">{{ formatCurrency(totalAmount) }}</span>
          </div>
        </div>
      </CardContent>
    </Card>

    <!-- Section 4: Soft Match Result -->
    <div>
      <!-- Matched -->
      <Alert v-if="matchResult.matchStatus === 'MATCHED'" class="border-green-200 bg-green-50 text-green-800">
        <CheckCircle class="size-4 text-green-600" />
        <AlertDescription class="font-medium">
          Invoice matches GRN — no variance detected
        </AlertDescription>
      </Alert>

      <!-- Minor variance -->
      <Alert v-else-if="matchResult.matchStatus === 'VARIANCE_WITHIN_THRESHOLD'" class="border-amber-200 bg-amber-50 text-amber-800">
        <TriangleAlert class="size-4 text-amber-600" />
        <AlertDescription class="font-medium">
          Minor variance of {{ matchResult.matchVariancePercent.toFixed(1) }}%
          ({{ formatCurrency(matchResult.matchVariance) }}).
          This is within the 10% threshold and can be approved.
        </AlertDescription>
      </Alert>

      <!-- Variance exceeded -->
      <div v-else-if="matchResult.matchStatus === 'VARIANCE_EXCEEDED'" class="space-y-3">
        <Alert class="border-destructive/50 bg-destructive/10 text-destructive">
          <XCircle class="size-4" />
          <AlertDescription class="font-medium">
            Variance of {{ matchResult.matchVariancePercent.toFixed(1) }}%
            ({{ formatCurrency(matchResult.matchVariance) }}) exceeds the 10% threshold.
            An override reason is required.
          </AlertDescription>
        </Alert>

        <div class="space-y-1.5">
          <label class="text-sm font-semibold">Override Reason <span class="text-destructive">*</span></label>
          <textarea
            v-model="overrideReason"
            rows="3"
            placeholder="Explain the variance…"
            class="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
            :class="overrideReason.trim().length > 0 && overrideReason.trim().length < 10 ? 'border-destructive' : ''"
          />
          <p v-if="overrideReason.trim().length > 0 && overrideReason.trim().length < 10" class="text-xs text-destructive">
            Minimum 10 characters required
          </p>
        </div>
      </div>
    </div>

    <!-- Actions -->
    <div class="flex items-center justify-end gap-3 pb-8">
      <Button variant="outline" @click="router.push(`/procurement/grns/${grn.id}`)">
        Cancel
      </Button>
      <Button
        variant="outline"
        :disabled="saving"
        @click="saveInvoice('DRAFT')"
      >
        <Loader2 v-if="saving" class="size-4 mr-2 animate-spin" />
        Save as Draft
      </Button>
      <Button
        variant="default"
        :disabled="saving"
        @click="saveInvoice('PENDING_MATCH')"
      >
        <Loader2 v-if="saving" class="size-4 mr-2 animate-spin" />
        Submit for Approval
      </Button>
    </div>
  </div>
</template>
