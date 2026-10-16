import React, { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Users, User, Calendar, Wallet, ClipboardList, Briefcase, Landmark, AlertTriangle, Plus, Trash2, Check, X, FileText, Percent, DollarSign, Phone, Mail, Building2, ShieldCheck, ShieldAlert, Clock, CheckCircle2, XCircle, Edit3, Search } from 'lucide-react'
import { toast } from 'sonner'

// ─── LEAVE TAB ──────────────────────────────────────────────────────────────
export function LeaveTab({ store, fmt, getEmpName }: any) {
  const [showRequest, setShowRequest] = useState(false)
  const [form, setForm] = useState({ employeeId: '', type: 'Annual', startDate: '', endDate: '', reason: '' })

  const leaveBalances = store.employees.reduce((acc: any, e: any) => {
    const used = store.leaveRequests.filter((l: any) => l.employeeId === e.id && l.status === 'Approved' && l.type === 'Annual')
      .reduce((s: number, l: any) => s + (store.daysBetween(l.startDate, l.endDate)), 0)
    acc[e.id] = { name: getEmpName(e), balance: Math.max(0, 20 - used) }
    return acc
  }, {})

  const handleRequest = async () => {
    if (!form.employeeId || !form.startDate || !form.endDate) { toast.error('Complete all fields'); return }
    const emp = store.employees.find((e: any) => e.id === form.employeeId)
    await store.submitLeaveRequest({ ...form, employeeName: getEmpName(emp) })
    setShowRequest(false)
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-xs font-black uppercase text-muted-foreground">Leave Balances</h3>
        <Button size="sm" className="bg-[#ff8903] text-white font-bold text-xs" onClick={() => setShowRequest(true)}><Plus className="size-3" /> Request</Button>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {Object.entries(leaveBalances).slice(0, 12).map(([id, info]: any) => (
          <div key={id} className="p-2 bg-muted/30 rounded-xl border text-center">
            <p className="text-[9px] font-bold text-muted-foreground truncate">{info.name.split(' ')[0]}</p>
            <p className="text-sm font-black">{info.balance}d</p>
          </div>
        ))}
      </div>

      <h3 className="text-xs font-black uppercase text-muted-foreground pt-2">Requests</h3>
      {store.leaveRequests.map((l: any) => (
        <Card key={l.id} className="border shadow-sm"><CardContent className="p-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-bold">{l.employeeName}</p>
              <p className="text-[10px] text-muted-foreground">{l.type} • {l.startDate} → {l.endDate}</p>
              {l.reason && <p className="text-[9px] text-muted-foreground mt-0.5">{l.reason}</p>}
            </div>
            <div className="flex items-center gap-1">
              <Badge variant="outline" className={`text-[9px] font-bold ${l.status === 'Approved' ? 'text-green-600 border-green-500/30' : l.status === 'Rejected' ? 'text-red-600 border-red-500/30' : 'text-amber-600 border-amber-500/30'}`}>{l.status}</Badge>
              {l.status === 'Pending' && <>
                <Button size="sm" className="h-7 w-7 p-0 bg-green-500/20 text-green-600" onClick={() => store.updateLeaveStatus(l.id, 'Approved')}><Check className="size-3" /></Button>
                <Button size="sm" className="h-7 w-7 p-0 bg-red-500/20 text-red-600" onClick={() => store.updateLeaveStatus(l.id, 'Rejected')}><X className="size-3" /></Button>
              </>}
            </div>
          </div>
        </CardContent></Card>
      ))}

      {showRequest && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <Card className="w-full max-w-md bg-card border shadow-2xl rounded-3xl">
            <CardHeader className="pb-3"><CardTitle className="text-lg font-black">Request Leave</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1"><Label className="text-xs font-black uppercase text-muted-foreground">Employee</Label>
                <select value={form.employeeId} onChange={e => setForm({...form, employeeId: e.target.value})} className="w-full h-10 px-3 rounded-xl border bg-background text-sm">
                  <option value="">Select</option>
                  {store.employees.map((e: any) => <option key={e.id} value={e.id}>{getEmpName(e)}</option>)}
                </select></div>
              <div className="space-y-1"><Label className="text-xs font-black uppercase text-muted-foreground">Type</Label>
                <select value={form.type} onChange={e => setForm({...form, type: e.target.value})} className="w-full h-10 px-3 rounded-xl border bg-background text-sm">
                  <option>Annual</option><option>Sick</option><option>Emergency</option><option>Study</option><option>Maternity/Paternity</option>
                </select></div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1"><Label className="text-xs font-black uppercase text-muted-foreground">Start</Label><Input type="date" value={form.startDate} onChange={e => setForm({...form, startDate: e.target.value})} className="h-10" /></div>
                <div className="space-y-1"><Label className="text-xs font-black uppercase text-muted-foreground">End</Label><Input type="date" value={form.endDate} onChange={e => setForm({...form, endDate: e.target.value})} className="h-10" /></div>
              </div>
              <div className="space-y-1"><Label className="text-xs font-black uppercase text-muted-foreground">Reason</Label><Input value={form.reason} onChange={e => setForm({...form, reason: e.target.value})} className="h-10" /></div>
              <div className="flex gap-3 pt-2">
                <Button variant="outline" className="flex-1 rounded-xl font-bold" onClick={() => setShowRequest(false)}>Cancel</Button>
                <Button className="flex-1 rounded-xl font-bold bg-[#ff8903] text-white" onClick={handleRequest}>Submit</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}

