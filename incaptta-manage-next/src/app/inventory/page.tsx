'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { db } from '@/lib/firebase'
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  addDoc,
  doc,
  updateDoc,
  serverTimestamp,
  Unsubscribe
} from 'firebase/firestore'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Search,
  Plus,
  Package,
  AlertTriangle,
  Loader2,
  RefreshCcw,
  TrendingDown,
  History,
  DollarSign,
  Hash,
  Edit3,
  Box
} from 'lucide-react'
import { toast } from 'sonner'

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(n || 0)

interface InventoryItem {
  id: string
  name?: string
  sku?: string
  category?: string
  unitOfMeasure?: string
  costPrice?: number
  sellingPrice?: number
  onHand?: number
  reorderLevel?: number
  location?: string
  status?: string
  createdAt?: any
  [key: string]: any
}

const CATEGORIES = ['All', 'Materials', 'Tools', 'Equipment', 'Consumables', 'Other']

const statusBadge = (status: string = 'ACTIVE') => {
  const colors: Record<string, string> = {
    ACTIVE: 'bg-green-500/10 text-green-600 border-green-500/20',
    INACTIVE: 'bg-gray-500/10 text-gray-600 border-gray-500/20',
    DISCONTINUED: 'bg-red-500/10 text-red-600 border-red-500/20',
    PENDING_GRN: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20',
  }
  return (
    <Badge variant="outline" className={`text-[8px] h-4 px-1.5 font-bold uppercase rounded ${colors[status] || ''}`}>
      {status}
    </Badge>
  )
}

export default function InventoryPage() {
  const [items, setItems] = useState<InventoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('All')
  const [showAddModal, setShowAddModal] = useState(false)
  const [showAdjustModal, setShowAdjustModal] = useState(false)
  const [adjustItem, setAdjustItem] = useState<InventoryItem | null>(null)
  const [adjustType, setAdjustType] = useState<'ADD' | 'REMOVE'>('ADD')
  const [adjustQty, setAdjustQty] = useState(0)
  const [adjustReason, setAdjustReason] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formData, setFormData] = useState({
    name: '', sku: '', category: 'Materials', unitOfMeasure: 'each',
    costPrice: 0, sellingPrice: 0, reorderLevel: 0, location: ''
  })

  useEffect(() => {
    setLoading(true)
    const unsub = onSnapshot(
      query(collection(db, 'inventoryItems'), orderBy('name', 'asc')),
      (snap) => {
        setItems(snap.docs.map(d => ({ id: d.id, ...d.data() }) as InventoryItem))
        setLoading(false)
      },
      (err) => {
        console.error('Inventory error:', err)
        setLoading(false)
      }
    )
    return () => unsub()
  }, [])

  const filteredItems = useMemo(() => {
    return items.filter(item => {
      const matchSearch = !searchQuery ||
        item.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.sku?.toLowerCase().includes(searchQuery.toLowerCase())
      const matchCategory = categoryFilter === 'All' || item.category === categoryFilter
      return matchSearch && matchCategory
    })
  }, [items, searchQuery, categoryFilter])

  const lowStockCount = useMemo(() =>
    items.filter(i => (i.onHand || 0) <= (i.reorderLevel || 0) && i.status === 'ACTIVE').length,
    [items]
  )

  const handleAddItem = async () => {
    if (!formData.name.trim()) { toast.error('Name is required'); return }
    setIsSubmitting(true)
    try {
      await addDoc(collection(db, 'inventoryItems'), {
        ...formData,
        costPrice: Number(formData.costPrice),
        sellingPrice: Number(formData.sellingPrice),
        onHand: 0,
        status: 'ACTIVE',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      })
      toast.success('Item added')
      setShowAddModal(false)
      setFormData({ name: '', sku: '', category: 'Materials', unitOfMeasure: 'each', costPrice: 0, sellingPrice: 0, reorderLevel: 0, location: '' })
    } catch (err) {
      toast.error('Failed to add item')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleAdjust = async () => {
    if (!adjustItem || adjustQty <= 0) { toast.error('Select item and valid quantity'); return }
    setIsSubmitting(true)
    try {
      const currentQty = adjustItem.onHand || 0
      const newQty = adjustType === 'ADD' ? currentQty + adjustQty : Math.max(0, currentQty - adjustQty)
      await updateDoc(doc(db, 'inventoryItems', adjustItem.id), {
        onHand: newQty,
        updatedAt: serverTimestamp()
      })
      // Also log the adjustment
      await addDoc(collection(db, 'inventoryAdjustments'), {
        itemId: adjustItem.id,
        itemName: adjustItem.name,
        previousQty: currentQty,
        adjustmentQty: adjustType === 'ADD' ? adjustQty : -adjustQty,
        newQty,
        reason: adjustReason || `${adjustType} adjustment`,
        type: adjustType,
        createdAt: serverTimestamp()
      })
      toast.success(`Stock ${adjustType === 'ADD' ? 'added' : 'removed'} successfully`)
      setShowAdjustModal(false)
      setAdjustItem(null)
      setAdjustQty(0)
      setAdjustReason('')
    } catch (err) {
      toast.error('Adjustment failed')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="flex-1 flex flex-col pb-20 bg-background min-h-screen">
      <header className="sticky top-0 z-10 bg-card border-b px-4 py-4 flex items-center gap-4 shadow-sm">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-black tracking-tight">Inventory Management</h1>
            <Badge className="bg-[#ff8903] text-white text-[10px] font-black h-5 px-2">{items.length}</Badge>
          </div>
          <p className="text-xs text-muted-foreground">Track stock levels & manage items</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="h-9 text-xs font-bold gap-1.5" onClick={() => setShowAdjustModal(true)}>
            <TrendingDown className="size-4" /> Adjust
          </Button>
          <Button size="sm" className="bg-[#ff8903] hover:bg-[#ff8903]/90 text-white font-bold text-xs gap-1.5 h-9" onClick={() => setShowAddModal(true)}>
            <Plus className="size-4" /> Add Item
          </Button>
        </div>
      </header>

      {/* Low Stock Alert */}
      {lowStockCount > 0 && (
        <div className="mx-4 mt-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center gap-3">
          <AlertTriangle className="size-5 text-red-500 shrink-0" />
          <div>
            <p className="text-xs font-bold text-red-600">{lowStockCount} item{lowStockCount > 1 ? 's' : ''} below reorder level</p>
            <p className="text-[10px] text-red-500/80">Immediate restocking recommended</p>
          </div>
        </div>
      )}

      {/* Search & Filters */}
      <section className="p-4 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
          <Input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name or SKU..." className="pl-9 h-10 border bg-muted/20" />
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {CATEGORIES.map(cat => (
            <Button key={cat} variant="secondary" size="sm"
              onClick={() => setCategoryFilter(cat)}
              className={`text-[10px] font-black px-3 rounded-full shrink-0 ${categoryFilter === cat ? 'bg-[#ff8903] text-white' : ''}`}
            >
              {cat}
            </Button>
          ))}
        </div>
      </section>

      {/* Items Grid */}
      <main className="px-4 space-y-3 flex-1">
        {loading && (
          <div className="flex flex-col items-center justify-center py-20">
            <RefreshCcw className="size-8 animate-spin text-muted-foreground" />
          </div>
        )}

        {!loading && filteredItems.length === 0 && (
          <div className="text-center py-20 text-muted-foreground">
            <Package className="size-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm font-medium">No items found</p>
            <p className="text-xs mt-1">{searchQuery || categoryFilter !== 'All' ? 'Try different filters' : 'Add your first inventory item'}</p>
          </div>
        )}

        {!loading && filteredItems.map((item) => {
          const isLowStock = (item.onHand || 0) <= (item.reorderLevel || 0) && item.status === 'ACTIVE'
          return (
            <Card key={item.id} className={`border shadow-sm ${isLowStock ? 'border-red-500/30 bg-red-500/[0.02]' : ''}`}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className={`size-10 rounded-full flex items-center justify-center shrink-0 border ${
                      isLowStock ? 'bg-red-500/10 border-red-500/20' : 'bg-primary/10 border-primary/20'
                    }`}>
                      <Package className={`size-5 ${isLowStock ? 'text-red-500' : 'text-[#ff8903]'}`} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <h3 className="font-black text-sm text-foreground">{item.name || 'Unnamed Item'}</h3>
                        {item.sku && <Badge variant="outline" className="text-[8px] font-mono bg-muted px-1 rounded">{item.sku}</Badge>}
                        {statusBadge(item.status)}
                      </div>
                      <div className="flex flex-wrap gap-2 mt-1.5">
                        {item.category && (
                          <Badge variant="outline" className="text-[8px] h-4 px-1.5 font-bold uppercase rounded bg-blue-500/10 text-blue-600 border-blue-500/20">
                            {item.category}
                          </Badge>
                        )}
                        <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                          <Hash className="size-3" /> On Hand: <span className={`font-bold ${isLowStock ? 'text-red-500' : 'text-foreground'}`}>{item.onHand || 0}</span>
                        </span>
                        {item.reorderLevel != null && (
                          <span className="text-[10px] text-muted-foreground">Reorder: {item.reorderLevel}</span>
                        )}
                      </div>
                      <div className="flex gap-3 mt-1 text-[10px] text-muted-foreground">
                        <span className="flex items-center gap-1"><DollarSign className="size-3" /> Cost: {fmt(item.costPrice || 0)}</span>
                        <span className="flex items-center gap-1"><DollarSign className="size-3" /> Sell: {fmt(item.sellingPrice || 0)}</span>
                        {item.location && <span>📍 {item.location}</span>}
                      </div>
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" className="size-8 shrink-0" onClick={() => { setAdjustItem(item); setShowAdjustModal(true) }}>
                    <Edit3 className="size-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </main>

      {/* Add Item Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <Card className="w-full max-w-md bg-card border shadow-2xl rounded-3xl overflow-hidden">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg font-black tracking-tight">Add Inventory Item</CardTitle>
              <p className="text-xs text-muted-foreground">Register a new item in the inventory system</p>
            </CardHeader>
            <CardContent className="space-y-4 max-h-[70vh] overflow-y-auto">
              <div className="space-y-1.5">
                <Label className="text-xs font-black uppercase text-muted-foreground">Item Name *</Label>
                <Input value={formData.name} onChange={(e) => setFormData(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Cement 50kg" className="h-10" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-black uppercase text-muted-foreground">SKU</Label>
                  <Input value={formData.sku} onChange={(e) => setFormData(f => ({ ...f, sku: e.target.value }))} placeholder="e.g. CMT-001" className="h-10" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-black uppercase text-muted-foreground">Category</Label>
                  <select value={formData.category} onChange={(e) => setFormData(f => ({ ...f, category: e.target.value }))}
                    className="w-full h-10 px-3 rounded-xl border bg-background text-sm"
                  >
                    {CATEGORIES.filter(c => c !== 'All').map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-black uppercase text-muted-foreground">UOM</Label>
                  <select value={formData.unitOfMeasure} onChange={(e) => setFormData(f => ({ ...f, unitOfMeasure: e.target.value }))}
                    className="w-full h-10 px-3 rounded-xl border bg-background text-sm"
                  >
                    <option value="each">Each</option>
                    <option value="kg">Kg</option>
                    <option value="m">Meters</option>
                    <option value="l">Liters</option>
                    <option value="box">Box</option>
                    <option value="bag">Bag</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-black uppercase text-muted-foreground">Location</Label>
                  <Input value={formData.location} onChange={(e) => setFormData(f => ({ ...f, location: e.target.value }))} placeholder="e.g. Warehouse A" className="h-10" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-black uppercase text-muted-foreground">Cost Price ($)</Label>
                  <Input type="number" value={formData.costPrice || ''} onChange={(e) => setFormData(f => ({ ...f, costPrice: Number(e.target.value) }))} className="h-10" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-black uppercase text-muted-foreground">Selling Price ($)</Label>
                  <Input type="number" value={formData.sellingPrice || ''} onChange={(e) => setFormData(f => ({ ...f, sellingPrice: Number(e.target.value) }))} className="h-10" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-black uppercase text-muted-foreground">Reorder Level</Label>
                <Input type="number" value={formData.reorderLevel || ''} onChange={(e) => setFormData(f => ({ ...f, reorderLevel: Number(e.target.value) }))} className="h-10" />
              </div>
              <div className="flex gap-3 pt-2">
                <Button variant="outline" className="flex-1 rounded-xl h-10 font-bold" onClick={() => setShowAddModal(false)}>Cancel</Button>
                <Button className="flex-1 rounded-xl h-10 font-bold bg-[#ff8903] hover:bg-[#ff8903]/90 text-white" disabled={isSubmitting} onClick={handleAddItem}>
                  {isSubmitting ? <Loader2 className="size-4 animate-spin mr-1" /> : null}
                  Add Item
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Stock Adjustment Modal */}
      {showAdjustModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <Card className="w-full max-w-sm bg-card border shadow-2xl rounded-3xl overflow-hidden">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg font-black tracking-tight">Stock Adjustment</CardTitle>
              <p className="text-xs text-muted-foreground">{adjustItem ? `Adjusting: ${adjustItem.name}` : 'Select an item to adjust'}</p>
            </CardHeader>
            <CardContent className="space-y-4">
              {!adjustItem && (
                <select
                  value=""
                  onChange={(e) => {
                    const found = items.find(i => i.id === e.target.value)
                    setAdjustItem(found || null)
                  }}
                  className="w-full h-10 px-3 rounded-xl border bg-background text-sm"
                >
                  <option value="" disabled>Select item...</option>
                  {items.map(i => (
                    <option key={i.id} value={i.id}>{i.name} (On Hand: {i.onHand || 0})</option>
                  ))}
                </select>
              )}
              {adjustItem && (
                <div className="bg-muted/20 p-3 rounded-xl text-xs space-y-1">
                  <p className="font-bold">{adjustItem.name} <span className="font-mono text-muted-foreground">({adjustItem.sku})</span></p>
                  <p>Current Stock: <span className="font-bold">{adjustItem.onHand || 0}</span></p>
                  {adjustItem.reorderLevel != null && <p>Reorder Level: {adjustItem.reorderLevel}</p>}
                </div>
              )}
              <div className="flex gap-2">
                <Button variant={adjustType === 'ADD' ? 'default' : 'outline'} size="sm" className="flex-1 text-xs font-bold" onClick={() => setAdjustType('ADD')}>Add Stock</Button>
                <Button variant={adjustType === 'REMOVE' ? 'destructive' : 'outline'} size="sm" className="flex-1 text-xs font-bold" onClick={() => setAdjustType('REMOVE')}>Remove Stock</Button>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-black uppercase text-muted-foreground">Quantity</Label>
                <Input type="number" value={adjustQty || ''} onChange={(e) => setAdjustQty(Number(e.target.value))} min={1} className="h-10" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-black uppercase text-muted-foreground">Reason</Label>
                <Input value={adjustReason} onChange={(e) => setAdjustReason(e.target.value)} placeholder="e.g. Stock count correction" className="h-10" />
              </div>
              <div className="flex gap-3 pt-2">
                <Button variant="outline" className="flex-1 rounded-xl h-10 font-bold" onClick={() => { setShowAdjustModal(false); setAdjustItem(null) }}>Cancel</Button>
                <Button className="flex-1 rounded-xl h-10 font-bold" disabled={isSubmitting || !adjustItem || adjustQty <= 0} onClick={handleAdjust}>
                  {isSubmitting ? <Loader2 className="size-4 animate-spin mr-1" /> : null}
                  Confirm
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}