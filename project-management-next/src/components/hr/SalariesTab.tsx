import React, { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Landmark, Plus } from 'lucide-react'

export function SalariesTab({ store, fmt, getEmpName }: any) {
  const [showFund, setShowFund] = useState(false)
  const [fundForm, setFundForm] = useState({ fromAccount: 'BANK', amount: 0, reference: '' })

  const totalFunded = store.salariesTransactions
    .filter((t: any) => t.type === 'FUNDING' || t.type === 'TRANSFER')
    .reduce((s: number, t: any) => s + Number(t.amount || 0), 0)
  const totalPaid = store.salariesTransactions
    .filter((t: any) => t.type === 'PAYMENT')
    .reduce((s: number, t: any) => s + Number(t.amount || 0), 0)
  const balance = totalFunded - totalPaid

  return (<div className="space-y-4">
    <Card className="border shadow-sm bg-card/60"><CardContent className="p-4 text-center space-y-1"><Landmark className="size-8 mx-auto text-[#ff8903]" /><p className="text-2xl font-black text-[#ff8903]">{fmt(balance)}</p><p className="text-[10px] font-bold uppercase text-muted-foreground">Available Balance</p></CardContent></Card>
    <div className="grid grid-cols-2 gap-2 text-xs"><div className="p-3 bg-muted/30 rounded-xl border"><span className="text-muted-foreground">Funded</span><p className="font-black text-green-500">{fmt(totalFunded)}</p></div><div className="p-3 bg-muted/30 rounded-xl border"><span className="text-muted-foreground">Paid Out</span><p className="font-black text-red-500">{fmt(totalPaid)}</p></div></div>
    <Button className="w-full h-12 rounded-2xl bg-[#ff8903] text-white font-black" onClick={() => setShowFund(true)}><Plus className="size-5 mr-1" /> Fund Salaries Account</Button>
    <h3 className="text-xs font-black uppercase text-muted-foreground pt-2">Transaction History</h3>
    {store.salariesTransactions.map((t: any) => {
      const isIncoming = t.type === 'FUNDING' || t.type === 'TRANSFER'
      const isOutgoing = t.type === 'PAYMENT'
      const isObligation = t.type === 'ACCUMULATION'

      let colorClass = 'text-slate-500 dark:text-slate-400'
      let sign = ''

      if (isIncoming) {
        colorClass = 'text-green-500'
        sign = '+'
      } else if (isOutgoing) {
        colorClass = 'text-red-500'
        sign = '-'
      }

      const formatDateTime = (val: any) => {
        if (!val) return ''
        const d = val.toDate ? val.toDate() : new Date(val)
        return d.toLocaleString('en-ZW', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        })
      }

      return (
        <Card key={t.id} className="border shadow-sm">
          <CardContent className="p-3">
            <div className="flex justify-between items-center">
              <div>
                <p className="text-sm font-bold">{t.description || t.type}</p>
                <p className="text-[10px] text-muted-foreground">
                  {t.type} • {t.source}
                  {t.createdAt && ` • ${formatDateTime(t.createdAt)}`}
                </p>
              </div>
              <span className={`font-black text-sm ${colorClass}`}>
                {sign}{fmt(t.amount || 0)}
              </span>
            </div>
          </CardContent>
        </Card>
      )
    })}
    {showFund && (<div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"><Card className="w-full max-w-md bg-card border shadow-2xl rounded-3xl"><CardHeader className="pb-3"><CardTitle className="text-lg font-black">Fund Salaries Account</CardTitle></CardHeader><CardContent className="space-y-3"><div className="space-y-1"><Label className="text-xs font-black uppercase">From Account</Label><select value={fundForm.fromAccount} onChange={e => setFundForm({...fundForm, fromAccount: e.target.value})} className="w-full h-10 px-3 rounded-xl border bg-background text-sm"><option value="BANK">Bank</option><option value="ECOCASH">EcoCash</option><option value="CASH">Cash</option></select></div><div className="space-y-1"><Label className="text-xs font-black uppercase">Amount</Label><Input type="number" value={fundForm.amount} onChange={e => setFundForm({...fundForm, amount: Number(e.target.value)})} className="h-10" /></div><div className="space-y-1"><Label className="text-xs font-black uppercase">Reference</Label><Input value={fundForm.reference} onChange={e => setFundForm({...fundForm, reference: e.target.value})} placeholder="Optional ref" className="h-10" /></div><div className="flex gap-3 pt-2"><Button variant="outline" className="flex-1 rounded-xl font-bold" onClick={() => setShowFund(false)}>Cancel</Button><Button className="flex-1 rounded-xl font-bold bg-[#ff8903] text-white" onClick={async () => { await store.fundSalariesAccount(fundForm.fromAccount, fundForm.amount, fundForm.reference); setShowFund(false) }}>Fund</Button></div></CardContent></Card></div>)}
  </div>)
}
