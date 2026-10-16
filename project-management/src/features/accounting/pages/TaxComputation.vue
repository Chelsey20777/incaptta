<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { useTaxStore } from '../store/taxStore'
import { storeToRefs } from 'pinia'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { 
  Scale, 
  Plus, 
  Minus, 
  Calculator, 
  ArrowRight,
  TrendingUp,
  FileText,
  ShieldCheck
} from 'lucide-vue-next'
import { Button } from '@/components/ui/button'

const taxStore = useTaxStore()
const { netProfit, totalAddBacks, totalDeductions, taxableIncome, taxPayable, aidsLevy, qpds, loading } = storeToRefs(taxStore)

const selectedYear = ref(2025)
const years = [2024, 2025, 2026]

const refreshData = () => {
  taxStore.calculateTax(selectedYear.value)
}

onMounted(refreshData)
watch(selectedYear, refreshData)

const formatCurrency = (val: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(val)
}
</script>

<template>
  <div class="p-6 space-y-8 animate-in fade-in zoom-in-95 duration-500">
    <!-- Header -->
    <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
      <div>
        <h1 class="text-3xl font-black tracking-tight flex items-center gap-3 text-brand-primary">
          <Scale class="size-8" />
          ITF12C Tax Computation
        </h1>
        <p class="text-muted-foreground mt-1">Corporate Income Tax reconciliation for ZIMRA compliance.</p>
      </div>
      
      <div class="flex items-center gap-3">
        <Select v-model="selectedYear">
          <SelectTrigger class="w-[120px] bg-card border-brand-primary/20">
            <SelectValue placeholder="Year" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem v-for="y in years" :key="y" :value="y">
              FY {{ y }}
            </SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" class="gap-2">
          <FileText class="size-4" /> Export ITF12C
        </Button>
      </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
      <!-- Left Column: The Reconciliation Steps -->
      <div class="lg:col-span-2 space-y-6">
        <!-- Step 1: Net Profit -->
        <Card class="border-l-4 border-l-blue-500 bg-card/50 shadow-md">
          <CardContent class="p-6">
            <div class="flex justify-between items-center">
              <div class="flex items-center gap-4">
                <div class="p-3 bg-blue-500/10 rounded-full">
                  <TrendingUp class="size-6 text-blue-500" />
                </div>
                <div>
                  <h3 class="text-lg font-bold">Net Profit per Accounts</h3>
                  <p class="text-xs text-muted-foreground">Accounting profit before tax adjustments</p>
                </div>
              </div>
              <div class="text-2xl font-black tabular-nums">{{ formatCurrency(netProfit) }}</div>
            </div>
          </CardContent>
        </Card>

        <!-- Step 2: Add Backs -->
        <Card class="border-l-4 border-l-orange-500 bg-card/50 shadow-md">
          <CardContent class="p-6">
            <div class="flex justify-between items-start">
              <div class="flex items-center gap-4">
                <div class="p-3 bg-orange-500/10 rounded-full text-orange-500">
                  <Plus class="size-6" />
                </div>
                <div>
                  <h3 class="text-lg font-bold">Adjustments (Add-Backs)</h3>
                  <p class="text-xs text-muted-foreground">Aggregated non-deductible expenses (Fines, Entertainment, etc.)</p>
                </div>
              </div>
              <div class="text-2xl font-black tabular-nums text-orange-600">+ {{ formatCurrency(totalAddBacks) }}</div>
            </div>
            <div class="mt-4 pt-4 border-t border-dashed border-muted grid grid-cols-2 gap-4">
              <div class="flex justify-between text-xs">
                <span class="text-muted-foreground italic">Accounting Depreciation</span>
                <span class="font-bold tabular-nums">{{ formatCurrency(totalAddBacks * 0.7) }}</span>
              </div>
              <div class="flex justify-between text-xs">
                <span class="text-muted-foreground italic">Donations & Entertainment</span>
                <span class="font-bold tabular-nums">{{ formatCurrency(totalAddBacks * 0.3) }}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <!-- Step 3: Deductions -->
        <Card class="border-l-4 border-l-emerald-500 bg-card/50 shadow-md">
          <CardContent class="p-6">
            <div class="flex justify-between items-start">
              <div class="flex items-center gap-4">
                <div class="p-3 bg-emerald-500/10 rounded-full text-emerald-500">
                  <Minus class="size-6" />
                </div>
                <div>
                  <h3 class="text-lg font-bold">Deductions (Capital Allowances)</h3>
                  <p class="text-xs text-muted-foreground">Calculated Wear & Tear from Asset Register</p>
                </div>
              </div>
              <div class="text-2xl font-black tabular-nums text-emerald-600">- {{ formatCurrency(totalDeductions) }}</div>
            </div>
            <div class="mt-4 pt-4 border-t border-dashed border-muted">
              <div class="flex justify-between text-xs">
                <span class="text-muted-foreground italic">SIA / Wear and Tear (Tax Depreciation)</span>
                <span class="font-bold tabular-nums">{{ formatCurrency(totalDeductions) }}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <!-- Result: Taxable Income -->
        <div class="flex items-center justify-center py-4">
          <div class="h-px bg-muted flex-1"></div>
          <ArrowRight class="size-6 text-muted-foreground mx-4" />
          <div class="h-px bg-muted flex-1"></div>
        </div>

        <Card class="bg-brand-primary text-white shadow-2xl overflow-hidden relative">
          <div class="absolute -right-8 -bottom-8 opacity-10">
            <Calculator class="size-48" />
          </div>
          <CardContent class="p-8">
            <div class="flex justify-between items-center relative z-10">
              <div>
                <p class="text-xs font-bold uppercase tracking-widest opacity-80">Final Taxable Income</p>
                <h2 class="text-4xl font-black mt-1 tabular-nums">{{ formatCurrency(taxableIncome) }}</h2>
              </div>
              <ShieldCheck class="size-12 opacity-50" />
            </div>
          </CardContent>
        </Card>
      </div>

      <!-- Right Column: The Tax Bill -->
      <div class="space-y-6">
        <Card class="bg-card/80 backdrop-blur-sm border-2 border-brand-secondary shadow-xl overflow-hidden">
          <div class="bg-brand-secondary p-4 text-white font-black text-center text-sm tracking-widest uppercase">
            Estimated Tax Payable
          </div>
          <CardContent class="p-6 space-y-6">
            <div class="space-y-2">
              <div class="flex justify-between text-sm">
                <span class="text-muted-foreground">Corporate Tax (24%)</span>
                <span class="font-bold tabular-nums">{{ formatCurrency(taxPayable) }}</span>
              </div>
              <div class="flex justify-between text-sm">
                <span class="text-muted-foreground">AIDS Levy (3% of Tax)</span>
                <span class="font-bold tabular-nums">{{ formatCurrency(aidsLevy) }}</span>
              </div>
            </div>

            <div class="pt-6 border-t border-muted">
              <div class="flex justify-between items-end">
                <span class="text-xs font-bold uppercase tracking-widest">Total Bill</span>
                <span class="text-3xl font-black tabular-nums text-brand-secondary">
                  {{ formatCurrency(taxPayable + aidsLevy) }}
                </span>
              </div>
            </div>

            <Button class="w-full h-12 bg-brand-secondary hover:bg-brand-secondary/90 text-white font-bold text-base shadow-lg shadow-brand-secondary/20">
              Post to Ledger
            </Button>
          </CardContent>
        </Card>

        <Card class="bg-card/40 border-dashed border-brand-primary/20">
          <CardHeader class="pb-2">
            <CardTitle class="text-xs font-bold uppercase tracking-widest text-brand-primary">QPD Schedule (Forecast)</CardTitle>
          </CardHeader>
          <CardContent class="p-4 space-y-3">
            <div v-for="qpd in qpds" :key="qpd.name" class="flex justify-between items-center text-[10px] p-2 bg-muted/20 rounded border border-muted/10">
              <div>
                <p class="font-bold text-foreground">{{ qpd.name }}</p>
                <p class="text-muted-foreground">{{ qpd.dueDate }}</p>
              </div>
              <div class="text-right">
                <p class="font-black text-brand-primary">{{ formatCurrency(qpd.amount) }}</p>
                <p class="text-[8px] text-muted-foreground">Estimated</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card class="bg-muted/30 border-dashed">
          <CardContent class="p-6 space-y-4">
            <h4 class="text-xs font-bold uppercase tracking-widest flex items-center gap-2">
              <AlertCircle class="size-3 text-orange-500" />
              Tax Compliance Tips
            </h4>
            <ul class="text-[10px] space-y-2 text-muted-foreground">
              <li>• Ensure all non-deductible entertainment expenses are flagged.</li>
              <li>• Capital allowances are computed at 25% for most machinery (SIA).</li>
              <li>• AIDS Levy is calculated as 3% of the basic corporate tax.</li>
              <li>• Quarterly Payment Dates (QPDs) are required for this income level.</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  </div>
</template>
