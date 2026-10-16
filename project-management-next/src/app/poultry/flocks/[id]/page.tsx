'use client'

import React, { useEffect, useState, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { db } from '@/lib/firebase'
import { usePoultryStore } from '@/stores/poultry-store'
import { poultryApi } from '@/features/poultry/api/poultryApi'
import { doc, onSnapshot } from 'firebase/firestore'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Loader2, ArrowLeft } from 'lucide-react'
import { toast } from 'sonner'
import type { PoultryFlock } from '@/stores/poultry-store'

function formatDate(dateVal: any): string {
  if (!dateVal) return '-'
  const d = dateVal.toDate ? dateVal.toDate() : new Date(dateVal)
  return d.toLocaleDateString()
}

function DailyLogModal({ open, flockId, onClose, onSaved }: { open: boolean; flockId: string; onClose: () => void; onSaved: () => void }) {
  const { inventory } = usePoultryStore()
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ date: new Date().toISOString().slice(0, 10), mortality: 0, feedItemId: '', feedConsumed: 0, notes: '' })
  const feedItems = useMemo(() => inventory.filter(i => i.type === 'FEED'), [inventory])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true)
    try {
      await poultryApi.createDailyLog({
        flockId,
        date: new Date(form.date),
        mortality: form.mortality,
        feedItemId: form.feedItemId || undefined,
        feedConsumed: form.feedItemId ? form.feedConsumed : 0,
        notes: form.notes,
        loggedBy: 'current-user',
      })
      toast.success('Daily log recorded')
      onSaved()
      onClose()
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Record Daily Log</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="grid gap-4">
          <div className="space-y-2"><Label>Date</Label><Input type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} required /></div>
          <div className="space-y-2"><Label>Mortality (Dead Birds)</Label><Input type="number" min={0} value={form.mortality} onChange={e => setForm(p => ({ ...p, mortality: Number(e.target.value) }))} className="text-red-600 font-bold" /></div>
          <div className="p-4 bg-muted/50 rounded-xl border space-y-3">
            <Label>Feed Consumed</Label>
            <select value={form.feedItemId} onChange={e => setForm(p => ({ ...p, feedItemId: e.target.value }))} className="w-full px-3 py-2 border rounded-lg bg-background text-sm">
              <option value="">Select Feed Type (Optional)</option>
              {feedItems.map(item => (<option key={item.id} value={item.id}>{item.itemName} ({item.quantity} {item.unit} left)</option>))}
            </select>
            {form.feedItemId && (<div className="space-y-1"><Label className="text-xs">Quantity Used</Label><Input type="number" min={0} step="0.1" value={form.feedConsumed} onChange={e => setForm(p => ({ ...p, feedConsumed: Number(e.target.value) }))} /></div>)}
          </div>
          <div className="space-y-2"><Label>Notes</Label><Textarea rows={2} value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} /></div>
          <DialogFooter><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save Log</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function RecordSaleModal({ open, flockId, maxQuantity, onClose, onSaved }: { open: boolean; flockId: string; maxQuantity: number; onClose: () => void; onSaved: () => void }) {
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ date: new Date().toISOString().slice(0, 10), quantitySold: 1, unitPrice: 0, totalWeight: undefined as number | undefined, buyerName: '' })
  const totalRevenue = (form.quantitySold || 0) * (form.unitPrice || 0)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true)
    try {
      await poultryApi.recordSale({
        flockId,
        date: new Date(form.date),
        quantitySold: form.quantitySold,
        totalWeight: form.totalWeight,
        unitPrice: form.unitPrice,
        totalRevenue,
        buyerName: form.buyerName,
        recordedBy: 'current-user',
      })
      toast.success('Sale recorded')
      onSaved()
      onClose()
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Record Sale</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="grid gap-4">
          <div className="space-y-2"><Label>Date</Label><Input type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} required /></div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2"><Label>Quantity Sold</Label><Input type="number" min={1} max={maxQuantity} value={form.quantitySold} onChange={e => setForm(p => ({ ...p, quantitySold: Number(e.target.value) }))} required className="font-bold" /></div>
            <div className="space-y-2"><Label>Unit Price ($)</Label><Input type="number" min={0} step="0.01" value={form.unitPrice} onChange={e => setForm(p => ({ ...p, unitPrice: Number(e.target.value) }))} required /></div>
          </div>
          <div className="space-y-2"><Label>Total Revenue</Label><div className="w-full px-4 py-3 bg-muted/50 rounded-xl border text-lg font-bold text-emerald-600">${totalRevenue.toFixed(2)}</div></div>
          <div className="space-y-2"><Label>Total Weight (kg) - Optional</Label><Input type="number" min={0} step="0.1" value={form.totalWeight ?? ''} onChange={e => setForm(p => ({ ...p, totalWeight: e.target.value ? Number(e.target.value) : undefined }))} /></div>
          <div className="space-y-2"><Label>Buyer Name *</Label><Input value={form.buyerName} onChange={e => setForm(p => ({ ...p, buyerName: e.target.value }))} required /></div>
          <DialogFooter><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" disabled={saving || form.quantitySold < 1}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Confirm Sale</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export default function FlockDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string
  const store = usePoultryStore()
  const { currentLogs, currentSales } = store
  const [flock, setFlock] = useState<PoultryFlock | null>(null)
  const [loadingFlock, setLoadingFlock] = useState(true)
  const [activeTab, setActiveTab] = useState('logs')
  const [showLogModal, setShowLogModal] = useState(false)
  const [showSaleModal, setShowSaleModal] = useState(false)

  const refreshData = async () => {
    const f = await poultryApi.getFlock(id)
    setFlock(f)
    if (f) await store.fetchFlockDetails(id)
  }

  useEffect(() => {
    if (!id) return
    store.fetchInventory()
    const unsub = onSnapshot(doc(db, 'poultryFlocks', id), snap => {
      if (snap.exists()) {
        setFlock({ id: snap.id, ...snap.data() } as PoultryFlock)
      }
      setLoadingFlock(false)
    })
    refreshData()
    return () => unsub()
  }, [id])

  const totalRevenue = useMemo(() => currentSales.reduce((s, sl) => s + (sl.totalRevenue || 0), 0), [currentSales])
  const totalFeed = useMemo(() => currentLogs.reduce((s, l) => s + (l.feedConsumed || 0), 0), [currentLogs])
  const isClosed = flock?.status === 'CLOSED'

  if (loadingFlock && !flock) return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-emerald-500" /></div>
  if (!flock) return <div className="py-12 text-center text-muted-foreground">Flock not found.</div>

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => router.push('/poultry')}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
      </div>

      <header className="flex flex-col md:flex-row md:justify-between md:items-start gap-4 mb-8">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-3xl font-bold">{flock.batchName}</h1>
            <Badge variant={flock.status === 'ACTIVE' ? 'default' : flock.status === 'ON_MARKET' ? 'secondary' : 'outline'}>{flock.status.replace('_', ' ')}</Badge>
          </div>
          <p className="text-muted-foreground">{flock.breed} - Started {formatDate(flock.startDate)}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          {!isClosed && (<Button variant="outline" onClick={() => setShowLogModal(true)}>Log Daily Data</Button>)}
          {!isClosed && (<Button onClick={() => setShowSaleModal(true)}>Record Sale</Button>)}
        </div>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground mb-1">Current Birds</p><p className="text-2xl font-bold">{flock.currentQuantity} <span className="text-sm font-normal text-muted-foreground">/ {flock.initialQuantity}</span></p></CardContent></Card>
        <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground mb-1">Survival Rate</p><p className="text-2xl font-bold text-emerald-600">{((flock.currentQuantity / flock.initialQuantity) * 100).toFixed(1)}%</p></CardContent></Card>
        <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground mb-1">Total Revenue</p><p className="text-2xl font-bold">${totalRevenue.toFixed(2)}</p></CardContent></Card>
        <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground mb-1">Total Feed Used</p><p className="text-2xl font-bold">{totalFeed.toFixed(1)} <span className="text-sm font-normal text-muted-foreground">units</span></p></CardContent></Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList><TabsTrigger value="logs">Daily Logs</TabsTrigger><TabsTrigger value="sales">Sales History</TabsTrigger><TabsTrigger value="financials">Financials</TabsTrigger></TabsList>

        <TabsContent value="logs" className="mt-4">
          <Card><CardContent className="p-0">
            <table className="w-full text-sm"><thead className="bg-muted/50"><tr><th className="text-left p-4 font-medium">Date</th><th className="text-right p-4 font-medium">Mortality</th><th className="text-right p-4 font-medium">Feed</th><th className="text-left p-4 font-medium">Notes</th></tr></thead><tbody>
              {currentLogs.length === 0 ? (<tr><td colSpan={4} className="text-center p-8 text-muted-foreground">No daily logs yet</td></tr>) : currentLogs.map(log => (<tr key={log.id} className="border-t hover:bg-muted/30"><td className="p-4">{formatDate(log.date)}</td><td className="p-4 text-right text-red-500">{log.mortality || 0}</td><td className="p-4 text-right">{log.feedConsumed || 0}</td><td className="p-4 text-muted-foreground max-w-[200px] truncate">{log.notes || '-'}</td></tr>))}
            </tbody></table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="sales" className="mt-4">
          <Card><CardContent className="p-0">
            <table className="w-full text-sm"><thead className="bg-muted/50"><tr><th className="text-left p-4 font-medium">Date</th><th className="text-left p-4 font-medium">Buyer</th><th className="text-right p-4 font-medium">Qty Sold</th><th className="text-right p-4 font-medium">Unit Price</th><th className="text-right p-4 font-medium">Revenue</th></tr></thead><tbody>
              {currentSales.length === 0 ? (<tr><td colSpan={5} className="text-center p-8 text-muted-foreground">No sales recorded yet</td></tr>) : currentSales.map(sale => (<tr key={sale.id} className="border-t hover:bg-muted/30"><td className="p-4">{formatDate(sale.date)}</td><td className="p-4">{sale.buyerName}</td><td className="p-4 text-right">{sale.quantitySold}</td><td className="p-4 text-right">${sale.unitPrice?.toFixed(2)}</td><td className="p-4 text-right font-medium text-emerald-600">${sale.totalRevenue?.toFixed(2)}</td></tr>))}
            </tbody></table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="financials" className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card><CardContent className="p-6">
              <h3 className="text-lg font-bold mb-4">Sales Revenue</h3>
              <div className="space-y-2">
                <div className="flex justify-between items-center py-2"><span className="text-muted-foreground">Bird Sales Revenue</span><span className="font-bold">${totalRevenue.toFixed(2)}</span></div>
                <div className="flex justify-between items-center py-2"><span className="text-muted-foreground">Purchase Investment ({flock.initialQuantity} birds @ ${(flock.unitCost || 0).toFixed(2)})</span><span className="font-bold text-red-600">-${(flock.initialQuantity * (flock.unitCost || 0)).toFixed(2)}</span></div>
              </div>
            </CardContent></Card>
            <Card><CardContent className="p-6">
              <h3 className="text-lg font-bold mb-4">Profit & Loss Summary</h3>
              <div className="space-y-2">
                <div className="flex justify-between items-center py-2"><span className="text-muted-foreground">Gross Revenue</span><span className="font-bold">${totalRevenue.toFixed(2)}</span></div>
                <div className="flex justify-between items-center py-2"><span className="text-muted-foreground">Initial Stock Cost</span><span className="font-bold text-red-600">-${(flock.initialQuantity * (flock.unitCost || 0)).toFixed(2)}</span></div>
                <div className="mt-4 pt-4 border-t flex justify-between items-center">
                  <span className="font-bold text-lg">Net Return (to date)</span>
                  <span className={`font-bold text-xl ${totalRevenue - (flock.initialQuantity * (flock.unitCost || 0)) >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    ${(totalRevenue - (flock.initialQuantity * (flock.unitCost || 0))).toFixed(2)}
                  </span>
                </div>
              </div>
            </CardContent></Card>
          </div>
        </TabsContent>
      </Tabs>

      <DailyLogModal open={showLogModal} flockId={flock.id} onClose={() => setShowLogModal(false)} onSaved={refreshData} />
      <RecordSaleModal open={showSaleModal} flockId={flock.id} maxQuantity={flock.currentQuantity} onClose={() => setShowSaleModal(false)} onSaved={refreshData} />
    </div>
  )
}
