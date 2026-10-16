'use client'

import React, { useEffect, useState } from 'react'
import { useTaxStore } from '@/stores/tax-store'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Scale, Plus, Minus, Calculator, TrendingUp, FileText, ShieldCheck, AlertCircle } from 'lucide-react'

const formatCurrency = (val: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val)

const years = [2024, 2025, 2026]

export default function TaxComputationPage() {
  const store = useTaxStore()
  const { netProfit, totalAddBacks, totalDeductions, taxableIncome, taxPayable, aidsLevy, qpds, loading } = store
  const [selectedYear, setSelectedYear] = useState<number>(2025)

  useEffect(() => { store.calculateTax(selectedYear) }, [selectedYear])

  return (
    <div className="p-6 space-y-8 animate-in fade-in zoom-in-95 duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight flex items-center gap-3 text-brand-primary">
            <Scale className="size-8" /> ITF12C Tax Computation
          </h1>
          <p className="text-muted-foreground mt-1">Corporate Income Tax reconciliation for ZIMRA compliance.</p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={String(selectedYear)} onValueChange={(v) => setSelectedYear(Number(v))}>
            <SelectTrigger className="w-[120px] bg-card border-brand-primary/20">
              <SelectValue placeholder="Year" />
            </SelectTrigger>
            <SelectContent>
              {years.map((y) => (<SelectItem key={y} value={String(y)}>FY {y}</SelectItem>))}
            </SelectContent>
          </Select>
          <Button variant="outline" className="gap-2"><FileText className="size-4" /> Export ITF12C</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <Card className="border-l-4 border-l-blue-500 bg-card/50 shadow-md">
            <CardContent className="p-6">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-blue-500/10 rounded-full"><TrendingUp className="size-6 text-blue-500" /></div>
                  <div><h3 className="text-lg font-bold">Net Profit per Accounts</h3><p className="text-xs text-muted-foreground">Accounting profit before tax adjustments</p></div>
                </div>
                <div className="text-2xl font-black tabular-nums">{formatCurrency(netProfit)}</div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-orange-500 bg-card/50 shadow-md">
            <CardContent className="p-6">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-orange-500/10 rounded-full"><Plus className="size-6 text-orange-500" /></div>
                  <div><h3 className="text-lg font-bold">Add Backs (Non-Deductibles)</h3><p className="text-xs text-muted-foreground">Entertainment, fines, depreciation added back</p></div>
                </div>
                <div className="text-2xl font-black tabular-nums text-orange-600">{formatCurrency(totalAddBacks)}</div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-emerald-500 bg-card/50 shadow-md">
            <CardContent className="p-6">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-emerald-500/10 rounded-full"><Minus className="size-6 text-emerald-500" /></div>
                  <div><h3 className="text-lg font-bold">Deductions (Capital Allowances)</h3><p className="text-xs text-muted-foreground">Wear &amp; tear, SIA allowances</p></div>
                </div>
                <div className="text-2xl font-black tabular-nums text-emerald-600">{formatCurrency(totalDeductions)}</div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-purple-500 bg-card/50 shadow-md border-2 border-purple-500/30">
            <CardContent className="p-6">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-purple-500/10 rounded-full"><Calculator className="size-6 text-purple-500" /></div>
                  <div><h3 className="text-lg font-bold">Taxable Income</h3><p className="text-xs text-muted-foreground">Profit + Add Backs - Deductions</p></div>
                </div>
                <div className="text-2xl font-black tabular-nums text-purple-600">{formatCurrency(taxableIncome)}</div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="bg-card/80 backdrop-blur-sm border-2 border-brand-secondary shadow-xl overflow-hidden">
            <div className="bg-brand-secondary p-4 text-white font-black text-center text-sm tracking-widest uppercase">Estimated Tax Payable</div>
            <CardContent className="p-6 space-y-6">
              <div className="space-y-2">
                <div className="flex justify-between text-sm"><span className="text-muted-foreground">Corporate Tax (24%)</span><span className="font-bold tabular-nums">{formatCurrency(taxPayable)}</span></div>
                <div className="flex justify-between text-sm"><span className="text-muted-foreground">AIDS Levy (3% of Tax)</span><span className="font-bold tabular-nums">{formatCurrency(aidsLevy)}</span></div>
              </div>
              <div className="pt-6 border-t border-muted">
                <div className="flex justify-between items-end"><span className="text-xs font-bold uppercase tracking-widest">Total Bill</span><span className="text-3xl font-black tabular-nums text-brand-secondary">{formatCurrency(taxPayable + aidsLevy)}</span></div>
              </div>
              <Button className="w-full h-12 bg-brand-secondary hover:bg-brand-secondary/90 text-white font-bold text-base shadow-lg shadow-brand-secondary/20">Post to Ledger</Button>
            </CardContent>
          </Card>
          <Card className="bg-card/40 border-dashed border-brand-primary/20">
            <CardHeader className="pb-2"><CardTitle className="text-xs font-bold uppercase tracking-widest text-brand-primary">QPD Schedule (Forecast)</CardTitle></CardHeader>
            <CardContent className="p-4 space-y-3">
              {qpds.map((qpd) => (
                <div key={qpd.name} className="flex justify-between items-center text-[10px] p-2 bg-muted/20 rounded border border-muted/10">
                  <div><p className="font-bold text-foreground">{qpd.name}</p><p className="text-muted-foreground">{qpd.dueDate}</p></div>
                  <div className="text-right"><p className="font-black text-brand-primary">{formatCurrency(qpd.amount)}</p><p className="text-[8px] text-muted-foreground">Estimated</p></div>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card className="bg-muted/30 border-dashed">
            <CardContent className="p-6 space-y-4">
              <h4 className="text-xs font-bold uppercase tracking-widest flex items-center gap-2"><AlertCircle className="size-3 text-orange-500" />Tax Compliance Tips</h4>
              <ul className="text-[10px] space-y-2 text-muted-foreground">
                <li>• Ensure all non-deductible entertainment expenses are flagged.</li>
                <li>• Capital allowances are computed at 25% for most machinery (SIA).</li>
                <li>• AIDS Levy is calculated as 3% of the basic corporate tax.</li>
                <li>• Quarterly Payment Dates (QPDs) are required for this income level.</li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
