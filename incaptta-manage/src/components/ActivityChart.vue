<script setup lang="ts">
import { computed } from 'vue'
import { VisXYContainer, VisLine, VisAxis, VisCrosshair, VisTooltip, VisArea } from '@unovis/vue'
import { CurveType } from '@unovis/ts'
import { ChartContainer, ChartTooltipContent } from '@/components/ui/chart'

const props = defineProps<{
  ledger: any[]
}>()

const chartData = computed(() => {
  if (!props.ledger || props.ledger.length === 0) return []

  // 1. Filter and sort by date ascending
  const items = props.ledger
    .filter(item => item.type === 'INCOME' || item.type === 'EXPENSE')
    .map(item => ({
      ...item,
      timestamp: item.createdAt?.toDate?.()?.getTime() || new Date(0).getTime()
    }))
    .sort((a, b) => a.timestamp - b.timestamp)

  if (items.length === 0) return []

  // 2. Aggregate by day and calculate cumulative totals
  const dailyData: Record<string, { x: number, income: number, expense: number }> = {}
  let cumulativeIncome = 0
  let cumulativeExpense = 0

  items.forEach(item => {
    const dateObj = new Date(item.timestamp)
    dateObj.setHours(0, 0, 0, 0)
    const timestamp = dateObj.getTime()
    const dateKey = timestamp.toString()

    if (item.type === 'INCOME') {
      cumulativeIncome += Math.abs(item.amount)
    } else if (item.type === 'EXPENSE') {
      cumulativeExpense += Math.abs(item.amount)
    }

    dailyData[dateKey] = {
      x: timestamp,
      income: cumulativeIncome,
      expense: cumulativeExpense
    }
  })

  // 3. Convert to sorted array
  return Object.values(dailyData).sort((a, b) => a.x - b.x)
})

const x = (d: any) => d.x
const y = [
  (d: any) => d.income,
  (d: any) => d.expense
]

const config = {
  income: { label: 'Total Income', color: 'var(--color-emerald-500)' },
  expense: { label: 'Total Expenses', color: 'var(--color-red-500)' }
}

function formatValue(v: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(v)
}

function formatDate(v: number) {
  return new Date(v).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
</script>

<template>
  <div class="w-full h-full min-h-[300px]">
    <div v-if="chartData.length < 2" class="h-full flex items-center justify-center text-muted-foreground italic text-sm">
      Insufficient data to generate trend...
    </div>
    <ChartContainer v-else :config="config" class="h-full w-full">
      <VisXYContainer :data="chartData" :margin="{ top: 10, right: 10, bottom: 20, left: 10 }">
        <VisLine :x="x" :y="y[0]" color="var(--color-emerald-500)" :lineWidth="3" :curveType="CurveType.MonotoneX" />
        <VisArea :x="x" :y="y[0]" color="var(--color-emerald-500)" :opacity="0.1" :curveType="CurveType.MonotoneX" />
        
        <VisLine :x="x" :y="y[1]" color="var(--color-red-500)" :lineWidth="3" :curveType="CurveType.MonotoneX" />
        <VisArea :x="x" :y="y[1]" color="var(--color-red-500)" :opacity="0.1" :curveType="CurveType.MonotoneX" />

        <VisAxis type="x" :tickFormat="formatDate" :gridLine="false" />
        <VisAxis type="y" :tickFormat="formatValue" :gridLine="true" />

        <VisCrosshair :template="() => ''" />
        <VisTooltip :auto-placement="true">
          <template #default="{ data }">
            <ChartTooltipContent :active="true" :payload="[
              { name: 'Total Income', value: data.income, color: 'var(--color-emerald-500)' },
              { name: 'Total Expenses', value: data.expense, color: 'var(--color-red-500)' }
            ]" />
          </template>
        </VisTooltip>
      </VisXYContainer>
    </ChartContainer>
  </div>
</template>
