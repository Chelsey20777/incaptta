import React, { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Users, User, Calendar, Wallet, ClipboardList, Briefcase, Landmark, AlertTriangle, Plus, Trash2, Check, X, FileText, Percent, DollarSign, Phone, Mail, Building2, ShieldCheck, ShieldAlert, Clock, CheckCircle2, XCircle, Edit3, Search } from 'lucide-react'
import { toast } from 'sonner'

// ─── PERFORMANCE TAB ────────────────────────────────────────────────────────
export function PerformanceTab({ store, fmt, getEmpName }: any) {
  const [showAddKpi, setShowAddKpi] = useState(false)
  const [showReview, setShowReview] = useState<any>(null)
  const [kpiForm, setKpiForm] = useState({ employeeId: '', name: '', targetValue: 100, weight: 20, period: 'Monthly' })
  const [reviewForm, setReviewForm] = useState({ employeeId: '', period: '' })

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Button size="sm" className="bg-[#ff8903] text-white font-bold text-xs" onClick={() => setShowAddKpi(true)}><Plus className="size-3" /> Add KPI</Button>
        <Button size="sm" variant="outline" className="text-xs font-bold" onClick={async () => {
          if (!reviewForm.employeeId || !reviewForm.period) { toast.error('Select employee and period'); return }
          await store.generateReview(reviewForm.employeeId, reviewForm.period)
        }}>Generate Review</Button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <select value={reviewForm.employeeId} onChange={e => setReviewForm({...reviewForm, employeeId: e.target.value})} className="h-9 px-2 rounded-xl border bg-background text-xs font-bold">
          <option value="">Select employee</option>
          {store.employees.map((e: any) => <option key={e.id} value={e.id}>{getEmpName(e)}</option>)}
        </select>
        <select value={reviewForm.period} onChange={e => setReviewForm({...reviewForm, period: e.target.value})} className="h-9 px-2 rounded-xl border bg-background text-xs font-bold">
          <option value="">Period</option>
          {['Monthly','Quarterly','Annual'].map(p => <option key={p}>{p}</option>)}
        </select>
      </div>

      {store.kpis.map((k: any) => (
        <Card key={k.id} className="border shadow-sm"><CardContent className="p-3">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-sm font-bold">{k.name}</p>
              <p className="text-[10px] text-muted-foreground">{getEmpName(store.employees.find((e: any) => e.id === k.employeeId))} | Target: {k.targetValue} | Weight: {k.weight}%</p>
            </div>
            <Badge variant="outline" className="text-[9px]">{k.period}</Badge>
          </div>
        </CardContent></Card>
      ))}

      {store.reviews.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-black uppercase text-muted-foreground pt-2">Reviews</h3>
          {store.reviews.map((r: any) => (
            <Card key={r.id} className="border shadow-sm cursor-pointer" onClick={() => setShowReview(r)}><CardContent className="p-3">
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-sm font-bold">{getEmpName(store.employees.find((e: any) => e.id === r.employeeId))}</p>
                  <p className="text-[10px] text-muted-foreground">{r.period} | Score: {r.overallScore.toFixed(1)}%</p>
                </div>
                <Badge className={`text-[9px] font-bold ${r.rating === 'Excellent' ? 'bg-green-500/20 text-green-600' : r.rating === 'Good' ? 'bg-blue-500/20 text-blue-600' : 'bg-amber-500/20 text-amber-600'}`}>{r.rating}</Badge>
              </div>
            </CardContent></Card>
          ))}
        </div>
      )}

      {showAddKpi && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <Card className="w-full max-w-md bg-card border shadow-2xl rounded-3xl">
            <CardHeader className="pb-3"><CardTitle className="text-lg font-black">Add KPI</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1"><Label className="text-xs font-black uppercase text-muted-foreground">Employee</Label>
                <select value={kpiForm.employeeId} onChange={e => setKpiForm({...kpiForm, employeeId: e.target.value})} className="w-full h-10 px-3 rounded-xl border bg-background text-sm">
                  <option value="">Select</option>
                  {store.employees.map((e: any) => <option key={e.id} value={e.id}>{getEmpName(e)}</option>)}
                </select></div>
              <div className="space-y-1"><Label className="text-xs font-black uppercase text-muted-foreground">KPI Name</Label><Input value={kpiForm.name} onChange={e => setKpiForm({...kpiForm, name: e.target.value})} className="h-10" /></div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1"><Label className="text-xs font-black uppercase text-muted-foreground">Target Value</Label><Input type="number" value={kpiForm.targetValue} onChange={e => setKpiForm({...kpiForm, targetValue: Number(e.target.value)})} className="h-10" /></div>
                <div className="space-y-1"><Label className="text-xs font-black uppercase text-muted-foreground">Weight %</Label><Input type="number" value={kpiForm.weight} onChange={e => setKpiForm({...kpiForm, weight: Number(e.target.value)})} className="h-10" /></div>
              </div>
              <div className="space-y-1"><Label className="text-xs font-black uppercase text-muted-foreground">Period</Label>
                <select value={kpiForm.period} onChange={e => setKpiForm({...kpiForm, period: e.target.value})} className="w-full h-10 px-3 rounded-xl border bg-background text-sm">
                  <option>Monthly</option><option>Quarterly</option><option>Annual</option>
                </select></div>
              <div className="flex gap-3 pt-2">
                <Button variant="outline" className="flex-1 rounded-xl font-bold" onClick={() => setShowAddKpi(false)}>Cancel</Button>
                <Button className="flex-1 rounded-xl font-bold bg-[#ff8903] text-white" onClick={async () => { await store.addKpi(kpiForm); setShowAddKpi(false) }}>Add</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {showReview && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <Card className="w-full max-w-lg bg-card border shadow-2xl rounded-3xl max-h-[80vh] overflow-y-auto">
            <CardHeader className="pb-3"><CardTitle className="text-lg font-black">Review Detail</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm font-bold">{getEmpName(store.employees.find((e: any) => e.id === showReview.employeeId))}</p>
              <p className="text-xs text-muted-foreground">Period: {showReview.period} | Overall: {showReview.overallScore.toFixed(1)}% | Rating: <Badge className="text-[9px] font-bold">{showReview.rating}</Badge></p>
              {showReview.kpiScores?.map((s: any, i: number) => (
                <div key={i} className="p-2 bg-muted/30 rounded-xl text-xs flex justify-between">
                  <span>{s.kpiName}</span><span className="font-bold">Weight: {s.weight}%</span>
                </div>
              ))}
              <Button variant="outline" className="w-full rounded-xl font-bold" onClick={() => setShowReview(null)}>Close</Button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}

