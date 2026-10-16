'use client'

import React, { useEffect, useState, useMemo } from 'react'
import { useCommissionsStore } from '@/stores/commissions-store'
import { useAuthStore } from '@/stores/auth-store'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { DollarSign, Plus, Search, CheckCircle, XCircle, Banknote, Users, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

export default function CommissionsPage() {
  const { user: authUser } = useAuthStore()
  const { commissions, payouts, fetchCommissions, fetchPayouts, addCommission, updateCommissionStatus, addPayout, cleanup, loadingCommissions } = useCommissionsStore()
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [isPayoutOpen, setIsPayoutOpen] = useState(false)
  const [selectedCommissionId, setSelectedCommissionId] = useState('')
  const [saving, setSaving] = useState(false)
  const [formData, setFormData] = useState({ referrerName: '', referredClient: '', projectType: '', commissionAmount: 0, commissionRate: 0 })
  const [payoutForm, setPayoutForm] = useState({ referrerName: '', amount: 0, paymentMethod: 'BANK', reference: '', notes: '' })

  useEffect(() => {
    const unsubCom = fetchCommissions()
    fetchPayouts()
    return () => { unsubCom(); cleanup() }
  }, [])

  const filtered = useMemo(() => {
    let r = commissions
    if (searchQuery) { const q = searchQuery.toLowerCase(); r = r.filter(c => c.referrerName?.toLowerCase().includes(q) || c.referredClient?.toLowerCase().includes(q)) }
    if (statusFilter !== 'ALL') r = r.filter(c => c.status === statusFilter)
    return r
  }, [commissions, searchQuery, statusFilter])

  const stats = {
    total: commissions.length,
    pending: commissions.filter(c => c.status === 'PENDING').reduce((s, c) => s + c.commissionAmount, 0),
    approved: commissions.filter(c => c.status === 'APPROVED').reduce((s, c) => s + c.commissionAmount, 0),
    paid: commissions.filter(c => c.status === 'PAID').reduce((s, c) => s + c.commissionAmount, 0),
    totalPayouts: payouts.reduce((s, p) => s + p.amount, 0),
  }

  const statusBadge = (status: string) => {
    const v: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = { PENDING: 'secondary', APPROVED: 'default', PAID: 'outline', CANCELLED: 'destructive' }
    return <Badge variant={v[status] || 'secondary'}>{status}</Badge>
  }

  const handleCreate = async () => {
    if (!formData.referrerName || !formData.referredClient) { toast.error('Referrer and client are required'); return }
    setSaving(true)
    try {
      await addCommission({ ...formData, referrerId: authUser?.uid || '', referredClientId: '', status: 'PENDING', paidDate: null, paidBy: '', notes: '', createdBy: authUser?.uid || '' })
      toast.success('Commission created'); setIsCreateOpen(false)
      setFormData({ referrerName: '', referredClient: '', projectType: '', commissionAmount: 0, commissionRate: 0 })
    } catch (err: any) { toast.error(err.message) } finally { setSaving(false) }
  }

  const handlePayout = async () => {
    if (!payoutForm.amount || !payoutForm.referrerName) { toast.error('Amount and referrer required'); return }
    setSaving(true)
    try {
      await addPayout({ ...payoutForm, referrerId: authUser?.uid || '', payoutDate: new Date().toISOString(), createdBy: authUser?.uid || '' })
      toast.success('Payout recorded'); setIsPayoutOpen(false)
      setPayoutForm({ referrerName: '', amount: 0, paymentMethod: 'BANK', reference: '', notes: '' })
    } catch (err: any) { toast.error(err.message) } finally { setSaving(false) }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h2 className="text-3xl font-bold tracking-tight">Referral Commissions</h2><p className="text-muted-foreground">Manage commissions, payouts, and agent referrals</p></div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setIsPayoutOpen(true)}><Banknote className="mr-2 h-4 w-4" />Record Payout</Button>
          <Button onClick={() => setIsCreateOpen(true)}><Plus className="mr-2 h-4 w-4" />New Commission</Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-5">
        <Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Total</CardTitle><DollarSign className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><div className="text-2xl font-bold">{loadingCommissions ? <Skeleton className="h-8 w-16" /> : commissions.length}</div></CardContent></Card>
        <Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Pending</CardTitle><DollarSign className="h-4 w-4 text-amber-500" /></CardHeader><CardContent><div className="text-2xl font-bold text-amber-500">${stats.pending.toLocaleString()}</div></CardContent></Card>
        <Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Approved</CardTitle><CheckCircle className="h-4 w-4 text-blue-500" /></CardHeader><CardContent><div className="text-2xl font-bold text-blue-500">${stats.approved.toLocaleString()}</div></CardContent></Card>
        <Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Paid</CardTitle><Banknote className="h-4 w-4 text-emerald-500" /></CardHeader><CardContent><div className="text-2xl font-bold text-emerald-500">${stats.paid.toLocaleString()}</div></CardContent></Card>
        <Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Payouts</CardTitle><Users className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><div className="text-2xl font-bold">${stats.totalPayouts.toLocaleString()}</div></CardContent></Card>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative flex-1"><Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" /><Input placeholder="Search by referrer or client..." className="pl-8" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} /></div>
        <Select value={statusFilter} onValueChange={(v) => v && setStatusFilter(v)}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All</SelectItem>
            <SelectItem value="PENDING">Pending</SelectItem>
            <SelectItem value="APPROVED">Approved</SelectItem>
            <SelectItem value="PAID">Paid</SelectItem>
            <SelectItem value="CANCELLED">Cancelled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card><CardContent className="p-0">
        <table className="w-full">
          <thead><tr className="border-b">
            <th className="text-left p-3 text-sm font-medium">Referrer</th>
            <th className="text-left p-3 text-sm font-medium">Client</th>
            <th className="text-left p-3 text-sm font-medium">Project</th>
            <th className="text-right p-3 text-sm font-medium">Amount</th>
            <th className="text-center p-3 text-sm font-medium">Rate</th>
            <th className="text-center p-3 text-sm font-medium">Status</th>
            <th className="text-center p-3 text-sm font-medium">Date</th>
            <th className="text-right p-3 text-sm font-medium">Actions</th>
          </tr></thead>
          <tbody>
            {filtered.length === 0 ? <tr><td colSpan={8} className="text-center p-8 text-muted-foreground">No commissions found</td></tr>
            : filtered.map(c => (
              <tr key={c.id} className="border-b hover:bg-muted/50">
                <td className="p-3 text-sm font-medium">{c.referrerName}</td>
                <td className="p-3 text-sm">{c.referredClient}</td>
                <td className="p-3 text-sm">{c.projectType || '-'}</td>
                <td className="p-3 text-sm text-right font-mono">${c.commissionAmount.toLocaleString()}</td>
                <td className="p-3 text-sm text-center">{c.commissionRate}%</td>
                <td className="p-3 text-center">{statusBadge(c.status)}</td>
                <td className="p-3 text-sm text-center text-muted-foreground">{c.createdAt?.toDate?.()?.toLocaleDateString() || '-'}</td>
                <td className="p-3 text-right"><div className="flex justify-end gap-1">
                  {c.status === 'PENDING' && <Button variant="ghost" size="sm" className="text-emerald-500" onClick={async () => { try { await updateCommissionStatus(c.id, 'APPROVED'); toast.success('Approved') } catch (err: any) { toast.error(err.message) } }}><CheckCircle className="h-4 w-4" /></Button>}
                  {c.status === 'APPROVED' && <Button variant="ghost" size="sm" className="text-emerald-500" onClick={async () => { try { await updateCommissionStatus(c.id, 'PAID', authUser?.displayName || authUser?.email || 'System'); toast.success('Marked paid') } catch (err: any) { toast.error(err.message) } }}><Banknote className="h-4 w-4" /></Button>}
                  {(c.status === 'PENDING' || c.status === 'APPROVED') && <Button variant="ghost" size="sm" className="text-red-500" onClick={async () => { try { await updateCommissionStatus(c.id, 'CANCELLED'); toast.success('Cancelled') } catch (err: any) { toast.error(err.message) } }}><XCircle className="h-4 w-4" /></Button>}
                </div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent></Card>

      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent><DialogHeader><DialogTitle>New Commission</DialogTitle></DialogHeader>
          <div className="grid gap-4">
            <div className="space-y-2"><Label>Referrer Name *</Label><Input value={formData.referrerName} onChange={(e) => setFormData(p => ({ ...p, referrerName: e.target.value }))} /></div>
            <div className="space-y-2"><Label>Referred Client *</Label><Input value={formData.referredClient} onChange={(e) => setFormData(p => ({ ...p, referredClient: e.target.value }))} /></div>
            <div className="space-y-2"><Label>Project Type</Label><Input value={formData.projectType} onChange={(e) => setFormData(p => ({ ...p, projectType: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Commission Amount ($)</Label><Input type="number" value={formData.commissionAmount} onChange={(e) => setFormData(p => ({ ...p, commissionAmount: Number(e.target.value) }))} /></div>
              <div className="space-y-2"><Label>Commission Rate (%)</Label><Input type="number" step="0.1" value={formData.commissionRate} onChange={(e) => setFormData(p => ({ ...p, commissionRate: Number(e.target.value) }))} /></div>
            </div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setIsCreateOpen(false)}>Cancel</Button><Button onClick={handleCreate} disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Create</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isPayoutOpen} onOpenChange={setIsPayoutOpen}>
        <DialogContent><DialogHeader><DialogTitle>Record Payout</DialogTitle></DialogHeader>
          <div className="grid gap-4">
            <div className="space-y-2"><Label>Referrer Name</Label><Input value={payoutForm.referrerName} onChange={(e) => setPayoutForm(p => ({ ...p, referrerName: e.target.value }))} /></div>
            <div className="space-y-2"><Label>Amount ($) *</Label><Input type="number" value={payoutForm.amount} onChange={(e) => setPayoutForm(p => ({ ...p, amount: Number(e.target.value) }))} /></div>
            <div className="space-y-2"><Label>Payment Method</Label>
              <Select value={payoutForm.paymentMethod} onValueChange={(v) => v && setPayoutForm(p => ({ ...p, paymentMethod: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="BANK">Bank</SelectItem><SelectItem value="CASH">Cash</SelectItem><SelectItem value="ECOCASH">EcoCash</SelectItem><SelectItem value="MOBILE">Mobile Money</SelectItem></SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>Reference</Label><Input value={payoutForm.reference} onChange={(e) => setPayoutForm(p => ({ ...p, reference: e.target.value }))} /></div>
            <div className="space-y-2"><Label>Notes</Label><Textarea value={payoutForm.notes} onChange={(e) => setPayoutForm(p => ({ ...p, notes: e.target.value }))} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setIsPayoutOpen(false)}>Cancel</Button><Button onClick={handlePayout} disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Record</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}