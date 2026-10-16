import React, { useMemo } from 'react'
import { VisXYContainer, VisLine, VisArea, VisAxis, VisCrosshair, VisTooltip } from '@unovis/react'
import { CurveType } from '@unovis/ts'
import { ChartContainer } from '@/components/ui/chart'
import type { DailyExpenseTotal } from '@/lib/types-analytics'

interface ExpenseTrendChartProps {
  trend: DailyExpenseTotal[]
  periodDays: number
}

function parseDateKey(dateStr: string): number {
  const [y, m, d] = dateStr.split('-')
  return new Date(Number(y), Number(m) - 1, Number(d)).getTime()
}

export default function ExpenseTrendChart({ trend, periodDays }: ExpenseTrendChartProps) {
  const chartData = useMemo(() =>
    trend.map(d => ({
      x: parseDateKey(d.date),
      y: d.total,
    })),
    [trend]
  )

  const hasData = useMemo(() =>
    chartData.length >= 2 && chartData.some(d => d.y > 0),
    [chartData]
  )

  const x = (d: { x: number; y: number }) => d.x
  const y = (d: { x: number; y: number }) => d.y

  const config = {
    expenses: { label: 'Daily Expenses', color: 'var(--brand-secondary, #ff8903)' },
  }

  const formatValue = (v: any) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Number(v))
  }

  function formatAxisDate(v: any) {
    return new Date(v).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  }

  return (
    <div className="w-full h-full min-h-[220px]">
      {!hasData ? (
        <div className="h-[220px] flex items-center justify-center text-muted-foreground italic text-sm">
          No expense data for this period
        </div>
      ) : (
        <ChartContainer config={config} className="h-[220px] w-full" cursor={true}>
          <VisXYContainer data={chartData} margin={{ top: 8, right: 8, bottom: 24, left: 10 }}>
            {/* Area fill under the line */}
            <VisArea
              x={x}
              y={y}
              color="var(--brand-secondary, #ff8903)"
              opacity={0.2}
              curveType={CurveType.MonotoneX}
            />
            {/* Main line */}
            <VisLine
              x={x}
              y={y}
              color="var(--brand-secondary, #ff8903)"
              lineWidth={3.5}
              curveType={CurveType.MonotoneX}
            />
            {/* Axes */}
            <VisAxis type="x" tickFormat={formatAxisDate} gridLine={false} numTicks={periodDays > 30 ? 6 : 8} />
            <VisAxis type="y" tickFormat={formatValue} gridLine={true} numTicks={4} />
            {/* Crosshair + Tooltip */}
            <VisCrosshair template={(d: any) => {
              return `<div style="background-color: var(--color-background, #fff); border: 1px solid var(--color-border, #e5e7eb); border-radius: 8px; padding: 8px 12px; font-size: 11px; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1); min-width: 140px; color: var(--color-foreground, #000);">
                <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px;">
                  <div style="display: flex; align-items: center; gap: 6px;">
                    <div style="height: 8px; width: 8px; border-radius: 1px; background-color: var(--brand-secondary, #ff8903);"></div>
                    <span style="color: var(--color-muted-foreground, #4b5563); font-size: 11px;">Expenses</span>
                  </div>
                  <span style="font-weight: 500; font-family: monospace;">${formatValue(d.y)}</span>
                </div>
              </div>`
            }} />
            <VisTooltip />
          </VisXYContainer>
        </ChartContainer>
      )}
    </div>
  )
}
