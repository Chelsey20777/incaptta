<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import {
  FileText, Clock, Wallet, ArrowLeftRight, TrendingUp,
  Package, AlertTriangle, PackageX, CheckCircle2,
  Landmark, Smartphone, Banknote, ListChecks
} from 'lucide-vue-next'
import { useJobCardsStore } from '@/features/jobCards/store/jobCardsStore'
import { useCommissionsStore } from '@/features/commissions/store/commissionsStore'
import { useFinanceStore } from '@/features/fundTransfers/store/financeStore'
import { useInventoryStore } from '@/features/inventory/store/inventoryStore'
import { storeToRefs } from 'pinia'
import ActivityChart from '../components/ActivityChart.vue'
import IncomeExpensePieChart from '../components/IncomeExpensePieChart.vue'

const jcStore = useJobCardsStore()
const commStore = useCommissionsStore()
const finStore = useFinanceStore()
const invStore = useInventoryStore()

import { useAdminStore } from '@/features/admin/store/adminStore'
const adminStore = useAdminStore()
const { appSettings } = storeToRefs(adminStore)

const { jobCards } = storeToRefs(jcStore)
const { commissions } = storeToRefs(commStore)
const { expenses, transfers, jobPayments, ledger, finalBalances } = storeToRefs(finStore)
const { items: inventoryItems, lowStockItems, totalValue: inventoryValue } = storeToRefs(invStore)

onMounted(() => {
  jcStore.fetchJobCards()
  commStore.fetchAllCommissions()
  finStore.fetchExpenses()
  finStore.fetchTransfers()
  finStore.fetchJobPayments()
  finStore.fetchTopUps()
  finStore.fetchHistoricalInventoryConsumption()
  invStore.fetchItems()
})

onUnmounted(() => {
  jcStore.cleanup()
  commStore.cleanup()
  finStore.cleanup()
})

// ── Finance Stats ───────────────────────────────────────────────
const treasuryBalance = computed(() => {
  const liquidSet = new Set(finStore.LIQUID_ACCOUNTS)
  return Object.entries(finalBalances.value)
    .filter(([acc]) => liquidSet.has(acc))
    .reduce((sum, [_, b]) => sum + (Number(b) || 0), 0)
})

const recentTransfersCount = computed(() => transfers.value.length)

const netRevenue = computed(() => {
  const totalIncome = jobPayments.value.reduce((sum: number, p: any) => sum + (Number(p.amount) || 0), 0)
  const totalApprovedExpenses = expenses.value
    .filter((e: any) => e.status === 'APPROVED')
    .reduce((sum: number, e: any) => sum + (Number(e.amount) || 0), 0)
  return totalIncome - totalApprovedExpenses
})

// Account balances — use finalBalances from store (single source of truth, avoids ledger filtering)
const bankBalance = computed(() => finalBalances.value['BANK'] || 0)
const ecocashBalance = computed(() => finalBalances.value['ECOCASH'] || 0)
const cashBalance = computed(() => finalBalances.value['CASH'] || 0)
const irdBalance = computed(() => finalBalances.value['IRD'] || 0)

// Count accounts with non-zero balances
const activeAccountCount = computed(() =>
  [bankBalance.value, ecocashBalance.value, cashBalance.value, irdBalance.value]
    .filter(b => b !== 0).length
)

// ── Inventory Stats ─────────────────────────────────────────────
const totalItemsInStock = computed(() =>
  inventoryItems.value.reduce((s: number, i: any) => s + (Number(i.onHand) || 0), 0)
)
const outOfStockCount = computed(() =>
  inventoryItems.value.filter((i: any) => (Number(i.onHand) || 0) === 0).length
)

// ── Sections ────────────────────────────────────────────────────
const topStats = computed(() => [
  {
    title: 'Treasury Balance',
    value: formatCurrency(treasuryBalance.value),
    icon: Wallet,
    colorHex: appSettings.value?.uiColors?.brandPrimaryColor || '#79c21b',
    bgClass: 'bg-brand-primary/5 dark:bg-brand-primary/10 backdrop-blur-md text-foreground dark:text-white',
    borderClass: 'border-brand-primary/20 dark:border-brand-primary/30 shadow-lg',
    trend: 'Total cash position',
    trendColorHex: appSettings.value?.uiColors?.brandSecondaryColor || '#ff8903',
    path: '/ledger'
  },
  {
    title: 'Net Revenue',
    value: formatCurrency(netRevenue.value),
    icon: TrendingUp,
    colorHex: appSettings.value?.uiColors?.brandPrimaryColor || '#79c21b',
    bgClass: 'bg-brand-primary/5 dark:bg-brand-primary/10 backdrop-blur-md text-foreground dark:text-white',
    borderClass: 'border-brand-primary/20 dark:border-brand-primary/30 shadow-lg',
    trend: netRevenue.value > 0 ? 'Income exceeds expenses' : netRevenue.value < 0 ? 'Expenses exceed income' : 'No revenue recorded yet',
    trendColorHex: netRevenue.value > 0 ? '#10b981' : netRevenue.value < 0 ? '#ef4444' : '#6b7280',
    path: '/ledger'
  },
])


const inventoryStats = computed(() => [
  {
    title: 'Inventory Valuation',
    value: formatCurrency(inventoryValue.value),
    icon: Package,
    colorHex: appSettings.value?.uiColors?.brandPrimaryColor || '#79c21b',
    bgClass: 'bg-brand-primary/5 dark:bg-brand-primary/10 backdrop-blur-md text-foreground dark:text-white',
    borderClass: 'border-brand-primary/20 dark:border-brand-primary/30 shadow-lg',
    trend: 'Total selling value of all inventory',
    trendColorHex: '#10b981',
    path: '/inventory'
  },
  {
    title: 'Total Items in Stock',
    value: totalItemsInStock.value.toLocaleString(),
    icon: Package,
    colorHex: appSettings.value?.uiColors?.brandPrimaryColor || '#79c21b',
    bgClass: 'bg-brand-primary/5 dark:bg-brand-primary/10 backdrop-blur-md text-foreground dark:text-white',
    borderClass: 'border-brand-primary/20 dark:border-brand-primary/30 shadow-lg',
    trend: `${inventoryItems.value.length} unique items`,
    trendColorHex: '#10b981',
    path: '/inventory'
  },
  {
    title: 'Low Stock Items',
    value: lowStockItems.value.length.toString(),
    icon: AlertTriangle,
    colorHex: appSettings.value?.uiColors?.lowStockColor || '#ff8903',
    bgClass: 'bg-brand-primary/5 dark:bg-brand-primary/10 backdrop-blur-md text-foreground dark:text-white',
    borderClass: 'border-brand-primary/20 dark:border-brand-primary/30 shadow-lg',
    trend: 'Items below minimum level',
    trendColorHex: appSettings.value?.uiColors?.lowStockColor || '#ff8903',
    path: '/inventory'
  },
  {
    title: 'Out of Stock Items',
    value: outOfStockCount.value.toString(),
    icon: PackageX,
    colorHex: appSettings.value?.uiColors?.outOfStockColor || '#ef4444',
    bgClass: 'bg-brand-primary/5 dark:bg-brand-primary/10 backdrop-blur-md text-foreground dark:text-white',
    borderClass: 'border-brand-primary/20 dark:border-brand-primary/30 shadow-lg',
    trend: 'Items with zero stock',
    trendColorHex: appSettings.value?.uiColors?.outOfStockColor || '#ef4444',
    path: '/inventory'
  },
])

const accountStats = computed(() => [
  {
    title: 'Bank Account Balance',
    value: formatCurrency(bankBalance.value),
    icon: Landmark,
    colorHex: appSettings.value?.uiColors?.bankBalanceColor || '#eab308',
    bgClass: 'bg-brand-primary/5 dark:bg-brand-primary/10 backdrop-blur-md text-foreground dark:text-white',
    borderClass: 'border-brand-primary/20 dark:border-brand-primary/30 shadow-lg',
    trend: bankBalance.value !== 0 ? 'Active bank account' : 'No bank transactions',
    trendColorHex: appSettings.value?.uiColors?.bankBalanceColor || '#eab308',
    path: '/ledger'
  },
  {
    title: 'EcoCash / RTGS Balance',
    value: formatCurrency(ecocashBalance.value),
    icon: Smartphone,
    colorHex: appSettings.value?.uiColors?.ecocashBalanceColor || '#ff8903',
    bgClass: 'bg-brand-primary/5 dark:bg-brand-primary/10 backdrop-blur-md text-foreground dark:text-white',
    borderClass: 'border-brand-primary/20 dark:border-brand-primary/30 shadow-lg',
    trend: 'Petty cash (ecocash/rtgs)',
    trendColorHex: appSettings.value?.uiColors?.ecocashBalanceColor || '#ff8903',
    path: '/ledger'
  },
  {
    title: 'Cash in Hand Balance',
    value: formatCurrency(cashBalance.value),
    icon: Banknote,
    colorHex: appSettings.value?.uiColors?.brandPrimaryColor || '#79c21b',
    bgClass: 'bg-brand-primary/5 dark:bg-brand-primary/10 backdrop-blur-md text-foreground dark:text-white',
    borderClass: 'border-brand-primary/20 dark:border-brand-primary/30 shadow-lg',
    trend: 'Physical cash on hand',
    trendColorHex: '#10b981',
    path: '/ledger'
  },
  {
    title: 'IRD Account Balance',
    value: formatCurrency(irdBalance.value),
    icon: ListChecks,
    colorHex: appSettings.value?.uiColors?.irdBalanceColor || '#ef4444',
    bgClass: 'bg-brand-primary/5 dark:bg-brand-primary/10 backdrop-blur-md text-foreground dark:text-white',
    borderClass: 'border-brand-primary/20 dark:border-brand-primary/30 shadow-lg',
    trend: 'Internal Revenue Dept Account',
    trendColorHex: appSettings.value?.uiColors?.irdBalanceColor || '#ef4444',
    path: '/ledger'
  },
])

function formatCurrency(val: any) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(val) || 0)
}

function getStatusColor(status: string) {
  switch (status) {
    case 'DRAFT': return 'text-gray-500'
    case 'SUBMITTED': return 'text-blue-500'
    case 'COMPLETED': return 'text-green-600'
    case 'REJECTED': return 'text-red-500'
    default: return 'text-orange-500'
  }
}
</script>

<template>
  <div class="space-y-8">

    <!-- Row 1: Core Stats (existing) -->
    <div>
      <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-2">
        <RouterLink v-for="stat in topStats" :key="stat.title" :to="stat.path">
          <Card
            :class="[stat.bgClass, stat.borderClass, 'transition-all duration-200 border shadow-sm hover:ring-2 hover:ring-primary/20 hover:scale-[1.02] cursor-pointer h-full']">
            <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle class="text-[11px] font-bold uppercase tracking-wider"
                :style="stat.colorHex ? { color: stat.colorHex } : {}">{{ stat.title }}
              </CardTitle>
              <component :is="stat.icon" class="h-4 w-4" :style="stat.colorHex ? { color: stat.colorHex } : {}" />
            </CardHeader>
            <CardContent>
              <div class="text-2xl font-bold">{{ stat.value }}</div>
              <p class="text-[10px] font-bold uppercase tracking-tight"
                :class="!stat.trendColorHex ? 'text-muted-foreground' : ''"
                :style="stat.trendColorHex ? { color: stat.trendColorHex } : {}">{{ stat.trend }}</p>
            </CardContent>
          </Card>
        </RouterLink>
      </div>
    </div>


    <!-- Row 3: Inventory Stats -->
    <div>
      <h3 class="text-xs font-bold uppercase text-muted-foreground/60 mb-3 tracking-widest">Inventory</h3>
      <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <RouterLink v-for="stat in inventoryStats" :key="stat.title" :to="stat.path">
          <Card
            :class="[stat.bgClass, stat.borderClass, 'transition-all duration-200 border shadow-sm hover:ring-2 hover:ring-primary/20 hover:scale-[1.02] cursor-pointer h-full']">
            <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle class="text-[11px] font-bold uppercase tracking-wider"
                :style="stat.colorHex ? { color: stat.colorHex } : {}">{{ stat.title }}
              </CardTitle>
              <component :is="stat.icon" class="h-4 w-4" :style="stat.colorHex ? { color: stat.colorHex } : {}" />
            </CardHeader>
            <CardContent>
              <div class="text-2xl font-bold">{{ stat.value }}</div>
              <p class="text-[10px] font-bold uppercase tracking-tight"
                :class="!stat.trendColorHex ? 'text-muted-foreground' : ''"
                :style="stat.trendColorHex ? { color: stat.trendColorHex } : {}">{{ stat.trend }}</p>
            </CardContent>
          </Card>
        </RouterLink>
      </div>
    </div>

    <!-- Row 4: Account Balances -->
    <div>
      <h3 class="text-xs font-bold uppercase text-muted-foreground/60 mb-3 tracking-widest">Account Balances</h3>
      <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <RouterLink v-for="stat in accountStats" :key="stat.title" :to="stat.path">
          <Card
            :class="[stat.bgClass, stat.borderClass, 'transition-all duration-200 border shadow-sm hover:ring-2 hover:ring-primary/20 hover:scale-[1.02] cursor-pointer h-full']">
            <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle class="text-xs font-bold uppercase tracking-wider"
                :style="stat.colorHex ? { color: stat.colorHex } : {}">{{ stat.title }}
              </CardTitle>
              <component :is="stat.icon" class="h-4 w-4" :style="stat.colorHex ? { color: stat.colorHex } : {}" />
            </CardHeader>
            <CardContent>
              <div class="text-2xl font-bold text-white">{{ stat.value }}</div>
              <p class="text-xs font-medium" :class="!stat.trendColorHex ? 'text-muted-foreground' : ''"
                :style="stat.trendColorHex ? { color: stat.trendColorHex } : {}">{{ stat.trend }}</p>
            </CardContent>
          </Card>
        </RouterLink>
      </div>
    </div>

    <!-- Charts & Recent Activity -->
    <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
      <Card
        class="col-span-4 bg-brand-primary/5 dark:bg-brand-primary/10 backdrop-blur-md text-foreground dark:text-white border-brand-primary/20 dark:border-brand-primary/30 shadow-lg">
        <CardHeader>
          <CardTitle class="text-brand-primary dark:text-white">Activity Overview</CardTitle>
        </CardHeader>
        <CardContent class="h-[300px]">
          <ActivityChart :ledger="ledger" />
        </CardContent>
      </Card>
      <div class="col-span-3">
        <IncomeExpensePieChart :ledger="ledger" />
      </div>
    </div>

  </div>
</template>
