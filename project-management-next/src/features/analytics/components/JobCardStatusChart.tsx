import React, { useMemo } from 'react'
import type { JobCardStatusCount } from '@/lib/types-analytics'

interface JobCardStatusChartProps {
  byStatus: JobCardStatusCount[]
  total: number
}

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

export default function JobCardStatusChart({ byStatus, total }: JobCardStatusChartProps) {
  const sortedStatuses = useMemo(() => {
    const known = new Map(DISPLAY_ORDER.map((s, i) => [s, i]))
    return [...byStatus].sort((a, b) => {
      const ai = known.get(a.status) ?? 99
      const bi = known.get(b.status) ?? 99
      return ai - bi
    })
  }, [byStatus])

  function pct(count: number): number {
    if (total === 0) return 0
    return Math.round((count / total) * 100)
  }

  if (total === 0) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground italic text-center py-8">
          No job cards found
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {sortedStatuses.map(item => {
        const meta = getMeta(item.status)
        return (
          <div key={item.status} className="space-y-1">
            <div className="flex items-center justify-between gap-2">
              <span className={`text-[11px] font-semibold uppercase tracking-wide truncate max-w-[70%] ${meta.colorClass}`}>
                {meta.label}
              </span>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-xs font-bold tabular-nums">{item.count}</span>
                <span className="text-[10px] text-muted-foreground tabular-nums">({pct(item.count)}%)</span>
              </div>
            </div>
            <div className="h-1.5 w-full rounded-full bg-muted/50 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${meta.bgClass}`}
                style={{ width: `${pct(item.count)}%` }}
              />
            </div>
          </div>
        )
      })}

      <p className="text-[10px] text-muted-foreground pt-1 border-t">
        {total} job cards total
      </p>
    </div>
  )
}
