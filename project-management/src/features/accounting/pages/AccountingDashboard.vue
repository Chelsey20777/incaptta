<script setup lang="ts">
import { onMounted } from 'vue'
import { useAccountingStore } from '../store/accountingStore'
import { storeToRefs } from 'pinia'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { 
  BarChart3, 
  Wallet, 
  TrendingUp, 
  Receipt, 
  FileText, 
  ArrowRight,
  Package,
  Landmark,
  Scale,
  RefreshCw,
  ShieldCheck
} from 'lucide-vue-next'
import { useRouter } from 'vue-router'
import { useJobCardsStore } from '@/features/jobCards/store/jobCardsStore'
import { useReportStore } from '../store/reportStore'
import { toast } from 'vue-sonner'
import FinancialMetricsTable from '../components/FinancialMetricsTable.vue'

const router = useRouter()
const jobStore = useJobCardsStore()
const accountingStore = useAccountingStore()
const reportStore = useReportStore()
const { inventoryValue, loading } = storeToRefs(accountingStore)
const { financialMetrics } = storeToRefs(reportStore)

const syncBacklog = async () => {
  try {
    const count = await jobStore.syncInventoryBacklog()
    toast.success(`Inventory Sync Complete`, {
      description: `Processed ${count} backlogged Job Cards and updated stock/COGS.`
    })
    accountingStore.fetchInventoryValuation()
  } catch (err: any) {
    toast.error('Sync Failed', { description: err.message })
  }
}

onMounted(() => {
  accountingStore.fetchInventoryValuation()
  reportStore.generateFinancialMetrics(new Date().getFullYear())
})

const formatCurrency = (val: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(val)
}
</script>

<template>
  <div class="p-6 space-y-8 animate-in fade-in duration-500">
    <!-- Header -->
    <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
      <div>
        <h1 class="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-brand-primary to-brand-secondary bg-clip-text text-transparent">
          Financial Command Center
        </h1>
        <p class="text-muted-foreground mt-1">Real-time accounting, tax compliance, and asset valuation.</p>
      </div>
      <div class="flex gap-3">
        <Button variant="secondary" class="gap-2 border-brand-primary/20" @click="syncBacklog" :disabled="jobStore.loading">
          <RefreshCw class="size-4" :class="{ 'animate-spin': jobStore.loading }" /> Sync Inventory Backlog
        </Button>
        <Button variant="outline" class="gap-2" @click="router.push('/accounting/vat')">
          <Receipt class="size-4" /> VAT Return
        </Button>
        <Button class="gap-2 bg-brand-primary hover:bg-brand-primary/90 text-white" @click="router.push('/accounting/tax')">
          <Scale class="size-4" /> ITF12C Tax
        </Button>
      </div>
    </div>

    <!-- Top Stats Grid -->
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      <Card class="bg-card/50 backdrop-blur-sm border-brand-primary/20 shadow-xl hover:shadow-brand-primary/10 transition-all group">
        <CardContent class="p-6">
          <div class="flex justify-between items-start">
            <div>
              <p class="text-xs font-bold text-muted-foreground uppercase tracking-widest">Inventory Assets</p>
              <h3 class="text-2xl font-black mt-1 tabular-nums">
                {{ loading ? '...' : formatCurrency(inventoryValue) }}
              </h3>
            </div>
            <div class="p-2 bg-brand-primary/10 rounded-lg group-hover:bg-brand-primary/20 transition-colors">
              <Package class="size-5 text-brand-primary" />
            </div>
          </div>
          <div class="mt-4 flex items-center text-[10px] font-bold text-emerald-500">
            <TrendingUp class="size-3 mr-1" /> Live Valuation from Master
          </div>
        </CardContent>
      </Card>

      <Card class="bg-card/50 backdrop-blur-sm border-brand-secondary/20 shadow-xl hover:shadow-brand-secondary/10 transition-all group text-foreground">
        <CardContent class="p-6">
          <div class="flex justify-between items-start">
            <div>
              <p class="text-xs font-bold text-muted-foreground uppercase tracking-widest">Statutory Liabilities</p>
              <h3 class="text-2xl font-black mt-1 tabular-nums text-red-500">
                $0.00
              </h3>
            </div>
            <div class="p-2 bg-brand-secondary/10 rounded-lg group-hover:bg-brand-secondary/20 transition-colors">
              <Landmark class="size-5 text-brand-secondary" />
            </div>
          </div>
          <div class="mt-4 flex items-center text-[10px] font-bold text-muted-foreground">
            PAYE, NSSA, AIDS Levy Pending
          </div>
        </CardContent>
      </Card>

      <Card class="bg-card/50 backdrop-blur-sm border-brand-primary/20 shadow-xl transition-all">
        <CardContent class="p-6">
          <div class="flex justify-between items-start">
            <div>
              <p class="text-xs font-bold text-muted-foreground uppercase tracking-widest">MTD Revenue</p>
              <h3 class="text-2xl font-black mt-1 tabular-nums">$0.00</h3>
            </div>
            <div class="p-2 bg-brand-primary/10 rounded-lg">
              <TrendingUp class="size-5 text-brand-primary" />
            </div>
          </div>
          <div class="mt-4 flex items-center text-[10px] font-bold text-muted-foreground">
            Poultry & Job Cards Aggregate
          </div>
        </CardContent>
      </Card>

      <Card class="bg-card/50 backdrop-blur-sm border-brand-secondary/20 shadow-xl transition-all">
        <CardContent class="p-6">
          <div class="flex justify-between items-start">
            <div>
              <p class="text-xs font-bold text-muted-foreground uppercase tracking-widest">VAT Status</p>
              <h3 class="text-2xl font-black mt-1 tabular-nums">RECAP</h3>
            </div>
            <div class="p-2 bg-brand-secondary/10 rounded-lg">
              <Receipt class="size-5 text-brand-secondary" />
            </div>
          </div>
          <div class="mt-4 flex items-center text-[10px] font-bold text-emerald-500">
            Current Period: April 2026
          </div>
        </CardContent>
      </Card>
    </div>

    <!-- Main Content Area -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
      <!-- Quick Actions -->
      <Card class="lg:col-span-1 bg-card/50 backdrop-blur-sm border-muted shadow-lg">
        <CardHeader>
          <CardTitle class="text-sm uppercase tracking-wider font-bold">Compliance Center</CardTitle>
        </CardHeader>
        <CardContent class="space-y-4">
          <div class="p-4 rounded-xl bg-muted/30 border border-border/40 hover:bg-muted/50 cursor-pointer transition-all flex items-center justify-between group">
            <div class="flex items-center gap-3">
              <div class="p-2 bg-blue-500/10 rounded-lg">
                <FileText class="size-4 text-blue-500" />
              </div>
              <div>
                <p class="text-sm font-bold">ITF12C Computation</p>
                <p class="text-[10px] text-muted-foreground">Annual Income Tax Template</p>
              </div>
            </div>
            <ArrowRight class="size-4 text-muted-foreground group-hover:translate-x-1 transition-transform" />
          </div>

          <div class="p-4 rounded-xl bg-muted/30 border border-border/40 hover:bg-muted/50 cursor-pointer transition-all flex items-center justify-between group">
            <div class="flex items-center gap-3">
              <div class="p-2 bg-emerald-500/10 rounded-lg">
                <Receipt class="size-4 text-emerald-500" />
              </div>
              <div>
                <p class="text-sm font-bold">VAT Calculator</p>
                <p class="text-[10px] text-muted-foreground">Input vs Output VAT logic</p>
              </div>
            </div>
            <ArrowRight class="size-4 text-muted-foreground group-hover:translate-x-1 transition-transform" />
          </div>

          <div class="p-4 rounded-xl bg-muted/30 border border-border/40 hover:bg-muted/50 cursor-pointer transition-all flex items-center justify-between group" @click="router.push('/accounting/reports')">
            <div class="flex items-center gap-3">
              <div class="p-2 bg-purple-500/10 rounded-lg">
                <FileText class="size-4 text-purple-500" />
              </div>
              <div>
                <p class="text-sm font-bold">Financial Statements</p>
                <p class="text-[10px] text-muted-foreground">P&L and Balance Sheet (USD)</p>
              </div>
            </div>
            <ArrowRight class="size-4 text-muted-foreground group-hover:translate-x-1 transition-transform" />
          </div>

          <div class="p-4 rounded-xl bg-amber-500/5 border border-amber-500/20 hover:bg-amber-500/10 cursor-pointer transition-all flex items-center justify-between group" @click="router.push('/accounting/auto-approvals')">
            <div class="flex items-center gap-3">
              <div class="p-2 bg-amber-500/10 rounded-lg">
                <ShieldCheck class="size-4 text-amber-500" />
              </div>
              <div>
                <p class="text-sm font-bold">Auto-Approvals Audit</p>
                <p class="text-[10px] text-muted-foreground">Opex &amp; Ad-hoc &lt;$300 · Daily / Weekly / Monthly</p>
              </div>
            </div>
            <ArrowRight class="size-4 text-amber-400/60 group-hover:translate-x-1 group-hover:text-amber-500 transition-all" />
          </div>
        </CardContent>
      </Card>

      <!-- Ledger Overview / Recent Activity Placeholder -->
      <Card class="lg:col-span-2 bg-card/50 backdrop-blur-sm border-muted shadow-lg">
        <CardHeader class="flex flex-row items-center justify-between">
          <CardTitle class="text-sm uppercase tracking-wider font-bold">Recent Financial Activity</CardTitle>
          <Button variant="ghost" size="sm" class="text-xs">View Ledger</Button>
        </CardHeader>
        <CardContent>
          <FinancialMetricsTable :data="financialMetrics" granularity="monthly" />
          <div class="mt-4 flex justify-end">
            <Button variant="ghost" size="sm" class="text-xs gap-2" @click="router.push('/accounting/reports')">
              View Detailed Metrics <ArrowRight class="size-3" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
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
