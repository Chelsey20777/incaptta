<script setup lang="ts">
/**
 * JobCardStatusChart
 *
 * Horizontal percentage-bar breakdown of job card statuses.
 * No @unovis dependency — status distributions are more readable as labelled
 * bars than as a small pie/donut when there are 7+ status values.
 *
 * Data: AnalyticsPayload.jobCards.byStatus (sorted descending by count).
 */
import { computed } from 'vue'
import type { JobCardStatusCount } from '../types/analytics'

const props = defineProps<{
  byStatus: JobCardStatusCount[]
  total: number
}>()

// ── Status display metadata ──────────────────────────────────────────────────
// Colors and labels for each known status.
// Unknown statuses (future schema additions) fall back to a neutral style.
const STATUS_META: Record<string, { label: string; colorClass: string; bgClass: string }> = {
  COMPLETED:                      { label: 'Completed',             colorClass: 'text-emerald-600 dark:text-emerald-400', bgClass: 'bg-emerald-500' },
  APPROVED_MANAGER:               { label: 'Approved (Manager)',     colorClass: 'text-green-600 dark:text-green-400',    bgClass: 'bg-green-500' },
  APPROVAL_PENDING_MANAGER:       { label: 'Pending Manager',        colorClass: 'text-amber-600 dark:text-amber-400',    bgClass: 'bg-amber-500' },
  APPROVAL_PENDING_ACCOUNTANT:    { label: 'Pending Accountant',     colorClass: 'text-blue-600 dark:text-blue-400',      bgClass: 'bg-blue-500' },
  APPROVED_ACCOUNTANT:            { label: 'Approved (Accountant)',  colorClass: 'text-sky-600 dark:text-sky-400',        bgClass: 'bg-sky-500' },
  SUBMITTED:                      { label: 'Submitted',              colorClass: 'text-violet-600 dark:text-violet-400',  bgClass: 'bg-violet-500' },
  DRAFT:                          { label: 'Draft',                  colorClass: 'text-muted-foreground',                 bgClass: 'bg-muted-foreground/40' },
  REJECTED:                       { label: 'Rejected',               colorClass: 'text-red-600 dark:text-red-400',        bgClass: 'bg-red-500' },
}

function getMeta(status: string) {
  return STATUS_META[status] ?? {
    label: status.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase()),
    colorClass: 'text-muted-foreground',
    bgClass: 'bg-muted-foreground/40',
  }
}

// Sort: terminal states last, active first; within group preserve count order
const DISPLAY_ORDER = [
  'APPROVAL_PENDING_MANAGER',
  'APPROVAL_PENDING_ACCOUNTANT',
  'SUBMITTED',
  'APPROVED_ACCOUNTANT',
  'APPROVED_MANAGER',
  'DRAFT',
  'COMPLETED',
  'REJECTED',
]

const sortedStatuses = computed(() => {
  const known = new Map(DISPLAY_ORDER.map((s, i) => [s, i]))
  return [...props.byStatus].sort((a, b) => {
    const ai = known.get(a.status) ?? 99
    const bi = known.get(b.status) ?? 99
    return ai - bi
  })
})

function pct(count: number): number {
  if (props.total === 0) return 0
  return Math.round((count / props.total) * 100)
}
</script>

<template>
  <div class="space-y-3">
    <p v-if="total === 0" class="text-sm text-muted-foreground italic text-center py-8">
      No job cards found
    </p>
    <template v-else>
      <div
        v-for="item in sortedStatuses"
        :key="item.status"
        class="space-y-1"
      >
        <!-- Label + count row -->
        <div class="flex items-center justify-between gap-2">
          <span
            class="text-[11px] font-semibold uppercase tracking-wide truncate max-w-[70%]"
            :class="getMeta(item.status).colorClass"
          >
            {{ getMeta(item.status).label }}
          </span>
          <div class="flex items-center gap-1.5 shrink-0">
            <span class="text-xs font-bold tabular-nums">{{ item.count }}</span>
            <span class="text-[10px] text-muted-foreground tabular-nums">({{ pct(item.count) }}%)</span>
          </div>
        </div>
        <!-- Bar -->
        <div class="h-1.5 w-full rounded-full bg-muted/50 overflow-hidden">
          <div
            class="h-full rounded-full transition-all duration-500"
            :class="getMeta(item.status).bgClass"
            :style="{ width: `${pct(item.count)}%` }"
          />
        </div>
      </div>

      <!-- Total footnote -->
      <p class="text-[10px] text-muted-foreground pt-1 border-t">
        {{ total }} job cards total
      </p>
    </template>
  </div>
</template>
