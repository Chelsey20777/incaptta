/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Plus, Trash2, Check, Banknote, RotateCcw, X } from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import type { WorkflowActor } from '@/stores/hr-types'

const legacyStatuses = new Set(['Pending Approval', 'Unprocessed', 'Processed'])

export function AdvancesTab({ store, fmt, getEmpName }: any) {
  const auth = useAuthStore()
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ employeeId: '', amount: 0, reason: '', urgencyNotes: '', supportingDocumentUrl: '' })
  const isAdmin = auth.isSuperAdmin() || auth.hasRole('ADMIN' as any)
  const isAccountant = auth.getRoles().includes('ACCOUNTANT' as any)
  const isManager = auth.getRoles().includes('MANAGER' as any) || auth.getRoles().includes('DIRECTOR' as any)
  const isFinance = isAccountant || isManager || isAdmin
  const actor: WorkflowActor = { uid: auth.user?.uid || 'unknown', name: auth.user?.displayName || auth.profile?.name || auth.user?.email || 'Finance user', email: auth.user?.email || '' }

  const reject = async (id: string) => { const reason = prompt('Reason for rejection?'); if (reason?.trim()) await store.rejectSalaryAdvance(id, reason, actor) }
  const disburse = async (id: string) => { const reference = prompt('Payment reference (required)?'); if (reference?.trim()) await store.disburseSalaryAdvance(id, reference, actor) }
  const reverse = async (id: string) => { const reason = prompt('Reversal reason? Confirm that the funds were returned to the Salaries account.'); if (reason?.trim()) await store.reverseSalaryAdvance(id, reason, actor) }

  return (<div className="space-y-4">
    <div className="flex justify-between items-center"><div><h3 className="text-xs font-black uppercase text-muted-foreground">Salary Advances</h3><p className="text-[10px] text-muted-foreground">Accountant verification → manager approval → separate Salaries-wallet payment</p></div>{isFinance && <Button size="sm" className="bg-[#ff8903] text-white font-bold text-xs" onClick={() => { setForm({ employeeId: '', amount: 0, reason: '', urgencyNotes: '', supportingDocumentUrl: '' }); setShowAdd(true) }}><Plus className="size-3" /> Request</Button>}</div>
    {store.salaryAdvances.map((a: any) => { const legacy = legacyStatuses.has(a.status); const outstanding = Number(a.outstandingBalance ?? (a.status === 'Unprocessed' ? a.amount : 0)); return <Card key={a.id} className="border shadow-sm"><CardContent className="p-3 space-y-2">
      <div className="flex items-start justify-between gap-3"><div><p className="text-sm font-bold">{a.employeeName || 'Legacy record — employee name missing'}</p><p className="text-[10px] text-muted-foreground">{fmt(a.originalAmount || a.amount)} {a.reason && `— ${a.reason}`}</p>{a.status === 'ACTIVE' && <p className="text-[10px] font-bold text-blue-600">Outstanding {fmt(outstanding)} · Recovered {fmt(a.recoveredAmount || 0)}</p>}</div><Badge variant="outline" className="text-[9px] font-bold">{legacy ? `LEGACY: ${a.status}` : a.status.replaceAll('_', ' ')}</Badge></div>
      {store.salaryAdvanceRecoveries.filter((r: any) => r.advanceId === a.id && r.status === 'RECOVERED').length > 0 && <div className="rounded-lg bg-muted/30 p-2 text-[9px] text-muted-foreground">{store.salaryAdvanceRecoveries.filter((r: any) => r.advanceId === a.id && r.status === 'RECOVERED').map((r: any) => <span key={r.id} className="mr-3">{r.month}/{r.year}: {fmt(r.amount)} recovered</span>)}</div>}
      {legacy && <p className="text-[10px] text-amber-600">Frozen pending migration review; no financial action is available.</p>}
      {!legacy && <div className="flex flex-wrap justify-end gap-1">
        {a.status === 'PENDING_ACCOUNTANT' && isAccountant && <Button size="sm" className="h-7 text-[10px]" onClick={() => store.verifySalaryAdvance(a.id, actor)}><Check className="size-3 mr-1" />Verify</Button>}
        {a.status === 'PENDING_MANAGER' && isManager && <Button size="sm" className="h-7 text-[10px]" onClick={() => store.approveSalaryAdvance(a.id, actor)}><Check className="size-3 mr-1" />Approve</Button>}
        {a.status === 'APPROVED_FOR_PAYMENT' && isFinance && <Button size="sm" className="h-7 text-[10px] bg-emerald-600" onClick={() => disburse(a.id)}><Banknote className="size-3 mr-1" />Pay</Button>}
        {['PENDING_ACCOUNTANT','PENDING_MANAGER','APPROVED_FOR_PAYMENT'].includes(a.status) && isFinance && <Button size="sm" variant="outline" className="h-7 text-[10px] text-red-500" onClick={() => reject(a.id)}><X className="size-3 mr-1" />Reject</Button>}
        {a.status === 'ACTIVE' && Number(a.recoveredAmount || 0) === 0 && isManager && <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => reverse(a.id)}><RotateCcw className="size-3 mr-1" />Reverse</Button>}
        {['PENDING_ACCOUNTANT','REJECTED'].includes(a.status) && isAdmin && <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-500" onClick={() => { if (confirm('Delete this unissued record?')) store.deleteSalaryAdvance(a.id) }}><Trash2 className="size-3" /></Button>}
      </div>}
    </CardContent></Card> })}
    {showAdd && (<div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"><Card className="w-full max-w-md bg-card border shadow-2xl rounded-3xl"><CardHeader className="pb-3"><CardTitle className="text-lg font-black">Request Salary Advance</CardTitle></CardHeader><CardContent className="space-y-3">
      <div className="space-y-1"><Label className="text-xs font-black uppercase text-muted-foreground">Employee</Label><select value={form.employeeId} onChange={e => setForm({...form, employeeId: e.target.value})} className="w-full h-10 px-3 rounded-xl border bg-background text-sm"><option value="">Select</option>{store.employees.map((e: any) => <option key={e.id} value={e.id}>{getEmpName(e)}</option>)}</select></div>
      <div className="space-y-1"><Label className="text-xs font-black uppercase text-muted-foreground">Amount</Label><Input type="number" min="0.01" step="0.01" value={form.amount} onChange={e => setForm({...form, amount: Number(e.target.value)})} /></div>
      <div className="space-y-1"><Label className="text-xs font-black uppercase text-muted-foreground">Reason</Label><Input value={form.reason} onChange={e => setForm({...form, reason: e.target.value})} /></div>
      <div className="space-y-1"><Label className="text-xs font-black uppercase text-muted-foreground">Urgency notes</Label><Input value={form.urgencyNotes} onChange={e => setForm({...form, urgencyNotes: e.target.value})} /></div>
      <div className="space-y-1"><Label className="text-xs font-black uppercase text-muted-foreground">Supporting document URL (optional)</Label><Input type="url" value={form.supportingDocumentUrl} onChange={e => setForm({...form, supportingDocumentUrl: e.target.value})} /></div>
      <div className="flex gap-3 pt-2"><Button variant="outline" className="flex-1" onClick={() => setShowAdd(false)}>Cancel</Button><Button disabled={store.isSubmitting || !form.employeeId || form.amount <= 0} className="flex-1 bg-[#ff8903] text-white" onClick={async () => { await store.addSalaryAdvance(form, actor); setShowAdd(false) }}>Submit</Button></div>
    </CardContent></Card></div>)}
  </div>)
}
