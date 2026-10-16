<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { collection, query, where, getDocs } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useCrmStore } from '../store/crmStore'
import { useAdminStore } from '@/features/admin/store/adminStore'
import { useSession } from '@/composables/useSession'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from '@/components/ui/table'
import {
  ArrowLeft, FileText, Loader2, User, Mail, Phone, MapPin,
  Receipt, Briefcase, TrendingUp, TrendingDown, Minus, CreditCard
} from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import { generateAccountStatement } from '../utils/generateAccountStatement'
import { formatCurrency } from '@/features/inventory/utils/pricing'
import AddDepositSheet from '../components/AddDepositSheet.vue'

const route  = useRoute()
const router = useRouter()
const customerId = route.params.id as string

const adminStore = useAdminStore()
const { appSettings } = storeToRefs(adminStore)
const store = useCrmStore()
const { user, hasAnyRole } = useSession()

// ── State ──────────────────────────────────────────────────────────────────────
const jobCards   = ref<any[]>([])
const jobPayments = ref<any[]>([])
const loadingData = ref(true)
const generatingPdf = ref(false)

const APPROVED = ['APPROVED_MANAGER', 'COMPLETED']

// ── Customer from store ────────────────────────────────────────────────────────
const customer = computed(() => store.customers.find((c: any) => c.id === customerId))

// ── CRM invoices for this customer ────────────────────────────────────────────
const crmInvoices = computed(() =>
  store.invoices.filter((inv: any) =>
    inv.customerId === customerId || inv.customerName === customer.value?.name
  )
)

// ── Fetch job cards + payments ─────────────────────────────────────────────────
async function fetchJobData() {
  if (!customer.value) return
  loadingData.value = true
  try {
    const jcSnap = await getDocs(
      query(collection(db, 'jobCards'), where('generalInfo.recipientName', '==', customer.value.name))
    )
    jobCards.value = jcSnap.docs.map(d => ({ id: d.id, ...d.data() }))

    const ids = jobCards.value.map((jc: any) => jc.id)
    const payments: any[] = []
    for (let i = 0; i < ids.length; i += 30) {
      const chunk = ids.slice(i, i + 30)
      const pymSnap = await getDocs(
        query(collection(db, 'jobPayments'), where('jobCardId', 'in', chunk))
      )
      payments.push(...pymSnap.docs.map(d => ({ id: d.id, ...d.data() })))
    }
    jobPayments.value = payments
  } finally {
    loadingData.value = false
  }
}

onMounted(async () => {
  store.fetchCustomers()
  store.fetchInvoices()
  // Fetch credit data
  await store.fetchCreditAccount(customerId)
  await store.fetchCreditTransactions(customerId)
  // Wait for customers to load then fetch related data
  const unwatch = store.$subscribe(() => {
    if (store.customers.length > 0) {
      unwatch()
      fetchJobData()
    }
  })
  // If already loaded
  if (store.customers.length > 0) {
    unwatch()
    fetchJobData()
  }
})

onUnmounted(() => store.cleanup())

// ── Computed financials ────────────────────────────────────────────────────────
function fmtDate(val: any): string {
  if (!val) return '—'
  if (val?.toDate) return val.toDate().toLocaleDateString('en-US')
  if (typeof val === 'string') return new Date(val).toLocaleDateString('en-US')
  if (val instanceof Date) return val.toLocaleDateString('en-US')
  return String(val)
}

function sortTs(val: any): number {
  if (!val) return 0
  if (val?.toDate) return val.toDate().getTime()
  if (typeof val === 'string') return new Date(val).getTime()
  if (val instanceof Date) return val.getTime()
  return 0
}

interface TxRow {
  sortTs: number
  date: string
  ref: string
  description: string
  invoiced: number
  paid: number
  type: 'invoice' | 'payment' | 'deposit'
  status?: string
  source: 'crm' | 'jobcard' | 'credit'
}

const transactions = computed<TxRow[]>(() => {
  const rows: TxRow[] = []

  // CRM invoices + embedded payments
  for (const inv of crmInvoices.value) {
    const ref = `INV-${String(inv.id).substring(0, 8).toUpperCase()}`
    rows.push({
      sortTs: sortTs(inv.createdAt),
      date: fmtDate(inv.createdAt),
      ref,
      description: `CRM Invoice${inv.items?.length ? ` (${inv.items.length} item${inv.items.length > 1 ? 's' : ''})` : ''}`,
      invoiced: Number(inv.grandTotal || 0),
      paid: 0,
      type: 'invoice',
      status: inv.status,
      source: 'crm',
    })
    for (const p of (inv.payments || [])) {
      rows.push({
        sortTs: sortTs(p.date),
        date: fmtDate(p.date),
        ref,
        description: `Payment${p.reference ? ` — ${p.reference}` : ''} (${p.method || ''})`,
        invoiced: 0,
        paid: Number(p.amount || 0),
        type: 'payment',
        source: 'crm',
      })
    }
  }

  // Job card invoices + jobPayments
  const pymByJob = new Map<string, any[]>()
  for (const p of jobPayments.value) {
    const jid = String(p.jobCardId || '')
    if (!pymByJob.has(jid)) pymByJob.set(jid, [])
    pymByJob.get(jid)!.push(p)
  }

  for (const jc of jobCards.value) {
    if (!APPROVED.includes(jc.status || '')) continue
    const jcRef = jc.generalInfo?.jobNumber || String(jc.id).substring(0, 8).toUpperCase()
    const jcAmt = Number(jc.lockedTotalInvoiceValue || jc.totals?.grandTotal || jc.summary?.grandTotal || 0)
    rows.push({
      sortTs: sortTs(jc.generalInfo?.dateIssued || jc.createdAt),
      date: fmtDate(jc.generalInfo?.dateIssued || jc.createdAt),
      ref: jcRef,
      description: `Job Card Invoice${jc.generalInfo?.jobTitle ? ` — ${jc.generalInfo.jobTitle}` : ''}`,
      invoiced: jcAmt,
      paid: 0,
      type: 'invoice',
      status: jc.status,
      source: 'jobcard',
    })
    for (const p of (pymByJob.get(jc.id) || [])) {
      rows.push({
        sortTs: sortTs(p.createdAt),
        date: fmtDate(p.createdAt),
        ref: jcRef,
        description: `Payment${p.description ? ` — ${p.description}` : ''} (${p.paymentMethod || ''})`,
        invoiced: 0,
        paid: Number(p.amount || 0),
        type: 'payment',
        source: 'jobcard',
      })
    }
  }

  // Client credit deposits
  for (const dep of (creditTxns.value || [])) {
    if (dep.type !== 'DEPOSIT') continue
    rows.push({
      sortTs: sortTs(dep.createdAt),
      date: fmtDate(dep.createdAt),
      ref: `DEP-${String(dep.id).substring(0, 8).toUpperCase()}`,
      description: `Cash Deposit${dep.paymentMethod ? ` (${dep.paymentMethod})` : ''}${dep.reference ? ` — ${dep.reference}` : ''}`,
      invoiced: 0,
      paid: Number(dep.amount || 0),
      type: 'deposit',
      source: 'credit',
    })
  }

  return rows.sort((a, b) => a.sortTs - b.sortTs)
})

const totalInvoiced  = computed(() => transactions.value.reduce((s, r) => s + r.invoiced, 0))
const totalPaid      = computed(() => transactions.value.reduce((s, r) => s + r.paid, 0))
const outstanding    = computed(() => totalInvoiced.value - totalPaid.value)

// ── Credit account state ──────────────────────────────────────────────────────
const showDepositSheet = ref(false)

const creditAccount = computed(() =>
  store.creditAccounts[customerId] ?? {
    balance: 0,
    totalDeposited: 0,
    totalApplied: 0
  }
)

const creditTxns = computed(() =>
  store.creditTransactions[customerId] ?? []
)

// Refresh after deposit
function handleDeposited() {
  store.fetchCreditAccount(customerId)
  store.fetchCreditTransactions(customerId)
}

// Running balance per row
const rowsWithBalance = computed(() => {
  let balance = 0
  return transactions.value.map(r => {
    balance += r.invoiced - r.paid
    return { ...r, balance }
  })
})

// Approved job cards only (for the Job Cards tab)
const approvedJobCards = computed(() => jobCards.value.filter((jc: any) => APPROVED.includes(jc.status || '')))
const pendingJobCards  = computed(() => jobCards.value.filter((jc: any) => !APPROVED.includes(jc.status || '')))

// ── PDF export ─────────────────────────────────────────────────────────────────
async function handleDownloadStatement() {
  if (!customer.value) return
  generatingPdf.value = true
  try {
    await generateAccountStatement(
      customer.value,
      crmInvoices.value,
      jobCards.value,
      jobPayments.value,
      appSettings.value,
      creditTxns.value
    )
    toast.success('Statement downloaded')
  } catch (err: any) {
    toast.error('Failed to generate PDF', { description: err.message })
  } finally {
    generatingPdf.value = false
  }
}

function statusColor(status: string) {
  if (['APPROVED_MANAGER', 'COMPLETED', 'PAID'].includes(status)) return 'default'
  if (['UNPAID', 'DRAFT', 'SUBMITTED'].includes(status)) return 'secondary'
  if (status === 'PARTIAL') return 'outline'
  if (status === 'REJECTED') return 'destructive'
  return 'secondary'
}
</script>

<template>
  <div class="space-y-6">

    <!-- Back + header -->
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-3">
        <Button variant="ghost" size="sm" @click="router.back()">
          <ArrowLeft class="size-4 mr-1" /> Back
        </Button>
        <div v-if="customer">
          <h1 class="text-2xl font-bold tracking-tight">{{ customer.name }}</h1>
          <p class="text-muted-foreground text-sm">Account Statement</p>
        </div>
        <div v-else class="text-muted-foreground text-sm">Loading customer…</div>
      </div>
      <Button
        v-if="customer"
        :disabled="generatingPdf"
        :style="{ backgroundColor: appSettings?.uiColors?.brandSecondaryColor || '#ff8903' }"
        class="text-white hover:opacity-90"
        @click="handleDownloadStatement">
        <Loader2 v-if="generatingPdf" class="size-4 mr-2 animate-spin" />
        <FileText v-else class="size-4 mr-2" />
        {{ generatingPdf ? 'Generating…' : 'Download PDF' }}
      </Button>
    </div>

    <div v-if="loadingData && !customer" class="flex justify-center py-16">
      <Loader2 class="size-8 animate-spin text-muted-foreground" />
    </div>

    <template v-else-if="customer">

      <!-- Customer info + summary strip -->
      <div class="grid grid-cols-1 md:grid-cols-4 gap-4">

        <!-- Customer card -->
        <Card class="bg-brand-primary/5 dark:bg-brand-primary/10 border-brand-primary/20 shadow-sm">
          <CardHeader class="pb-2">
            <CardTitle class="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-brand-primary">
              <User class="size-4" /> Customer Info
            </CardTitle>
          </CardHeader>
          <CardContent class="space-y-2 text-sm">
            <div class="flex items-center gap-2 font-semibold text-foreground dark:text-white text-base">
              <div class="size-8 rounded-full flex items-center justify-center text-sm font-bold text-brand-primary"
                :style="{ backgroundColor: (appSettings?.uiColors?.brandPrimaryColor || '#79c21b') + '30' }">
                {{ customer.name.charAt(0).toUpperCase() }}
              </div>
              {{ customer.name }}
            </div>
            <div v-if="customer.email" class="flex items-center gap-2 text-muted-foreground">
              <Mail class="size-3.5 shrink-0" /> {{ customer.email }}
            </div>
            <div v-if="customer.phone" class="flex items-center gap-2 text-muted-foreground">
              <Phone class="size-3.5 shrink-0" /> {{ customer.phone }}
            </div>
            <div v-if="customer.address" class="flex items-center gap-2 text-muted-foreground">
              <MapPin class="size-3.5 shrink-0" /> {{ customer.address }}
            </div>
            <div class="text-xs text-muted-foreground pt-1">
              Customer since {{ customer.createdAt?.toDate?.()?.toLocaleDateString() || 'N/A' }}
            </div>
          </CardContent>
        </Card>

        <!-- Total Invoiced -->
        <Card class="bg-brand-primary/5 dark:bg-brand-primary/10 border-brand-primary/20 shadow-sm">
          <CardContent class="pt-6 text-center space-y-1">
            <p class="text-xs font-bold uppercase tracking-wider text-brand-primary">Total Invoiced</p>
            <p class="text-3xl font-bold text-foreground dark:text-white">{{ formatCurrency(totalInvoiced) }}</p>
            <p class="text-xs text-muted-foreground">
              {{ crmInvoices.length }} CRM invoice{{ crmInvoices.length !== 1 ? 's' : '' }} +
              {{ approvedJobCards.length }} job card{{ approvedJobCards.length !== 1 ? 's' : '' }}
            </p>
          </CardContent>
        </Card>

        <!-- Credit Balance -->
        <div class="rounded-lg border bg-card p-4">
          <p class="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
            Credit Balance
          </p>
          <p class="text-2xl font-bold"
             :class="creditAccount.balance > 0 ? 'text-green-500' : 'text-muted-foreground'">
            ${{ (creditAccount.balance ?? 0).toFixed(2) }}
          </p>
          <Button
            v-if="hasAnyRole(['SUPER_ADMIN','ADMIN','ACCOUNTANT'])"
            size="sm"
            variant="outline"
            class="mt-2 h-7 text-xs"
            @click="showDepositSheet = true"
          >
            + Add Deposit
          </Button>
        </div>

        <!-- Total Paid / Outstanding -->
        <div class="grid grid-rows-2 gap-4">
          <Card class="bg-emerald-500/10 border-emerald-500/20 shadow-sm">
            <CardContent class="py-3 flex items-center justify-between">
              <div>
                <p class="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">Total Paid</p>
                <p class="text-xl font-bold text-foreground dark:text-white">{{ formatCurrency(totalPaid) }}</p>
              </div>
              <TrendingUp class="size-8 text-emerald-500/40" />
            </CardContent>
          </Card>
          <Card :class="outstanding > 0 ? 'bg-red-500/10 border-red-500/20' : 'bg-emerald-500/10 border-emerald-500/20'" class="shadow-sm">
            <CardContent class="py-3 flex items-center justify-between">
              <div>
                <p class="text-xs font-bold uppercase tracking-wider"
                  :class="outstanding > 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'">
                  Outstanding
                </p>
                <p class="text-xl font-bold text-foreground dark:text-white">{{ formatCurrency(outstanding) }}</p>
              </div>
              <TrendingDown v-if="outstanding > 0" class="size-8 text-red-500/40" />
              <Minus v-else class="size-8 text-emerald-500/40" />
            </CardContent>
          </Card>
        </div>
      </div>

      <!-- Tabs -->
      <Tabs default-value="statement">
        <TabsList>
          <TabsTrigger value="statement">
            <Receipt class="size-3.5 mr-1.5" /> Account Statement
          </TabsTrigger>
          <TabsTrigger value="jobcards">
            <Briefcase class="size-3.5 mr-1.5" />
            Job Cards
            <span v-if="jobCards.length" class="ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-brand-primary/20 text-brand-primary">
              {{ jobCards.length }}
            </span>
          </TabsTrigger>
          <TabsTrigger value="crminvoices">
            <FileText class="size-3.5 mr-1.5" />
            CRM Invoices
            <span v-if="crmInvoices.length" class="ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-brand-primary/20 text-brand-primary">
              {{ crmInvoices.length }}
            </span>
          </TabsTrigger>
          <TabsTrigger value="creditaccount">
            <CreditCard class="size-3.5 mr-1.5" />
            Credit Account
            <span v-if="creditTxns.length" class="ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-brand-primary/20 text-brand-primary">
              {{ creditTxns.length }}
            </span>
          </TabsTrigger>
        </TabsList>

        <!-- ── Account Statement tab ── -->
        <TabsContent value="statement">
          <Card class="bg-brand-primary/5 dark:bg-brand-primary/10 border-brand-primary/20 shadow-sm">
            <CardContent class="p-0">
              <div v-if="loadingData" class="flex justify-center py-10">
                <Loader2 class="size-6 animate-spin text-muted-foreground" />
              </div>
              <div v-else-if="rowsWithBalance.length === 0" class="text-center py-12 text-muted-foreground text-sm">
                No transactions on record for this customer.
              </div>
              <Table v-else>
                <TableHeader>
                  <TableRow class="border-b hover:bg-transparent" :style="{ borderColor: 'var(--crm-grid-border)' }">
                    <TableHead class="text-[11px] font-bold uppercase tracking-wider pl-4">Date</TableHead>
                    <TableHead class="text-[11px] font-bold uppercase tracking-wider">Reference</TableHead>
                    <TableHead class="text-[11px] font-bold uppercase tracking-wider">Description</TableHead>
                    <TableHead class="text-[11px] font-bold uppercase tracking-wider text-right">Invoiced</TableHead>
                    <TableHead class="text-[11px] font-bold uppercase tracking-wider text-right">Paid</TableHead>
                    <TableHead class="text-[11px] font-bold uppercase tracking-wider text-right pr-4">Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow
                    v-for="(row, i) in rowsWithBalance" :key="i"
                    class="border-b transition-colors"
                    :style="{ borderColor: 'var(--crm-grid-border)' }"
                    :class="[
                      row.type === 'payment' ? 'bg-emerald-500/5' : '',
                      row.type === 'deposit' ? 'bg-blue-500/5' : '',
                      'hover:bg-brand-primary/5 dark:hover:bg-brand-primary/10'
                    ]">
                    <TableCell class="text-xs text-muted-foreground pl-4 whitespace-nowrap">{{ row.date }}</TableCell>
                    <TableCell>
                      <span class="font-mono text-xs px-2 py-0.5 rounded border"
                        :class="row.type === 'deposit'
                          ? 'bg-blue-500/10 border-blue-500/30 text-blue-500'
                          : 'text-brand-primary'"
                        :style="row.type !== 'deposit' ? { backgroundColor: (appSettings?.uiColors?.brandPrimaryColor || '#79c21b') + '15', borderColor: (appSettings?.uiColors?.brandPrimaryColor || '#79c21b') + '30' } : {}">
                        {{ row.ref }}
                      </span>
                    </TableCell>
                    <TableCell class="text-sm" :class="[
                      row.type === 'payment' ? 'text-muted-foreground italic pl-6' : 'font-medium text-foreground dark:text-white',
                      row.type === 'deposit' ? 'text-blue-500 italic pl-6' : ''
                    ]">
                      {{ row.description }}
                    </TableCell>
                    <TableCell class="text-right text-sm font-semibold text-foreground dark:text-white">
                      {{ row.invoiced > 0 ? formatCurrency(row.invoiced) : '—' }}
                    </TableCell>
                    <TableCell class="text-right text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                      {{ row.paid > 0 ? formatCurrency(row.paid) : '—' }}
                    </TableCell>
                    <TableCell class="text-right text-sm font-bold pr-4"
                      :class="row.balance > 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'">
                      {{ formatCurrency(row.balance) }}
                    </TableCell>
                  </TableRow>

                  <!-- Totals row -->
                  <TableRow class="border-t-2 bg-brand-primary/10" :style="{ borderColor: (appSettings?.uiColors?.brandPrimaryColor || '#79c21b') + '40' }">
                    <TableCell colspan="3" class="font-bold text-sm pl-4 text-foreground dark:text-white">TOTALS</TableCell>
                    <TableCell class="text-right font-bold text-sm text-foreground dark:text-white">{{ formatCurrency(totalInvoiced) }}</TableCell>
                    <TableCell class="text-right font-bold text-sm text-emerald-600 dark:text-emerald-400">{{ formatCurrency(totalPaid) }}</TableCell>
                    <TableCell class="text-right font-bold text-sm pr-4"
                      :class="outstanding > 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'">
                      {{ formatCurrency(outstanding) }}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <!-- ── Job Cards tab ── -->
        <TabsContent value="jobcards">
          <Card class="bg-brand-primary/5 dark:bg-brand-primary/10 border-brand-primary/20 shadow-sm">
            <CardContent class="p-0">
              <div v-if="loadingData" class="flex justify-center py-10">
                <Loader2 class="size-6 animate-spin text-muted-foreground" />
              </div>
              <div v-else-if="jobCards.length === 0" class="text-center py-12 text-muted-foreground text-sm">
                No job cards found for this customer.
              </div>
              <Table v-else>
                <TableHeader>
                  <TableRow class="border-b hover:bg-transparent" :style="{ borderColor: 'var(--crm-grid-border)' }">
                    <TableHead class="text-[11px] font-bold uppercase tracking-wider pl-4">Job Ref</TableHead>
                    <TableHead class="text-[11px] font-bold uppercase tracking-wider">Title</TableHead>
                    <TableHead class="text-[11px] font-bold uppercase tracking-wider">Date</TableHead>
                    <TableHead class="text-[11px] font-bold uppercase tracking-wider">Status</TableHead>
                    <TableHead class="text-[11px] font-bold uppercase tracking-wider text-right">Invoice Value</TableHead>
                    <TableHead class="text-[11px] font-bold uppercase tracking-wider text-right pr-4">Collected</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow
                    v-for="jc in jobCards" :key="jc.id"
                    class="border-b hover:bg-brand-primary/5 dark:hover:bg-brand-primary/10 transition-colors cursor-pointer"
                    :style="{ borderColor: 'var(--crm-grid-border)' }"
                    @click="router.push(`/job-cards/${jc.id}`)">
                    <TableCell class="pl-4">
                      <span class="font-mono text-xs px-2 py-0.5 rounded border text-brand-primary"
                        :style="{ backgroundColor: (appSettings?.uiColors?.brandPrimaryColor || '#79c21b') + '15', borderColor: (appSettings?.uiColors?.brandPrimaryColor || '#79c21b') + '30' }">
                        {{ jc.generalInfo?.jobNumber || jc.id.substring(0, 8).toUpperCase() }}
                      </span>
                    </TableCell>
                    <TableCell class="text-sm font-medium text-foreground dark:text-white">
                      {{ jc.generalInfo?.jobTitle || jc.generalInfo?.jobCardTitle || '—' }}
                    </TableCell>
                    <TableCell class="text-xs text-muted-foreground">
                      {{ jc.generalInfo?.dateIssued ? new Date(jc.generalInfo.dateIssued).toLocaleDateString() : fmtDate(jc.createdAt) }}
                    </TableCell>
                    <TableCell>
                      <Badge :variant="statusColor(jc.status)" class="text-[10px]">{{ jc.status }}</Badge>
                    </TableCell>
                    <TableCell class="text-right text-sm font-semibold text-foreground dark:text-white">
                      {{ APPROVED.includes(jc.status) ? formatCurrency(Number(jc.lockedTotalInvoiceValue || jc.totals?.grandTotal || 0)) : '—' }}
                    </TableCell>
                    <TableCell class="text-right text-sm text-emerald-600 dark:text-emerald-400 font-semibold pr-4">
                      {{ formatCurrency(jobPayments.filter((p: any) => p.jobCardId === jc.id).reduce((s: number, p: any) => s + Number(p.amount || 0), 0)) }}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <!-- ── CRM Invoices tab ── -->
        <TabsContent value="crminvoices">
          <Card class="bg-brand-primary/5 dark:bg-brand-primary/10 border-brand-primary/20 shadow-sm">
            <CardContent class="p-0">
              <div v-if="crmInvoices.length === 0" class="text-center py-12 text-muted-foreground text-sm">
                No CRM invoices found for this customer.
              </div>
              <Table v-else>
                <TableHeader>
                  <TableRow class="border-b hover:bg-transparent" :style="{ borderColor: 'var(--crm-grid-border)' }">
                    <TableHead class="text-[11px] font-bold uppercase tracking-wider pl-4">Invoice</TableHead>
                    <TableHead class="text-[11px] font-bold uppercase tracking-wider">Date</TableHead>
                    <TableHead class="text-[11px] font-bold uppercase tracking-wider">Status</TableHead>
                    <TableHead class="text-[11px] font-bold uppercase tracking-wider text-right">Amount</TableHead>
                    <TableHead class="text-[11px] font-bold uppercase tracking-wider text-right">Paid</TableHead>
                    <TableHead class="text-[11px] font-bold uppercase tracking-wider text-right pr-4">Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow
                    v-for="inv in crmInvoices" :key="inv.id"
                    class="border-b hover:bg-brand-primary/5 dark:hover:bg-brand-primary/10 transition-colors"
                    :style="{ borderColor: 'var(--crm-grid-border)' }">
                    <TableCell class="pl-4">
                      <span class="font-mono text-xs px-2 py-0.5 rounded border text-brand-primary"
                        :style="{ backgroundColor: (appSettings?.uiColors?.brandPrimaryColor || '#79c21b') + '15', borderColor: (appSettings?.uiColors?.brandPrimaryColor || '#79c21b') + '30' }">
                        INV-{{ inv.id.substring(0, 8).toUpperCase() }}
                      </span>
                    </TableCell>
                    <TableCell class="text-xs text-muted-foreground">{{ fmtDate(inv.createdAt) }}</TableCell>
                    <TableCell>
                      <Badge :variant="statusColor(inv.status)" class="text-[10px]">{{ inv.status }}</Badge>
                    </TableCell>
                    <TableCell class="text-right text-sm font-semibold text-foreground dark:text-white">
                      {{ formatCurrency(inv.grandTotal || 0) }}
                    </TableCell>
                    <TableCell class="text-right text-sm text-emerald-600 dark:text-emerald-400 font-semibold">
                      {{ formatCurrency(inv.amountPaid || 0) }}
                    </TableCell>
                    <TableCell class="text-right text-sm font-bold pr-4"
                      :class="(inv.grandTotal - (inv.amountPaid || 0)) > 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'">
                      {{ formatCurrency(inv.grandTotal - (inv.amountPaid || 0)) }}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <!-- ── Credit Account tab ── -->
        <TabsContent value="creditaccount">
          <Card class="bg-brand-primary/5 dark:bg-brand-primary/10 border-brand-primary/20 shadow-sm">
            <CardContent class="p-0">
              <!-- Header stats -->
              <div class="p-6 border-b bg-white/50 dark:bg-gray-900/50">
                <h2 class="text-lg font-semibold text-foreground dark:text-white mb-4">Credit Account</h2>
                <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div class="bg-muted/30 p-4 rounded-lg">
                    <p class="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Total Deposited</p>
                    <p class="text-2xl font-bold text-foreground dark:text-white">${{ creditAccount.totalDeposited.toFixed(2) }}</p>
                  </div>
                  <div class="bg-muted/30 p-4 rounded-lg">
                    <p class="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Total Applied</p>
                    <p class="text-2xl font-bold text-foreground dark:text-white">${{ creditAccount.totalApplied.toFixed(2) }}</p>
                  </div>
                  <div class="bg-muted/30 p-4 rounded-lg">
                    <p class="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Current Balance</p>
                    <p class="text-2xl font-bold"
                       :class="creditAccount.balance > 0 ? 'text-green-500' : 'text-muted-foreground'">
                      ${{ creditAccount.balance.toFixed(2) }}
                    </p>
                  </div>
                </div>
              </div>

              <!-- Transaction table -->
              <div v-if="creditTxns.length === 0" class="text-center py-12 text-muted-foreground text-sm">
                No credit transactions yet.<br />
                Record a deposit to get started.
              </div>
              <Table v-else>
                <TableHeader>
                  <TableRow class="border-b hover:bg-transparent" :style="{ borderColor: 'var(--crm-grid-border)' }">
                    <TableHead class="text-[11px] font-bold uppercase tracking-wider pl-4">Date</TableHead>
                    <TableHead class="text-[11px] font-bold uppercase tracking-wider">Type</TableHead>
                    <TableHead class="text-[11px] font-bold uppercase tracking-wider text-right">Amount</TableHead>
                    <TableHead class="text-[11px] font-bold uppercase tracking-wider text-right">Balance</TableHead>
                    <TableHead class="text-[11px] font-bold uppercase tracking-wider">Reference</TableHead>
                    <TableHead class="text-[11px] font-bold uppercase tracking-wider">Details</TableHead>
                    <TableHead class="text-[11px] font-bold uppercase tracking-wider pr-4">Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow
                    v-for="tx in creditTxns" :key="tx.id"
                    class="border-b hover:bg-brand-primary/5 dark:hover:bg-brand-primary/10 transition-colors"
                    :style="{ borderColor: 'var(--crm-grid-border)' }">
                    <TableCell class="text-xs text-muted-foreground pl-4 whitespace-nowrap">{{ fmtDate(tx.createdAt) }}</TableCell>
                    <TableCell>
                      <Badge
                        :variant="tx.type === 'DEPOSIT' ? 'default' : tx.type === 'APPLIED' ? 'secondary' : 'outline'"
                        :class="[
                          'text-[10px]',
                          tx.type === 'DEPOSIT' ? 'bg-green-500/20 text-green-700 dark:text-green-300 border-green-500/30' :
                          tx.type === 'APPLIED' ? 'bg-blue-500/20 text-blue-700 dark:text-blue-300 border-blue-500/30' :
                          'bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/30'
                        ]">
                        {{ tx.type === 'DEPOSIT' ? 'Deposit' : tx.type === 'APPLIED' ? 'Applied' : 'Adjustment' }}
                      </Badge>
                    </TableCell>
                    <TableCell class="text-right text-sm font-semibold"
                               :class="tx.type === 'DEPOSIT' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'">
                      {{ tx.type === 'DEPOSIT' ? '+' : '−' }}${{ (tx.amount || 0).toFixed(2) }}
                    </TableCell>
                    <TableCell class="text-right text-sm font-bold text-foreground dark:text-white">
                      ${{ (tx.balanceAfter || 0).toFixed(2) }}
                    </TableCell>
                    <TableCell class="font-mono text-xs">
                      {{ tx.reference || '—' }}
                    </TableCell>
                    <TableCell class="text-xs">
                      <template v-if="tx.type === 'APPLIED' && tx.jobCardId">
                        <Button
                          variant="link"
                          class="h-auto p-0 text-xs"
                          @click="router.push(`/job-cards/${tx.jobCardId}`)">
                          {{ tx.jobCardNumber || 'View Job Card' }}
                        </Button>
                      </template>
                      <template v-else-if="tx.type === 'DEPOSIT'">
                        <Badge variant="outline" class="text-[10px]">
                          {{ tx.paymentMethod || '—' }}
                        </Badge>
                      </template>
                      <template v-else>—</template>
                    </TableCell>
                    <TableCell class="text-xs text-muted-foreground pr-4 max-w-[200px] truncate">
                      {{ tx.notes || '—' }}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </template>

    <div v-else class="text-center py-16 text-muted-foreground">
      Customer not found.
    </div>

  </div>

  <!-- Add Deposit Sheet -->
  <AddDepositSheet
    :open="showDepositSheet"
    :clientId="customerId"
    :clientName="customer.name"
    :currentBalance="creditAccount.balance"
    @update:open="showDepositSheet = $event"
    @deposited="handleDeposited"
  />
</template>
