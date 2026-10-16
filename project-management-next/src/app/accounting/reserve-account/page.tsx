'use client'

import React, { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useFinanceStore } from '@/stores/finance-store'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Landmark, Plus, ArrowLeftRight, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

const fmt = (n?: number | null) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(n || 0)

function formatDateTime(val: any) {
  if (!val) return ''
  const d = val.toDate ? val.toDate() : new Date(val)
  return d.toLocaleString('en-ZW', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function ReserveAccountPage() {
  const {
    reserveTransactions,
    subscribeLedger,
    fundReserveAccount,
  } = useFinanceStore()

  const [showFund, setShowFund] = useState(false)
  const [funding, setFunding] = useState(false)
  const [fundForm, setFundForm] = useState({
    fromAccount: 'BANK',
    amount: 0,
    reference: '',
  })

  useEffect(() => {
    return subscribeLedger()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const { totalFunded, totalPaid, balance } = useMemo(() => {
    const funded = reserveTransactions
      .filter((t: any) => t.type === 'FUNDING' || t.type === 'TRANSFER')
      .reduce((s: number, t: any) => s + Number(t.amount || 0), 0)
    const paid = reserveTransactions
      .filter((t: any) => t.type === 'PAYMENT')
      .reduce((s: number, t: any) => s + Number(t.amount || 0), 0)
    return { totalFunded: funded, totalPaid: paid, balance: funded - paid }
  }, [reserveTransactions])

  const handleFund = async () => {
    if (fundForm.amount <= 0) {
      toast.error('Amount must be greater than 0')
      return
    }
    setFunding(true)
    try {
      await fundReserveAccount(fundForm.fromAccount, fundForm.amount, fundForm.reference)
      setShowFund(false)
      setFundForm({ fromAccount: 'BANK', amount: 0, reference: '' })
    } catch {
      // toast handled in store
    } finally {
      setFunding(false)
    }
  }

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight">Reserve Account</h1>
          <p className="text-sm text-muted-foreground">
            Virtual reserve holding company funds. Fund here, move money via Transfers,
            or select Reserve as the payment account on expenses — deductions reduce this balance.
          </p>
        </div>
        <Link
          href="/transfers"
          className="inline-flex h-8 items-center justify-center gap-2 rounded-lg border border-border bg-background px-2.5 text-sm font-medium hover:bg-muted"
        >
          <ArrowLeftRight className="size-4" />
          Request / Transfer Funds
        </Link>
      </div>

      <Card className="border shadow-sm bg-card/60">
        <CardContent className="p-6 text-center space-y-1">
          <Landmark className="size-8 mx-auto text-sky-500" />
          <p className="text-3xl font-black text-sky-600 dark:text-sky-400">{fmt(balance)}</p>
          <p className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider">
            Available Balance
          </p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3 text-xs">
        <div className="p-4 bg-muted/30 rounded-xl border">
          <span className="text-muted-foreground">Funded</span>
          <p className="font-black text-green-500 text-lg mt-1">{fmt(totalFunded)}</p>
        </div>
        <div className="p-4 bg-muted/30 rounded-xl border">
          <span className="text-muted-foreground">Paid Out</span>
          <p className="font-black text-red-500 text-lg mt-1">{fmt(totalPaid)}</p>
        </div>
      </div>

      <Button
        className="w-full h-12 rounded-2xl bg-sky-600 hover:bg-sky-700 text-white font-black"
        onClick={() => setShowFund(true)}
      >
        <Plus className="size-5 mr-1" /> Fund Reserve Account
      </Button>

      <div className="space-y-3">
        <h3 className="text-xs font-black uppercase text-muted-foreground pt-2">
          Transaction History
        </h3>
        {reserveTransactions.length === 0 && (
          <Card className="border shadow-sm">
            <CardContent className="p-6 text-center text-sm text-muted-foreground">
              No transactions yet. Fund the account or complete a transfer to/from Reserve Account.
            </CardContent>
          </Card>
        )}
        {reserveTransactions.map((t: any) => {
          const isIncoming = t.type === 'FUNDING' || t.type === 'TRANSFER'
          const isOutgoing = t.type === 'PAYMENT'
          let colorClass = 'text-slate-500 dark:text-slate-400'
          let sign = ''
          if (isIncoming) {
            colorClass = 'text-green-500'
            sign = '+'
          } else if (isOutgoing) {
            colorClass = 'text-red-500'
            sign = '-'
          }

          return (
            <Card key={t.id} className="border shadow-sm">
              <CardContent className="p-3">
                <div className="flex justify-between items-center gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-bold truncate">{t.description || t.type}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {t.type} • {t.source}
                      {t.createdAt && ` • ${formatDateTime(t.createdAt)}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="outline" className="text-[9px] font-bold uppercase">
                      {t.type}
                    </Badge>
                    <span className={`font-black text-sm tabular-nums ${colorClass}`}>
                      {sign}
                      {fmt(t.amount || 0)}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {showFund && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <Card className="w-full max-w-md bg-card border shadow-2xl rounded-3xl">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg font-black">Fund Reserve Account</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs font-black uppercase">From Account</Label>
                <select
                  value={fundForm.fromAccount}
                  onChange={(e) => setFundForm({ ...fundForm, fromAccount: e.target.value })}
                  className="w-full h-10 px-3 rounded-xl border bg-background text-sm"
                >
                  <option value="BANK">Bank</option>
                  <option value="ECOCASH">EcoCash</option>
                  <option value="CASH">Cash</option>
                  <option value="IRD">IRD</option>
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-black uppercase">Amount</Label>
                <Input
                  type="number"
                  value={fundForm.amount || ''}
                  onChange={(e) => setFundForm({ ...fundForm, amount: Number(e.target.value) })}
                  className="h-10"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-black uppercase">Reference</Label>
                <Input
                  value={fundForm.reference}
                  onChange={(e) => setFundForm({ ...fundForm, reference: e.target.value })}
                  placeholder="Optional ref"
                  className="h-10"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <Button
                  variant="outline"
                  className="flex-1 rounded-xl font-bold"
                  onClick={() => setShowFund(false)}
                  disabled={funding}
                >
                  Cancel
                </Button>
                <Button
                  className="flex-1 rounded-xl font-bold bg-sky-600 hover:bg-sky-700 text-white"
                  onClick={() => void handleFund()}
                  disabled={funding}
                >
                  {funding ? <Loader2 className="size-4 animate-spin mr-1" /> : null}
                  Fund
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
