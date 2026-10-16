import React, { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Users, User, Calendar, Wallet, ClipboardList, Briefcase, Landmark, AlertTriangle, Plus, Trash2, Check, X, FileText, Percent, DollarSign, Phone, Mail, Building2, ShieldCheck, ShieldAlert, Clock, CheckCircle2, XCircle, Edit3, Search } from 'lucide-react'
import { toast } from 'sonner'

// ─── ADVANCES TAB ───────────────────────────────────────────────────────────
export function AdvancesTab({ store, fmt, getEmpName }: any) {
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ employeeId: '', amount: 0, reason: '' })

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-xs font-black uppercase text-muted-foreground">Salary Advances</h3>
        <Button size="sm" className="bg-[#ff8903] text-white font-bold text-xs" onClick={() => { setForm({ employeeId: '', amount: 0, reason: '' }); setShowAdd(true) }}><Plus className="size-3" /> Request</Button>
      </div>
      {store.salaryAdvances.map((a: any) => (
        <Card key={a.id} className="border shadow-sm"><CardContent className="p-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-bold">{a.employeeName}</p>
              <p className="text-[10px] text-muted-foreground">{fmt(a.amount)} {a.reason && `— ${a.reason}`}</p>
            </div>
            <div className="flex items-center gap-1">
              <Badge variant="outline" className={`text-[9px] font-bold ${a.status === 'Processed' ? 'text-green-600' : a.status === 'Unprocessed' ? 'text-blue-600' : 'text-amber-600'}`}>{a.status}</Badge>
              {(a.status === 'Pending Approval' || a.status === 'Unprocessed') && (
                <Button size="sm" className="h-7 w-7 p-0 bg-green-500/20 text-green-600" onClick={() => store.approveSalaryAdvance(a)}><Check className="size-3" /></Button>
              )}
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-500" onClick={() => { if (confirm('Delete?')) store.deleteSalaryAdvance(a.id) }}><Trash2 className="size-3" /></Button>
            </div>
          </div>
        </CardContent></Card>
      ))}

      {showAdd && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <Card className="w-full max-w-md bg-card border shadow-2xl rounded-3xl">
            <CardHeader className="pb-3"><CardTitle className="text-lg font-black">Request Advance</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1"><Label className="text-xs font-black uppercase text-muted-foreground">Employee</Label>
                <select value={form.employeeId} onChange={e => setForm({...form, employeeId: e.target.value})} className="w-full h-10 px-3 rounded-xl border bg-background text-sm">
                  <option value="">Select</option>
                  {store.employees.map((e: any) => <option key={e.id} value={e.id}>{getEmpName(e)}</option>)}
                </select></div>
              <div className="space-y-1"><Label className="text-xs font-black uppercase text-muted-foreground">Amount</Label>
                <Input type="number" value={form.amount} onChange={e => setForm({...form, amount: Number(e.target.value)})} className="h-10" /></div>
              <div className="space-y-1"><Label className="text-xs font-black uppercase text-muted-foreground">Reason</Label>
                <Input value={form.reason} onChange={e => setForm({...form, reason: e.target.value})} className="h-10" /></div>
              <div className="flex gap-3 pt-2">
                <Button variant="outline" className="flex-1 rounded-xl font-bold" onClick={() => setShowAdd(false)}>Cancel</Button>
                <Button className="flex-1 rounded-xl font-bold bg-[#ff8903] text-white" onClick={async () => { await store.addSalaryAdvance(form); setShowAdd(false) }}>Submit</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}

