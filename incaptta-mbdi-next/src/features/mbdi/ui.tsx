'use client'

import { cn } from '@/lib/utils'
import {
  MBDI_STATUS_LABELS,
  MBDI_STATUS_META,
  MBDI_TIERS,
  MBDI_TASK_STATUS_LABELS,
  MBDI_TASK_STATUS_META,
  type MbdiStatus,
  type MbdiTier,
  type MbdiTaskStatus,
} from './types'

export function MbdiStatusPill({ status, className }: { status: MbdiStatus; className?: string }) {
  const m = MBDI_STATUS_META[status]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap',
        m.pill,
        className
      )}
    >
      <span className={cn('size-1.5 rounded-full', m.dot)} />
      {MBDI_STATUS_LABELS[status]}
    </span>
  )
}

export function MbdiTierPill({ tier, amount, className }: { tier: MbdiTier; amount?: number; className?: string }) {
  const t = MBDI_TIERS[tier]
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap',
        t.badgeClass,
        className
      )}
    >
      {t.label}
      {typeof amount === 'number' && (
        <span className="ml-1 opacity-80">
          · US${amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}
        </span>
      )}
    </span>
  )
}

export function MbdiTaskStatusPill({ status }: { status: MbdiTaskStatus }) {
  const m = MBDI_TASK_STATUS_META[status]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap',
        m.pill
      )}
    >
      <span className={cn('size-1.5 rounded-full', m.dot)} />
      {MBDI_TASK_STATUS_LABELS[status]}
    </span>
  )
}

export function ProgressBar({
  value,
  className,
  barClassName,
}: {
  value: number
  className?: string
  barClassName?: string
}) {
  const pct = Math.max(0, Math.min(100, value))
  return (
    <div className={cn('h-2 w-full rounded-full bg-muted overflow-hidden', className)}>
      <div
        className={cn(
          'h-full rounded-full transition-all',
          pct >= 100
            ? 'bg-emerald-500'
            : pct >= 50
              ? 'bg-teal-500'
              : pct > 0
                ? 'bg-orange-500'
                : 'bg-slate-400',
          barClassName
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}
