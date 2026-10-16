'use client'

import React, { useEffect, useState, useMemo } from 'react'
import { useToolsStore } from '@/stores/tools-store'
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
import { Wrench, Plus, Search, Loader2, CheckCircle, AlertTriangle, Hammer, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'

const STATUS_COLORS: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  ACTIVE: 'default', IN_USE: 'default', DAMAGED: 'destructive', REPAIR: 'secondary', RETIRED: 'outline'
}

export default function ToolsPage() {
  const { user: authUser } = useAuthStore()
  const { tools, checkouts, repairs, fetchTools, addTool, updateTool, deleteTool, fetchCheckouts, addCheckout, returnTool, fetchRepairs, addRepair, updateRepairStatus, cleanup, loadingTools } = useToolsStore()
  const [activeTab, setActiveTab] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [isToolDialogOpen, setIsToolDialogOpen] = useState(false)
  const [isCheckoutDialogOpen, setIsCheckoutDialogOpen] = useState(false)
  const [isRepairDialogOpen, setIsRepairDialogOpen] = useState(false)
  const [isReturnDialogOpen, setIsReturnDialogOpen] = useState(false)
  const [selectedToolId, setSelectedToolId] = useState('')
  const [saving, setSaving] = useState(false)
  const [toolForm, setToolForm] = useState({ name: '', brand: '', model: '', serialNumber: '', category: '', location: '', purchasePrice: 0, notes: '' })
  const [checkoutForm, setCheckoutForm] = useState({ toolName: '', assignedTo: '', assignedByName: '', site: '', checkoutDate: new Date().toISOString().slice(0, 10), expectedReturnDate: '', conditionOnCheckout: 'GOOD', notes: '' })
  const [repairForm, setRepairForm] = useState({ description: '', repairCost: 0, repairVendor: '', repairDate: new Date().toISOString().slice(0, 10), notes: '' })
  const [returnForm, setReturnForm] = useState({ actualReturnDate: new Date().toISOString().slice(0, 10), conditionOnReturn: 'GOOD', notes: '' })
  const [selectedCheckoutId, setSelectedCheckoutId] = useState('')

  useEffect(() => {
    const unsub = fetchTools()
    fetchCheckouts()
    fetchRepairs()
    return () => { unsub(); cleanup() }
  }, [])

  const filteredTools = useMemo(() => {
    let r = tools
    if (searchQuery) { const q = searchQuery.toLowerCase(); r = r.filter(t => t.name.toLowerCase().includes(q) || t.brand?.toLowerCase().includes(q) || t.toolId?.toLowerCase().includes(q)) }
    if (activeTab === 'inUse') r = r.filter(t => t.status === 'IN_USE')
    else if (activeTab === 'repair') r = r.filter(t => t.status === 'REPAIR' || t.status === 'DAMAGED')
    return r
  }, [tools, searchQuery, activeTab])

  const activeCheckouts = checkouts.filter(c => !c.actualReturnDate)
  const availableTools = tools.filter(t => t.status === 'ACTIVE')

  const handleAddTool = async () => {
    if (!toolForm.name) { toast.error('Tool name required'); return }
    setSaving(true)
    try {
      const toolId = `TL-${String(tools.length + 1).padStart(4, '0')}`
      await addTool({ ...toolForm, toolId, status: 'ACTIVE', purchaseDate: '', currentValue: toolForm.purchasePrice, createdBy: authUser?.uid || '' })
      toast.success('Tool added'); setIsToolDialogOpen(false)
      setToolForm({ name: '', brand: '', model: '', serialNumber: '', category: '', location: '', purchasePrice: 0, notes: '' })
    } catch (err: any) { toast.error(err.message) } finally { setSaving(false) }
  }

  const handleCheckout = async () => {
    if (!checkoutForm.assignedTo || !selectedToolId) { toast.error('Assignee and tool are required'); return }
    setSaving(true)
    try {
      const tool = tools.find(t => t.id === selectedToolId)
      await addCheckout({ ...checkoutForm, toolId: selectedToolId, toolName: tool?.name || '', createdBy: authUser?.uid || '' })
      toast.success('Tool checked out'); setIsCheckoutDialogOpen(false)
      setCheckoutForm({ toolName: '', assignedTo: '', assignedByName: '', site: '', checkoutDate: new Date().toISOString().slice(0, 10), expectedReturnDate: '', conditionOnCheckout: 'GOOD', notes: '' })
    } catch (err: any) { toast.error(err.message) } finally { setSaving(false) }
  }

  const handleReturn = async () => {
    if (!selectedCheckoutId) return
    setSaving(true)
    try {
      await returnTool(selectedCheckoutId, returnForm.actualReturnDate, returnForm.conditionOnReturn, returnForm.notes)
      toast.success('Tool returned'); setIsReturnDialogOpen(false)
    } catch (err: any) { toast.error(err.message) } finally { setSaving(false) }
  }

  const handleAddRepair = async () => {
    if (!repairForm.description || !selectedToolId) { toast.error('Description and tool required'); return }
    setSaving(true)
    try {
      const tool = tools.find(t => t.id === selectedToolId)
      await addRepair({ ...repairForm, toolId: selectedToolId, toolName: tool?.name || '', status: 'PENDING', createdBy: authUser?.uid || '' })
      toast.success('Repair logged'); setIsRepairDialogOpen(false)
      setRepairForm({ description: '', repairCost: 0, repairVendor: '', repairDate: new Date().toISOString().slice(0, 10), notes: '' })
    } catch (err: any) { toast.error(err.message) } finally { setSaving(false) }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h2 className="text-3xl font-bold tracking-tight">Company Tools</h2><p className="text-muted-foreground">Machinery, hand tools, and equipment registry</p></div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => { setSelectedToolId(''); setIsRepairDialogOpen(true) }}><Hammer className="mr-2 h-4 w-4" />Log Repair</Button>
          <Button onClick={() => { setSelectedToolId(''); setIsToolDialogOpen(true) }}><Plus className="mr-2 h-4 w-4" />Add Tool</Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Total Tools</CardTitle><Wrench className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><div className="text-2xl font-bold">{loadingTools ? <Skeleton className="h-8 w-16" /> : tools.length}</div></CardContent></Card>
        <Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Available</CardTitle><CheckCircle className="h-4 w-4 text-emerald-500" /></CardHeader><CardContent><div className="text-2xl font-bold text-emerald-500">{availableTools.length}</div></CardContent></Card>
        <Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">In Use</CardTitle><Wrench className="h-4 w-4 text-blue-500" /></CardHeader><CardContent><div className="text-2xl font-bold text-blue-500">{tools.filter(t => t.status === 'IN_USE').length}</div></CardContent></Card>
        <Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Under Repair</CardTitle><AlertTriangle className="h-4 w-4 text-amber-500" /></CardHeader><CardContent><div className="text-2xl font-bold text-amber-500">{tools.filter(t => t.status === 'REPAIR' || t.status === 'DAMAGED').length}</div></CardContent></Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="all">All Tools</TabsTrigger>
          <TabsTrigger value="inUse">Checked Out</TabsTrigger>
          <TabsTrigger value="repair">Under Repair</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="flex items-center gap-4">
        <div className="relative flex-1"><Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" /><Input placeholder="Search tools..." className="pl-8" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} /></div>
      </div>

      {activeTab === 'all' && (
        <Card><CardContent className="p-0">
          <table className="w-full">
            <thead><tr className="border-b">
              <th className="text-left p-3 text-sm font-medium">Tool ID</th>
              <th className="text-left p-3 text-sm font-medium">Name</th>
              <th className="text-left p-3 text-sm font-medium">Brand</th>
              <th className="text-left p-3 text-sm font-medium">Category</th>
              <th className="text-left p-3 text-sm font-medium">Location</th>
              <th className="text-center p-3 text-sm font-medium">Status</th>
              <th className="text-right p-3 text-sm font-medium">Actions</th>
            </tr></thead>
            <tbody>
              {filteredTools.length === 0 ? <tr><td colSpan={7} className="text-center p-8 text-muted-foreground">No tools found</td></tr>
              : filteredTools.map(t => (
                <tr key={t.id} className="border-b hover:bg-muted/50">
                  <td className="p-3 text-sm font-mono">{t.toolId || '-'}</td>
                  <td className="p-3 text-sm font-medium">{t.name}</td>
                  <td className="p-3 text-sm">{t.brand || '-'}</td>
                  <td className="p-3 text-sm">{t.category || '-'}</td>
                  <td className="p-3 text-sm">{t.location || '-'}</td>
                  <td className="p-3 text-center"><Badge variant={STATUS_COLORS[t.status] || 'secondary'}>{t.status}</Badge></td>
                  <td className="p-3 text-right"><div className="flex justify-end gap-1">
                    {t.status === 'ACTIVE' && <Button variant="ghost" size="sm" onClick={() => { setSelectedToolId(t.id); setCheckoutForm(p => ({ ...p, toolName: t.name })); setIsCheckoutDialogOpen(true) }}><Wrench className="h-4 w-4" /></Button>}
                    {t.status === 'IN_USE' && <Button variant="ghost" size="sm" onClick={() => { const co = checkouts.find(c => c.toolId === t.id && !c.actualReturnDate); if (co) { setSelectedCheckoutId(co.id); setIsReturnDialogOpen(true) } }}><RefreshCw className="h-4 w-4" /></Button>}
                    <Button variant="ghost" size="sm" className="text-red-500" onClick={async () => { if (!confirm('Delete?')) return; try { await deleteTool(t.id); toast.success('Deleted') } catch (err: any) { toast.error(err.message) } }}><span className="text-xs">✕</span></Button>
                  </div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent></Card>
      )}

      {activeTab === 'inUse' && (
        <Card><CardContent className="p-0">
          <table className="w-full">
            <thead><tr className="border-b">
              <th className="text-left p-3 text-sm font-medium">Tool</th>
              <th className="text-left p-3 text-sm font-medium">Assignee</th>
              <th className="text-left p-3 text-sm font-medium">Site</th>
              <th className="text-center p-3 text-sm font-medium">Checkout</th>
              <th className="text-center p-3 text-sm font-medium">Expected Return</th>
              <th className="text-right p-3 text-sm font-medium">Action</th>
            </tr></thead>
            <tbody>
              {activeCheckouts.length === 0 ? <tr><td colSpan={6} className="text-center p-8 text-muted-foreground">No active checkouts</td></tr>
              : activeCheckouts.map(co => (
                <tr key={co.id} className="border-b hover:bg-muted/50">
                  <td className="p-3 text-sm font-medium">{co.toolName}</td>
                  <td className="p-3 text-sm">{co.assignedByName || co.assignedTo}</td>
                  <td className="p-3 text-sm">{co.site || '-'}</td>
                  <td className="p-3 text-sm text-center">{co.checkoutDate ? new Date(co.checkoutDate).toLocaleDateString() : '-'}</td>
                  <td className="p-3 text-sm text-center">{co.expectedReturnDate ? new Date(co.expectedReturnDate).toLocaleDateString() : '-'}</td>
                  <td className="p-3 text-right"><Button variant="ghost" size="sm" onClick={() => { setSelectedCheckoutId(co.id); setIsReturnDialogOpen(true) }}>Return</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent></Card>
      )}

      {activeTab === 'repair' && (
        <Card><CardContent className="p-0">
          <table className="w-full">
            <thead><tr className="border-b">
              <th className="text-left p-3 text-sm font-medium">Tool</th>
              <th className="text-left p-3 text-sm font-medium">Description</th>
              <th className="text-right p-3 text-sm font-medium">Cost</th>
              <th className="text-left p-3 text-sm font-medium">Vendor</th>
              <th className="text-center p-3 text-sm font-medium">Date</th>
              <th className="text-center p-3 text-sm font-medium">Status</th>
              <th className="text-right p-3 text-sm font-medium">Action</th>
            </tr></thead>
            <tbody>
              {repairs.filter(r => r.status !== 'COMPLETED').length === 0 ? <tr><td colSpan={7} className="text-center p-8 text-muted-foreground">No repairs in progress</td></tr>
              : repairs.filter(r => r.status !== 'COMPLETED').map(r => (
                <tr key={r.id} className="border-b hover:bg-muted/50">
                  <td className="p-3 text-sm font-medium">{r.toolName}</td>
                  <td className="p-3 text-sm">{r.description}</td>
                  <td className="p-3 text-sm text-right">${(r.repairCost || 0).toFixed(2)}</td>
                  <td className="p-3 text-sm">{r.repairVendor || '-'}</td>
                  <td className="p-3 text-sm text-center">{r.repairDate ? new Date(r.repairDate).toLocaleDateString() : '-'}</td>
                  <td className="p-3 text-center"><Badge variant={r.status === 'COMPLETED' ? 'default' : 'secondary'}>{r.status}</Badge></td>
                  <td className="p-3 text-right">{r.status === 'PENDING' || r.status === 'IN_PROGRESS' ? <Button variant="ghost" size="sm" onClick={async () => { try { await updateRepairStatus(r.id, 'COMPLETED'); toast.success('Marked completed') } catch (err: any) { toast.error(err.message) } }}>Complete</Button> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent></Card>
      )}

      <Dialog open={isToolDialogOpen} onOpenChange={setIsToolDialogOpen}>
        <DialogContent><DialogHeader><DialogTitle>Add Tool</DialogTitle></DialogHeader>
          <div className="grid gap-4">
            <div className="space-y-2"><Label>Name *</Label><Input value={toolForm.name} onChange={(e) => setToolForm(p => ({ ...p, name: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Brand</Label><Input value={toolForm.brand} onChange={(e) => setToolForm(p => ({ ...p, brand: e.target.value }))} /></div>
              <div className="space-y-2"><Label>Model</Label><Input value={toolForm.model} onChange={(e) => setToolForm(p => ({ ...p, model: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Category</Label><Input value={toolForm.category} onChange={(e) => setToolForm(p => ({ ...p, category: e.target.value }))} /></div>
              <div className="space-y-2"><Label>Location</Label><Input value={toolForm.location} onChange={(e) => setToolForm(p => ({ ...p, location: e.target.value }))} /></div>
            </div>
            <div className="space-y-2"><Label>Purchase Price ($)</Label><Input type="number" value={toolForm.purchasePrice} onChange={(e) => setToolForm(p => ({ ...p, purchasePrice: Number(e.target.value) }))} /></div>
            <div className="space-y-2"><Label>Notes</Label><Textarea value={toolForm.notes} onChange={(e) => setToolForm(p => ({ ...p, notes: e.target.value }))} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setIsToolDialogOpen(false)}>Cancel</Button><Button onClick={handleAddTool} disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Add Tool</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isCheckoutDialogOpen} onOpenChange={setIsCheckoutDialogOpen}>
        <DialogContent><DialogHeader><DialogTitle>Check Out Tool</DialogTitle></DialogHeader>
          <div className="grid gap-4">
            <div className="space-y-2"><Label>Tool</Label><Input value={checkoutForm.toolName} disabled /></div>
            <div className="space-y-2"><Label>Assigned To *</Label><Input value={checkoutForm.assignedTo} onChange={(e) => setCheckoutForm(p => ({ ...p, assignedTo: e.target.value }))} /></div>
            <div className="space-y-2"><Label>Assignee Name</Label><Input value={checkoutForm.assignedByName} onChange={(e) => setCheckoutForm(p => ({ ...p, assignedByName: e.target.value }))} /></div>
            <div className="space-y-2"><Label>Site</Label><Input value={checkoutForm.site} onChange={(e) => setCheckoutForm(p => ({ ...p, site: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Checkout Date</Label><Input type="date" value={checkoutForm.checkoutDate} onChange={(e) => setCheckoutForm(p => ({ ...p, checkoutDate: e.target.value }))} /></div>
              <div className="space-y-2"><Label>Expected Return</Label><Input type="date" value={checkoutForm.expectedReturnDate} onChange={(e) => setCheckoutForm(p => ({ ...p, expectedReturnDate: e.target.value }))} /></div>
            </div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setIsCheckoutDialogOpen(false)}>Cancel</Button><Button onClick={handleCheckout} disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Check Out</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isReturnDialogOpen} onOpenChange={setIsReturnDialogOpen}>
        <DialogContent><DialogHeader><DialogTitle>Return Tool</DialogTitle></DialogHeader>
          <div className="grid gap-4">
            <div className="space-y-2"><Label>Return Date</Label><Input type="date" value={returnForm.actualReturnDate} onChange={(e) => setReturnForm(p => ({ ...p, actualReturnDate: e.target.value }))} /></div>
            <div className="space-y-2"><Label>Condition</Label>
              <Select value={returnForm.conditionOnReturn} onValueChange={(v) => v && setReturnForm(p => ({ ...p, conditionOnReturn: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="GOOD">Good</SelectItem><SelectItem value="DAMAGED">Damaged</SelectItem><SelectItem value="NEEDS_REPAIR">Needs Repair</SelectItem><SelectItem value="LOST">Lost</SelectItem></SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>Notes</Label><Textarea value={returnForm.notes} onChange={(e) => setReturnForm(p => ({ ...p, notes: e.target.value }))} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setIsReturnDialogOpen(false)}>Cancel</Button><Button onClick={handleReturn} disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Return</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isRepairDialogOpen} onOpenChange={setIsRepairDialogOpen}>
        <DialogContent><DialogHeader><DialogTitle>Log Repair</DialogTitle></DialogHeader>
          <div className="grid gap-4">
            <div className="space-y-2"><Label>Tool</Label>
              <Select value={selectedToolId} onValueChange={(v) => v && setSelectedToolId(v)}>
                <SelectTrigger><SelectValue placeholder="Select tool" /></SelectTrigger>
                <SelectContent>{tools.filter(t => t.status !== 'RETIRED').map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>Description *</Label><Textarea value={repairForm.description} onChange={(e) => setRepairForm(p => ({ ...p, description: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Repair Cost ($)</Label><Input type="number" value={repairForm.repairCost} onChange={(e) => setRepairForm(p => ({ ...p, repairCost: Number(e.target.value) }))} /></div>
              <div className="space-y-2"><Label>Vendor</Label><Input value={repairForm.repairVendor} onChange={(e) => setRepairForm(p => ({ ...p, repairVendor: e.target.value }))} /></div>
            </div>
            <div className="space-y-2"><Label>Repair Date</Label><Input type="date" value={repairForm.repairDate} onChange={(e) => setRepairForm(p => ({ ...p, repairDate: e.target.value }))} /></div>
            <div className="space-y-2"><Label>Notes</Label><Textarea value={repairForm.notes} onChange={(e) => setRepairForm(p => ({ ...p, notes: e.target.value }))} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setIsRepairDialogOpen(false)}>Cancel</Button><Button onClick={handleAddRepair} disabled={saving || !selectedToolId}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Log Repair</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}