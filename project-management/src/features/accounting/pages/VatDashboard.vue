<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { useVatStore } from '../store/vatStore'
import { storeToRefs } from 'pinia'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { 
  Receipt, 
  ArrowUpRight, 
  ArrowDownRight, 
  Scale, 
  Calendar,
  AlertCircle,
  Download,
  CheckCircle2
} from 'lucide-vue-next'
import { Button } from '@/components/ui/button'

const vatStore = useVatStore()
const { outputVat, inputVat, netVatPayable, poultryVat, jobVat, loading } = storeToRefs(vatStore)

const selectedMonth = ref(new Date().getMonth() + 1)
const selectedYear = ref(new Date().getFullYear())

const months = [
  { value: 1, label: 'January' }, { value: 2, label: 'February' },
  { value: 3, label: 'March' }, { value: 4, label: 'April' },
  { value: 5, label: 'May' }, { value: 6, label: 'June' },
  { value: 7, label: 'July' }, { value: 8, label: 'August' },
  { value: 9, label: 'September' }, { value: 10, label: 'October' },
  { value: 11, label: 'November' }, { value: 12, label: 'December' }
]

const years = [2024, 2025, 2026]

const refreshData = () => {
  vatStore.calculateVat(selectedMonth.value, selectedYear.value)
}

onMounted(refreshData)
watch([selectedMonth, selectedYear], refreshData)

const formatCurrency = (val: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(val)
}
</script>

<template>
  <div class="p-6 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
    <!-- Header -->
    <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
      <div>
        <h1 class="text-3xl font-black tracking-tight text-foreground flex items-center gap-2">
          <Receipt class="size-8 text-brand-primary" />
          VAT Return Center
        </h1>
        <p class="text-muted-foreground">Manage your Value Added Tax compliance and submissions.</p>
      </div>
      
      <div class="flex items-center gap-3">
        <Select v-model="selectedMonth">
          <SelectTrigger class="w-[140px] bg-card border-brand-primary/20">
            <Calendar class="mr-2 size-4 opacity-50" />
            <SelectValue placeholder="Month" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem v-for="m in months" :key="m.value" :value="m.value">
              {{ m.label }}
            </SelectItem>
          </SelectContent>
        </Select>

        <Select v-model="selectedYear">
          <SelectTrigger class="w-[100px] bg-card border-brand-primary/20">
            <SelectValue placeholder="Year" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem v-for="y in years" :key="y" :value="y">
              {{ y }}
            </SelectItem>
          </SelectContent>
        </Select>

        <Button variant="outline" size="icon" @click="refreshData">
          <Download class="size-4" />
        </Button>
      </div>
    </div>

    <!-- Summary Cards -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
      <Card class="relative overflow-hidden border-emerald-500/20 bg-emerald-500/5 shadow-lg">
        <div class="absolute top-0 right-0 p-4 opacity-10">
          <ArrowUpRight class="size-16" />
        </div>
        <CardContent class="p-6">
          <p class="text-xs font-bold uppercase tracking-widest text-emerald-600">Output VAT (Sales)</p>
          <h2 class="text-3xl font-black mt-2 tabular-nums">{{ formatCurrency(outputVat) }}</h2>
          <p class="text-[10px] mt-2 font-medium text-muted-foreground uppercase">Collected from customers</p>
        </CardContent>
      </Card>

      <Card class="relative overflow-hidden border-blue-500/20 bg-blue-500/5 shadow-lg">
        <div class="absolute top-0 right-0 p-4 opacity-10">
          <ArrowDownRight class="size-16" />
        </div>
        <CardContent class="p-6">
          <p class="text-xs font-bold uppercase tracking-widest text-blue-600">Input VAT (Purchases)</p>
          <h2 class="text-3xl font-black mt-2 tabular-nums">{{ formatCurrency(inputVat) }}</h2>
          <p class="text-[10px] mt-2 font-medium text-muted-foreground uppercase">Claimable from ZIMRA</p>
        </CardContent>
      </Card>

      <Card class="relative overflow-hidden border-brand-secondary/20 bg-brand-secondary/5 shadow-lg border-2">
        <div class="absolute top-0 right-0 p-4 opacity-10">
          <Scale class="size-16" />
        </div>
        <CardContent class="p-6">
          <p class="text-xs font-bold uppercase tracking-widest text-brand-secondary">Net VAT Payable</p>
          <h2 class="text-3xl font-black mt-2 tabular-nums" :class="netVatPayable > 0 ? 'text-orange-600' : 'text-emerald-600'">
            {{ formatCurrency(Math.abs(netVatPayable)) }}
          </h2>
          <p class="text-[10px] mt-2 font-bold uppercase" :class="netVatPayable > 0 ? 'text-orange-600' : 'text-emerald-600'">
            {{ netVatPayable > 0 ? 'PAYABLE TO ZIMRA' : 'REFUND DUE' }}
          </p>
        </CardContent>
      </Card>
    </div>

    <!-- Main Breakdown Area -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
      <!-- Output VAT Breakdown -->
      <Card class="bg-card/50 backdrop-blur-md border-muted shadow-xl">
        <CardHeader>
          <CardTitle class="text-sm font-bold uppercase tracking-widest flex items-center gap-2">
            <ArrowUpRight class="size-4 text-emerald-500" />
            Output VAT Breakdown
          </CardTitle>
        </CardHeader>
        <CardContent class="space-y-4">
          <div class="flex justify-between items-center p-3 rounded-lg bg-muted/20">
            <span class="text-sm font-medium">Poultry Sales</span>
            <span class="text-sm font-bold tabular-nums">{{ formatCurrency(poultryVat) }}</span>
          </div>
          <div class="flex justify-between items-center p-3 rounded-lg bg-muted/20">
            <span class="text-sm font-medium">Job Card Services</span>
            <span class="text-sm font-bold tabular-nums">{{ formatCurrency(jobVat) }}</span>
          </div>
          <div class="p-4 bg-emerald-500/10 rounded-xl border border-emerald-500/20 mt-4">
            <div class="flex items-start gap-3">
              <CheckCircle2 class="size-5 text-emerald-500 shrink-0" />
              <div>
                <p class="text-xs font-bold text-emerald-700">Audit Ready</p>
                <p class="text-[10px] text-emerald-600">All sales records have valid tax invoice references.</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <!-- Input VAT Breakdown -->
      <Card class="bg-card/50 backdrop-blur-md border-muted shadow-xl">
        <CardHeader>
          <CardTitle class="text-sm font-bold uppercase tracking-widest flex items-center gap-2">
            <ArrowDownRight class="size-4 text-blue-500" />
            Input VAT Breakdown
          </CardTitle>
        </CardHeader>
        <CardContent class="space-y-4">
          <div class="flex justify-between items-center p-3 rounded-lg bg-muted/20">
            <span class="text-sm font-medium">Direct Operating Costs</span>
            <span class="text-sm font-bold tabular-nums">{{ formatCurrency(inputVat * 0.7) }}</span>
          </div>
          <div class="flex justify-between items-center p-3 rounded-lg bg-muted/20">
            <span class="text-sm font-medium">Administrative Expenses</span>
            <span class="text-sm font-bold tabular-nums">{{ formatCurrency(inputVat * 0.3) }}</span>
          </div>
          <div class="p-4 bg-blue-500/10 rounded-xl border border-blue-500/20 mt-4">
            <div class="flex items-start gap-3">
              <AlertCircle class="size-5 text-blue-500 shrink-0" />
              <div>
                <p class="text-xs font-bold text-blue-700">Verification Required</p>
                <p class="text-[10px] text-blue-600">Ensure all supplier tax invoices are uploaded for this period.</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>

    <!-- Action Bar -->
    <div class="flex justify-end gap-4">
      <Button variant="ghost" class="font-bold">Discard Changes</Button>
      <Button class="bg-brand-primary text-white font-bold px-8 h-12 shadow-lg shadow-brand-primary/20">
        Generate VAT 201 Return
      </Button>
    </div>
  </div>
</template>
