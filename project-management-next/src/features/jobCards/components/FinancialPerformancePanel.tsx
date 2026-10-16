import React from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { LineChart, PieChart } from 'lucide-react'
import { formatCurrency } from '@/lib/format'

interface FinancialPerformancePanelProps {
  financials: {
    totalRevenue: number
    totalCost: number
    netProfit: number
    profitMargin: number
    initialInvoiceValue: number
    totalOperationalGross: number
    twidNetAfterAdjustments: number
    twidRevenuePercentage: number
    irdGrossRevenue: number
    irdBaseCost: number
    irdNetRevenue: number
    irdCumulativeNetRevenue: number
    irdRevenuePercentage: number
    totalAdjustments: number
    implementationCost: number
    operationalExpenses: number
    adjustmentAdhoc: number
    returnsProfit: number
    targetJobNet: number
    referrerCommission: number
    staffRatesTotal: number
    adHocTotal: number
    subcontractWorksTotal?: number
    billedLabor?: number
  }
}

export default function FinancialPerformancePanel({ financials }: FinancialPerformancePanelProps) {

  // Chart data calculations
  const cost = financials.totalCost || 0
  const netProfit = financials.netProfit || 0
  const commission = financials.referrerCommission || 0

  // SVG Donut calculation helper
  // Segments: Profit, Cost, Commission
  const total = (netProfit > 0 ? netProfit : 0) + cost + commission
  const segments = [
    { name: 'Net Profit', value: netProfit > 0 ? netProfit : 0, color: '#10b981' },
    { name: 'Direct Cost', value: cost, color: '#f43f5e' },
    { name: 'Commission', value: commission, color: '#3b82f6' },
  ].filter(s => s.value > 0)

  let accumulatedPercent = 0
  const donutData = segments.map(s => {
    const percent = total > 0 ? (s.value / total) * 100 : 0
    const start = accumulatedPercent
    accumulatedPercent += percent
    return { ...s, percent, start }
  })

  const isProfitAbove = netProfit >= financials.targetJobNet
  const profitVariance = netProfit - financials.targetJobNet

  return (
    <Card className="bg-brand-primary/5 border-brand-primary/20 shadow-xl overflow-hidden backdrop-blur-md">
      <CardHeader className="flex flex-row items-center gap-2 py-3 px-4 bg-brand-primary/5 border-b border-brand-primary/10">
        <LineChart className="size-4 text-emerald-500" />
        <CardTitle className="text-sm font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
          Financial Performance
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 space-y-6">
        {/* ── Tier 1 — Top Level KPIs ────────────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Invoice Value */}
          <div className="rounded-xl border border-border/50 bg-card p-4 shadow-sm space-y-1.5 transition-all hover:shadow-md">
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/70">
              Invoice Value
            </p>
            <div className="flex items-baseline gap-2">
              <p className="text-2xl font-black tabular-nums text-foreground">
                {formatCurrency(financials.totalRevenue)}
              </p>
            </div>
            <p className="text-[10px] text-muted-foreground/60 italic leading-tight">
              Agreed value from CRM / Manager
            </p>
          </div>

          {/* Direct Costs */}
          <div className="rounded-xl border border-border/50 bg-card p-4 shadow-sm space-y-1.5 transition-all hover:shadow-md">
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/70">
              Direct Costs
            </p>
            <p className="text-2xl font-black tabular-nums text-rose-500">
              {formatCurrency(financials.totalCost)}
            </p>
            <p className="text-[10px] text-muted-foreground/60 italic leading-tight">
              Materials + Labor + Expenses + Commission
            </p>
          </div>

          {/* Net Profit */}
          <div
            className={`rounded-xl border p-4 shadow-md space-y-1.5 transition-all hover:shadow-lg ${
              netProfit >= 0
                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-900 dark:text-emerald-100'
                : 'bg-rose-500/10 border-rose-500/20 text-rose-900 dark:text-rose-100'
            }`}
          >
            <p className={`text-[10px] font-black uppercase tracking-widest ${netProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600'}`}>
              Net Profit
            </p>
            <p className={`text-2xl font-black tabular-nums ${netProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500'}`}>
              {formatCurrency(netProfit)}
            </p>
            <p className="text-[10px] opacity-70 italic leading-tight">
              The bottom line for this job
            </p>
          </div>

          {/* Profit Margin */}
          <div
            className={`rounded-xl border p-4 shadow-sm space-y-1.5 transition-all ${
              financials.profitMargin >= 20
                ? 'bg-emerald-500/5 border-emerald-500/20'
                : financials.profitMargin > 0
                ? 'bg-amber-500/5 border-amber-500/20'
                : 'bg-rose-500/5 border-rose-500/20'
            }`}
          >
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/70">
              Profit Margin
            </p>
            <p
              className={`text-2xl font-black tabular-nums ${
                financials.profitMargin >= 20
                  ? 'text-emerald-600'
                  : financials.profitMargin > 0
                  ? 'text-amber-600'
                  : 'text-rose-600'
              }`}
            >
              {financials.profitMargin.toFixed(1)}%
            </p>
            <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden mt-1">
              <div
                className={`h-full rounded-full transition-all duration-700 ${
                  financials.profitMargin >= 20
                    ? 'bg-emerald-500'
                    : financials.profitMargin > 0
                    ? 'bg-amber-500'
                    : 'bg-rose-500'
                }`}
                style={{ width: `${Math.max(0, Math.min(100, financials.profitMargin))}%` }}
              />
            </div>
          </div>
        </div>

        {/* ── Tier 2 — Formula Row ───────────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4 shadow-sm space-y-1.5 min-h-[100px] flex flex-col justify-center">
            <p className="text-[10px] font-black uppercase tracking-widest text-emerald-700 dark:text-emerald-400">
              Initial Invoice Value
            </p>
            <p className="text-2xl font-black tabular-nums text-emerald-700 dark:text-emerald-400">
              {formatCurrency(financials.initialInvoiceValue)}
            </p>
          </div>

          <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-4 shadow-sm space-y-1.5 min-h-[100px] flex flex-col justify-center">
            <p className="text-[10px] font-black uppercase tracking-widest text-rose-700 dark:text-rose-400">
              Direct Operational Cost
            </p>
            <p className="text-2xl font-black tabular-nums text-rose-700 dark:text-rose-400">
              {formatCurrency(financials.totalOperationalGross)}
            </p>
            <p className="text-[9px] text-rose-600/60 font-bold">Operational Costs</p>
          </div>

          <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-4 shadow-sm space-y-1.5 min-h-[100px] flex flex-col justify-center">
            <p className="text-[10px] font-black uppercase tracking-widest text-amber-700 dark:text-amber-400">
              T.W.I.D Cumulative Net Amount
            </p>
            <p className="text-2xl font-black tabular-nums text-amber-700 dark:text-amber-400">
              {formatCurrency(financials.twidNetAfterAdjustments)}
            </p>
          </div>

          <div className="rounded-xl border border-border bg-card p-4 shadow-sm space-y-1.5 min-h-[100px] flex flex-col justify-center">
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
              TWID Revenue Percentage
            </p>
            <p className="text-xl font-black tabular-nums text-foreground">
              {financials.twidRevenuePercentage.toFixed(2)}%
            </p>
          </div>
        </div>

        {/* ── Tier 3 — IRD Formula Row ────────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-4 pb-4 border-b border-border/30">
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm space-y-1.5 min-h-[100px] flex flex-col justify-center">
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
              Inventory Gross Value
            </p>
            <p className="text-2xl font-black tabular-nums text-foreground">
              {formatCurrency(financials.irdGrossRevenue)}
            </p>
            <p className="text-[8px] text-muted-foreground/60 font-bold">(PURCHASING + MARKUP)</p>
          </div>

          <div className="rounded-xl border border-border bg-card p-4 shadow-sm space-y-1.5 min-h-[100px] flex flex-col justify-center">
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
              I.R.D Inventory Purchasing Price
            </p>
            <p className="text-2xl font-black tabular-nums text-foreground">
              {formatCurrency(financials.irdBaseCost)}
            </p>
            <p className="text-[8px] text-muted-foreground/60 font-bold">(CUMULATIVE)</p>
          </div>

          <div className="rounded-xl border border-border bg-card p-4 shadow-sm space-y-1.5 min-h-[100px] flex flex-col justify-center">
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
              I.R.D Cumulative Net Revenue
            </p>
            <p className="text-2xl font-black tabular-nums text-foreground">
              {formatCurrency(financials.irdCumulativeNetRevenue)}
            </p>
          </div>

          <div className="rounded-xl border border-border bg-card p-4 shadow-sm space-y-1.5 min-h-[100px] flex flex-col justify-center">
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
              I.R.D Revenue Percentage
            </p>
            <p className="text-xl font-black tabular-nums text-foreground">
              {financials.irdRevenuePercentage.toFixed(1)}%
            </p>
          </div>
        </div>

        {/* ── Financial Breakdown Visualization ───────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pt-4">
          {/* Chart Column */}
          <div className="lg:col-span-4 flex flex-col items-center justify-center p-6 bg-muted/10 rounded-2xl border border-border/50">
            <div className="w-full flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <PieChart className="size-4 text-emerald-500" />
                <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                  Revenue Allocation
                </span>
              </div>
              <Badge variant="outline" className="text-[9px] font-bold">
                100% OF INVOICE
              </Badge>
            </div>

            {/* Custom SVG Donut Chart */}
            <div className="relative w-full aspect-square max-w-[200px] flex items-center justify-center">
              <svg viewBox="-1 -1 2 2" className="w-full h-full -rotate-90">
                {total === 0 ? (
                  <circle r="0.8" fill="none" stroke="var(--muted)" strokeWidth="0.35" />
                ) : (
                  donutData.map((seg, i) => {
                    const strokeDash = `${seg.percent} 100`
                    const strokeOffset = -seg.start

                    return (
                      <circle
                        key={i}
                        cx="0"
                        cy="0"
                        r="0.75"
                        fill="none"
                        stroke={seg.color}
                        strokeWidth="0.32"
                        strokeDasharray={strokeDash}
                        strokeDashoffset={strokeOffset}
                        className="transition-all duration-500 hover:stroke-[0.38] cursor-pointer"
                        pathLength="100"
                      />
                    )
                  })
                )}
              </svg>

              {/* Center Overlay */}
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center animate-fade-in">
                <span className="text-[9px] font-bold text-muted-foreground/60 uppercase tracking-wider">
                  Total Invoice
                </span>
                <span className="text-base font-black tabular-nums text-foreground">
                  {formatCurrency(financials.initialInvoiceValue)}
                </span>
              </div>
            </div>

            {/* Legend */}
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 mt-6 w-full">
              {segments.map(item => (
                <div key={item.name} className="flex items-center gap-2">
                  <div className="size-2 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                  <div className="flex flex-col">
                    <span className="text-[9px] font-bold text-muted-foreground uppercase leading-none">
                      {item.name}
                    </span>
                    <span className="text-[10px] font-black tabular-nums leading-tight mt-0.5">
                      {formatCurrency(item.value)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Metrics Column (Detailed Breakdown) */}
          <div className="lg:col-span-8 grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Revenue Breakdown */}
            <div className="space-y-3">
              <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/50 border-b pb-1">
                Revenue Breakdown
              </h4>
              <div className="space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-muted-foreground">Inventory Sales</span>
                  <span className="font-bold tabular-nums">{formatCurrency(financials.irdGrossRevenue)}</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-muted-foreground">Labor & Expenses Billed</span>
                  <span className="font-bold tabular-nums">{formatCurrency(financials.billedLabor ?? financials.implementationCost)}</span>
                </div>
                {financials.totalAdjustments > 0 && (
                  <div className="flex justify-between items-center text-xs pt-1 border-t border-dashed">
                    <span className="text-amber-600 font-medium">Adjustments (Reductions)</span>
                    <span className="font-bold tabular-nums text-amber-600">
                      -{formatCurrency(financials.totalAdjustments)}
                    </span>
                  </div>
                )}

                <div className="mt-4 p-3 rounded-lg border border-brand-primary/20 bg-brand-primary/5 space-y-2">
                  <div className="flex justify-between items-center">
                    <p className="text-[9px] font-black uppercase tracking-widest text-brand-primary">
                      IRD Remittance
                    </p>
                    <span className="text-xs font-black text-brand-primary">
                      {formatCurrency(financials.irdNetRevenue)}
                    </span>
                  </div>
                  <p className="text-[8px] text-muted-foreground leading-tight italic">
                    Revenue due to IRD account for materials.
                  </p>
                </div>
              </div>
            </div>

            {/* Cost Breakdown */}
            <div className="space-y-3">
              <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/50 border-b pb-1">
                Cost Breakdown
              </h4>
              <div className="space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-muted-foreground">Inventory Base Cost</span>
                  <span className="font-bold tabular-nums">{formatCurrency(financials.irdBaseCost)}</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-muted-foreground">Staff & Labor Costs</span>
                  <span className="font-bold tabular-nums">{formatCurrency(financials.staffRatesTotal)}</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-muted-foreground">Ad-hoc Expenses</span>
                  <span className="font-bold tabular-nums">{formatCurrency(financials.adHocTotal)}</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-muted-foreground">Subcontract Works</span>
                  <span className="font-bold tabular-nums">{formatCurrency(financials.subcontractWorksTotal || 0)}</span>
                </div>
                {financials.returnsProfit > 0 && (
                  <div className="flex justify-between items-center text-xs pt-1 border-t border-dashed">
                    <span className="text-emerald-600 font-medium">Returns (Cost Recovery)</span>
                    <span className="font-bold tabular-nums text-emerald-600">
                      -{formatCurrency(financials.returnsProfit)}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Performance Benchmarks */}
            <div className="space-y-3">
              <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/50 border-b pb-1">
                Performance Benchmarks
              </h4>
              <div className="space-y-2.5">
                <div className="p-2.5 rounded-lg bg-muted/20 border border-border/50">
                  <p className="text-[9px] font-black uppercase text-muted-foreground/70">
                    Original Profit Target
                  </p>
                  <p className="text-sm font-black tabular-nums text-foreground/80 mt-0.5">
                    {formatCurrency(financials.targetJobNet)}
                  </p>
                  <p className="text-[8px] text-muted-foreground/60 italic">Expected margin at creation</p>
                </div>

                <div
                  className={`p-2.5 rounded-lg border border-border/50 ${
                    isProfitAbove ? 'bg-emerald-500/5' : 'bg-orange-500/5'
                  }`}
                >
                  <div className="flex justify-between items-center">
                    <p className="text-[9px] font-black uppercase text-muted-foreground/70">
                      Profit Variance
                    </p>
                    <Badge variant={isProfitAbove ? 'default' : 'secondary'} className="text-[8px] h-4">
                      {isProfitAbove ? 'ABOVE TARGET' : 'BELOW TARGET'}
                    </Badge>
                  </div>
                  <p
                    className={`text-sm font-black tabular-nums mt-1 ${
                      isProfitAbove ? 'text-emerald-600' : 'text-orange-600'
                    }`}
                  >
                    {isProfitAbove ? '+' : ''}
                    {formatCurrency(profitVariance)}
                  </p>
                  <p className="text-[8px] text-muted-foreground/60 italic">Actual vs Original Target</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
