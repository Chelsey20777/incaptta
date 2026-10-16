<script setup lang="ts">
/**
 * AnalyticsDashboard — Manager Analytics Overview
 *
 * Phase 4: AI brief wired in. Charts and KPIs still load from local store
 * data immediately; the AI brief section is on-demand (manager-triggered).
 *
 * Store hydration strategy:
 *   - jobCardsStore.fetchJobCards()  → real-time onSnapshot (re-subscribes idempotently)
 *   - financeStore.fetchExpenses(), fetchTransfers() → same pattern
 *   - adminStore.fetchAll()          → already called by TopBar on mount; safe to call again
 *   - inventoryStore.fetchItems()    → one-time REST-style fetch (no onSnapshot)
 *
 * Cleanup: jobCards and finance listeners are torn down on unmount to prevent
 * orphaned subscriptions when navigating away, matching the Dashboard.vue pattern.
 */
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import {
  Landmark, Smartphone, Banknote, ListChecks,
  AlertTriangle, Clock, CheckCircle2,
  Wallet, BarChart3, Download, Package,
} from 'lucide-vue-next'

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table'

import { useJobCardsStore } from '@/features/jobCards/store/jobCardsStore'
import { useFinanceStore } from '@/features/fundTransfers/store/financeStore'
import { useAdminStore } from '@/features/admin/store/adminStore'
import { useInventoryStore } from '@/features/inventory/store/inventoryStore'

import { useUnifiedOperationalContext } from '../composables/useUnifiedOperationalContext'
import { requestAnalyticsBrief, AiBriefError } from '../services/analyticsAiService'
import type { AiBriefErrorCode } from '../services/analyticsAiService'
import type { AiBriefResponse } from '../types/analytics'
import { buildAiContext } from '../utils/buildAiContext'
import AnalyticsSkeleton from '../components/AnalyticsSkeleton.vue'
import ExpenseTrendChart from '../components/ExpenseTrendChart.vue'
import JobCardStatusChart from '../components/JobCardStatusChart.vue'
import DepartmentPerformanceChart from '../components/DepartmentPerformanceChart.vue'
import AiBriefPanel from '../components/AiBriefPanel.vue'
import AnalyticsChatPanel from '../components/AnalyticsChatPanel.vue'
import { generateAnalyticsPdf } from '../utils/generateAnalyticsPdf'

const router = useRouter()

// ── Stores ───────────────────────────────────────────────────────────────────
const jobCardsStore = useJobCardsStore()
const financeStore  = useFinanceStore()
const adminStore    = useAdminStore()
const invStore      = useInventoryStore()

// ── Period selector ───────────────────────────────────────────────────────────
// The composable receives a ref so the computed payload reacts when the user
// switches periods without remounting the component.
const PERIOD_OPTIONS = [7, 30, 90] as const
const selectedPeriod = ref<number>(30)

// ── Analytics data ────────────────────────────────────────────────────────────
const { context: payload } = useUnifiedOperationalContext(selectedPeriod)
const resolvedPeriodDays = computed(() => payload.value.periodDays)
// Default overdue threshold is 14 days by system convention
const resolvedOverdueDays = ref(14)

// ── Loading gate ──────────────────────────────────────────────────────────────
// Show skeleton while the primary store subscriptions are warming up.
// Once any store has data, we render immediately (even if still streaming).
const { loading: jcLoading } = storeToRefs(jobCardsStore)
const { loading: finLoading } = storeToRefs(financeStore)
const { loading: invLoading } = storeToRefs(invStore)

const isLoading = computed(() => jcLoading.value || finLoading.value)

// ── Store hydration ───────────────────────────────────────────────────────────
onMounted(() => {
  // These stores use real-time onSnapshot listeners. Re-calling is safe:
  // each store stores a single unsubscribe ref and replaces it on each call.
  jobCardsStore.fetchJobCards()
  financeStore.fetchExpenses()
  financeStore.fetchTransfers()
  // jobPayments and topUps feed finalBalances — needed for account balance KPIs
  financeStore.fetchJobPayments()
  financeStore.fetchTopUps()
  financeStore.fetchSalariesTransactions()
  financeStore.fetchHistoricalInventoryConsumption()
  // adminStore is already hydrated by TopBar, but fetchAll is idempotent
  adminStore.fetchAll()
  // inventoryStore uses a one-time fetch (no real-time listener)
  invStore.fetchItems()
})

onUnmounted(() => {
  // Tear down only the listeners we started — mirrors Dashboard.vue cleanup
  jobCardsStore.cleanup()
  financeStore.cleanup()
})

// ── Derived KPI values ────────────────────────────────────────────────────────
/**
 * Total pending approvals across all three queues:
 *   job cards in workflow + expense accountant queue + expense manager queue
 *   + transfer accountant queue + transfer manager queue
 */
const totalPendingApprovals = computed(() => {
  if (!payload.value) return 0
  const p = payload.value.operations
  return (
    p.jobCards.pendingApprovals +
    p.expenses.pendingApprovalCount +
    p.expenses.pendingManagerCount +
    p.transfers.pendingAccountantCount +
    p.transfers.pendingManagerCount
  )
})

const totalTreasuryBalance = computed(() => {
  if (!payload.value) return 0
  const liquidSet = new Set(financeStore.LIQUID_ACCOUNTS)
  return payload.value.operations.accountBalances
    .filter(a => liquidSet.has(a.account))
    .reduce((s, a) => s + a.balance, 0)
})

// ── Formatters ────────────────────────────────────────────────────────────────
function formatCurrency(v: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(v)
}

function formatDate(dateStr: string) {
  if (!dateStr || dateStr === 'Unknown') return '—'
  return new Date(dateStr + 'T12:00:00').toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric'
  })
}

// ── Account display config ────────────────────────────────────────────────────
const ACCOUNT_DISPLAY: Record<string, { label: string; icon: any; colorHex: string }> = {
  BANK:    { label: 'Bank',    icon: Landmark,   colorHex: '#eab308' },
  ECOCASH: { label: 'EcoCash', icon: Smartphone, colorHex: '#f97316' },
  CASH:    { label: 'Cash',    icon: Banknote,   colorHex: '#10b981' },
  IRD:     { label: 'IRD Account', icon: ListChecks, colorHex: '#ef4444' },
  SALARIES: { label: 'Salaries Account', icon: Landmark, colorHex: '#10b981' },
  CREDIT:  { label: 'Customer Credit', icon: Wallet, colorHex: '#3b82f6' },
  INVENTORY: { label: 'Inventory Consumption', icon: Package, colorHex: '#8b5cf6' },
}

function accountMeta(key: string) {
  if (key === 'UNKNOWN' || key === 'INVENTORY') {
    return { label: 'Inventory Consumption', icon: Package, colorHex: '#8b5cf6' }
  }
  return ACCOUNT_DISPLAY[key] ?? { label: key, icon: Wallet, colorHex: '#6b7280' }
}

// ── Last updated label ────────────────────────────────────────────────────────
const lastUpdated = computed(() => {
  if (!payload.value) return ''
  return new Date(payload.value.generatedAt).toLocaleTimeString(undefined, {
    hour: '2-digit', minute: '2-digit'
  })
})

// ── Navigation ───────────────────────────────────────────────────────────────
function handleAccountClick(account: string) {
  switch (account) {
    case 'BANK':
    case 'CASH':
    case 'ECOCASH':
    case 'IRD':
      router.push('/ledger')
      break
    case 'SALARIES':
      router.push('/hr/salaries-account')
      break
    case 'CREDIT':
      router.push('/crm/customers')
      break
    case 'INVENTORY':
      router.push('/inventory')
      break
    default:
      router.push('/ledger')
  }
}

// ── AI Brief state ────────────────────────────────────────────────────────────
// Charts and KPIs render immediately from local store data.
// The AI brief is idle until the manager explicitly requests it.
const aiBrief     = ref<AiBriefResponse | null>(null)
const aiLoading   = ref(false)
const aiErrorCode = ref<AiBriefErrorCode | null>(null)
const aiErrorMsg  = ref<string | null>(null)

async function refreshAnalysis() {
  if (aiLoading.value) return
  aiLoading.value   = true
  aiErrorCode.value = null
  aiErrorMsg.value  = null

  try {
    const slim = buildAiContext(payload.value)
    aiBrief.value = await requestAnalyticsBrief(slim)
  } catch (err) {
    if (err instanceof AiBriefError) {
      aiErrorCode.value = err.code
      aiErrorMsg.value  = err.message
    } else {
      aiErrorCode.value = 'UNKNOWN'
      aiErrorMsg.value  = 'An unexpected error occurred.'
    }
  } finally {
    aiLoading.value = false
  }
}

// ── PDF export ────────────────────────────────────────────────────────────────
const pdfExporting = ref(false)

async function exportPdf() {
  if (pdfExporting.value) return
  pdfExporting.value = true
  try {
    await generateAnalyticsPdf(
      payload.value,
      aiBrief.value,
      adminStore.appSettings ?? undefined,
      adminStore.appSettings ?? undefined,
    )
  } finally {
    pdfExporting.value = false
  }
}
</script>

<template>
  <div class="space-y-8 pb-12 px-4 md:px-8">

    <!-- ── Page Header ──────────────────────────────────────────────────── -->
    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pt-2">
      <div>
        <h1 class="text-2xl font-bold tracking-tight flex items-center gap-2">
          <BarChart3 class="size-6 text-primary" />
          Analytics
        </h1>
        <p class="text-sm text-muted-foreground mt-0.5">
          Operational overview · Last {{ resolvedPeriodDays }} days
          <span v-if="lastUpdated" class="text-muted-foreground/60"> · updated {{ lastUpdated }}</span>
        </p>
      </div>

      <!-- Period selector + export -->
      <div class="flex items-center gap-2 self-start sm:self-auto flex-wrap">
        <div class="flex items-center gap-1 bg-muted/50 rounded-lg p-1">
          <Button
            v-for="p in PERIOD_OPTIONS"
            :key="p"
            size="sm"
            :variant="selectedPeriod === p ? 'default' : 'ghost'"
            class="h-7 px-3 text-xs font-semibold"
            @click="selectedPeriod = p"
          >
            {{ p }}d
          </Button>
        </div>
        <Button
          size="sm"
          variant="outline"
          class="h-8 px-3 gap-1.5 text-xs"
          :disabled="pdfExporting || isLoading"
          @click="exportPdf"
        >
          <Download class="size-3" :class="{ 'animate-pulse': pdfExporting }" />
          {{ pdfExporting ? 'Exporting…' : 'Download Report' }}
        </Button>
      </div>
    </div>

    <!-- ── Loading skeleton ─────────────────────────────────────────────── -->
    <AnalyticsSkeleton v-if="isLoading && !payload.operations.jobCards.total" />

    <!-- ── Main content ─────────────────────────────────────────────────── -->
    <template v-else>

      <!-- ── Account Balances ───────────────────────────────────────────── -->
      <div>
        <h2 class="text-xs font-bold uppercase text-muted-foreground/60 mb-3 tracking-widest">
          Account Balances
        </h2>
        <div class="grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
          <Card
            v-for="account in payload.operations.accountBalances"
            :key="account.account"
            class="bg-card/50 border hover:ring-2 hover:ring-primary/20 transition-all cursor-pointer hover:scale-[1.02] active:scale-[0.98] duration-200"
            @click="handleAccountClick(account.account)"
          >
            <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle
                class="text-[11px] font-bold uppercase tracking-wider"
                :style="{ color: accountMeta(account.account).colorHex }"
              >
                {{ accountMeta(account.account).label }}
              </CardTitle>
              <component
                :is="accountMeta(account.account).icon"
                class="size-4"
                :style="{ color: accountMeta(account.account).colorHex }"
              />
            </CardHeader>
            <CardContent>
              <div
                class="text-xl font-bold"
                :class="account.account !== 'INVENTORY' && account.balance < 0 ? 'text-red-500' : ''"
              >
                {{ formatCurrency(account.account === 'INVENTORY' ? Math.abs(account.balance) : account.balance) }}
              </div>
              <p class="text-[10px] font-bold uppercase tracking-tight text-muted-foreground mt-0.5">
                Current balance
              </p>
            </CardContent>
          </Card>
        </div>

        <!-- Total treasury -->
        <div class="mt-3 text-right">
          <span class="text-xs text-muted-foreground">
            Total treasury position:
            <span class="font-bold text-foreground ml-1">{{ formatCurrency(totalTreasuryBalance) }}</span>
          </span>
        </div>
      </div>

      <!-- ── Inventory Snapshot ─────────────────────────────────────────── -->
      <div>
        <h2 class="text-xs font-bold uppercase text-muted-foreground/60 mb-3 tracking-widest">
          Inventory Snapshot
        </h2>
        <div class="grid gap-4 grid-cols-2 lg:grid-cols-4">
          <Card 
            class="bg-card/50 border cursor-pointer hover:ring-2 hover:ring-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200"
            @click="router.push('/inventory')"
          >
            <CardHeader class="pb-2">
              <CardTitle class="text-[11px] font-bold uppercase tracking-wider text-primary">
                Total Items
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div class="text-2xl font-bold">{{ payload.inventory.totalItems }}</div>
              <p class="text-[10px] text-muted-foreground mt-0.5">{{ payload.inventory.activeItems }} active</p>
            </CardContent>
          </Card>
          <Card 
            class="bg-card/50 border cursor-pointer hover:ring-2 hover:ring-amber-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200"
            @click="router.push('/inventory')"
          >
            <CardHeader class="pb-2">
              <CardTitle class="text-[11px] font-bold uppercase tracking-wider text-amber-600">
                Low Stock
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div class="text-2xl font-bold">{{ payload.inventory.lowStockCount }}</div>
              <p class="text-[10px] text-muted-foreground mt-0.5">Below reorder level</p>
            </CardContent>
          </Card>
          <Card 
            class="bg-card/50 border lg:col-span-2 cursor-pointer hover:ring-2 hover:ring-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200"
            @click="router.push('/inventory')"
          >
            <CardHeader class="pb-2">
              <CardTitle class="text-[11px] font-bold uppercase tracking-wider text-primary">
                Stock Value (Selling)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div class="text-2xl font-bold">{{ formatCurrency(payload.inventory.totalInventoryValue) }}</div>
              <p class="text-[10px] text-muted-foreground mt-0.5">
                Selling price basis · {{ payload.inventory.totalItems }} SKUs
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      <!-- ── KPI Cards ──────────────────────────────────────────────────── -->
      <div>
        <h2 class="text-xs font-bold uppercase text-muted-foreground/60 mb-3 tracking-widest">
          Current Status
        </h2>
        <div class="grid gap-4 grid-cols-2 lg:grid-cols-4">

          <!-- Pending Approvals -->
          <Card 
            class="bg-card/50 border hover:ring-2 hover:ring-primary/20 transition-all cursor-pointer hover:scale-[1.02] active:scale-[0.98] duration-200"
            @click="router.push('/job-cards')"
          >
            <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle class="text-[11px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                Pending Approvals
              </CardTitle>
              <Clock class="size-4 text-amber-500" />
            </CardHeader>
            <CardContent>
              <div class="text-2xl font-bold">{{ totalPendingApprovals }}</div>
              <p class="text-[10px] font-bold uppercase tracking-tight text-muted-foreground mt-0.5">
                Across job cards, OPEX &amp; transfers
              </p>
              <!-- Sub-breakdown -->
              <div class="mt-2 space-y-0.5 text-[10px] text-muted-foreground">
                <div class="flex justify-between">
                  <span>Job cards</span>
                  <span class="font-semibold">{{ payload.operations.jobCards.pendingApprovals }}</span>
                </div>
                <div class="flex justify-between">
                  <span>Expenses</span>
                  <span class="font-semibold">{{ payload.operations.expenses.pendingApprovalCount + payload.operations.expenses.pendingManagerCount }}</span>
                </div>
                <div class="flex justify-between">
                  <span>Transfers</span>
                  <span class="font-semibold">{{ payload.operations.transfers.pendingAccountantCount + payload.operations.transfers.pendingManagerCount }}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <!-- Overdue Job Cards -->
          <Card 
            class="bg-card/50 border hover:ring-2 hover:ring-primary/20 transition-all cursor-pointer hover:scale-[1.02] active:scale-[0.98] duration-200"
            @click="router.push('/job-cards')"
          >
            <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle class="text-[11px] font-bold uppercase tracking-wider"
                :class="payload.operations.jobCards.overdueOpenCards.length > 0 ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground'">
                Overdue Job Cards
              </CardTitle>
              <AlertTriangle
                class="size-4"
                :class="payload.operations.jobCards.overdueOpenCards.length > 0 ? 'text-red-500' : 'text-muted-foreground/40'"
              />
            </CardHeader>
            <CardContent>
              <div class="text-2xl font-bold">{{ payload.operations.jobCards.overdueOpenCards.length }}</div>
              <p class="text-[10px] font-bold uppercase tracking-tight text-muted-foreground mt-0.5">
                Open &gt; {{ resolvedOverdueDays }} days
              </p>
              <!--
                ASSUMPTION: "Overdue" = non-terminal, non-DRAFT card older than
                {{ resolvedOverdueDays }} days. This threshold is a placeholder — confirm
                actual SLA with management before Phase 4 (AI brief).
              -->
              <p class="text-[9px] text-muted-foreground/50 mt-1.5 italic leading-tight">
                Threshold: {{ resolvedOverdueDays }}d default · confirm with management
              </p>
            </CardContent>
          </Card>

          <!-- Completed this period -->
          <Card 
            class="bg-card/50 border hover:ring-2 hover:ring-primary/20 transition-all cursor-pointer hover:scale-[1.02] active:scale-[0.98] duration-200"
            @click="router.push('/job-cards')"
          >
            <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle class="text-[11px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                Completed
              </CardTitle>
              <CheckCircle2 class="size-4 text-emerald-500" />
            </CardHeader>
            <CardContent>
              <div class="text-2xl font-bold">{{ payload.operations.jobCards.completedInPeriod }}</div>
              <p class="text-[10px] font-bold uppercase tracking-tight text-muted-foreground mt-0.5">
                Job cards in last {{ resolvedPeriodDays }} days
              </p>
              <!--
                NOTE: Uses updatedAt as proxy for completion date. May overcount
                if a completed card was edited after completion. See Phase 1 docs.
              -->
              <p class="text-[9px] text-muted-foreground/50 mt-1.5 italic leading-tight">
                Based on updatedAt (proxy — see Phase 1 note)
              </p>
            </CardContent>
          </Card>

          <!-- Approved expenses this period -->
          <Card 
            class="bg-card/50 border hover:ring-2 hover:ring-primary/20 transition-all cursor-pointer hover:scale-[1.02] active:scale-[0.98] duration-200"
            @click="router.push('/opex')"
          >
            <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle class="text-[11px] font-bold uppercase tracking-wider text-orange-600 dark:text-orange-400">
                Approved Expenses
              </CardTitle>
              <Wallet class="size-4 text-orange-500" />
            </CardHeader>
            <CardContent>
              <div class="text-2xl font-bold">{{ formatCurrency(payload.operations.expenses.approvedAmount) }}</div>
              <p class="text-[10px] font-bold uppercase tracking-tight text-muted-foreground mt-0.5">
                Committed in last {{ resolvedPeriodDays }} days
              </p>
              <p class="text-[10px] text-muted-foreground/70 mt-1">
                Requested: {{ formatCurrency(payload.operations.expenses.totalAmount) }}
              </p>
            </CardContent>
          </Card>

        </div>
      </div>

      <!-- ── Charts: Trend + Status Distribution ───────────────────────── -->
      <div class="grid gap-6 lg:grid-cols-3">

        <!-- Expense Trend (2/3 width) -->
        <Card class="lg:col-span-2 border bg-card/50">
          <CardHeader class="pb-3 border-b bg-muted/10">
            <CardTitle class="text-sm font-bold uppercase tracking-wider text-muted-foreground">
              Expense Trend — Last {{ resolvedPeriodDays }} Days
            </CardTitle>
          </CardHeader>
          <CardContent class="pt-4 px-4 pb-4">
            <ExpenseTrendChart
              :trend="payload.operations.expenses.trend"
              :period-days="resolvedPeriodDays"
            />
          </CardContent>
        </Card>

        <!-- Job Card Status (1/3 width) -->
        <Card class="border bg-card/50">
          <CardHeader class="pb-3 border-b bg-muted/10">
            <CardTitle class="text-sm font-bold uppercase tracking-wider text-muted-foreground">
              Job Card Status
            </CardTitle>
          </CardHeader>
          <CardContent class="pt-4">
            <JobCardStatusChart
              :by-status="payload.operations.jobCards.byStatus"
              :total="payload.operations.jobCards.total"
            />
          </CardContent>
        </Card>

      </div>

      <!-- ── Department Performance ─────────────────────────────────────── -->
      <Card class="border bg-card/50">
        <CardHeader class="pb-3 border-b bg-muted/10">
          <div class="flex items-center justify-between">
            <CardTitle class="text-sm font-bold uppercase tracking-wider text-muted-foreground">
              Department Performance
            </CardTitle>
            <span class="text-[10px] text-muted-foreground/60 italic">
              By job card count (all time)
            </span>
          </div>
        </CardHeader>
        <CardContent class="pt-4 pb-4 px-4">
          <DepartmentPerformanceChart :metrics="payload.operations.departmentMetrics" />

          <!-- Completion rate table below the chart -->
          <div v-if="payload.operations.departmentMetrics.some(d => d.jobCardCount > 0)" class="mt-6">
            <p class="text-[10px] font-bold uppercase text-muted-foreground/60 tracking-widest mb-2">
              Completion Rate by Department
            </p>
            <div class="space-y-1.5">
              <div
                v-for="d in payload.operations.departmentMetrics.filter(m => m.jobCardCount > 0)"
                :key="d.departmentId"
                class="flex items-center gap-3"
              >
                <span class="text-xs text-muted-foreground w-36 truncate shrink-0">{{ d.departmentName }}</span>
                <div class="flex-1 h-1.5 rounded-full bg-muted/50 overflow-hidden">
                  <div
                    class="h-full rounded-full bg-emerald-500 transition-all duration-500"
                    :style="{ width: `${d.completionRate}%` }"
                  />
                </div>
                <span class="text-xs font-bold tabular-nums w-10 text-right">{{ d.completionRate }}%</span>
                <span class="text-[10px] text-muted-foreground tabular-nums w-16 text-right shrink-0">
                  {{ d.completedCount }}/{{ d.jobCardCount }}
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <!-- ── Expense Top Categories ─────────────────────────────────────── -->
      <div v-if="payload.operations.expenses.byCategory.length > 0">
        <h2 class="text-xs font-bold uppercase text-muted-foreground/60 mb-3 tracking-widest">
          Top Expense Categories — Last {{ resolvedPeriodDays }} Days
        </h2>
        <Card class="border bg-card/50">
          <CardContent class="pt-4 space-y-2.5">
            <div
              v-for="cat in payload.operations.expenses.byCategory.slice(0, 8)"
              :key="cat.category"
              class="flex items-center gap-3"
            >
              <span class="text-xs text-foreground w-40 truncate shrink-0 font-medium">{{ cat.category }}</span>
              <div class="flex-1 h-2 rounded-full bg-muted/50 overflow-hidden">
                <div
                  class="h-full rounded-full bg-orange-500 transition-all duration-500"
                  :style="{
                    width: payload.operations.expenses.totalAmount > 0
                      ? `${Math.round((cat.total / payload.operations.expenses.totalAmount) * 100)}%`
                      : '0%'
                  }"
                />
              </div>
              <span class="text-xs font-bold tabular-nums w-24 text-right shrink-0">
                {{ formatCurrency(cat.total) }}
              </span>
              <Badge variant="secondary" class="text-[9px] px-1.5 shrink-0">
                {{ cat.count }}
              </Badge>
            </div>

            <p
              v-if="payload.operations.expenses.byCategory.length === 0"
              class="text-sm text-muted-foreground italic text-center py-4"
            >
              No expenses recorded in this period
            </p>
          </CardContent>
        </Card>
      </div>

      <!-- ── Overdue Job Cards Table ────────────────────────────────────── -->
      <div v-if="payload.operations.jobCards.overdueOpenCards.length > 0">
        <h2 class="text-xs font-bold uppercase text-muted-foreground/60 mb-3 tracking-widest flex items-center gap-2">
          <AlertTriangle class="size-3.5 text-red-500" />
          Overdue Job Cards
          <Badge variant="destructive" class="ml-1 text-[9px]">
            {{ payload.operations.jobCards.overdueOpenCards.length }}
          </Badge>
        </h2>
        <Card class="border border-red-200 dark:border-red-900/40 bg-card/50">
          <CardContent class="pt-4 pb-0 px-0">
            <Table>
              <TableHeader>
                <TableRow class="hover:bg-transparent">
                  <TableHead class="text-[10px] font-bold uppercase tracking-wide pl-4">Job #</TableHead>
                  <TableHead class="text-[10px] font-bold uppercase tracking-wide">Title</TableHead>
                  <TableHead class="text-[10px] font-bold uppercase tracking-wide">Department</TableHead>
                  <TableHead class="text-[10px] font-bold uppercase tracking-wide">Status</TableHead>
                  <TableHead class="text-[10px] font-bold uppercase tracking-wide">Created</TableHead>
                  <TableHead class="text-[10px] font-bold uppercase tracking-wide text-right pr-4">Days Open</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow
                  v-for="card in payload.operations.jobCards.overdueOpenCards.slice(0, 10)"
                  :key="card.id"
                  class="hover:bg-muted/30"
                >
                  <TableCell class="pl-4 font-mono text-xs text-primary">{{ card.jobNumber }}</TableCell>
                  <TableCell class="text-xs max-w-[160px] truncate">{{ card.jobTitle }}</TableCell>
                  <TableCell class="text-xs text-muted-foreground">{{ card.departmentName }}</TableCell>
                  <TableCell>
                    <Badge
                      variant="secondary"
                      class="text-[9px] px-1.5 font-semibold"
                    >
                      {{ card.status.replace(/_/g, ' ') }}
                    </Badge>
                  </TableCell>
                  <TableCell class="text-xs text-muted-foreground">{{ formatDate(card.createdAt) }}</TableCell>
                  <TableCell class="text-right pr-4">
                    <span class="text-xs font-bold text-red-600 dark:text-red-400">
                      {{ card.daysOpen }}d
                    </span>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
            <p
              v-if="payload.operations.jobCards.overdueOpenCards.length > 10"
              class="text-[10px] text-muted-foreground text-center py-3 border-t"
            >
              Showing 10 of {{ payload.operations.jobCards.overdueOpenCards.length }} overdue cards
            </p>
          </CardContent>
        </Card>
      </div>

      <!-- ── Largest Expense Items ──────────────────────────────────────── -->
      <div v-if="payload.operations.expenses.largestItems.length > 0">
        <h2 class="text-xs font-bold uppercase text-muted-foreground/60 mb-3 tracking-widest">
          Largest Expenses — Last {{ resolvedPeriodDays }} Days
        </h2>
        <Card class="border bg-card/50">
          <CardContent class="pt-4 pb-0 px-0">
            <Table>
              <TableHeader>
                <TableRow class="hover:bg-transparent">
                  <TableHead class="text-[10px] font-bold uppercase tracking-wide pl-4">Description</TableHead>
                  <TableHead class="text-[10px] font-bold uppercase tracking-wide">Category</TableHead>
                  <TableHead class="text-[10px] font-bold uppercase tracking-wide">Method</TableHead>
                  <TableHead class="text-[10px] font-bold uppercase tracking-wide">Status</TableHead>
                  <TableHead class="text-[10px] font-bold uppercase tracking-wide">Date</TableHead>
                  <TableHead class="text-[10px] font-bold uppercase tracking-wide text-right pr-4">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow
                  v-for="item in payload.operations.expenses.largestItems"
                  :key="item.id"
                  class="hover:bg-muted/30"
                >
                  <TableCell class="pl-4 text-xs max-w-[180px] truncate">{{ item.description }}</TableCell>
                  <TableCell class="text-xs text-muted-foreground">{{ item.category }}</TableCell>
                  <TableCell class="text-xs">
                    <Badge variant="outline" class="text-[9px] px-1.5">{{ item.paymentMethod }}</Badge>
                  </TableCell>
                  <TableCell class="text-xs text-muted-foreground">
                    {{ item.status.replace(/_/g, ' ') }}
                  </TableCell>
                  <TableCell class="text-xs text-muted-foreground">{{ formatDate(item.date) }}</TableCell>
                  <TableCell class="text-right pr-4 font-bold text-sm text-orange-600 dark:text-orange-400">
                    {{ formatCurrency(item.amount) }}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <!-- ── AI Manager Brief ───────────────────────────────────────────── -->
      <Separator />
      <AiBriefPanel
        :brief="aiBrief"
        :loading="aiLoading"
        :error-code="aiErrorCode"
        :error-message="aiErrorMsg"
        @refresh="refreshAnalysis"
      />

      <!-- ── Manager Analytics Chat ─────────────────────────────────────── -->
      <Separator />
      <AnalyticsChatPanel :payload="payload" />

    </template>
  </div>
</template>
