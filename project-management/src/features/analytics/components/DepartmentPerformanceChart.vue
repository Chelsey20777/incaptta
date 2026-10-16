<script setup lang="ts">
/**
 * DepartmentPerformanceChart
 *
 * Grouped bar chart showing total vs completed job cards per department.
 * Uses VisXYContainer + VisGroupedBar from @unovis/vue — same import family
 * as ActivityChart.vue in the dashboard feature.
 *
 * Data: AnalyticsPayload.departmentMetrics (all departments from adminStore).
 * Filters out departments with 0 job cards before rendering.
 */
import { computed } from 'vue'
import { VisXYContainer, VisGroupedBar, VisAxis, VisTooltip } from '@unovis/vue'
import { ChartContainer, ChartTooltipContent } from '@/components/ui/chart'
import type { DepartmentMetric } from '../types/analytics'

const props = defineProps<{
  metrics: DepartmentMetric[]
}>()

// ── Filtered and truncated data ──────────────────────────────────────────────
const DEPT_NAME_MAX = 14   // Truncate long department names for the axis
const MAX_BARS      = 10   // Cap to avoid cramped rendering

const chartData = computed<DepartmentMetric[]>(() =>
  props.metrics
    .filter(d => d.jobCardCount > 0)
    .slice(0, MAX_BARS)
    .map(d => ({
      ...d,
      // Truncate for axis readability; full name remains in tooltip via departmentName
      _label: d.departmentName.length > DEPT_NAME_MAX
        ? d.departmentName.slice(0, DEPT_NAME_MAX) + '…'
        : d.departmentName,
    }))
)

const hasData = computed(() => chartData.value.length > 0)

// ── @unovis accessors ────────────────────────────────────────────────────────
// x returns the truncated label string for the X axis
const x = (d: DepartmentMetric & { _label?: string }) => (d as any)._label ?? d.departmentName

// y is an array: [total cards, completed cards] — two bars per department
const y = [
  (d: DepartmentMetric) => d.jobCardCount,
  (d: DepartmentMetric) => d.completedCount,
]

// Two colours: primary (blue) for total, emerald for completed
const BAR_COLORS = ['var(--color-blue-500)', 'var(--color-emerald-500)']

// ── Config ───────────────────────────────────────────────────────────────────
const config = {
  total:     { label: 'Total Cards',     color: 'var(--color-blue-500)' },
  completed: { label: 'Completed Cards', color: 'var(--color-emerald-500)' },
}

function formatCount(v: number) {
  return String(Math.round(v))
}
</script>

<template>
  <div class="w-full min-h-[200px]">
    <p
      v-if="!hasData"
      class="h-[200px] flex items-center justify-center text-muted-foreground italic text-sm"
    >
      No departments with job cards found
    </p>

    <template v-else>
      <!-- Legend -->
      <div class="flex items-center gap-4 mb-4">
        <div class="flex items-center gap-1.5">
          <div class="size-2.5 rounded-sm bg-blue-500" />
          <span class="text-[11px] text-muted-foreground font-medium">Total</span>
        </div>
        <div class="flex items-center gap-1.5">
          <div class="size-2.5 rounded-sm bg-emerald-500" />
          <span class="text-[11px] text-muted-foreground font-medium">Completed</span>
        </div>
      </div>

      <ChartContainer :config="config" class="h-[200px] w-full">
        <VisXYContainer
          :data="chartData"
          :margin="{ top: 4, right: 8, bottom: 36, left: 10 }"
        >
          <VisGroupedBar
            :x="x"
            :y="y"
            :color="BAR_COLORS"
            :barPadding="0.15"
            :roundedCorners="2"
          />
          <VisAxis
            type="x"
            :gridLine="false"
          />
          <VisAxis
            type="y"
            :tickFormat="formatCount"
            :gridLine="true"
            :numTicks="4"
          />
          <VisTooltip :auto-placement="true">
            <template #default="{ data }">
              <ChartTooltipContent
                :active="true"
                :payload="[
                  { name: data.departmentName + ' — Total',     value: data.jobCardCount,  color: 'var(--color-blue-500)' },
                  { name: data.departmentName + ' — Completed', value: data.completedCount, color: 'var(--color-emerald-500)' },
                ]"
              />
            </template>
          </VisTooltip>
        </VisXYContainer>
      </ChartContainer>
    </template>
  </div>
</template>
