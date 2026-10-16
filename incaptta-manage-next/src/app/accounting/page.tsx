'use client'

import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAccountingStore } from '@/stores/accounting-store'
import { useFinanceStore } from '@/stores/finance-store'
import { useInventoryStore } from '@/stores/inventory-store'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  ChevronLeft,
  TrendingUp,
  Scale,
  Receipt,
  Calendar,
  Loader2,
  ArrowRightLeft,
  Package,
  Landmark,
  DollarSign,
  ShieldCheck,
  Briefcase
} from 'lucide-react'

type Timeframe = 'month' | 'ytd' | 'all'

export default function AccountingPage() {
  const router = useRouter()
  const accounting = useAccountingStore()
  const financeStore = useFinanceStore()
  const invStore = useInventoryStore()

  const [timeframe, setTimeframe] = useState<Timeframe>('month')

  useEffect(() => {
    accounting.fetchTaxCategories()
    accounting.fetchVatReturns()
    accounting.startListeners()

    financeStore.fetchExpenses()
    financeStore.fetchTransfers()
    financeStore.fetchJobPayments()
    financeStore.fetchTopUps()
    financeStore.fetchSalariesTransactions()
    financeStore.fetchHistoricalInventoryConsumption()
    invStore.fetchItems()

    return () => {
      accounting.cleanup()
      financeStore.cleanup()
    }
  }, [])

  const plData = accounting.computePandL(timeframe)
  const cashAndBank = financeStore.totalBusinessBalance || 0
  const inventoryValue = invStore.totalValue() || 0
  const balanceSheetData = accounting.computeBalanceSheet(cashAndBank, inventoryValue)
  const fmt = accounting.fmt
  const periodLabel = accounting.getPeriodLabel(timeframe)
  const balances = financeStore.finalBalances || {}

  return (
    <div className="flex-1 flex flex-col pb-20 bg-background min-h-screen">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-card border-b px-4 py-4 flex items-center gap-4 shadow-sm">
        <Button variant="ghost" size="icon" onClick={() => router.push('/')}>
          <ChevronLeft className="size-6" />
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-black tracking-tight">Accounting</h1>
          <p className="text-xs text-muted-foreground">Statements & financial sheets</p>
        </div>
        <Badge className="bg-[#ff8903] text-white text-[10px] font-black h-5 px-2">
          REAL-TIME (USD)
        </Badge>
      </header>

      {/* Timeframe Filters */}
      <section className="p-4 space-y-3">
        <div className="bg-card border rounded-2xl p-1 flex gap-1 shadow-sm">
          {(['month', 'ytd', 'all'] as Timeframe[]).map((tf) => (
            <Button
              key={tf}
              variant="ghost"
              className={`flex-1 text-xs font-black py-2 rounded-xl transition-all ${
                timeframe === tf
                  ? 'bg-[#ff8903] text-white shadow-sm hover:bg-[#ff8903]'
                  : 'text-muted-foreground'
              }`}
              onClick={() => setTimeframe(tf)}
            >
              {tf === 'month' && <Calendar className="size-3.5 mr-1" />}
              {tf === 'ytd' && <Scale className="size-3.5 mr-1" />}
              {tf === 'all' && <Receipt className="size-3.5 mr-1" />}
              {tf === 'month' ? 'This Month' : tf === 'ytd' ? 'YTD' : 'All Time'}
            </Button>
          ))}
        </div>
      </section>

      {/* Loading */}
      {accounting.loading && (
        <div className="flex flex-col items-center justify-center py-20">
          <Loader2 className="size-8 animate-spin text-[#ff8903]" />
          <p className="text-xs text-muted-foreground mt-2 font-bold uppercase tracking-wider">Calculating ledger books...</p>
        </div>
      )}

      {!accounting.loading && (
        <main className="px-4 pb-6 space-y-6">
          {/* Period Banner */}
          <div className="rounded-2xl bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border p-4 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-[9px] font-black uppercase text-muted-foreground tracking-widest">Reporting Period</p>
              <h2 className="text-sm font-black text-foreground mt-0.5">{periodLabel}</h2>
            </div>
            <Badge variant="outline" className="border-emerald-500/25 bg-emerald-500/5 text-emerald-500 text-[10px] font-bold">
              Matched to Master
            </Badge>
          </div>

          {/* Profit & Loss Section */}
          <section className="space-y-3">
            <h3 className="text-xs font-black uppercase tracking-wider text-muted-foreground px-1 flex items-center gap-1.5">
              <TrendingUp className="size-4 text-[#79c21b]" /> Profit & Loss Statement
            </h3>

            <div className="grid grid-cols-2 gap-3">
              <Card className="bg-card border shadow-sm">
                <CardContent className="p-3 space-y-1">
                  <span className="text-[9px] font-black uppercase text-muted-foreground tracking-widest block">Gross Income</span>
                  <span className="text-base font-black text-[#79c21b] block truncate">{fmt(plData.revenue)}</span>
                  <span className="text-[9px] font-medium text-muted-foreground block text-left">Poultry & Job Cards</span>
                </CardContent>
              </Card>

              <Card className="bg-card border shadow-sm">
                <CardContent className="p-3 space-y-1">
                  <span className="text-[9px] font-black uppercase text-muted-foreground tracking-widest block">Direct COGS</span>
                  <span className="text-base font-black text-purple-400 block truncate">{fmt(plData.cogs)}</span>
                  <span className="text-[9px] font-medium text-muted-foreground block text-left">Inventory Consumed</span>
                </CardContent>
              </Card>

              <Card className="bg-card border shadow-sm">
                <CardContent className="p-3 space-y-1">
                  <span className="text-[9px] font-black uppercase text-muted-foreground tracking-widest block">Admin & Opex</span>
                  <span className="text-base font-black text-red-500 block truncate">{fmt(plData.operatingExpenses)}</span>
                  <span className="text-[9px] font-medium text-muted-foreground block text-left">Operations & Staff</span>
                </CardContent>
              </Card>

              <Card className="bg-[#ff8903]/5 border border-[#ff8903]/20 shadow-sm">
                <CardContent className="p-3 space-y-1">
                  <span className="text-[9px] font-black uppercase text-[#ff8903] tracking-widest block">Net Profit</span>
                  <span className={`text-base font-black block truncate ${plData.netProfit >= 0 ? 'text-[#ff8903]' : 'text-red-600'}`}>
                    {fmt(plData.netProfit)}
                  </span>
                  <span className="text-[9px] font-medium text-muted-foreground block text-left">After deductions</span>
                </CardContent>
              </Card>
            </div>
          </section>

          {/* Statement of Financial Position */}
          <section className="space-y-3">
            <h3 className="text-xs font-black uppercase tracking-wider text-muted-foreground px-1 flex items-center gap-1.5">
              <Landmark className="size-4 text-blue-500" /> Statement of Financial Position
            </h3>

            <Card className="border shadow-md overflow-hidden bg-card/60 backdrop-blur-md rounded-2xl">
              <CardHeader className="p-4 bg-muted/20 border-b">
                <div className="flex justify-between items-center">
                  <CardTitle className="text-xs uppercase font-black text-foreground">ASSETS & LIABILITIES</CardTitle>
                  <span className="text-[10px] font-bold text-muted-foreground">USD Sheet</span>
                </div>
              </CardHeader>
              <CardContent className="p-4 space-y-4">
                {/* Assets Block */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                    <span>1. ASSETS</span>
                    <span className="text-foreground font-black">{fmt(balanceSheetData.totalAssets)}</span>
                  </div>
                  <div className="space-y-1.5 pl-2 border-l-2 border-emerald-500/30 text-xs">
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground flex items-center gap-1"><DollarSign className="size-3 text-[#79c21b]" /> Liquid Cash & Bank</span>
                      <span className="font-bold text-foreground">{fmt(balanceSheetData.cashAndBank)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground flex items-center gap-1"><Package className="size-3 text-[#ff8903]" /> Warehouse Stock Value</span>
                      <span className="font-bold text-foreground">{fmt(balanceSheetData.inventoryValue)}</span>
                    </div>
                  </div>
                </div>

                {/* Liabilities Block */}
                <div className="space-y-2 pt-2 border-t border-dashed">
                  <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                    <span>2. LIABILITIES</span>
                    <span className="text-red-500 font-black">{fmt(balanceSheetData.totalLiabilities)}</span>
                  </div>
                  <div className="space-y-1.5 pl-2 border-l-2 border-red-500/30 text-xs">
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground flex items-center gap-1"><Briefcase className="size-3 text-red-500" /> Pending Statutory (ZIMRA/NSSA)</span>
                      <span className="font-bold text-foreground">{fmt(balanceSheetData.statutoryPayables)}</span>
                    </div>
                  </div>
                </div>

                {/* Equity Block */}
                <div className="space-y-2 pt-3 border-t border-solid border-border flex justify-between items-center font-black">
                  <div className="text-[10px] uppercase tracking-wider text-[#ff8903] flex items-center gap-1.5">
                    <ShieldCheck className="size-4" /> 3. Retained Equity
                  </div>
                  <span className="text-sm text-[#ff8903]">{fmt(balanceSheetData.equity)}</span>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* Ledger Account States */}
          <section className="space-y-3">
            <h3 className="text-xs font-black uppercase tracking-wider text-muted-foreground px-1 flex items-center gap-1.5">
              <ArrowRightLeft className="size-4 text-purple-400" /> Statutory & Liquid Account States
            </h3>

            <div className="grid grid-cols-2 gap-2 text-[10px] font-bold">
              {[
                { label: 'Bank Ledger', key: 'BANK' },
                { label: 'EcoCash Ledger', key: 'ECOCASH' },
                { label: 'Cash Safe', key: 'CASH' },
                { label: 'Salaries Account', key: 'SALARIES' },
              ].map((acct) => (
                <div key={acct.key} className="p-3 bg-muted/40 rounded-xl border flex justify-between items-center">
                  <span className="text-muted-foreground">{acct.label}</span>
                  <span className={(balances[acct.key] || 0) < 0 ? 'text-red-500' : 'text-foreground'}>
                    {fmt(balances[acct.key] || 0)}
                  </span>
                </div>
              ))}
            </div>
          </section>
        </main>
      )}
    </div>
  )
}