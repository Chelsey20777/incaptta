'use client'

import React, { useEffect, useState, useMemo } from 'react'
import { useReportStore, type MonthlyMetric } from '@/stores/report-store'
import { accrualPayrollEnabled } from '@/lib/payroll/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { FileText, PieChart, TrendingUp, DollarSign, Download, Building2, Scale, BarChart3, Calendar, TrendingDown, Minus } from 'lucide-react'

const formatCurrency = (val: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val)

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December']
const SHORT_MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']


export type Granularity = 'monthly' | 'quarterly' | 'annual'

// --- Inline FinancialMetricsTable ---
function MetricsTable({ data, granularity }: { data: MonthlyMetric[]; granularity: Granularity }) {
  const aggregated = useMemo(() => {
    if (granularity === 'monthly') {
      return data.map((d) => ({ ...d, label: `${MONTH_NAMES[d.month]} ${d.year}` }))
    }
    if (granularity === 'quarterly') {
      const quarters = [{ label: 'Q1', months: [0,1,2] },{ label: 'Q2', months: [3,4,5] },{ label: 'Q3', months: [6,7,8] },{ label: 'Q4', months: [9,10,11] }]
      return quarters.map((q) => {
        const qd = data.filter((d) => q.months.includes(d.month))
        return { label: `${q.label} ${data[0]?.year || ''}`, sales: qd.reduce((s,d)=>s+d.sales,0), opex: qd.reduce((s,d)=>s+d.opex,0), jobcardAdhoc: qd.reduce((s,d)=>s+d.jobcardAdhoc,0), staffRates: qd.reduce((s,d)=>s+d.staffRates,0), salaries: qd.reduce((s,d)=>s+d.salaries,0) }
      })
    }
    return [{ label: `${data[0]?.year || ''}`, sales: data.reduce((s,d)=>s+d.sales,0), opex: data.reduce((s,d)=>s+d.opex,0), jobcardAdhoc: data.reduce((s,d)=>s+d.jobcardAdhoc,0), staffRates: data.reduce((s,d)=>s+d.staffRates,0), salaries: data.reduce((s,d)=>s+d.salaries,0) }]
  }, [data, granularity])

  const calcNet = (row: any) => row.sales - (row.opex + row.jobcardAdhoc + row.staffRates + row.salaries)

  return (
    <div className="rounded-xl border bg-card overflow-x-auto scrollbar-thin shadow-sm">
      <Table>
        <TableHeader className="bg-muted/50">
          <TableRow>
            <TableHead className="w-[200px] font-bold uppercase tracking-wider text-[10px]">Period</TableHead>
            <TableHead className="text-right font-bold uppercase tracking-wider text-[10px]">Sales</TableHead>
            <TableHead className="text-right font-bold uppercase tracking-wider text-[10px]">Op Expenses</TableHead>
            <TableHead className="text-right font-bold uppercase tracking-wider text-[10px]">Ad-hoc Exp</TableHead>
            <TableHead className="text-right font-bold uppercase tracking-wider text-[10px]">Staff Rates</TableHead>
            <TableHead className="text-right font-bold uppercase tracking-wider text-[10px]">Salaries</TableHead>
            <TableHead className="text-right font-bold uppercase tracking-wider text-[10px]">Net Contribution</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {aggregated.map((row: any) => {
            const net = calcNet(row)
            return (
              <TableRow key={row.label} className="hover:bg-muted/30 transition-colors">
                <TableCell className="font-bold text-sm">{row.label}</TableCell>
                <TableCell className="text-right tabular-nums font-medium">{formatCurrency(row.sales)}</TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">{formatCurrency(row.opex)}</TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">{formatCurrency(row.jobcardAdhoc)}</TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">{formatCurrency(row.staffRates)}</TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">{formatCurrency(row.salaries)}</TableCell>
                <TableCell className="text-right tabular-nums">
                  <div className="flex items-center justify-end gap-2">
                    <span className={net >= 0 ? 'text-emerald-600 font-black' : 'text-red-500 font-black'}>{formatCurrency(net)}</span>
                    {net > 0 ? <TrendingUp className="size-3 text-emerald-500" /> : net < 0 ? <TrendingDown className="size-3 text-red-500" /> : <Minus className="size-3 text-muted-foreground" />}
                  </div>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}

// --- Inline FinancialMetricsChart ---
function MetricsChart({ data, granularity }: { data: MonthlyMetric[]; granularity: Granularity }) {
  const chartData = useMemo(() => {
    if (granularity === 'monthly') {
      return data.map((d) => ({ label: SHORT_MONTHS[d.month], sales: d.sales, expenses: d.opex + d.jobcardAdhoc + d.salaries }))
    }
    if (granularity === 'quarterly') {
      const qs = [{l:'Q1',m:[0,1,2]},{l:'Q2',m:[3,4,5]},{l:'Q3',m:[6,7,8]},{l:'Q4',m:[9,10,11]}]
      return qs.map((q) => {
        const qd = data.filter((d) => q.m.includes(d.month))
        return { label: q.l, sales: qd.reduce((s,d)=>s+d.sales,0), expenses: qd.reduce((s,d)=>s+d.opex+d.jobcardAdhoc+d.salaries,0) }
      })
    }
    return [{ label: `${data[0]?.year || ''}`, sales: data.reduce((s,d)=>s+d.sales,0), expenses: data.reduce((s,d)=>s+d.opex+d.jobcardAdhoc+d.salaries,0) }]
  }, [data, granularity])

  const maxVal = Math.max(...chartData.map((d) => Math.max(d.sales, d.expenses)), 1)

  return (
    <div className="w-full h-[300px] flex items-end gap-2 px-2">
      {chartData.map((d, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
          <div className="w-full flex flex-col items-center gap-0.5">
            <div className="w-full bg-brand-primary/80 rounded-t-sm" style={{ height: `${(d.sales/maxVal)*200}px`, minHeight: d.sales>0?2:0 }} />
            <div className="w-full bg-brand-secondary/80 rounded-t-sm" style={{ height: `${(d.expenses/maxVal)*200}px`, minHeight: d.expenses>0?2:0 }} />
          </div>
          <span className="text-[10px] text-muted-foreground font-medium">{d.label}</span>
        </div>
      ))}
    </div>
  )
}


export default function FinancialReportsPage() {
  const store = useReportStore()
  const { plData, balanceSheetData, financialMetrics, loading } = store
  const [granularity, setGranularity] = useState<Granularity>('monthly')
  const [selectedYear, setSelectedYear] = useState(2026)
  const [activeTab, setActiveTab] = useState('p-and-l')

  useEffect(() => {
    store.generatePandL(selectedYear)
    store.generateBalanceSheet()
    store.generateFinancialMetrics(selectedYear)
  }, [selectedYear])

  const handleYearChange = (val: number) => {
    setSelectedYear(val)
  }

  return (
    <div className="p-6 space-y-6 animate-in fade-in duration-700">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-foreground flex items-center gap-2">
            <FileText className="size-8 text-brand-primary" /> Financial Statements (USD)
          </h1>
          <p className="text-muted-foreground">Comprehensive P&amp;L and Balance Sheet reporting.</p>
        </div>
        <Button variant="outline" className="gap-2"><Download className="size-4" /> Export All</Button>
      </div>

      {store.payrollWarnings.map(w => <p role="status" key={w} className="rounded border border-amber-500/40 p-3 text-sm">{w}</p>)}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <div className="w-full overflow-x-auto scrollbar-hide py-1">
          <TabsList className="flex justify-start gap-1 p-1 min-w-max bg-muted/50">
            <TabsTrigger value="p-and-l" className="gap-2 shrink-0 flex-none"><PieChart className="size-4" /> Profit &amp; Loss</TabsTrigger>
            <TabsTrigger value="balance-sheet" className="gap-2 shrink-0 flex-none"><Scale className="size-4" /> Balance Sheet</TabsTrigger>
            <TabsTrigger value="metrics" className="gap-2 shrink-0 flex-none"><BarChart3 className="size-4" /> Financial Metrics</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="p-and-l">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="lg:col-span-2 shadow-xl border-brand-primary/10">
              <CardHeader className="border-b bg-muted/20">
                <CardTitle className="text-sm font-bold uppercase tracking-widest">Statement of Comprehensive Income</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y">
                  <div className="p-6 flex justify-between items-center group hover:bg-muted/10 transition-colors">
                    <div className="space-y-1"><p className="text-sm font-bold">Total Revenue</p><p className="text-[10px] text-muted-foreground">Job Payments &amp; Poultry Sales</p></div>
                    <span className="text-2xl font-black tabular-nums text-brand-primary">{formatCurrency(plData.revenue)}</span>
                  </div>
                  <div className="p-6 flex justify-between items-center group hover:bg-muted/10 transition-colors">
                    <div className="space-y-1"><p className="text-sm font-bold">Cost of Goods Sold</p><p className="text-[10px] text-muted-foreground">Materials, feeds, direct job costs</p></div>
                    <span className="text-2xl font-black tabular-nums text-red-500">({formatCurrency(plData.cogs)})</span>
                  </div>
                  <div className="p-6 flex justify-between items-center bg-brand-primary/5 border-l-4 border-l-brand-primary">
                    <div className="space-y-1"><p className="text-lg font-black uppercase tracking-tight">Gross Profit</p><p className="text-[10px] text-muted-foreground">Revenue less direct costs</p></div>
                    <span className="text-3xl font-black tabular-nums text-brand-primary">{formatCurrency(plData.grossProfit)}</span>
                  </div>
                  <div className="p-6 flex justify-between items-center group hover:bg-muted/10 transition-colors">
                    <div className="space-y-1"><p className="text-sm font-bold">Operating Expenses</p><p className="text-[10px] text-muted-foreground">Salaries, admin, utilities, etc.</p></div>
                    <span className="text-2xl font-black tabular-nums text-orange-500">({formatCurrency(plData.operatingExpenses)})</span>
                  </div>
                  <div className="p-6 flex justify-between items-center bg-brand-secondary/5 border-b-4 border-b-brand-secondary">
                    <div className="space-y-1"><p className="text-lg font-black uppercase tracking-tight">Net Profit / (Loss)</p><p className="text-[10px] text-muted-foreground">Bottom-line for the period</p></div>
                    <span className={`text-3xl font-black tabular-nums ${plData.netProfit >= 0 ? 'text-brand-secondary' : 'text-red-500'}`}>{formatCurrency(plData.netProfit)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="space-y-6">
              <Card className="bg-gradient-to-br from-brand-primary/10 to-brand-secondary/10 shadow-lg border-brand-primary/20">
                <CardHeader className="pb-2"><CardTitle className="text-xs font-bold uppercase tracking-widest">Fiscal Year</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <Select value={String(selectedYear)} onValueChange={(v) => handleYearChange(Number(v))}>
                    <SelectTrigger className="w-full"><Calendar className="mr-2 size-4 opacity-50" /><SelectValue placeholder="Year" /></SelectTrigger>
                    <SelectContent>{[2024,2025,2026,2027].map((y)=>(<SelectItem key={y} value={String(y)}>{y}</SelectItem>))}</SelectContent>
                  </Select>
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs"><span className="text-muted-foreground">Revenue</span><span className="font-bold">{formatCurrency(plData.revenue)}</span></div>
                    <div className="flex justify-between text-xs"><span className="text-muted-foreground">COGS</span><span className="font-bold text-red-500">{formatCurrency(plData.cogs)}</span></div>
                    <div className="flex justify-between text-xs"><span className="text-muted-foreground">Opex</span><span className="font-bold">{formatCurrency(plData.operatingExpenses)}</span></div>
                    <hr className="border-muted" />
                    <div className="flex justify-between text-sm font-black"><span>Net Profit</span><span className={plData.netProfit>=0?'text-emerald-600':'text-red-500'}>{formatCurrency(plData.netProfit)}</span></div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-muted/20 border-dashed">
                <CardContent className="p-4 flex items-start gap-3">
                  <div className="p-2 bg-brand-primary/10 rounded-full shrink-0"><DollarSign className="size-4 text-brand-primary" /></div>
                  <p className="text-[10px] text-muted-foreground italic leading-relaxed">Revenue includes job card payments and poultry sales (chicks, eggs, full-grown birds). COGS captures direct material costs.</p>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>


        <TabsContent value="balance-sheet">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="shadow-xl border-brand-primary/10">
              <CardHeader className="border-b bg-blue-500/10">
                <CardTitle className="text-sm font-bold uppercase tracking-widest flex items-center gap-2"><Building2 className="size-4 text-blue-500" />Assets</CardTitle>
              </CardHeader>
              <CardContent className="p-6 space-y-4">
                <div className="flex justify-between items-center p-4 bg-muted/20 rounded-xl">
                  <div className="space-y-1"><p className="text-sm font-bold">Cash &amp; Bank</p><p className="text-[10px] text-muted-foreground">Liquid assets</p></div>
                  <span className="text-xl font-black tabular-nums">{formatCurrency(balanceSheetData.assets.cashAndBank)}</span>
                </div>
                <div className="flex justify-between items-center p-4 bg-muted/20 rounded-xl">
                  <div className="space-y-1"><p className="text-sm font-bold">Inventory</p><p className="text-[10px] text-muted-foreground">Stock on hand at cost</p></div>
                  <span className="text-xl font-black tabular-nums">{formatCurrency(balanceSheetData.assets.inventory)}</span>
                </div>
                <div className="flex justify-between items-center p-4 bg-muted/20 rounded-xl">
                  <div className="space-y-1"><p className="text-sm font-bold">Employee Advances</p><p className="text-[10px] text-muted-foreground">Outstanding salary-advance receivables</p></div>
                  <span className="text-xl font-black tabular-nums">{formatCurrency(balanceSheetData.assets.employeeAdvances)}</span>
                </div>
                <div className="flex justify-between items-center p-4 bg-blue-500/10 rounded-xl border border-blue-500/20">
                  <span className="text-sm font-black uppercase tracking-tight">Total Assets</span>
                  <span className="text-2xl font-black tabular-nums">{formatCurrency(balanceSheetData.assets.totalAssets)}</span>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-xl border-brand-primary/10">
              <CardHeader className="border-b bg-orange-500/10">
                <CardTitle className="text-sm font-bold uppercase tracking-widest flex items-center gap-2"><Scale className="size-4 text-orange-500" />Liabilities &amp; Equity</CardTitle>
              </CardHeader>
              <CardContent className="p-6 space-y-4">
                <div className="p-4 bg-muted/20 rounded-xl space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-bold">Statutory Payables</span>
                    <span className="font-black tabular-nums">{formatCurrency(balanceSheetData.liabilities.statutoryPayables)}</span>
                  </div>
                  {accrualPayrollEnabled && <div className="flex justify-between"><span>Salaries payable</span><span className="font-black tabular-nums">{formatCurrency(balanceSheetData.liabilities.salariesPayable)}</span></div>}
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-bold">Owner/Director Loans</span>
                    <span className="font-black tabular-nums">{formatCurrency(balanceSheetData.liabilities.businessLoans)}</span>
                  </div>
                  <div className="flex justify-between items-center pt-3 border-t border-muted/50">
                    <span className="text-sm font-black uppercase tracking-tight">Total Liabilities</span>
                    <span className="text-lg font-black tabular-nums text-orange-600">{formatCurrency(balanceSheetData.liabilities.totalLiabilities)}</span>
                  </div>
                </div>
                <div className="p-4 bg-emerald-500/10 rounded-xl border border-emerald-500/20">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-black italic">Owner&apos;s Equity / Retained Earnings</span>
                    <span className="font-black tabular-nums text-brand-primary">{formatCurrency(balanceSheetData.equity)}</span>
                  </div>
                </div>
                <div className="pt-4 flex justify-between items-center">
                  <span className="text-lg font-black uppercase tracking-tight">Total Liabilities &amp; Equity</span>
                  <span className="text-2xl font-black tabular-nums border-b-4 border-muted">{formatCurrency(balanceSheetData.liabilities.totalLiabilities + balanceSheetData.equity)}</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>


        <TabsContent value="metrics" className="space-y-6">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div className="flex items-center gap-4">
              <Select value={granularity} onValueChange={(v) => setGranularity(v as Granularity)}>
                <SelectTrigger className="w-[180px]"><Calendar className="mr-2 size-4 opacity-50" /><SelectValue placeholder="Granularity" /></SelectTrigger>
                <SelectContent><SelectItem value="monthly">Monthly View</SelectItem><SelectItem value="quarterly">Quarterly View</SelectItem><SelectItem value="yearly">Yearly View</SelectItem></SelectContent>
              </Select>
              <Select value={String(selectedYear)} onValueChange={(v) => handleYearChange(Number(v))}>
                <SelectTrigger className="w-[120px]"><SelectValue placeholder="Year" /></SelectTrigger>
                <SelectContent>{[2024,2025,2026].map((y) => (<SelectItem key={y} value={String(y)}>{y}</SelectItem>))}</SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground uppercase tracking-widest">
              <div className="size-3 rounded-full bg-brand-primary" /> Sales
              <div className="size-3 rounded-full bg-brand-secondary ml-2" /> Expenses
            </div>
          </div>
          <Card className="p-6"><MetricsChart data={financialMetrics} granularity={granularity} /></Card>
          <MetricsTable data={financialMetrics} granularity={granularity} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
