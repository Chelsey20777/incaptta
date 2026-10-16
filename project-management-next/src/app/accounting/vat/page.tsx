'use client'

import React, { useEffect, useState } from 'react'
import { useVatStore } from '@/stores/vat-store'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Receipt, ArrowUpRight, ArrowDownRight, Scale, Calendar, AlertCircle, Download, CheckCircle2 } from 'lucide-react'

const formatCurrency = (val: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val)

const months = [
  { value: 1, label: 'January' }, { value: 2, label: 'February' }, { value: 3, label: 'March' },
  { value: 4, label: 'April' }, { value: 5, label: 'May' }, { value: 6, label: 'June' },
  { value: 7, label: 'July' }, { value: 8, label: 'August' }, { value: 9, label: 'September' },
  { value: 10, label: 'October' }, { value: 11, label: 'November' }, { value: 12, label: 'December' },
]
const years = [2024, 2025, 2026]

export default function VatDashboardPage() {
  const store = useVatStore()
  const { outputVat, inputVat, netVatPayable, poultryVat, jobVat, loading } = store
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth() + 1)
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear())

  useEffect(() => { store.calculateVat(selectedMonth, selectedYear) }, [selectedMonth, selectedYear])

  return (
    <div className="p-6 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-foreground flex items-center gap-2">
            <Receipt className="size-8 text-brand-primary" /> VAT Return Center
          </h1>
          <p className="text-muted-foreground">Manage your Value Added Tax compliance and submissions.</p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={String(selectedMonth)} onValueChange={(v) => setSelectedMonth(Number(v))}>
            <SelectTrigger className="w-[140px] bg-card border-brand-primary/20">
              <Calendar className="mr-2 size-4 opacity-50" /><SelectValue placeholder="Month" />
            </SelectTrigger>
            <SelectContent>{months.map((m) => (<SelectItem key={m.value} value={String(m.value)}>{m.label}</SelectItem>))}</SelectContent>
          </Select>
          <Select value={String(selectedYear)} onValueChange={(v) => setSelectedYear(Number(v))}>
            <SelectTrigger className="w-[100px] bg-card border-brand-primary/20"><SelectValue placeholder="Year" /></SelectTrigger>
            <SelectContent>{years.map((y) => (<SelectItem key={y} value={String(y)}>{y}</SelectItem>))}</SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={() => store.calculateVat(selectedMonth, selectedYear)}><Download className="size-4" /></Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="relative overflow-hidden border-emerald-500/20 bg-emerald-500/5 shadow-lg">
          <div className="absolute top-0 right-0 p-4 opacity-10"><ArrowUpRight className="size-16" /></div>
          <CardContent className="p-6 relative">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Output VAT</p>
            <h3 className="text-3xl font-black mt-2 tabular-nums text-emerald-600">{formatCurrency(outputVat)}</h3>
            <p className="text-[10px] text-muted-foreground mt-1">Sales inclusive of 15% VAT</p>
          </CardContent>
        </Card>
        <Card className="relative overflow-hidden border-blue-500/20 bg-blue-500/5 shadow-lg">
          <div className="absolute top-0 right-0 p-4 opacity-10"><ArrowDownRight className="size-16" /></div>
          <CardContent className="p-6 relative">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Input VAT</p>
            <h3 className="text-3xl font-black mt-2 tabular-nums text-blue-600">{formatCurrency(inputVat)}</h3>
            <p className="text-[10px] text-muted-foreground mt-1">Purchases eligible for credit</p>
          </CardContent>
        </Card>
        <Card className={`relative overflow-hidden shadow-lg border-2 ${netVatPayable > 0 ? 'border-red-500/30 bg-red-500/5' : 'border-emerald-500/30 bg-emerald-500/5'}`}>
          <CardContent className="p-6">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Net VAT</p>
            <h3 className={`text-3xl font-black mt-2 tabular-nums ${netVatPayable > 0 ? 'text-red-600' : 'text-emerald-600'}`}>{formatCurrency(Math.abs(netVatPayable))}</h3>
            <p className={`text-[10px] font-bold mt-1 uppercase tracking-wider ${netVatPayable > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
              {netVatPayable > 0 ? 'PAYABLE TO ZIMRA' : 'REFUND DUE'}
            </p>
          </CardContent>
        </Card>
      </div>


      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Card className="bg-card/50 backdrop-blur-md border-muted shadow-xl">
          <CardHeader><CardTitle className="text-sm font-bold uppercase tracking-widest flex items-center gap-2"><ArrowUpRight className="size-4 text-emerald-500" />Output VAT Breakdown</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between items-center p-3 rounded-lg bg-muted/20"><span className="text-sm font-medium">Poultry Sales</span><span className="text-sm font-bold tabular-nums">{formatCurrency(poultryVat)}</span></div>
            <div className="flex justify-between items-center p-3 rounded-lg bg-muted/20"><span className="text-sm font-medium">Job Card Services</span><span className="text-sm font-bold tabular-nums">{formatCurrency(jobVat)}</span></div>
            <div className="p-4 bg-emerald-500/10 rounded-xl border border-emerald-500/20 mt-4">
              <div className="flex items-start gap-3"><CheckCircle2 className="size-5 text-emerald-500 shrink-0" /><div><p className="text-xs font-bold text-emerald-700">Audit Ready</p><p className="text-[10px] text-emerald-600">All sales records have valid tax invoice references.</p></div></div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card/50 backdrop-blur-md border-muted shadow-xl">
          <CardHeader><CardTitle className="text-sm font-bold uppercase tracking-widest flex items-center gap-2"><ArrowDownRight className="size-4 text-blue-500" />Input VAT Breakdown</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between items-center p-3 rounded-lg bg-muted/20"><span className="text-sm font-medium">Direct Operating Costs</span><span className="text-sm font-bold tabular-nums">{formatCurrency(inputVat * 0.7)}</span></div>
            <div className="flex justify-between items-center p-3 rounded-lg bg-muted/20"><span className="text-sm font-medium">Administrative Expenses</span><span className="text-sm font-bold tabular-nums">{formatCurrency(inputVat * 0.3)}</span></div>
            <div className="p-4 bg-blue-500/10 rounded-xl border border-blue-500/20 mt-4">
              <div className="flex items-start gap-3"><AlertCircle className="size-5 text-blue-500 shrink-0" /><div><p className="text-xs font-bold text-blue-700">Verification Required</p><p className="text-[10px] text-blue-600">Ensure all supplier tax invoices are uploaded for this period.</p></div></div>
            </div>
          </CardContent>
        </Card>
      </div>
      <div className="flex justify-end gap-4">
        <Button variant="ghost" className="font-bold">Discard Changes</Button>
        <Button className="bg-brand-primary text-white font-bold px-8 h-12 shadow-lg shadow-brand-primary/20">Generate VAT 201 Return</Button>
      </div>
    </div>
  )
}
