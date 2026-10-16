<script setup lang="ts">
import { computed } from 'vue'
import { VisXYContainer, VisLine, VisArea, VisAxis, VisCrosshair, VisTooltip, VisGroupedBar } from '@unovis/vue'
import { CurveType } from '@unovis/ts'
import { ChartContainer, ChartTooltipContent } from '@/components/ui/chart'

const props = defineProps<{
  data: any[]
  granularity: 'monthly' | 'quarterly' | 'yearly'
}>()

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
]

const aggregatedData = computed(() => {
  if (props.granularity === 'monthly') {
    return props.data.map(d => ({
      x: d.month,
      sales: d.sales,
      expenses: d.opex + d.jobcardAdhoc + d.salaries,
      label: MONTH_NAMES[d.month]
    }))
  }

  if (props.granularity === 'quarterly') {
    const quarters = [
      { label: 'Q1', months: [0, 1, 2] },
      { label: 'Q2', months: [3, 4, 5] },
      { label: 'Q3', months: [6, 7, 8] },
      { label: 'Q4', months: [9, 10, 11] }
    ]

    return quarters.map((q, i) => {
      const qData = props.data.filter(d => q.months.includes(d.month))
      return {
        x: i,
        label: q.label,
        sales: qData.reduce((s, d) => s + d.sales, 0),
        expenses: qData.reduce((s, d) => s + (d.opex + d.jobcardAdhoc + d.salaries), 0)
      }
    })
  }

  return props.data.map((d, i) => ({
    x: i,
    label: d.year.toString(),
    sales: props.data.reduce((s, x) => s + x.sales, 0),
    expenses: props.data.reduce((s, x) => s + (x.opex + x.jobcardAdhoc + x.salaries), 0)
  })).slice(0, 1)
})

const x = (d: any) => d?.x ?? 0
const ySales = (d: any) => d?.sales ?? 0
const yExpenses = (d: any) => d?.expenses ?? 0

const config = {
  sales: { label: 'Sales', color: 'hsl(var(--brand-primary))' },
  expenses: { label: 'Expenses', color: 'hsl(var(--brand-secondary))' }
}

function formatValue(v: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v)
}

function formatAxis(v: number) {
  return aggregatedData.value[v]?.label || ''
}
</script>

<template>
  <div class="w-full h-[300px]">
    <ChartContainer :config="config" class="h-full w-full" :cursor="true">
      <VisXYContainer :data="aggregatedData" :margin="{ top: 20, right: 20, bottom: 40, left: 20 }">
        <!-- Sales Area -->
        <VisArea
          :x="x"
          :y="ySales"
          color="var(--brand-primary)"
          :opacity="0.1"
          :curveType="CurveType.MonotoneX"
        />
        <VisLine
          :x="x"
          :y="ySales"
          color="var(--brand-primary)"
          :lineWidth="3"
          :curveType="CurveType.MonotoneX"
        />

        <!-- Expenses Area -->
        <VisArea
          :x="x"
          :y="yExpenses"
          color="var(--brand-secondary)"
          :opacity="0.1"
          :curveType="CurveType.MonotoneX"
        />
        <VisLine
          :x="x"
          :y="yExpenses"
          color="var(--brand-secondary)"
          :lineWidth="3"
          :curveType="CurveType.MonotoneX"
        />

        <VisAxis type="x" :tickFormat="formatAxis" :gridLine="false" :numTicks="aggregatedData.length" />
        <VisAxis type="y" :tickFormat="formatValue" :gridLine="true" :numTicks="5" />
        
        <VisCrosshair :template="() => ''" />
        <VisTooltip :auto-placement="true">
          <template #default="{ data }">
            <ChartTooltipContent
              :active="true"
              :payload="[
                { name: 'Sales', value: data.sales, color: 'var(--brand-primary)' },
                { name: 'Expenses', value: data.expenses, color: 'var(--brand-secondary)' }
              ]"
              :formatter="(v: number) => formatValue(v)"
            />
          </template>
        </VisTooltip>
      </VisXYContainer>
    </ChartContainer>
  </div>
</template>
