'use client'

import React, { useMemo, useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const

function parsePeriod(value?: string): { year: number; month: number } | null {
  if (!value || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return null
  return { year: Number(value.slice(0, 4)), month: Number(value.slice(5, 7)) }
}

function formatPeriod(year: number, month: number) {
  return `${year}-${String(month).padStart(2, '0')}`
}

function formatLabel(value?: string) {
  const parsed = parsePeriod(value)
  if (!parsed) return 'Select month'
  return new Date(parsed.year, parsed.month - 1, 1).toLocaleString(undefined, {
    month: 'short',
    year: 'numeric',
  })
}

interface EarningMonthPickerProps {
  value?: string
  disabled?: boolean
  onChange: (period: string) => void
  /** Larger trigger for mobile stacked layout */
  size?: 'sm' | 'lg'
  className?: string
  'aria-label'?: string
}

export default function EarningMonthPicker({
  value,
  disabled,
  onChange,
  size = 'sm',
  className,
  'aria-label': ariaLabel = 'Staff rate earning month',
}: EarningMonthPickerProps) {
  const [open, setOpen] = useState(false)
  const selected = useMemo(() => parsePeriod(value), [value])
  const now = new Date()
  const [viewYear, setViewYear] = useState(selected?.year ?? now.getFullYear())

  const handleOpenChange = (next: boolean) => {
    if (disabled) return
    if (next) setViewYear(selected?.year ?? now.getFullYear())
    setOpen(next)
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger
        disabled={disabled}
        render={
          <button
            type="button"
            aria-label={ariaLabel}
            className={cn(
              'inline-flex w-full min-w-0 items-center justify-between gap-1 rounded border border-border/60 bg-background text-left font-medium disabled:opacity-60',
              size === 'sm' ? 'h-8 px-1.5 text-[11px]' : 'h-12 rounded-xl px-3 text-sm font-bold',
              !selected && 'text-muted-foreground',
              className
            )}
          />
        }
      >
        <span className="truncate">{formatLabel(value)}</span>
        <CalendarDays className={cn('shrink-0 opacity-70', size === 'sm' ? 'size-3' : 'size-4')} />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[240px] p-2" sideOffset={4}>
        <div className="flex items-center justify-between gap-1 pb-2">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setViewYear((y) => y - 1)}
            aria-label="Previous year"
          >
            <ChevronLeft className="size-4" />
          </Button>
          <span className="text-sm font-bold tabular-nums">{viewYear}</span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setViewYear((y) => y + 1)}
            aria-label="Next year"
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
        <div className="grid grid-cols-3 gap-1">
          {MONTHS.map((label, idx) => {
            const month = idx + 1
            const isSelected = selected?.year === viewYear && selected?.month === month
            return (
              <Button
                key={label}
                type="button"
                variant={isSelected ? 'default' : 'ghost'}
                size="sm"
                className={cn(
                  'h-8 text-xs font-bold',
                  isSelected && 'bg-emerald-600 text-white hover:bg-emerald-600'
                )}
                onClick={() => {
                  onChange(formatPeriod(viewYear, month))
                  setOpen(false)
                }}
              >
                {label}
              </Button>
            )
          })}
        </div>
      </PopoverContent>
    </Popover>
  )
}
