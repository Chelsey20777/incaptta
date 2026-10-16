'use client'

import React from 'react'
import { cn } from '@/lib/utils'

export type ChartConfig = Record<
  string,
  {
    label?: React.ReactNode
    icon?: React.ComponentType
    color?: string
  }
>

interface ChartContainerProps extends React.ComponentProps<'div'> {
  config: ChartConfig
  cursor?: boolean
}

export const ChartContainer = React.forwardRef<HTMLDivElement, ChartContainerProps>(
  ({ className, config, cursor = true, style, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        data-slot="chart"
        className={cn(
          "flex flex-col justify-center text-xs w-full h-full",
          "[&_.tick_text]:!fill-muted-foreground [&_.tick_line]:!stroke-border/50",
          "[&_[data-vis-xy-container]]:h-full [&_[data-vis-single-container]]:h-full",
          "[&_[data-vis-xy-container]]:w-full [&_[data-vis-single-container]]:w-full",
          className
        )}
        style={{
          '--vis-tooltip-padding': '0px',
          '--vis-tooltip-background-color': 'transparent',
          '--vis-tooltip-border-color': 'transparent',
          '--vis-tooltip-text-color': 'none',
          '--vis-tooltip-shadow-color': 'none',
          '--vis-tooltip-backdrop-filter': 'none',
          '--vis-crosshair-circle-stroke-color': '#0000',
          '--vis-crosshair-line-stroke-width': cursor ? '1px' : '0px',
          '--vis-font-family': 'var(--font-sans)',
          ...style
        } as React.CSSProperties}
        {...props}
      >
        {children}
      </div>
    )
  }
)
ChartContainer.displayName = 'ChartContainer'

interface ChartTooltipContentProps extends React.ComponentProps<'div'> {
  active?: boolean
  payload?: any[]
  hideLabel?: boolean
  indicator?: 'dot' | 'line' | 'dashed'
  formatter?: (value: any) => string
  label?: string
}

export const ChartTooltipContent = React.forwardRef<HTMLDivElement, ChartTooltipContentProps>(
  ({ className, active, payload, hideLabel = false, indicator = 'dot', formatter, label, ...props }, ref) => {
    if (!active || !payload || !payload.length) return null

    return (
      <div
        ref={ref}
        className={cn(
          "border-border/50 bg-background grid min-w-[8rem] items-start gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs shadow-xl",
          className
        )}
        {...props}
      >
        {!hideLabel && label && <div className="font-medium">{label}</div>}
        <div className="grid gap-1.5">
          {payload.map((item, index) => {
            const displayValue = formatter ? formatter(item.value) : item.value?.toLocaleString()
            const indicatorColor = item.color || item.fill

            return (
              <div
                key={index}
                className={cn(
                  "flex w-full items-center gap-2 text-muted-foreground",
                  indicator === 'dot' && "items-center"
                )}
              >
                {indicator === 'dot' && (
                  <div
                    className="h-2.5 w-2.5 shrink-0 rounded-[2px] border-border bg-foreground"
                    style={{ backgroundColor: indicatorColor, borderColor: indicatorColor }}
                  />
                )}
                {indicator === 'line' && (
                  <div
                    className="w-1 shrink-0 rounded-[2px] border-border bg-foreground"
                    style={{ backgroundColor: indicatorColor, borderColor: indicatorColor, height: '100%' }}
                  />
                )}
                <div className="flex flex-1 justify-between items-center leading-none">
                  <span className="text-muted-foreground mr-4">{item.name || item.label || 'Value'}</span>
                  {displayValue && (
                    <span className="text-foreground font-mono font-medium tabular-nums">
                      {displayValue}
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }
)
ChartTooltipContent.displayName = 'ChartTooltipContent'
