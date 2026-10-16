'use client'

import React, { useEffect, useState } from 'react'
import { usePoultryStore } from '@/stores/poultry-store'
import { poultryApi } from '@/features/poultry/api/poultryApi'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Plus, Loader2, Pencil, Trash } from 'lucide-react'
import { toast } from 'sonner'
import type { PoultryInventoryItem } from '@/stores/poultry-store'

const INVENTORY_TYPES = ['FEED', 'MEDICINE', 'VACCINE', 'OTHER'] as const

export default function PoultryInventoryPage() {
  const { inventory, isLoading, fetchInventory } = usePoultryStore()
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<PoultryInventoryItem | null>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ itemName: '', type: 'FEED' as string, unit: '', quantity: 0, minStockLevel: 5, unitPrice: 0 })

  useEffect(() => {
    fetchInventory()
  }, [])

  const resetForm = () => {
    setForm({ itemName: '', type: 'FEED', unit: '', quantity: 0, minStockLevel: 5, unitPrice: 0 })
    setEditing(null)
  }

  const handleEdit = (item: PoultryInventoryItem) => {
    setEditing(item)
    setForm({
      itemName: item.itemName,
      type: item.type,
      unit: item.unit,
      quantity: item.quantity,
      minStockLevel: item.minStockLevel,
      unitPrice: item.unitPrice,
    })
    setShowModal(true)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this item?')) return
    try {
      await poultryApi.deleteInventoryItem(id)
      fetchInventory()
      toast.success('Deleted')
    } catch (e: any) {
      toast.error(e.message)
    }
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      const totalValue = form.quantity * form.unitPrice
      if (editing) {
        await poultryApi.updateInventoryItem(editing.id, { ...form, totalValue } as any)
        toast.success('Updated')
      } else {
        await poultryApi.addInventoryItem({ ...form, totalValue } as any)
        toast.success('Created')
      }
      setShowModal(false)
      resetForm()
      fetchInventory()
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Poultry Inventory</h2>
          <p className="text-muted-foreground">Manage feed, vaccines, and medicine stock</p>
        </div>
        <Button onClick={() => { resetForm(); setShowModal(true) }}>
          <Plus className="mr-2 h-4 w-4" />Add Item
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-6 py-4 font-medium">Item Name</th>
                <th className="px-6 py-4 font-medium">Type</th>
                <th className="px-6 py-4 font-medium">Stock Level</th>
                <th className="px-6 py-4 font-medium">Unit Price</th>
                <th className="px-6 py-4 font-medium">Total Value</th>
                <th className="px-6 py-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-muted-foreground">
                    Loading inventory...
                  </td>
                </tr>
              ) : inventory.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-muted-foreground">
                    No inventory items found. Add one to get started.
                  </td>
                </tr>
              ) : (
                inventory.map(item => (
                  <tr key={item.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-medium">{item.itemName}</div>
                      {item.quantity <= item.minStockLevel && (
                        <div className="text-xs text-amber-600 font-medium mt-1">
                          Low Stock Warning
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <Badge variant={item.type === 'FEED' ? 'secondary' : item.type === 'MEDICINE' || item.type === 'VACCINE' ? 'default' : 'outline'}>
                        {item.type}
                      </Badge>
                    </td>
                    <td className="px-6 py-4">
                      <span className={item.quantity <= item.minStockLevel ? 'text-amber-600 font-bold' : ''}>
                        {item.quantity} {item.unit}
                      </span>
                    </td>
                    <td className="px-6 py-4">${item.unitPrice.toFixed(2)}</td>
                    <td className="px-6 py-4 font-medium">${(item.quantity * item.unitPrice).toFixed(2)}</td>
                    <td className="px-6 py-4 text-right flex justify-end gap-2">
                      <Button variant="ghost" size="sm" onClick={() => handleEdit(item)}>
                        <Pencil className="h-3 w-3 mr-1" />Edit
                      </Button>
                      <Button variant="ghost" size="sm" className="text-red-500" onClick={() => handleDelete(item.id)}>
                        <Trash className="h-3 w-3 mr-1" />Delete
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Item' : 'Add Item'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSave} className="grid gap-4">
            <div className="space-y-2">
              <Label>Name *</Label>
              <Input value={form.itemName} onChange={e => setForm(p => ({ ...p, itemName: e.target.value }))} required />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={form.type} onValueChange={v => v && setForm(p => ({ ...p, type: v }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {INVENTORY_TYPES.map(t => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Unit</Label>
                <Input value={form.unit} onChange={e => setForm(p => ({ ...p, unit: e.target.value }))} placeholder="e.g., Bags, Bottles" required />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Quantity</Label>
                <Input type="number" value={form.quantity} onChange={e => setForm(p => ({ ...p, quantity: Number(e.target.value) }))} required />
              </div>
              <div className="space-y-2">
                <Label>Min Stock Level</Label>
                <Input type="number" value={form.minStockLevel} onChange={e => setForm(p => ({ ...p, minStockLevel: Number(e.target.value) }))} required />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Unit Price ($)</Label>
              <Input type="number" step="0.01" value={form.unitPrice} onChange={e => setForm(p => ({ ...p, unitPrice: Number(e.target.value) }))} required />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => { setShowModal(false); resetForm() }}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{editing ? 'Update' : 'Save'} Item</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
