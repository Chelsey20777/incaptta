<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useFinanceStore } from '../store/financeStore'
import { useAdminStore } from '@/features/admin/store/adminStore'
import { useSession } from '@/composables/useSession'
import { toast } from 'vue-sonner'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Loader2, Search, Filter, X, FileText, ChevronDown, FileSpreadsheet } from 'lucide-vue-next'
import LedgerTable from '../components/LedgerTable.vue'
import { generateLedgerReportPdf } from '../utils/generateLedgerReportPdf'
import { generateLedgerReportExcel } from '../utils/generateLedgerReportExcel'

const store      = useFinanceStore()
const adminStore = useAdminStore()
const { user }   = useSession()
const { ledger, finalBalances, loading } = storeToRefs(store)
const { appSettings } = storeToRefs(adminStore)

// ── Filter state ────────────────────────────────────────────────────
const searchQuery   = ref('')
const typeFilter    = ref('all')
const timeframe     = ref('all')
const dateFrom      = ref('')
const dateTo        = ref('')
const showFilters   = ref(false)
const activeTab     = ref('all')
const downloadingReport = ref(false)
const downloadingExcel = ref(false)

const hasActiveFilters = computed(() =>
  !!searchQuery.value || typeFilter.value !== 'all' || timeframe.value !== 'all' || !!dateFrom.value || !!dateTo.value
)

const resetFilters = () => {
  searchQuery.value = ''
  typeFilter.value  = 'all'
  timeframe.value   = 'all'
  dateFrom.value    = ''
  dateTo.value      = ''
}

// ── Core filter function applied to any slice of ledger ─────────────
const applyFilters = (entries: any[]) => {
  return entries.filter(entry => {
    // 1. Search
    const q = searchQuery.value.toLowerCase()
    const searchMatch = !q || (entry.description || '').toLowerCase().includes(q)

    // 2. Type
    const typeMatch = typeFilter.value === 'all' || entry.type === typeFilter.value

    // 3. Timeframe
    let timeMatch = true
    if (timeframe.value !== 'all') {
      const raw  = entry.createdAt?.toDate?.() ?? new Date(entry.createdAt || 0)
      const now  = new Date()

      if (timeframe.value === 'today') {
        timeMatch = raw.toDateString() === now.toDateString()
      } else if (timeframe.value === 'week') {
        const wk = new Date(); wk.setDate(now.getDate() - 7)
        timeMatch = raw >= wk
      } else if (timeframe.value === 'month') {
        timeMatch = raw.getMonth() === now.getMonth() && raw.getFullYear() === now.getFullYear()
      } else if (timeframe.value === 'custom') {
        const from = dateFrom.value ? new Date(dateFrom.value) : null
        const to   = dateTo.value   ? new Date(dateTo.value + 'T23:59:59') : null
        if (from) timeMatch = raw >= from
        if (to)   timeMatch = timeMatch && raw <= to
      }
    }

    return searchMatch && typeMatch && timeMatch
  })
}

// ── Per-tab filtered + mapped entries ───────────────────────────────
const allFiltered = computed(() =>
  applyFilters(ledger.value.map(e => ({ ...e, balance: e.globalBalance })))
)
const bankFiltered = computed(() =>
  applyFilters(ledger.value.filter(e => e.account === 'BANK').map(e => ({ ...e, balance: e.accountBalance })))
)
const cashFiltered = computed(() =>
  applyFilters(ledger.value.filter(e => e.account === 'CASH').map(e => ({ ...e, balance: e.accountBalance })))
)
const ecocashFiltered = computed(() =>
  applyFilters(ledger.value.filter(e => e.account === 'ECOCASH').map(e => ({ ...e, balance: e.accountBalance })))
)
const irdFiltered = computed(() =>
  applyFilters(ledger.value.filter(e => e.account === 'IRD').map(e => ({ ...e, balance: e.accountBalance })))
)

const currentEntries = computed(() => {
  const map: Record<string, any[]> = {
    all: allFiltered.value, bank: bankFiltered.value,
    cash: cashFiltered.value, ecocash: ecocashFiltered.value, ird: irdFiltered.value
  }
  return map[activeTab.value] ?? allFiltered.value
})

// ── PDF download ─────────────────────────────────────────────────────
const tabLabel: Record<string, string> = {
  all: 'All Accounts', bank: 'BANK', cash: 'CASH', ecocash: 'ECOCASH', ird: 'IRD'
}

const handleDownloadReport = async () => {
  if (currentEntries.value.length === 0) {
    toast.error('No entries to export', { description: 'Adjust your filters and try again.' })
    return
  }
  downloadingReport.value = true
  try {
    const range = timeframe.value === 'custom' && (dateFrom.value || dateTo.value)
      ? { from: dateFrom.value || 'Start', to: dateTo.value || 'End' }
      : null
    await generateLedgerReportPdf(
      currentEntries.value,
      tabLabel[activeTab.value] || 'All Accounts',
      range,
      adminStore.appSettings,
      adminStore.appSettings,
      user.value?.displayName || user.value?.email || 'System User'
    )
    toast.success('Ledger Report Downloaded!')
  } catch (err: any) {
    console.error(err)
    toast.error('Failed to generate report')
  } finally {
    downloadingReport.value = false
  }
}

const handleDownloadExcel = async () => {
  if (currentEntries.value.length === 0) {
    toast.error('No entries to export', { description: 'Adjust your filters and try again.' })
    return
  }
  downloadingExcel.value = true
  try {
    const range = timeframe.value === 'custom' && (dateFrom.value || dateTo.value)
      ? { from: dateFrom.value || 'Start', to: dateTo.value || 'End' }
      : null
    await generateLedgerReportExcel(
      currentEntries.value,
      tabLabel[activeTab.value] || 'All Accounts',
      range,
      adminStore.appSettings,
      user.value?.displayName || user.value?.email || 'System User'
    )
    toast.success('Ledger Excel Downloaded!')
  } catch (err: any) {
    console.error(err)
    toast.error('Failed to generate Excel')
  } finally {
    downloadingExcel.value = false
  }
}

onMounted(() => {
  adminStore.fetchSettings()
  store.fetchExpenses()
  store.fetchTransfers()
  store.fetchJobPayments()
  store.fetchTopUps()
})

onUnmounted(() => { store.cleanup() })
</script>

<template>
  <div v-if="loading" class="h-[400px] flex items-center justify-center">
    <Loader2 class="size-8 animate-spin text-primary" />
  </div>

  <div v-else class="space-y-4 p-8 pt-4">

    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h2 class="text-3xl font-bold tracking-tight text-foreground">Ledger Records</h2>
        <p class="text-muted-foreground">Historical transaction log for all accounts.</p>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger as-child>
          <Button variant="outline" class="border-dashed" :disabled="downloadingReport || downloadingExcel">
            <Loader2 v-if="downloadingReport || downloadingExcel" class="mr-2 size-4 animate-spin" />
            <FileText v-else class="mr-2 size-4" />
            Download Report
            <ChevronDown class="ml-2 size-4 opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" class="w-[200px]">
          <DropdownMenuItem @click="handleDownloadReport" class="cursor-pointer">
            <FileText class="mr-2 size-4" />
            <span>Download PDF</span>
          </DropdownMenuItem>
          <DropdownMenuItem @click="handleDownloadExcel" class="cursor-pointer">
            <FileSpreadsheet class="mr-2 size-4" />
            <span>Download Excel</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>

    <!-- Filter Bar -->
    <div class="flex items-center gap-3 flex-wrap">
      <!-- Search -->
      <div class="relative min-w-[220px]">
        <Search class="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
        <Input v-model="searchQuery" placeholder="Search description..." class="pl-8" />
      </div>

      <!-- Type filter -->
      <Select v-model="typeFilter">
        <SelectTrigger class="w-[170px]">
          <SelectValue placeholder="All Types" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Types</SelectItem>
          <SelectItem value="EXPENSE">Expense</SelectItem>
          <SelectItem value="INCOME">Income</SelectItem>
          <SelectItem value="TRANSFER">Transfer</SelectItem>
          <SelectItem value="TOPUP">Top-up</SelectItem>
        </SelectContent>
      </Select>

      <!-- More filters toggle -->
      <Button variant="outline" :class="{ 'bg-muted': showFilters }" @click="showFilters = !showFilters">
        <Filter class="mr-2 size-4" />
        More Filters
      </Button>

      <!-- Reset -->
      <Button v-if="hasActiveFilters" variant="ghost" @click="resetFilters">
        <X class="mr-2 size-4" />
        Reset
      </Button>

      <!-- Live count -->
      <span v-if="hasActiveFilters" class="text-xs text-muted-foreground ml-auto">
        {{ currentEntries.length }} result{{ currentEntries.length !== 1 ? 's' : '' }}
      </span>
    </div>

    <!-- Expanded filter panel -->
    <Card v-if="showFilters" class="bg-muted/30">
      <CardContent class="p-4 grid grid-cols-1 md:grid-cols-4 gap-4">
        <div class="space-y-2">
          <label class="text-xs font-semibold uppercase text-muted-foreground">Timeframe</label>
          <Select v-model="timeframe">
            <SelectTrigger>
              <SelectValue placeholder="All Time" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Time</SelectItem>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="week">Past 7 Days</SelectItem>
              <SelectItem value="month">This Month</SelectItem>
              <SelectItem value="custom">Custom Range</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <template v-if="timeframe === 'custom'">
          <div class="space-y-2">
            <label class="text-xs font-semibold uppercase text-muted-foreground">From</label>
            <Input type="date" v-model="dateFrom" class="w-full" />
          </div>
          <div class="space-y-2">
            <label class="text-xs font-semibold uppercase text-muted-foreground">To</label>
            <Input type="date" v-model="dateTo" class="w-full" />
          </div>
        </template>
      </CardContent>
    </Card>

    <!-- Tabs -->
    <Tabs v-model="activeTab" class="space-y-4">
      <TabsList class="bg-muted/50 p-1 h-auto flex flex-row items-stretch justify-start gap-1 w-full overflow-x-auto no-scrollbar">
        <TabsTrigger value="all" class="px-6 py-2.5 shrink-0">All Entries</TabsTrigger>

        <TabsTrigger value="bank" class="px-6 py-2.5 flex flex-col items-start gap-0.5 shrink-0">
          <span class="text-xs font-semibold opacity-70 group-data-[state=active]:opacity-100">Bank</span>
          <span class="text-sm font-bold" :style="{ color: appSettings?.uiColors?.bankBalanceColor || '#eab308' }">
            ${{ (finalBalances.BANK || 0).toLocaleString(undefined, { minimumFractionDigits: 2 }) }}
          </span>
        </TabsTrigger>

        <TabsTrigger value="cash" class="px-6 py-2.5 flex flex-col items-start gap-0.5 shrink-0">
          <span class="text-xs font-semibold opacity-70">Cash</span>
          <span class="text-sm font-bold text-brand-primary">
            ${{ (finalBalances.CASH || 0).toLocaleString(undefined, { minimumFractionDigits: 2 }) }}
          </span>
        </TabsTrigger>

        <TabsTrigger value="ecocash" class="px-6 py-2.5 flex flex-col items-start gap-0.5 shrink-0">
          <span class="text-xs font-semibold opacity-70">EcoCash</span>
          <span class="text-sm font-bold" :style="{ color: appSettings?.uiColors?.ecocashBalanceColor || '#ff8903' }">
            ${{ (finalBalances.ECOCASH || 0).toLocaleString(undefined, { minimumFractionDigits: 2 }) }}
          </span>
        </TabsTrigger>

        <TabsTrigger value="ird" class="px-6 py-2.5 flex flex-col items-start gap-0.5 shrink-0">
          <span class="text-xs font-semibold opacity-70">IRD</span>
          <span class="text-sm font-bold" :style="{ color: appSettings?.uiColors?.irdBalanceColor || '#ef4444' }">
            ${{ (finalBalances.IRD || 0).toLocaleString(undefined, { minimumFractionDigits: 2 }) }}
          </span>
        </TabsTrigger>
      </TabsList>

      <TabsContent value="all"     class="space-y-4 pt-4"><LedgerTable :ledger="allFiltered"     /></TabsContent>
      <TabsContent value="bank"    class="space-y-4 pt-4"><LedgerTable :ledger="bankFiltered"    /></TabsContent>
      <TabsContent value="cash"    class="space-y-4 pt-4"><LedgerTable :ledger="cashFiltered"    /></TabsContent>
      <TabsContent value="ecocash" class="space-y-4 pt-4"><LedgerTable :ledger="ecocashFiltered" /></TabsContent>
      <TabsContent value="ird"     class="space-y-4 pt-4"><LedgerTable :ledger="irdFiltered"     /></TabsContent>
    </Tabs>
  </div>
</template>
