<script setup lang="ts">
/**
 * ExpenseTrendChart
 *
 * Renders a line + area chart of daily expense totals over the selected period.
 * All data comes from AnalyticsPayload.expenses.trend — no independent store access.
 *
 * Pattern: mirrors ActivityChart.vue (dashboard) exactly, using the same
 * VisXYContainer + VisLine + VisArea + VisAxis + VisTooltip stack from @unovis/vue.
 */
import { computed } from 'vue'
import { VisXYContainer, VisLine, VisArea, VisAxis, VisCrosshair, VisTooltip } from '@unovis/vue'
import { CurveType } from '@unovis/ts'
import { ChartContainer, ChartTooltipContent } from '@/components/ui/chart'
import type { DailyExpenseTotal } from '../types/analytics'

const props = defineProps<{
  trend: DailyExpenseTotal[]
  periodDays: number
}>()

// ── Data transform ──────────────────────────────────────────────────────────
/**
 * Converts 'YYYY-MM-DD' strings (produced by toLocalDateString in the composable)
 * back to local-midnight timestamps for the @unovis x-axis.
 * Using explicit year/month/day parsing prevents UTC-offset day shifts.
 */
function parseDateKey(dateStr: string): number {
  const [y, m, d] = dateStr.split('-')
  return new Date(Number(y), Number(m) - 1, Number(d)).getTime()
}

const chartData = computed(() =>
  props.trend.map(d => ({
    x: parseDateKey(d.date),
    y: d.total,
  }))
)

const hasData = computed(() =>
  chartData.value.length >= 2 && chartData.value.some(d => d.y > 0)
)

// ── Accessors ───────────────────────────────────────────────────────────────
const x = (d: { x: number; y: number }) => d.x
const y = (d: { x: number; y: number }) => d.y

// ── Config for ChartContainer CSS vars ──────────────────────────────────────
const config = {
  expenses: { label: 'Daily Expenses', color: 'var(--color-orange-500)' },
}

// ── Formatters ──────────────────────────────────────────────────────────────
function formatValue(v: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v)
}

function formatAxisDate(v: number) {
  // Show fewer ticks for longer periods to avoid overlap
  return new Date(v).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
</script>

<template>
  <div class="w-full h-full min-h-[220px]">
    <div
      v-if="!hasData"
      class="h-[220px] flex items-center justify-center text-muted-foreground italic text-sm"
    >
      No expense data for this period
    </div>
    <ChartContainer v-else :config="config" class="h-[220px] w-full" :cursor="true">
      <VisXYContainer :data="chartData" :margin="{ top: 8, right: 8, bottom: 24, left: 10 }">
        <!-- Area fill under the line -->
        <VisArea
          :x="x"
          :y="y"
          color="var(--color-orange-500)"
          :opacity="0.12"
          :curveType="CurveType.MonotoneX"
        />
        <!-- Main line -->
        <VisLine
          :x="x"
          :y="y"
          color="var(--color-orange-500)"
          :lineWidth="2.5"
          :curveType="CurveType.MonotoneX"
        />
        <!-- Axes -->
        <VisAxis type="x" :tickFormat="formatAxisDate" :gridLine="false" :numTicks="periodDays > 30 ? 6 : 8" />
        <VisAxis type="y" :tickFormat="formatValue" :gridLine="true" :numTicks="4" />
        <!-- Crosshair + Tooltip -->
        <VisCrosshair :template="() => ''" />
        <VisTooltip :auto-placement="true">
          <template #default="{ data }">
            <ChartTooltipContent
              :active="true"
              :payload="[{ name: 'Expenses', value: data.y, color: 'var(--color-orange-500)' }]"
              :formatter="(v: number) => formatValue(v)"
            />
          </template>
        </VisTooltip>
      </VisXYContainer>
    </ChartContainer>
  </div>
</template>
