import React, { useMemo } from 'react'
import { VisXYContainer, VisGroupedBar, VisAxis, VisTooltip } from '@unovis/react'
import { GroupedBar } from '@unovis/ts'
import { ChartContainer } from '@/components/ui/chart'
import type { DepartmentMetric } from '@/lib/types-analytics'

interface DepartmentPerformanceChartProps {
  metrics: DepartmentMetric[]
}

const DEPT_NAME_MAX = 14
const MAX_BARS      = 10

export default function DepartmentPerformanceChart({ metrics }: DepartmentPerformanceChartProps) {
  const chartData = useMemo(() =>
    metrics
      .filter(d => d.jobCardCount > 0)
      .slice(0, MAX_BARS)
      .map(d => ({
        ...d,
        _label: d.departmentName.length > DEPT_NAME_MAX
          ? d.departmentName.slice(0, DEPT_NAME_MAX) + '…'
          : d.departmentName,
      })),
    [metrics]
  )

  const hasData = useMemo(() => chartData.length > 0, [chartData])

  const x = (d: DepartmentMetric & { _label?: string }) => d._label ?? d.departmentName
  const y = [
    (d: DepartmentMetric) => d.jobCardCount,
    (d: DepartmentMetric) => d.completedCount,
  ]

  const BAR_COLORS = ['var(--color-blue-500)', 'var(--color-emerald-500)']

  const config = {
    total:     { label: 'Total Cards',     color: 'var(--color-blue-500)' },
    completed: { label: 'Completed Cards', color: 'var(--color-emerald-500)' },
  }

  const triggers = useMemo(() => ({
    [GroupedBar.selectors.bar]: (d: DepartmentMetric) => {
      return `<div style="background-color: var(--color-background, #fff); border: 1px solid var(--color-border, #e5e7eb); border-radius: 8px; padding: 8px 12px; font-size: 11px; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1); min-width: 140px;">
        <div style="font-weight: 600; color: var(--color-foreground, #000); margin-bottom: 6px;">${d.departmentName}</div>
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 4px;">
          <div style="display: flex; align-items: center; gap: 6px;">
            <div style="height: 8px; width: 8px; border-radius: 1px; background-color: var(--color-blue-500, #3b82f6);"></div>
            <span style="color: var(--color-muted-foreground, #4b5563); font-size: 11px;">Total Cards</span>
          </div>
          <span style="font-weight: 500; font-family: monospace;">${d.jobCardCount}</span>
        </div>
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px;">
          <div style="display: flex; align-items: center; gap: 6px;">
            <div style="height: 8px; width: 8px; border-radius: 1px; background-color: var(--color-emerald-500, #10b981);"></div>
            <span style="color: var(--color-muted-foreground, #4b5563); font-size: 11px;">Completed</span>
          </div>
          <span style="font-weight: 500; font-family: monospace;">${d.completedCount}</span>
        </div>
      </div>`
    }
  }), [])

  function formatCount(v: any) {
    return String(Math.round(Number(v)))
  }

  return (
    <div className="w-full min-h-[200px]">
      {!hasData ? (
        <p className="h-[200px] flex items-center justify-center text-muted-foreground italic text-sm">
          No departments with job cards found
        </p>
      ) : (
        <>
          {/* Legend */}
          <div className="flex items-center gap-4 mb-4">
            <div className="flex items-center gap-1.5">
              <div className="size-2.5 rounded-sm bg-blue-500" />
              <span className="text-[11px] text-muted-foreground font-medium">Total</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="size-2.5 rounded-sm bg-emerald-500" />
              <span className="text-[11px] text-muted-foreground font-medium">Completed</span>
            </div>
          </div>

          <ChartContainer config={config} className="h-[200px] w-full">
            <VisXYContainer
              data={chartData}
              margin={{ top: 4, right: 8, bottom: 36, left: 10 }}
            >
              <VisGroupedBar
                x={x as any}
                y={y}
                color={BAR_COLORS}
                barPadding={0.15}
                roundedCorners={2}
              />
              <VisAxis type="x" gridLine={false} />
              <VisAxis type="y" tickFormat={formatCount} gridLine={true} numTicks={4} />
              <VisTooltip triggers={triggers} />
            </VisXYContainer>
          </ChartContainer>
        </>
      )}
    </div>
  )
}
