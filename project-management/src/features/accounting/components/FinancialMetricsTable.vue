<script setup lang="ts">
import { computed } from 'vue'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { TrendingUp, TrendingDown, Minus } from 'lucide-vue-next'

const props = defineProps<{
  data: any[]
  granularity: 'monthly' | 'quarterly' | 'yearly'
}>()

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
]

const aggregatedData = computed(() => {
  if (props.granularity === 'monthly') {
    return props.data.map(d => ({
      ...d,
      label: `${MONTH_NAMES[d.month]} ${d.year}`
    }))
  }

  if (props.granularity === 'quarterly') {
    const quarters = [
      { label: 'Q1', months: [0, 1, 2] },
      { label: 'Q2', months: [3, 4, 5] },
      { label: 'Q3', months: [6, 7, 8] },
      { label: 'Q4', months: [9, 10, 11] }
    ]

    return quarters.map(q => {
      const qData = props.data.filter(d => q.months.includes(d.month))
      return {
        label: `${q.label} ${props.data[0]?.year || ''}`,
        sales: qData.reduce((s, d) => s + d.sales, 0),
        opex: qData.reduce((s, d) => s + d.opex, 0),
        jobcardAdhoc: qData.reduce((s, d) => s + d.jobcardAdhoc, 0),
        staffRates: qData.reduce((s, d) => s + d.staffRates, 0),
        salaries: qData.reduce((s, d) => s + d.salaries, 0)
      }
    })
  }

  if (props.granularity === 'yearly') {
    return [{
      label: `${props.data[0]?.year || ''}`,
      sales: props.data.reduce((s, d) => s + d.sales, 0),
      opex: props.data.reduce((s, d) => s + d.opex, 0),
      jobcardAdhoc: props.data.reduce((s, d) => s + d.jobcardAdhoc, 0),
      staffRates: props.data.reduce((s, d) => s + d.staffRates, 0),
      salaries: props.data.reduce((s, d) => s + d.salaries, 0)
    }]
  }

  return []
})

const formatCurrency = (val: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(val)
}

const calculateNet = (row: any) => {
  return row.sales - (row.opex + row.jobcardAdhoc + row.staffRates + row.salaries)
}
</script>

<template>
  <div class="rounded-xl border bg-card overflow-hidden shadow-sm">
    <Table>
      <TableHeader class="bg-muted/50">
        <TableRow>
          <TableHead class="w-[200px] font-bold uppercase tracking-wider text-[10px]">Period</TableHead>
          <TableHead class="text-right font-bold uppercase tracking-wider text-[10px]">Sales</TableHead>
          <TableHead class="text-right font-bold uppercase tracking-wider text-[10px]">Op Expenses</TableHead>
          <TableHead class="text-right font-bold uppercase tracking-wider text-[10px]">Ad-hoc Exp</TableHead>
          <TableHead class="text-right font-bold uppercase tracking-wider text-[10px]">Staff Rates</TableHead>
          <TableHead class="text-right font-bold uppercase tracking-wider text-[10px]">Salaries</TableHead>
          <TableHead class="text-right font-bold uppercase tracking-wider text-[10px]">Net Contribution</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow v-for="row in aggregatedData" :key="row.label" class="hover:bg-muted/30 transition-colors">
          <TableCell class="font-bold text-sm">{{ row.label }}</TableCell>
          <TableCell class="text-right tabular-nums font-medium">{{ formatCurrency(row.sales) }}</TableCell>
          <TableCell class="text-right tabular-nums text-muted-foreground">{{ formatCurrency(row.opex) }}</TableCell>
          <TableCell class="text-right tabular-nums text-muted-foreground">{{ formatCurrency(row.jobcardAdhoc) }}</TableCell>
          <TableCell class="text-right tabular-nums text-muted-foreground">{{ formatCurrency(row.staffRates) }}</TableCell>
          <TableCell class="text-right tabular-nums text-muted-foreground">{{ formatCurrency(row.salaries) }}</TableCell>
          <TableCell class="text-right tabular-nums">
            <div class="flex items-center justify-end gap-2">
              <span :class="calculateNet(row) >= 0 ? 'text-emerald-600 font-black' : 'text-red-500 font-black'">
                {{ formatCurrency(calculateNet(row)) }}
              </span>
              <TrendingUp v-if="calculateNet(row) > 0" class="size-3 text-emerald-500" />
              <TrendingDown v-else-if="calculateNet(row) < 0" class="size-3 text-red-500" />
              <Minus v-else class="size-3 text-muted-foreground" />
            </div>
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>
  </div>
</template>
