'use client'

import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAccountingStore } from '@/stores/accounting-store'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  TrendingUp, Receipt, FileText,
  ArrowRight, Package, Landmark, Scale, RefreshCw, ShieldCheck
} from 'lucide-react'
import { toast } from 'sonner'
import { QuickLink } from '@/components/accounting/QuickLink'

const formatCurrency = (val: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(val)
}

export default function AccountingDashboardPage() {
  const router = useRouter()
  const store = useAccountingStore()

  const [balances, setBalances] = useState<Record<string, number>>({})
  const [loadingBalances, setLoadingBalances] = useState(true)
  const [syncing, setSyncing] = useState(false)

  useEffect(() => {
    async function load() {
      setLoadingBalances(true)
      try {
        const bals = await store.fetchAllBalances()
        setBalances(bals)
        // Also load recent ledger entries for the activity table
        await store.fetchLedger({ limitCount: 10 })
      } catch (err) {
        console.error('Failed to load balances:', err)
      } finally {
        setLoadingBalances(false)
      }
    }
    load()
  }, [])

  const inventoryValue = balances['Inventory'] || 0

  const handleSyncBacklog = async () => {
    setSyncing(true)
    try {
      toast.info('Inventory sync not yet implemented in Next.js', {
        description: 'This feature will be available in a future update.'
      })
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-brand-primary to-brand-secondary bg-clip-text text-transparent">
            Financial Command Center
          </h1>
          <p className="text-muted-foreground mt-1">
            Real-time accounting, tax compliance, and asset valuation.
          </p>
        </div>
        <div className="flex gap-3">
          <Button
            variant="secondary"
            className="gap-2 border-brand-primary/20"
            onClick={handleSyncBacklog}
            disabled={syncing}
          >
            <RefreshCw className={`size-4 ${syncing ? 'animate-spin' : ''}`} />
            Sync Inventory Backlog
          </Button>
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => router.push('/accounting/vat')}
          >
            <Receipt className="size-4" /> VAT Return
          </Button>
          <Button
            className="gap-2 bg-brand-primary hover:bg-brand-primary/90 text-white"
            onClick={() => router.push('/accounting/tax')}
          >
            <Scale className="size-4" /> ITF12C Tax
          </Button>
        </div>
      </div>

      {/* Top Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="bg-card/50 backdrop-blur-sm border-brand-primary/20 shadow-xl hover:shadow-brand-primary/10 transition-all group">
          <CardContent className="p-6">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
                  Inventory Assets
                </p>
                <h3 className="text-2xl font-black mt-1 tabular-nums">
                  {loadingBalances ? '...' : formatCurrency(inventoryValue)}
                </h3>
              </div>
              <div className="p-2 bg-brand-primary/10 rounded-lg group-hover:bg-brand-primary/20 transition-colors">
                <Package className="size-5 text-brand-primary" />
              </div>
            </div>
            <div className="mt-4 flex items-center text-[10px] font-bold text-emerald-500">
              <TrendingUp className="size-3 mr-1" /> Live Valuation from Ledger
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/50 backdrop-blur-sm border-brand-secondary/20 shadow-xl hover:shadow-brand-secondary/10 transition-all group text-foreground">
          <CardContent className="p-6">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
                  Statutory Liabilities
                </p>
                <h3 className="text-2xl font-black mt-1 tabular-nums text-red-500">
                  $0.00
                </h3>
              </div>
              <div className="p-2 bg-brand-secondary/10 rounded-lg group-hover:bg-brand-secondary/20 transition-colors">
                <Landmark className="size-5 text-brand-secondary" />
              </div>
            </div>
            <div className="mt-4 flex items-center text-[10px] font-bold text-muted-foreground">
              PAYE, NSSA, AIDS Levy Pending
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/50 backdrop-blur-sm border-brand-primary/20 shadow-xl transition-all">
          <CardContent className="p-6">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
                  MTD Revenue
                </p>
                <h3 className="text-2xl font-black mt-1 tabular-nums">$0.00</h3>
              </div>
              <div className="p-2 bg-brand-primary/10 rounded-lg">
                <TrendingUp className="size-5 text-brand-primary" />
              </div>
            </div>
            <div className="mt-4 flex items-center text-[10px] font-bold text-muted-foreground">
              Poultry & Job Cards Aggregate
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/50 backdrop-blur-sm border-brand-secondary/20 shadow-xl transition-all">
          <CardContent className="p-6">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
                  VAT Status
                </p>
                <h3 className="text-2xl font-black mt-1 tabular-nums">RECAP</h3>
              </div>
              <div className="p-2 bg-brand-secondary/10 rounded-lg">
                <Receipt className="size-5 text-brand-secondary" />
              </div>
            </div>
            <div className="mt-4 flex items-center text-[10px] font-bold text-emerald-500">
              Current Period: {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Area */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Quick Actions */}
        <Card className="lg:col-span-1 bg-card/50 backdrop-blur-sm border-muted shadow-lg">
          <CardHeader>
            <CardTitle className="text-sm uppercase tracking-wider font-bold">
              Compliance Center
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <QuickLink
              icon={FileText}
              iconColor="blue"
              title="ITF12C Computation"
              subtitle="Annual Income Tax Template"
              href="/accounting/tax"
            />
            <QuickLink
              icon={Receipt}
              iconColor="emerald"
              title="VAT Calculator"
              subtitle="Input vs Output VAT logic"
              href="/accounting/vat"
            />
            <QuickLink
              icon={Package}
              iconColor="orange"
              title="Inventory Sales Report"
              subtitle="Job card inventory consumption tracking"
              href="/accounting/sales-reports"
            />

            <QuickLink
              icon={FileText}
              iconColor="purple"
              title="Financial Statements"
              subtitle="P&L and Balance Sheet (USD)"
              href="/accounting/reports"
            />
            <QuickLink
              icon={ShieldCheck}
              iconColor="amber"
              title="Auto-Approvals Audit"
              subtitle="Opex & Ad-hoc <$300 · Daily / Weekly / Monthly"
              href="/accounting/auto-approvals"
            />
          </CardContent>
        </Card>

        {/* Ledger Overview / Recent Activity */}
        <Card className="lg:col-span-2 bg-card/50 backdrop-blur-sm border-muted shadow-lg">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-sm uppercase tracking-wider font-bold">
              Recent Financial Activity
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs"
              onClick={() => router.push('/ledger')}
            >
              View Ledger
            </Button>
          </CardHeader>
          <CardContent>
            {store.loadingLedger ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                Loading ledger entries...
              </div>
            ) : store.ledgerEntries.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                No ledger entries found.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[11px] font-bold uppercase">Date</TableHead>
                    <TableHead className="text-[11px] font-bold uppercase">Account</TableHead>
                    <TableHead className="text-[11px] font-bold uppercase">Description</TableHead>
                    <TableHead className="text-[11px] font-bold uppercase">Type</TableHead>
                    <TableHead className="text-[11px] font-bold uppercase text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {store.ledgerEntries.slice(0, 8).map((entry) => (
                    <TableRow key={entry.id} className="border-b">
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {entry.date?.toDate ? entry.date.toDate().toLocaleDateString() : '—'}
                      </TableCell>
                      <TableCell className="text-xs font-medium">{entry.account}</TableCell>
                      <TableCell className="text-xs">{entry.description}</TableCell>
                      <TableCell>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                          entry.type === 'DEBIT'
                            ? 'bg-blue-500/10 text-blue-700 dark:text-blue-300'
                            : 'bg-red-500/10 text-red-700 dark:text-red-300'
                        }`}>
                          {entry.type}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs font-semibold text-right">
                        {formatCurrency(entry.amount)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            <div className="mt-4 flex justify-end">
              <Button
                variant="ghost"
                size="sm"
                className="text-xs gap-2"
                onClick={() => router.push('/accounting/reports')}
              >
                View Detailed Metrics <ArrowRight className="size-3" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}