'use client'

import React, { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { db } from '@/lib/firebase'
import { usePoultryStore } from '@/stores/poultry-store'
import { poultryApi } from '@/features/poultry/api/poultryApi'
import { collection, getDocs, query, where } from 'firebase/firestore'
import { differenceInDays } from 'date-fns'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { Plus, Bird, Activity, Bell, Package, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

function getFlockAge(startDate: any): number {
  if (!startDate) return 0
  const start = startDate?.toDate ? startDate.toDate() : new Date(startDate)
  return differenceInDays(new Date(), start)
}

function getDaysToHarvest(harvestDate: any): number {
  if (!harvestDate) return 0
  const end = harvestDate?.toDate ? harvestDate.toDate() : new Date(harvestDate)
  return differenceInDays(end, new Date())
}

function CreateFlockModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [employees, setEmployees] = useState<any[]>([])
  const [form, setForm] = useState({
    batchName: '', breed: '', initialQuantity: 1000,
    startDate: new Date().toISOString().slice(0, 10),
    estimatedHarvestDate: new Date(Date.now() + 42 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    assignedStaffIds: [] as string[], unitCost: 0, status: 'ACTIVE' as const,
  })

  useEffect(() => {
    if (open) {
      (async () => {
        const q = query(collection(db, 'employees'), where('status', '==', 'Active'))
        const snap = await getDocs(q)
        setEmployees(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      })()
    }
  }, [open])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setIsSubmitting(true)
    try {
      await poultryApi.createFlock({
        ...form,
        currentQuantity: form.initialQuantity,
        startDate: new Date(form.startDate),
        estimatedHarvestDate: new Date(form.estimatedHarvestDate),
      })
      toast.success('Flock created successfully')
      onSaved(); onClose()
    } catch (err: any) {
      toast.error(err.message || 'Failed to create flock')
    } finally { setIsSubmitting(false) }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Start New Flock</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="grid gap-4">
          <div className="space-y-2">
            <Label>Batch Name *</Label>
            <Input value={form.batchName} onChange={e => setForm(p => ({ ...p, batchName: e.target.value }))} placeholder="e.g., Batch 2024-A" required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Breed *</Label>
              <Input value={form.breed} onChange={e => setForm(p => ({ ...p, breed: e.target.value }))} placeholder="e.g., Ross 308" required />
            </div>
            <div className="space-y-2">
              <Label>Initial Quantity *</Label>
              <Input type="number" min={1} value={form.initialQuantity} onChange={e => setForm(p => ({ ...p, initialQuantity: Number(e.target.value) }))} required />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Start Date *</Label>
              <Input type="date" value={form.startDate} onChange={e => setForm(p => ({ ...p, startDate: e.target.value }))} required />
            </div>
            <div className="space-y-2">
              <Label>Bird Cost ($) *</Label>
              <Input type="number" step="0.01" min={0} value={form.unitCost} onChange={e => setForm(p => ({ ...p, unitCost: Number(e.target.value) }))} required placeholder="0.00" />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Estimated Harvest *</Label>
            <Input type="date" value={form.estimatedHarvestDate} onChange={e => setForm(p => ({ ...p, estimatedHarvestDate: e.target.value }))} required />
          </div>
          <div className="space-y-2">
            <Label>Assign Staff</Label>
            <div className="max-h-40 overflow-y-auto border rounded-lg p-2 space-y-1 bg-muted/30">
              {employees.length === 0 && <p className="text-xs text-muted-foreground text-center py-2 italic">No active employees found.</p>}
              {employees.map(staff => (
                <label key={staff.id} className="flex items-center gap-2 hover:bg-background p-1 rounded cursor-pointer text-sm">
                  <input type="checkbox" checked={form.assignedStaffIds.includes(staff.id)}
                    onChange={() => setForm(p => ({ ...p, assignedStaffIds: p.assignedStaffIds.includes(staff.id) ? p.assignedStaffIds.filter(s => s !== staff.id) : [...p.assignedStaffIds, staff.id] }))}
                    className="rounded border-gray-300 text-emerald-600" />
                  {staff.fullName}
                </label>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={isSubmitting}>{isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Create Flock</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export default function PoultryPage() {
  const router = useRouter()
  const store = usePoultryStore()
  const { flocks, inventory, isLoading } = store
  const [showCreateFlock, setShowCreateFlock] = useState(false)

  useEffect(() => {
    store.fetchFlocks()
    store.fetchInventory()
    return () => store.cleanupListeners()
  }, [])

  const activeFlocks = useMemo(() => store.activeFlocks(), [flocks])
  const totalBirds = useMemo(() => activeFlocks.reduce((s, f) => s + (f.currentQuantity || 0), 0), [activeFlocks])
  
  const alerts = useMemo(() => {
    const a: { id: string; message: string }[] = []
    inventory.forEach(i => {
      if (i.quantity <= i.minStockLevel) {
        a.push({ id: `inv-${i.id}`, message: `${i.itemName} low: ${i.quantity} ${i.unit}` })
      }
    })
    activeFlocks.forEach(f => {
      const d = getDaysToHarvest(f.estimatedHarvestDate)
      if (d <= 7 && f.status !== 'ON_MARKET') {
        a.push({ id: `harv-${f.id}`, message: `${f.batchName} harvest in ${d}d` })
      }
    })
    return a
  }, [inventory, activeFlocks])

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8">
      <header className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Pekka Poultry</h1>
          <p className="text-muted-foreground mt-1">Farm Management Dashboard</p>
        </div>
        <div className="flex gap-3">
          <Link href="/poultry/inventory">
            <Button variant="outline">
              <Package className="mr-2 h-4 w-4" />Inventory
            </Button>
          </Link>
          <Button onClick={() => setShowCreateFlock(true)}>
            <Plus className="mr-2 h-4 w-4" />New Flock
          </Button>
        </div>
      </header>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Flocks</CardTitle>
            <Bird className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {isLoading ? <Skeleton className="h-8 w-12" /> : activeFlocks.length}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Birds</CardTitle>
            <Activity className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {isLoading ? <Skeleton className="h-8 w-16" /> : totalBirds.toLocaleString()}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-amber-50 dark:bg-amber-900/20 border-amber-100">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-amber-700 dark:text-amber-400">Alerts</CardTitle>
            <Bell className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-900 dark:text-amber-300">{alerts.length}</div>
            {alerts.slice(0, 2).map(a => (
              <p key={a.id} className="text-xs text-amber-800 dark:text-amber-200 mt-1 truncate">
                {a.message}
              </p>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Current Batches Grid */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Current Batches</h2>
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map(i => (
              <Card key={i}>
                <CardContent className="p-6">
                  <Skeleton className="h-4 w-3/4 mb-2" />
                  <Skeleton className="h-3 w-1/2" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : activeFlocks.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-muted-foreground">
              No active flocks. Create one to get started.
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {activeFlocks.map(flock => (
              <Card key={flock.id} className="cursor-pointer hover:shadow-md transition-all" onClick={() => router.push(`/poultry/flocks/${flock.id}`)}>
                <CardContent className="p-5 space-y-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-semibold">{flock.batchName}</h3>
                      <p className="text-xs text-muted-foreground">{flock.breed}</p>
                    </div>
                    <Badge variant={flock.status === 'ACTIVE' ? 'default' : 'secondary'}>
                      {flock.status.replace('_', ' ')}
                    </Badge>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Age</span>
                    <span className="text-emerald-600 font-semibold">{getFlockAge(flock.startDate)}d</span>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Survival</span>
                      <span className="font-medium">{((flock.currentQuantity / flock.initialQuantity) * 100).toFixed(1)}%</span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                      <div className="bg-emerald-500 h-2 rounded-full" style={{ width: `${(flock.currentQuantity / flock.initialQuantity) * 100}%` }} />
                    </div>
                    <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                      <div>
                        <p className="text-xs text-muted-foreground">Current Birds</p>
                        <p className="font-semibold">{flock.currentQuantity}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Harvest In</p>
                        <p className="font-semibold text-amber-600">{getDaysToHarvest(flock.estimatedHarvestDate)} days</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <CreateFlockModal open={showCreateFlock} onClose={() => setShowCreateFlock(false)} onSaved={() => store.fetchFlocks()} />
    </div>
  )
}
