<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { db } from '@/lib/firebase'
import { collection, onSnapshot, Timestamp } from 'firebase/firestore'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useFinanceStore } from '@/stores/financeStore'
import { useInventoryStore } from '@/stores/inventoryStore'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { 
  ChevronLeft, 
  TrendingUp, 
  Scale, 
  Receipt, 
  Calendar, 
  Loader2, 
  ArrowRightLeft, 
  Package, 
  Landmark, 
  DollarSign,
  ShieldCheck,
  Briefcase
} from 'lucide-vue-next'

const router = useRouter()
const finStore = useFinanceStore()
const invStore = useInventoryStore()

const { totalBusinessBalance: cashAndBank, finalBalances: balances } = storeToRefs(finStore)
const { totalValue: inventoryValue } = storeToRefs(invStore)

type Timeframe = 'month' | 'ytd' | 'all'
const timeframe = ref<Timeframe>('month')

// Real-time data refs for on-the-fly calculations
const localJobPayments = ref<any[]>([])
const localExpenses = ref<any[]>([])
const localPoultrySales = ref<any[]>([])
const localJobCards = ref<any[]>([])
const loading = ref(false)

let unsubPayments: (() => void) | null = null
let unsubExpenses: (() => void) | null = null
let unsubPoultry: (() => void) | null = null
let unsubJobCards: (() => void) | null = null

onMounted(async () => {
  loading.value = true
  
  // Refresh global stores
  finStore.fetchExpenses()
  finStore.fetchTransfers()
  finStore.fetchJobPayments()
  finStore.fetchTopUps()
  finStore.fetchSalariesTransactions()
  finStore.fetchHistoricalInventoryConsumption()
  invStore.fetchItems()

  // Set up real-time listeners for dynamic P&L calculations
  unsubPayments = onSnapshot(collection(db, 'jobPayments'), (snap) => {
    localJobPayments.value = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }))
  }, (err) => console.error('Error listening to jobPayments:', err))

  unsubExpenses = onSnapshot(collection(db, 'operationalExpenses'), (snap) => {
    localExpenses.value = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }))
  }, (err) => console.error('Error listening to operationalExpenses:', err))

  unsubPoultry = onSnapshot(collection(db, 'poultrySales'), (snap) => {
    localPoultrySales.value = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }))
  }, (err) => console.error('Error listening to poultrySales:', err))

  unsubJobCards = onSnapshot(collection(db, 'jobCards'), (snap) => {
    localJobCards.value = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }))
    loading.value = false
  }, (err) => {
    console.error('Error listening to jobCards:', err)
    loading.value = false
  })
})

onUnmounted(() => {
  unsubPayments?.()
  unsubExpenses?.()
  unsubPoultry?.()
  unsubJobCards?.()
})

// Timeframe helper checks
const isInTimeframe = (dateInput: any): boolean => {
  if (!dateInput) return false
  const date = dateInput instanceof Timestamp 
    ? dateInput.toDate() 
    : (dateInput.seconds ? new Timestamp(dateInput.seconds, dateInput.nanoseconds).toDate() : new Date(dateInput))
  
  if (isNaN(date.getTime())) return false

  const now = new Date()
  if (timeframe.value === 'month') {
    return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth()
  } else if (timeframe.value === 'ytd') {
    return date.getFullYear() === now.getFullYear()
  }
  return true // All time
}

// Dynamic Profit & Loss Calculations
const plData = computed(() => {
  let revenue = 0
  let cogs = 0
  let opex = 0

  // 1. Revenue: jobPayments + poultrySales in timeframe
  localJobPayments.value.forEach(payment => {
    if (isInTimeframe(payment.createdAt)) {
      revenue += Number(payment.amount || 0)
    }
  })

  localPoultrySales.value.forEach(sale => {
    // poultrySales usually has 'date' field (either Timestamp or Date string)
    if (isInTimeframe(sale.date)) {
      revenue += Number(sale.totalRevenue || 0)
    }
  })

  // 2. COGS & Operating Expenses from operationalExpenses in timeframe
  localExpenses.value.forEach(exp => {
    if (['APPROVED', 'APPROVED_FOR_PAYMENT', 'PAYMENT_PROCESSED'].includes(exp.status) && isInTimeframe(exp.createdAt)) {
      const amount = Number(exp.amount || 0)
      if (exp.type === 'COST_OF_SALES' || exp.category === 'Cost of Sales') {
        cogs += amount
      } else {
        opex += amount
      }
    }
  })

  // 3. Plus Job Card inventory consumption in timeframe (COGS)
  localJobCards.value.forEach(job => {
    const sections = job.requisitionSections || []
    sections.forEach((section: any) => {
      const items = section.items || []
      items.forEach((item: any) => {
        if (item.inventoryItemId && item.approvalStatus === 'APPROVED_MANAGER') {
          const itemDate = item.approvedAt || job.updatedAt || job.createdAt
          if (isInTimeframe(itemDate)) {
            const qty = Number(item.qtyRequired || item.quantity || 0)
            const price = Number(item.irdSellingPrice || item.unitCost || item.costSnapshot || 0)
            cogs += qty * price
          }
        }
      })
    })

    const flatItems = job.requisitionItems || []
    flatItems.forEach((item: any) => {
      if (item.inventoryItemId && item.approvalStatus === 'APPROVED_MANAGER') {
        const itemDate = item.approvedAt || job.updatedAt || job.createdAt
        if (isInTimeframe(itemDate)) {
          const qty = Number(item.qtyRequired || item.quantity || 0)
          const price = Number(item.irdSellingPrice || item.unitCost || item.costSnapshot || 0)
          
          // Avoid double counting if already in sections
          const inSections = sections.some((s: any) => (s.items || []).some((si: any) => si.inventoryItemId === item.inventoryItemId))
          if (!inSections) {
            cogs += qty * price
          }
        }
      }
    })

    // Subtract Returns
    const returns = job.inventoryReturns || []
    returns.forEach((ret: any) => {
      if (ret.inventoryItemId && ret.approvalStatus === 'APPROVED_MANAGER') {
        const retDate = ret.approvedAt || job.updatedAt || job.createdAt
        if (isInTimeframe(retDate)) {
          const qty = Number(ret.qtyReturned || 0)
          const price = Number(ret.unitPrice || 0)
          cogs -= qty * price
        }
      }
    })
  })

  const grossProfit = revenue - cogs
  const netProfit = grossProfit - opex

  return {
    revenue,
    cogs,
    grossProfit,
    operatingExpenses: opex,
    netProfit
  }
})

// Dynamic Balance Sheet Calculations (Financial Position)
const balanceSheetData = computed(() => {
  // 1. Assets
  const cashVal = cashAndBank.value || 0
  const inventoryVal = inventoryValue.value || 0
  const totalAssets = cashVal + inventoryVal

  // 2. Liabilities (Pending Statutory Liabilities)
  let statutoryPayables = 0
  localExpenses.value.forEach(exp => {
    if (exp.type === 'STATUTORY_LIABILITY' && exp.status === 'PENDING') {
      statutoryPayables += Number(exp.amount || 0)
    }
  })

  // 3. Equity
  const equity = totalAssets - statutoryPayables

  return {
    cashAndBank: cashVal,
    inventoryValue: inventoryVal,
    totalAssets,
    statutoryPayables,
    totalLiabilities: statutoryPayables,
    equity
  }
})

// Formatting Helpers
const fmt = (n: number) => {
  return (n < 0 ? '-$' : '$') + Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const getPeriodLabel = computed(() => {
  if (timeframe.value === 'month') {
    return new Date().toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
  } else if (timeframe.value === 'ytd') {
    return `YTD (${new Date().getFullYear()})`
  }
  return 'All-Time Financial Overview'
})
</script>

<template>
  <div class="flex-1 flex flex-col pb-20 bg-background min-h-screen">
    <!-- Header -->
    <header class="sticky top-0 z-10 bg-card border-b px-4 py-4 flex items-center gap-4 shadow-sm">
      <Button variant="ghost" size="icon" @click="router.push('/')">
        <ChevronLeft class="size-6" />
      </Button>
      <div class="flex-1">
        <h1 class="text-xl font-black tracking-tight">Accounting</h1>
        <p class="text-xs text-muted-foreground">Statements & financial sheets</p>
      </div>
      <Badge class="bg-[#ff8903] text-white text-[10px] font-black h-5 px-2">
        REAL-TIME (USD)
      </Badge>
    </header>

    <!-- Timeframe Filters -->
    <section class="p-4 space-y-3">
      <div class="bg-card border rounded-2xl p-1 flex gap-1 shadow-sm">
        <Button 
          variant="ghost" 
          class="flex-1 text-xs font-black py-2 rounded-xl transition-all"
          :class="timeframe === 'month' ? 'bg-[#ff8903] text-white shadow-sm hover:bg-[#ff8903]' : 'text-muted-foreground'"
          @click="timeframe = 'month'"
        >
          <Calendar class="size-3.5 mr-1" /> This Month
        </Button>
        <Button 
          variant="ghost" 
          class="flex-1 text-xs font-black py-2 rounded-xl transition-all"
          :class="timeframe === 'ytd' ? 'bg-[#ff8903] text-white shadow-sm hover:bg-[#ff8903]' : 'text-muted-foreground'"
          @click="timeframe = 'ytd'"
        >
          <Scale class="size-3.5 mr-1" /> YTD
        </Button>
        <Button 
          variant="ghost" 
          class="flex-1 text-xs font-black py-2 rounded-xl transition-all"
          :class="timeframe === 'all' ? 'bg-[#ff8903] text-white shadow-sm hover:bg-[#ff8903]' : 'text-muted-foreground'"
          @click="timeframe = 'all'"
        >
          <Receipt class="size-3.5 mr-1" /> All Time
        </Button>
      </div>
    </section>

    <!-- Loading Indicators -->
    <div v-if="loading" class="flex flex-col items-center justify-center py-20">
      <Loader2 class="size-8 animate-spin text-[#ff8903]" />
      <p class="text-xs text-muted-foreground mt-2 font-bold uppercase tracking-wider">Calculating ledger books...</p>
    </div>

    <main v-else class="px-4 pb-6 space-y-6">
      <!-- Period Banner -->
      <div class="rounded-2xl bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border p-4 shadow-sm flex items-center justify-between">
        <div>
          <p class="text-[9px] font-black uppercase text-muted-foreground tracking-widest">Reporting Period</p>
          <h2 class="text-sm font-black text-foreground mt-0.5">{{ getPeriodLabel }}</h2>
        </div>
        <Badge variant="outline" class="border-emerald-500/25 bg-emerald-500/5 text-emerald-500 text-[10px] font-bold">
          Matched to Master
        </Badge>
      </div>

      <!-- Profit & Loss Section -->
      <section class="space-y-3">
        <h3 class="text-xs font-black uppercase tracking-wider text-muted-foreground px-1 flex items-center gap-1.5">
          <TrendingUp class="size-4 text-[#79c21b]" /> Profit &amp; Loss Statement
        </h3>

        <!-- P&L Cards Grid -->
        <div class="grid grid-cols-2 gap-3">
          <Card class="bg-card border shadow-sm">
            <CardContent class="p-3 space-y-1">
              <span class="text-[9px] font-black uppercase text-muted-foreground tracking-widest block">Gross Income</span>
              <span class="text-base font-black text-[#79c21b] block truncate">{{ fmt(plData.revenue) }}</span>
              <span class="text-[9px] font-medium text-muted-foreground block text-left">Poultry & Job Cards</span>
            </CardContent>
          </Card>

          <Card class="bg-card border shadow-sm">
            <CardContent class="p-3 space-y-1">
              <span class="text-[9px] font-black uppercase text-muted-foreground tracking-widest block">Direct COGS</span>
              <span class="text-base font-black text-purple-400 block truncate">{{ fmt(plData.cogs) }}</span>
              <span class="text-[9px] font-medium text-muted-foreground block text-left">Inventory Consumed</span>
            </CardContent>
          </Card>

          <Card class="bg-card border shadow-sm">
            <CardContent class="p-3 space-y-1">
              <span class="text-[9px] font-black uppercase text-muted-foreground tracking-widest block">Admin &amp; Opex</span>
              <span class="text-base font-black text-red-500 block truncate">{{ fmt(plData.operatingExpenses) }}</span>
              <span class="text-[9px] font-medium text-muted-foreground block text-left">Operations & Staff</span>
            </CardContent>
          </Card>

          <Card class="bg-[#ff8903]/5 border border-[#ff8903]/20 shadow-sm">
            <CardContent class="p-3 space-y-1">
              <span class="text-[9px] font-black uppercase text-[#ff8903] tracking-widest block">Net Profit</span>
              <span :class="['text-base font-black block truncate', plData.netProfit >= 0 ? 'text-[#ff8903]' : 'text-red-600']">
                {{ fmt(plData.netProfit) }}
              </span>
              <span class="text-[9px] font-medium text-muted-foreground block text-left">After deductions</span>
            </CardContent>
          </Card>
        </div>
      </section>

      <!-- Statement of Financial Position (Balance Sheet) -->
      <section class="space-y-3">
        <h3 class="text-xs font-black uppercase tracking-wider text-muted-foreground px-1 flex items-center gap-1.5">
          <Landmark class="size-4 text-blue-500" /> Statement of Financial Position
        </h3>

        <!-- Balance Sheet Breakdowns -->
        <Card class="border shadow-md overflow-hidden bg-card/60 backdrop-blur-md rounded-2xl">
          <CardHeader class="p-4 bg-muted/20 border-b">
            <div class="flex justify-between items-center">
              <CardTitle class="text-xs uppercase font-black text-foreground">ASSETS &amp; LIABILITIES</CardTitle>
              <span class="text-[10px] font-bold text-muted-foreground">USD Sheet</span>
            </div>
          </CardHeader>
          <CardContent class="p-4 space-y-4">
            
            <!-- Assets Block -->
            <div class="space-y-2">
              <div class="flex justify-between items-center text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                <span>1. ASSETS</span>
                <span class="text-foreground font-black">{{ fmt(balanceSheetData.totalAssets) }}</span>
              </div>
              <div class="space-y-1.5 pl-2 border-l-2 border-emerald-500/30 text-xs">
                <div class="flex justify-between items-center">
                  <span class="text-muted-foreground flex items-center gap-1"><DollarSign class="size-3 text-[#79c21b]" /> Liquid Cash &amp; Bank</span>
                  <span class="font-bold text-foreground">{{ fmt(balanceSheetData.cashAndBank) }}</span>
                </div>
                <div class="flex justify-between items-center">
                  <span class="text-muted-foreground flex items-center gap-1"><Package class="size-3 text-[#ff8903]" /> Warehouse Stock Value</span>
                  <span class="font-bold text-foreground">{{ fmt(balanceSheetData.inventoryValue) }}</span>
                </div>
              </div>
            </div>

            <!-- Liabilities Block -->
            <div class="space-y-2 pt-2 border-t border-dashed">
              <div class="flex justify-between items-center text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                <span>2. LIABILITIES</span>
                <span class="text-red-500 font-black">{{ fmt(balanceSheetData.totalLiabilities) }}</span>
              </div>
              <div class="space-y-1.5 pl-2 border-l-2 border-red-500/30 text-xs">
                <div class="flex justify-between items-center">
                  <span class="text-muted-foreground flex items-center gap-1"><Briefcase class="size-3 text-red-500" /> Pending Statutory (ZIMRA/NSSA)</span>
                  <span class="font-bold text-foreground">{{ fmt(balanceSheetData.statutoryPayables) }}</span>
                </div>
              </div>
            </div>

            <!-- Shareholder's Equity Block -->
            <div class="space-y-2 pt-3 border-t border-solid border-border flex justify-between items-center font-black">
              <div class="text-[10px] uppercase tracking-wider text-[#ff8903] flex items-center gap-1.5">
                <ShieldCheck class="size-4" /> 3. Retained Equity
              </div>
              <span class="text-sm text-[#ff8903]">{{ fmt(balanceSheetData.equity) }}</span>
            </div>

          </CardContent>
        </Card>
      </section>

      <!-- Ledger Accounts Health Status -->
      <section class="space-y-3">
        <h3 class="text-xs font-black uppercase tracking-wider text-muted-foreground px-1 flex items-center gap-1.5">
          <ArrowRightLeft class="size-4 text-purple-400" /> Statutory &amp; Liquid Account States
        </h3>

        <div class="grid grid-cols-2 gap-2 text-[10px] font-bold">
          <div class="p-3 bg-muted/40 rounded-xl border flex justify-between items-center">
            <span class="text-muted-foreground">Bank Ledger</span>
            <span :class="[(balances['BANK'] || 0) < 0 ? 'text-red-500' : 'text-foreground']">{{ fmt(balances['BANK'] || 0) }}</span>
          </div>
          <div class="p-3 bg-muted/40 rounded-xl border flex justify-between items-center">
            <span class="text-muted-foreground">EcoCash Ledger</span>
            <span :class="[(balances['ECOCASH'] || 0) < 0 ? 'text-red-500' : 'text-foreground']">{{ fmt(balances['ECOCASH'] || 0) }}</span>
          </div>
          <div class="p-3 bg-muted/40 rounded-xl border flex justify-between items-center">
            <span class="text-muted-foreground">Cash Safe</span>
            <span :class="[(balances['CASH'] || 0) < 0 ? 'text-red-500' : 'text-foreground']">{{ fmt(balances['CASH'] || 0) }}</span>
          </div>
          <div class="p-3 bg-muted/40 rounded-xl border flex justify-between items-center">
            <span class="text-muted-foreground">Salaries Account</span>
            <span :class="[(balances['SALARIES'] || 0) < 0 ? 'text-red-500' : 'text-foreground']">{{ fmt(balances['SALARIES'] || 0) }}</span>
          </div>
        </div>
      </section>
    </main>
  </div>
</template>

<style scoped>
.bg-gradient-to-r {
  background-size: 200% auto;
  animation: gradient 5s linear infinite;
}

@keyframes gradient {
  0% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
}
</style>
