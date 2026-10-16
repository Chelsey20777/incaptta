<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useReportStore } from '../store/reportStore'
import { storeToRefs } from 'pinia'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { 
  FileText, 
  PieChart, 
  TrendingUp, 
  DollarSign, 
  Download,
  Building2,
  Scale,
  BarChart3,
  Calendar,
  Package
} from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import InventorySalesReport from './InventorySalesReport.vue'
import FinancialMetricsTable from '../components/FinancialMetricsTable.vue'
import FinancialMetricsChart from '../components/FinancialMetricsChart.vue'

const reportStore = useReportStore()
const { plData, balanceSheetData, financialMetrics, loading } = storeToRefs(reportStore)

const granularity = ref<'monthly' | 'quarterly' | 'yearly'>('monthly')
const selectedYear = ref(2026)

onMounted(() => {
  reportStore.generatePandL(selectedYear.value)
  reportStore.generateBalanceSheet()
  reportStore.generateInventoryReport()
  reportStore.generateFinancialMetrics(selectedYear.value)
})

const formatCurrency = (val: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(val)
}
</script>

<template>
  <div class="p-6 space-y-6 animate-in fade-in duration-700">
    <!-- Header -->
    <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
      <div>
        <h1 class="text-3xl font-black tracking-tight text-foreground flex items-center gap-2">
          <FileText class="size-8 text-brand-primary" />
          Financial Statements (USD)
        </h1>
        <p class="text-muted-foreground">Comprehensive P&L and Balance Sheet reporting.</p>
      </div>
      <Button variant="outline" class="gap-2">
        <Download class="size-4" /> Export All
      </Button>
    </div>

    <Tabs default-value="p-and-l" class="space-y-6">
      <TabsList class="bg-muted/50 p-1">
        <TabsTrigger value="p-and-l" class="gap-2">
          <PieChart class="size-4" /> Profit & Loss
        </TabsTrigger>
        <TabsTrigger value="balance-sheet" class="gap-2">
          <Scale class="size-4" /> Balance Sheet
        </TabsTrigger>
        <TabsTrigger value="inventory-sales" class="gap-2">
          <Package class="size-4" /> Inventory Sales
        </TabsTrigger>
        <TabsTrigger value="metrics" class="gap-2">
          <BarChart3 class="size-4" /> Financial Metrics
        </TabsTrigger>
      </TabsList>

      <!-- Profit & Loss Tab -->
      <TabsContent value="p-and-l">
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card class="lg:col-span-2 shadow-xl border-brand-primary/10">
            <CardHeader class="border-b bg-muted/20">
              <CardTitle class="text-sm font-bold uppercase tracking-widest">Statement of Comprehensive Income</CardTitle>
            </CardHeader>
            <CardContent class="p-0">
              <div class="divide-y">
                <!-- Revenue -->
                <div class="p-6 flex justify-between items-center group hover:bg-muted/10 transition-colors">
                  <div class="space-y-1">
                    <p class="text-sm font-bold">Total Revenue</p>
                    <p class="text-[10px] text-muted-foreground uppercase">Income from Sales & Services</p>
                  </div>
                  <span class="text-xl font-black tabular-nums">{{ formatCurrency(plData.revenue) }}</span>
                </div>

                <!-- COGS -->
                <div class="p-6 flex justify-between items-center bg-muted/5">
                  <div class="space-y-1">
                    <p class="text-sm font-bold">Cost of Sales (COGS)</p>
                    <p class="text-[10px] text-muted-foreground uppercase">Direct materials & flock costs</p>
                  </div>
                  <span class="text-xl font-bold tabular-nums text-red-500">({{ formatCurrency(plData.cogs) }})</span>
                </div>

                <!-- Gross Profit -->
                <div class="p-6 flex justify-between items-center bg-brand-primary/5">
                  <div class="space-y-1">
                    <p class="text-sm font-black uppercase tracking-tighter text-brand-primary">Gross Profit</p>
                  </div>
                  <span class="text-2xl font-black tabular-nums text-brand-primary">{{ formatCurrency(plData.grossProfit) }}</span>
                </div>

                <!-- Operating Expenses -->
                <div class="p-6 space-y-4">
                  <p class="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-4">Operating Expenses</p>
                  <div class="flex justify-between items-center text-sm">
                    <span>Admin & General Expenses</span>
                    <span class="font-medium tabular-nums">{{ formatCurrency(plData.operatingExpenses) }}</span>
                  </div>
                </div>

                <!-- Net Profit -->
                <div class="p-8 flex justify-between items-center bg-gradient-to-br from-brand-primary/10 to-brand-secondary/10">
                  <div class="space-y-1">
                    <p class="text-lg font-black uppercase tracking-tight">Net Profit for the Year</p>
                    <p class="text-[10px] text-muted-foreground uppercase">USD Functional Currency</p>
                  </div>
                  <div class="text-3xl font-black tabular-nums" :class="plData.netProfit >= 0 ? 'text-brand-primary' : 'text-red-500'">
                    {{ formatCurrency(plData.netProfit) }}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <div class="space-y-6">
            <Card class="bg-brand-primary text-white shadow-xl">
              <CardContent class="p-6 flex flex-col items-center text-center space-y-4">
                <div class="p-3 bg-white/20 rounded-full">
                  <TrendingUp class="size-8" />
                </div>
                <div>
                  <p class="text-xs font-bold uppercase tracking-widest opacity-80">Operating Margin</p>
                  <h3 class="text-3xl font-black mt-1">{{ plData.revenue > 0 ? ((plData.netProfit / plData.revenue) * 100).toFixed(1) : 0 }}%</h3>
                </div>
              </CardContent>
            </Card>

            <Card class="bg-card/50 border-dashed">
              <CardHeader>
                <CardTitle class="text-xs font-bold uppercase tracking-widest">Revenue Breakdown</CardTitle>
              </CardHeader>
              <CardContent class="space-y-3">
                <div class="flex justify-between text-sm">
                  <span class="text-muted-foreground">Services (Job Cards)</span>
                  <span class="font-bold tabular-nums">100%</span>
                </div>
                <div class="flex justify-between text-sm">
                  <span class="text-muted-foreground">Poultry</span>
                  <span class="font-bold tabular-nums">0%</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </TabsContent>

      <!-- Balance Sheet Tab -->
      <TabsContent value="balance-sheet">
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <!-- Assets -->
          <Card class="shadow-xl">
            <CardHeader class="border-b bg-muted/20">
              <CardTitle class="text-sm font-bold uppercase tracking-widest flex items-center gap-2">
                <Building2 class="size-4 text-blue-500" />
                Statement of Financial Position: Assets
              </CardTitle>
            </CardHeader>
            <CardContent class="p-6 space-y-6">
              <div class="space-y-4">
                <p class="text-xs font-bold uppercase tracking-widest text-muted-foreground">Current Assets</p>
                <div class="flex justify-between items-center py-3 border-b border-dashed">
                  <div class="flex items-center gap-3">
                    <div class="p-2 bg-blue-500/10 rounded-lg"><DollarSign class="size-4 text-blue-500" /></div>
                    <span class="text-sm font-medium">Cash & Bank Balances</span>
                  </div>
                  <span class="font-bold tabular-nums">{{ formatCurrency(balanceSheetData.assets.cashAndBank) }}</span>
                </div>
                <div class="flex justify-between items-center py-3 border-b border-dashed">
                  <div class="flex items-center gap-3">
                    <div class="p-2 bg-emerald-500/10 rounded-lg"><Package class="size-4 text-emerald-500" /></div>
                    <span class="text-sm font-medium">Inventory on Hand</span>
                  </div>
                  <span class="font-bold tabular-nums">{{ formatCurrency(balanceSheetData.assets.inventory) }}</span>
                </div>
              </div>
              
              <div class="pt-4 flex justify-between items-center">
                <span class="text-lg font-black uppercase tracking-tight">Total Assets</span>
                <span class="text-2xl font-black tabular-nums text-blue-600 border-b-4 border-blue-600/20">
                  {{ formatCurrency(balanceSheetData.assets.totalAssets) }}
                </span>
              </div>
            </CardContent>
          </Card>

          <!-- Liabilities & Equity -->
          <div class="space-y-6">
            <Card class="shadow-xl">
              <CardHeader class="border-b bg-muted/20">
                <CardTitle class="text-sm font-bold uppercase tracking-widest flex items-center gap-2">
                  <Scale class="size-4 text-orange-500" />
                  Liabilities & Equity
                </CardTitle>
              </CardHeader>
              <CardContent class="p-6 space-y-8">
                <div class="space-y-4">
                  <p class="text-xs font-bold uppercase tracking-widest text-muted-foreground">Current Liabilities</p>
                  <div class="flex justify-between items-center py-3 border-b border-dashed">
                    <span class="text-sm font-medium">Statutory Payables (Tax/NSSA)</span>
                    <span class="font-bold tabular-nums text-orange-600">{{ formatCurrency(balanceSheetData.liabilities.statutoryPayables) }}</span>
                  </div>
                </div>

                <div class="space-y-4 pt-4">
                  <p class="text-xs font-bold uppercase tracking-widest text-muted-foreground">Shareholders' Equity</p>
                  <div class="flex justify-between items-center py-3 border-b-2 border-brand-primary/20">
                    <span class="text-sm font-black italic">Owner's Equity / Retained Earnings</span>
                    <span class="font-black tabular-nums text-brand-primary">{{ formatCurrency(balanceSheetData.equity) }}</span>
                  </div>
                </div>

                <div class="pt-4 flex justify-between items-center">
                  <span class="text-lg font-black uppercase tracking-tight">Total Liabilities & Equity</span>
                  <span class="text-2xl font-black tabular-nums border-b-4 border-muted">
                    {{ formatCurrency(balanceSheetData.liabilities.totalLiabilities + balanceSheetData.equity) }}
                  </span>
                </div>
              </CardContent>
            </Card>

            <div class="p-4 bg-muted/30 rounded-xl flex items-start gap-3">
              <div class="p-2 bg-brand-primary/10 rounded-full shrink-0"><Scale class="size-4 text-brand-primary" /></div>
              <p class="text-[10px] text-muted-foreground italic leading-relaxed">
                The Balance Sheet is balanced based on the fundamental accounting equation: Assets = Liabilities + Equity. All figures are presented in USD.
              </p>
            </div>
          </div>
        </div>
      </TabsContent>

      <!-- Inventory Sales Tab -->
      <TabsContent value="inventory-sales">
        <InventorySalesReport />
      </TabsContent>

      <!-- Financial Metrics Tab -->
      <TabsContent value="metrics" class="space-y-6">
        <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div class="flex items-center gap-4">
            <Select v-model="granularity">
              <SelectTrigger class="w-[180px]">
                <Calendar class="mr-2 size-4 opacity-50" />
                <SelectValue placeholder="Granularity" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="monthly">Monthly View</SelectItem>
                <SelectItem value="quarterly">Quarterly View</SelectItem>
                <SelectItem value="yearly">Yearly View</SelectItem>
              </SelectContent>
            </Select>

            <Select 
              :model-value="selectedYear.toString()" 
              @update:model-value="(val) => { 
                selectedYear = Number(val); 
                reportStore.generateFinancialMetrics(selectedYear);
                reportStore.generatePandL(selectedYear);
              }"
            >
              <SelectTrigger class="w-[120px]">
                <SelectValue placeholder="Year" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="2024">2024</SelectItem>
                <SelectItem value="2025">2025</SelectItem>
                <SelectItem value="2026">2026</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div class="flex items-center gap-2 text-xs font-bold text-muted-foreground uppercase tracking-widest">
            <div class="size-3 rounded-full bg-brand-primary"></div> Sales
            <div class="size-3 rounded-full bg-brand-secondary ml-2"></div> Expenses
          </div>
        </div>

        <Card class="p-6">
          <FinancialMetricsChart :data="financialMetrics" :granularity="granularity" />
        </Card>

        <FinancialMetricsTable :data="financialMetrics" :granularity="granularity" />
      </TabsContent>
    </Tabs>
  </div>
</template>
