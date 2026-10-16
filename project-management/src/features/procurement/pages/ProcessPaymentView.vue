<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { db } from '@/lib/firebase'
import { doc, getDoc, serverTimestamp } from 'firebase/firestore'
import { useProcurementStore } from '../store/procurementStore'
import { useFinanceStore } from '@/features/fundTransfers/store/financeStore'
import { useSession } from '@/composables/useSession'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import {
  ArrowLeft,
  Loader2,
  TriangleAlert,
  CreditCard,
  FileText,
  Info,
} from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import type { SupplierInvoice, MatchStatus } from '../types/procurement'

const route = useRoute()
const router = useRouter()
const procurementStore = useProcurementStore()
const financeStore = useFinanceStore()
const { user: currentUser, hasAnyRole } = useSession()

const invoiceId = route.params.id as string

// ── State ──────────────────────────────────────────────────
const loading = ref(true)
const isProcessing = ref(false)
const invoice = ref<SupplierInvoice | null>(null)

// ── Form fields ────────────────────────────────────────────
const paymentMethod = ref('')
const referenceNumber = ref('')
const transactionDate = ref(new Date().toISOString().split('T')[0])
const notes = ref('')

// ── Account options ────────────────────────────────────────
const accountOptions = [
  { value: 'ecocash', label: 'EcoCash',        balanceKey: 'ECOCASH' },
  { value: 'bank',    label: 'Bank',            balanceKey: 'BANK'    },
  { value: 'cash',    label: 'Cash on Hand',    balanceKey: 'CASH'    },
  { value: 'ird',     label: 'IRD Account',     balanceKey: 'IRD'     },
]

// ── Reactive balance display ───────────────────────────────
const selectedBalance = computed(() => {
  if (!paymentMethod.value) return null
  const opt = accountOptions.find(o => o.value === paymentMethod.value)
  if (!opt) return null
  return financeStore.finalBalances[opt.balanceKey] ?? 0
})

const insufficientBalance = computed(() => {
  if (selectedBalance.value === null || !invoice.value) return false
  return selectedBalance.value < invoice.value.totalAmount
})

function balanceForKey(key: string): number {
  return financeStore.finalBalances[key] ?? 0
}

// ── Load invoice on mount ──────────────────────────────────
onMounted(async () => {
  // Start finance listeners so balances populate
  financeStore.fetchExpenses()
  financeStore.fetchTransfers()
  financeStore.fetchJobPayments()
  financeStore.fetchTopUps()

  try {
    const snap = await getDoc(doc(db, 'procurementSupplierInvoices', invoiceId))
    if (!snap.exists()) {
      toast.error('Invoice not found')
      router.push('/procurement/invoices')
      return
    }
    invoice.value = { id: snap.id, ...snap.data() } as SupplierInvoice

    // Guard: must be APPROVED
    if (invoice.value.status !== 'APPROVED') {
      toast.error('Only approved invoices can be paid')
      router.push(`/procurement/invoices/${invoiceId}`)
      return
    }

    // Guard: not already paid
    if (invoice.value.operationalExpenseId) {
      toast.info('Payment already recorded')
      router.push(`/procurement/invoices/${invoiceId}`)
      return
    }
  } catch (error) {
    console.error('Error loading invoice:', error)
    toast.error('Failed to load invoice')
    router.push('/procurement/invoices')
  } finally {
    loading.value = false
  }
})

// ── Helpers ────────────────────────────────────────────────
function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(amount)
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '—'
  try {
    const [year, month, day] = dateStr.split('-')
    return `${new Date(Number(year), Number(month) - 1, Number(day)).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })}`
  } catch {
    return dateStr
  }
}

function isOverdue(dateStr: string): boolean {
  if (!dateStr) return false
  try {
    return new Date(dateStr) < new Date(new Date().toDateString())
  } catch {
    return false
  }
}

function getMatchStatusClass(status: MatchStatus): string {
  switch (status) {
    case 'MATCHED':                   return 'bg-green-100 text-green-700 border-green-200'
    case 'VARIANCE_WITHIN_THRESHOLD': return 'bg-amber-100 text-amber-700 border-amber-200'
    case 'VARIANCE_EXCEEDED':         return 'bg-red-100 text-red-700 border-red-200'
    case 'OVERRIDE_APPROVED':         return 'bg-purple-100 text-purple-700 border-purple-200'
    default:                          return 'bg-gray-100 text-gray-700 border-gray-200'
  }
}

function getMatchStatusLabel(status: MatchStatus): string {
  switch (status) {
    case 'MATCHED':                   return 'Matched'
    case 'VARIANCE_WITHIN_THRESHOLD': return 'Minor Variance'
    case 'VARIANCE_EXCEEDED':         return 'Variance Exceeded'
    case 'OVERRIDE_APPROVED':         return 'Override Approved'
    default:                          return 'Pending'
  }
}

// ── Payment processing ─────────────────────────────────────
async function handleRecordPayment() {
  if (!hasAnyRole(['SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT', 'TECHNICAL'])) {
    toast.error('Insufficient permissions')
    return
  }

  if (!paymentMethod.value || !referenceNumber.value.trim()) {
    toast.error('Payment method and reference required')
    return
  }

  if (!invoice.value) return

  isProcessing.value = true

  try {
    // ── Step 1: Create operationalExpenses record ───────────
    await financeStore.recordExpense({
      title: `Supplier Payment — ${invoice.value.supplierName}`,
      description:
        `Invoice ${invoice.value.invoiceNumber} | ` +
        `GRN ${invoice.value.grnNumber}`,
      category: 'procurement-payment',
      amount: invoice.value.totalAmount,
      paymentMethod: paymentMethod.value,      // lowercase
      pettyCashAccount: paymentMethod.value,   // same value
      department: invoice.value.department,
      requestType: 'purchase',
      beneficiary: invoice.value.supplierName,
      currency: invoice.value.currency,
      items: [{
        description: `Invoice ${invoice.value.invoiceNumber}`,
        quantity: 1,
        estCost: invoice.value.totalAmount
      }],
      type: 'INTERNAL_REQUISITION',
      status: 'APPROVED_ACCOUNTANT',
      createdByEmail: currentUser.value?.email ?? '',
      createdByName:
        currentUser.value?.displayName ??
        currentUser.value?.email ?? '',
      // Procurement cross-reference fields
      procurementOrderId: invoice.value.poId,
      supplierInvoiceId: invoice.value.id,
      supplierId: invoice.value.supplierId,
      poNumber: invoice.value.poNumber
    })

    // ── Step 2: Retrieve the created expense doc ID ─────────
    // recordExpense() returns void — query for the new record
    const { collection, query, where, orderBy, limit, getDocs } =
      await import('firebase/firestore')

    const expenseSnap = await getDocs(
      query(
        collection(db, 'operationalExpenses'),
        where('supplierInvoiceId', '==', invoice.value.id),
        orderBy('createdAt', 'desc'),
        limit(1)
      )
    )

    const expenseId = expenseSnap.docs[0]?.id
    if (!expenseId) {
      throw new Error('Failed to locate expense record after creation')
    }

    // ── Step 3: Process payment — hits ledger, deducts balance ─
    await financeStore.processExpensePayment(
      expenseId,
      {
        name: currentUser.value?.displayName ?? '',
        email: currentUser.value?.email ?? ''
      },
      {
        paymentMethod: paymentMethod.value,
        ledgerAccount: paymentMethod.value.toUpperCase(),
        transactionDate: transactionDate.value,
        referenceNumber: referenceNumber.value.trim(),
        notes: notes.value.trim() || undefined
      }
    )

    // ── Step 4: Update invoice record ──────────────────────
    await procurementStore.updateSupplierInvoice(invoice.value.id, {
      status: 'PAYMENT_PROCESSED',
      operationalExpenseId: expenseId,
      paymentMethod: paymentMethod.value.toUpperCase(),
      paymentReference: referenceNumber.value.trim(),
      paymentProcessedAt: serverTimestamp()
    })

    toast.success('Payment recorded successfully', {
      description:
        `${invoice.value.invoiceNumber} marked as paid. ` +
        `${paymentMethod.value.toUpperCase()} balance updated.`
    })

    router.push(`/procurement/invoices/${invoice.value.id}`)

  } catch (e: any) {
    console.error('Payment processing error:', e)
    toast.error('Payment failed', {
      description: e?.message ?? 'Please try again'
    })
  } finally {
    isProcessing.value = false
  }
}
</script>

<template>
  <!-- Loading -->
  <div v-if="loading" class="space-y-4 max-w-2xl mx-auto">
    <Skeleton class="h-10 w-64" />
    <Skeleton class="h-48 w-full" />
    <Skeleton class="h-64 w-full" />
  </div>

  <div v-else-if="invoice" class="space-y-6 max-w-2xl mx-auto">

    <!-- Header -->
    <div class="flex items-start gap-4">
      <Button variant="outline" size="icon" @click="router.push(`/procurement/invoices/${invoiceId}`)">
        <ArrowLeft class="size-4" />
      </Button>
      <div>
        <p class="text-sm font-medium text-muted-foreground uppercase tracking-widest">Procurement Payment</p>
        <h2 class="text-2xl font-extrabold tracking-tight">Process Payment</h2>
        <p class="text-muted-foreground text-sm mt-0.5">
          Invoice <span class="font-mono font-bold">{{ invoice.invoiceNumber }}</span>
          — {{ invoice.supplierName }}
        </p>
      </div>
    </div>

    <!-- Section 1: Invoice Summary (read-only) -->
    <Card class="bg-muted/50">
      <CardHeader>
        <CardTitle class="flex items-center gap-2 text-base">
          <FileText class="size-4" />
          Invoice Summary
        </CardTitle>
      </CardHeader>
      <CardContent class="space-y-3">
        <div class="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
          <span class="text-muted-foreground">Invoice Number</span>
          <span class="font-mono font-bold">{{ invoice.invoiceNumber }}</span>

          <span class="text-muted-foreground">Supplier</span>
          <span class="font-medium">{{ invoice.supplierName }}</span>

          <span class="text-muted-foreground">PO Reference</span>
          <span class="font-mono">{{ invoice.poNumber }}</span>

          <span class="text-muted-foreground">Match Status</span>
          <Badge
            variant="outline"
            :class="getMatchStatusClass(invoice.matchStatus)"
            class="text-xs font-bold uppercase tracking-wider w-fit"
          >
            {{ getMatchStatusLabel(invoice.matchStatus) }}
          </Badge>

          <span class="text-muted-foreground">Due Date</span>
          <span
            class="font-medium"
            :class="isOverdue(invoice.dueDate) ? 'text-red-600 font-bold' : ''"
          >
            {{ formatDate(invoice.dueDate) }}
            <span v-if="isOverdue(invoice.dueDate)" class="text-xs ml-1">(Overdue)</span>
          </span>
        </div>

        <Separator />

        <div class="flex items-center justify-between">
          <span class="text-sm text-muted-foreground">Invoice Total</span>
          <span class="text-3xl font-extrabold font-mono">
            {{ formatCurrency(invoice.totalAmount) }}
          </span>
        </div>
      </CardContent>
    </Card>

    <!-- Section 2: Payment Details Form -->
    <Card>
      <CardHeader>
        <CardTitle class="flex items-center gap-2">
          <CreditCard class="size-5" />
          Payment Details
        </CardTitle>
      </CardHeader>
      <CardContent class="space-y-5">

        <!-- Payment Account -->
        <div class="space-y-1.5">
          <label class="text-sm font-semibold">
            Payment Account <span class="text-destructive">*</span>
          </label>
          <select
            v-model="paymentMethod"
            class="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="" disabled>Select payment account…</option>
            <option
              v-for="opt in accountOptions"
              :key="opt.value"
              :value="opt.value"
            >
              {{ opt.label }} — Balance: {{ formatCurrency(balanceForKey(opt.balanceKey)) }}
            </option>
          </select>

          <!-- Insufficient balance warning -->
          <Alert
            v-if="insufficientBalance"
            class="border-amber-200 bg-amber-50 text-amber-800 mt-2"
          >
            <TriangleAlert class="size-4 text-amber-600" />
            <AlertDescription class="text-sm font-medium">
              Insufficient balance. Account has
              {{ formatCurrency(selectedBalance ?? 0) }},
              invoice total is
              {{ formatCurrency(invoice.totalAmount) }}.
            </AlertDescription>
          </Alert>
        </div>

        <!-- Reference Number -->
        <div class="space-y-1.5">
          <label class="text-sm font-semibold">
            Payment Reference <span class="text-destructive">*</span>
          </label>
          <input
            v-model="referenceNumber"
            type="text"
            placeholder="e.g. ECO-20260328-001"
            class="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <p class="text-xs text-muted-foreground">
            EcoCash transaction ID, bank reference, or cash voucher number
          </p>
        </div>

        <!-- Transaction Date -->
        <div class="space-y-1.5">
          <label class="text-sm font-semibold">
            Transaction Date <span class="text-destructive">*</span>
          </label>
          <input
            v-model="transactionDate"
            type="date"
            class="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        <!-- Notes -->
        <div class="space-y-1.5">
          <label class="text-sm font-semibold">Payment Notes</label>
          <textarea
            v-model="notes"
            rows="3"
            placeholder="Any additional payment notes…"
            class="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
          />
        </div>
      </CardContent>
    </Card>

    <!-- Section 3: Finance Record Preview -->
    <Card class="border-blue-200 bg-blue-50 dark:bg-blue-950/30 dark:border-blue-800">
      <CardHeader>
        <div class="flex items-center gap-2">
          <Info class="size-4 text-blue-600" />
          <CardTitle class="text-base text-blue-800 dark:text-blue-300">
            Finance Record Preview
          </CardTitle>
        </div>
        <CardDescription class="text-blue-600 dark:text-blue-400">
          This entry will appear in the Finance module
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div class="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
          <span class="text-muted-foreground">Title</span>
          <span class="font-medium">Supplier Payment — {{ invoice.supplierName }}</span>

          <span class="text-muted-foreground">Description</span>
          <span class="font-mono text-xs">
            Invoice {{ invoice.invoiceNumber }} | GRN {{ invoice.grnNumber }}
          </span>

          <span class="text-muted-foreground">Category</span>
          <span class="font-mono text-xs">procurement-payment</span>

          <span class="text-muted-foreground">Amount</span>
          <span class="font-mono font-bold">{{ formatCurrency(invoice.totalAmount) }}</span>

          <span class="text-muted-foreground">Department</span>
          <span>{{ invoice.department }}</span>

          <span class="text-muted-foreground">Beneficiary</span>
          <span>{{ invoice.supplierName }}</span>

          <span class="text-muted-foreground">Request Type</span>
          <span>purchase</span>

          <span class="text-muted-foreground">Currency</span>
          <span class="font-mono">{{ invoice.currency }}</span>
        </div>
      </CardContent>
    </Card>

    <!-- Actions -->
    <div class="flex items-center justify-end gap-3 pb-8">
      <Button
        variant="outline"
        :disabled="isProcessing"
        @click="router.push(`/procurement/invoices/${invoiceId}`)"
      >
        Cancel
      </Button>
      <Button
        variant="default"
        :disabled="!paymentMethod || !referenceNumber.trim() || isProcessing"
        @click="handleRecordPayment"
      >
        <Loader2 v-if="isProcessing" class="size-4 mr-2 animate-spin" />
        <CreditCard v-else class="size-4 mr-2" />
        Record Payment
      </Button>
    </div>

  </div>
</template>
