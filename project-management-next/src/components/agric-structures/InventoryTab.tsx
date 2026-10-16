'use client'

import React, { useEffect, useState, useRef, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Plus,
  Search,
  Trash,
  Package,
  Warehouse,
  AlertTriangle,
  Loader2,
} from 'lucide-react'
import { useAgricStructuresStore } from '@/stores/agric-structures-store'
import { INVENTORY_CATEGORIES } from '@/features/agric-structures/constants/defaults'
import type { AgricInventoryItem } from '@/features/agric-structures/types'
import { toast } from 'sonner'

const COLUMNS = [
  { key: 'sku', label: 'SKU', width: 'w-[100px]' },
  { key: 'name', label: 'Name', width: 'min-w-[160px]' },
  { key: 'categoryName', label: 'Category', width: 'w-[140px]' },
  { key: 'onHand', label: 'On Hand', width: 'w-[80px]', numeric: true },
  { key: 'uom', label: 'UOM', width: 'w-[60px]' },
  { key: 'purchasePrice', label: 'Purchase $', width: 'w-[90px]', numeric: true },
  { key: 'freightDuty', label: 'Freight $', width: 'w-[80px]', numeric: true },
  { key: 'totalCost', label: 'Total Cost $', width: 'w-[90px]', numeric: true, computed: true },
  { key: 'markupPercent', label: 'Markup %', width: 'w-[80px]', numeric: true },
  { key: 'sellingPrice', label: 'Selling $', width: 'w-[90px]', numeric: true, computed: true },
  { key: 'location', label: 'Location', width: 'w-[90px]' },
  { key: 'notes', label: 'Notes', width: 'min-w-[120px]' },
]

export function InventoryTab() {
  const {
    inventoryItems,
    loadingInventory,
    isProcessing,
    fetchInventory,
    addInventoryItem,
    updateInventoryItem,
    deleteInventoryItem,
    adjustStock,
    cleanup,
  } = useAgricStructuresStore()

  const [editingCell, setEditingCell] = useState<{
    itemId: string
    field: string
  } | null>(null)
  const [editValue, setEditValue] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('ALL')
  const [addingRow, setAddingRow] = useState(false)
  const [newItem, setNewItem] = useState({
    sku: '',
    name: '',
    categoryName: '',
    onHand: 0,
    uom: 'PCS',
    purchasePrice: 0,
    freightDuty: 0,
    markupPercent: 0,
    location: '',
    notes: '',
  })
  const [adjustDialogItem, setAdjustDialogItem] = useState<AgricInventoryItem | null>(null)
  const [adjustQty, setAdjustQty] = useState(0)
  const [editingDialogItem, setEditingDialogItem] = useState<AgricInventoryItem | null>(null)
  const [editForm, setEditForm] = useState({
    sku: '',
    name: '',
    categoryName: '',
    purchasePrice: 0,
    freightDuty: 0,
    markupPercent: 0,
    location: '',
    notes: '',
  })

  const startEditDialog = (item: AgricInventoryItem) => {
    setEditingDialogItem(item)
    setEditForm({
      sku: item.sku || '',
      name: item.name || '',
      categoryName: item.categoryName || '',
      purchasePrice: item.purchasePrice || 0,
      freightDuty: item.freightDuty || 0,
      markupPercent: item.markupPercent || 0,
      location: item.location || '',
      notes: item.notes || '',
    })
  }

  const handleSaveEditDialog = async () => {
    if (!editingDialogItem) return
    try {
      await updateInventoryItem(editingDialogItem.id, editForm)
      setEditingDialogItem(null)
    } catch {
      // handled
    }
  }

  const editInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const unsub = fetchInventory()
    return () => {
      unsub()
      cleanup()
    }
  }, [])

  useEffect(() => {
    if (editingCell && editInputRef.current) {
      editInputRef.current.focus()
      editInputRef.current.select()
    }
  }, [editingCell])

  const filtered = React.useMemo(() => {
    let result = inventoryItems
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      result = result.filter(
        (i) =>
          i.name?.toLowerCase().includes(q) ||
          i.sku?.toLowerCase().includes(q) ||
          i.categoryName?.toLowerCase().includes(q)
      )
    }
    if (categoryFilter !== 'ALL') {
      result = result.filter((i) => i.categoryName === categoryFilter)
    }
    return result
  }, [inventoryItems, searchQuery, categoryFilter])

  const totalValue = React.useMemo(
    () => inventoryItems.reduce((s, i) => s + (i.sellingPrice || 0) * (i.onHand || 0), 0),
    [inventoryItems]
  )

  const startEdit = (itemId: string, field: string, currentValue: any) => {
    setEditingCell({ itemId, field })
    setEditValue(String(currentValue ?? ''))
  }

  const commitEdit = useCallback(async () => {
    if (!editingCell) return
    const { itemId, field } = editingCell
    const numericFields = [
      'onHand',
      'purchasePrice',
      'freightDuty',
      'markupPercent',
      'totalCost',
      'sellingPrice',
    ]
    const payload: any = {}
    if (numericFields.includes(field)) {
      payload[field] = Number(editValue) || 0
    } else {
      payload[field] = editValue
    }
    try {
      await updateInventoryItem(itemId, payload)
    } catch {
      // toast handled in store
    }
    setEditingCell(null)
  }, [editingCell, editValue, updateInventoryItem])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      commitEdit()
    } else if (e.key === 'Tab' && editingCell) {
      e.preventDefault()
      commitEdit()
      // Find next editable column
      const currentColIndex = COLUMNS.findIndex((c) => c.key === editingCell.field)
      const nextCol = COLUMNS[currentColIndex + 1]
      if (nextCol && !nextCol.computed) {
        const item = inventoryItems.find((i) => i.id === editingCell.itemId)
        if (item) {
          setEditingCell({ itemId: editingCell.itemId, field: nextCol.key })
          setEditValue(String((item as any)[nextCol.key] ?? ''))
        }
      }
    } else if (e.key === 'Escape') {
      setEditingCell(null)
    }
  }

  const handleAddRow = async () => {
    if (!newItem.name.trim() || !newItem.categoryName) {
      toast.error('Name and category are required')
      return
    }
    try {
      await addInventoryItem({
        sku: newItem.sku || `AGR-${Date.now().toString(36).toUpperCase()}`,
        name: newItem.name,
        categoryName: newItem.categoryName,
        categoryId: newItem.categoryName.toLowerCase().replace(/\s+/g, '-'),
        onHand: newItem.onHand,
        uom: newItem.uom,
        purchasePrice: newItem.purchasePrice,
        freightDuty: newItem.freightDuty,
        totalCost: 0, // computed
        markupPercent: newItem.markupPercent,
        sellingPrice: 0, // computed
        location: newItem.location,
        notes: newItem.notes,
      })
      setAddingRow(false)
      setNewItem({
        sku: '',
        name: '',
        categoryName: '',
        onHand: 0,
        uom: 'PCS',
        purchasePrice: 0,
        freightDuty: 0,
        markupPercent: 0,
        location: '',
        notes: '',
      })
    } catch {
      // toast handled in store
    }
  }

  const handleDeleteItem = async (id: string) => {
    if (!confirm('Delete this inventory item?')) return
    try {
      await deleteInventoryItem(id)
    } catch {
      // toast handled in store
    }
  }

  const handleStockAdjust = async () => {
    if (!adjustDialogItem || adjustQty === 0) return
    try {
      await adjustStock(adjustDialogItem.id, {
        qty: adjustQty,
        reason: `Manual stock adjustment`,
      })
      setAdjustDialogItem(null)
      setAdjustQty(0)
    } catch {
      // toast handled in store
    }
  }

  const getCellValue = (item: AgricInventoryItem, col: (typeof COLUMNS)[0]) => {
    if (col.computed) {
      if (col.key === 'totalCost')
        return ((item.purchasePrice || 0) + (item.freightDuty || 0)).toFixed(2)
      if (col.key === 'sellingPrice') {
        const tc = (item.purchasePrice || 0) + (item.freightDuty || 0)
        return (tc * (1 + (item.markupPercent || 0) / 100)).toFixed(2)
      }
    }
    const val = (item as any)[col.key]
    if (val === undefined || val === null) return ''
    if (col.numeric) {
      if (typeof val === 'number') {
        return col.key === 'onHand' ? val.toString() : val.toFixed(2)
      }
      return val
    }
    return String(val)
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
        <Card className="bg-card/50 backdrop-blur-sm border shadow rounded-xl">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase">Total Items</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {loadingInventory ? <Skeleton className="h-8 w-16" /> : inventoryItems.length}
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card/50 backdrop-blur-sm border shadow rounded-xl">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase">Categories</CardTitle>
            <Warehouse className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-500">
              {INVENTORY_CATEGORIES.length}
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card/50 backdrop-blur-sm border shadow rounded-xl">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase">Stock Value</CardTitle>
            <Package className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-500">
              ${totalValue.toLocaleString()}
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card/50 backdrop-blur-sm border shadow rounded-xl">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase">Low Stock</CardTitle>
            <AlertTriangle className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-500">
              {inventoryItems.filter((i) => i.onHand <= 0).length}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters and CTA */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-1 items-center gap-3 w-full md:max-w-[600px]">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, SKU, or category..."
              className="pl-9 h-9"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <Select value={categoryFilter} onValueChange={(v) => v && setCategoryFilter(v)}>
            <SelectTrigger className="w-[180px] h-9">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Categories</SelectItem>
              {INVENTORY_CATEGORIES.map((cat) => (
                <SelectItem key={cat} value={cat}>
                  {cat}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button
          onClick={() => {
            setAddingRow(!addingRow)
            setAdjustDialogItem(null)
          }}
          className="bg-brand-primary hover:bg-brand-primary/95 text-white font-bold h-9 shrink-0 shadow"
        >
          <Plus className="size-4 mr-1" />
          {addingRow ? 'Cancel Row' : 'Add Material'}
        </Button>
      </div>

      {/* Spreadsheet Grid Card */}
      <Card className="bg-card/50 backdrop-blur-sm border shadow rounded-xl overflow-hidden">
        <CardHeader className="pb-3">
          <CardTitle>Material Spreadsheet Grid</CardTitle>
          <p className="text-xs text-muted-foreground italic">
            * Note: Double-click any cell to edit details inline. Press Enter to save, Esc to cancel.
          </p>
        </CardHeader>
        <CardContent className="p-0">
          {/* Desktop Table View */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-xs text-left divide-y border-t">
              <thead className="bg-muted/30 uppercase text-[10px] text-muted-foreground font-bold">
                <tr className="border-b bg-muted/50 sticky top-0">
                  {COLUMNS.map((col) => (
                    <th
                      key={col.key}
                      className={`p-2.5 ${col.numeric ? 'text-right' : 'text-left'} ${col.width}`}
                    >
                      {col.label}
                    </th>
                  ))}
                  <th className="p-2.5 text-center w-[80px]">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y font-semibold">
                {/* Add Row */}
                {addingRow && (
                  <tr className="border-b bg-primary/5">
                    {COLUMNS.map((col) => {
                      if (col.computed) {
                        return (
                          <td key={col.key} className={`p-1.5 ${col.numeric ? 'text-right' : ''}`}>
                            <span className="text-[10px] text-muted-foreground px-1 italic">auto</span>
                          </td>
                        )
                      }
                      if (col.key === 'categoryName') {
                        return (
                          <td key={col.key} className="p-1.5">
                            <Select
                              value={newItem.categoryName}
                              onValueChange={(v) => {
                                if (v) setNewItem((p) => ({ ...p, categoryName: v }))
                              }}
                            >
                              <SelectTrigger className="h-7 text-xs">
                                <SelectValue placeholder="Category" />
                              </SelectTrigger>
                              <SelectContent>
                                {INVENTORY_CATEGORIES.map((cat) => (
                                  <SelectItem key={cat} value={cat}>
                                    {cat}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </td>
                        )
                      }
                      if (col.key === 'uom') {
                        return (
                          <td key={col.key} className="p-1.5">
                            <Select
                              value={newItem.uom}
                              onValueChange={(v) => {
                                if (v) setNewItem((p) => ({ ...p, uom: v }))
                              }}
                            >
                              <SelectTrigger className="h-7 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {['PCS', 'M', 'KG', 'ROLLS', 'SHEETS', 'BAGS', 'LITRES', 'm³', 'm²'].map(
                                  (u) => (
                                    <SelectItem key={u} value={u}>
                                      {u}
                                    </SelectItem>
                                  )
                                )}
                              </SelectContent>
                            </Select>
                          </td>
                        )
                      }
                      return (
                        <td key={col.key} className="p-1.5">
                          <Input
                            type={col.numeric ? 'number' : 'text'}
                            step={col.numeric ? '0.01' : undefined}
                            className="h-7 text-xs"
                            value={(newItem as any)[col.key] ?? ''}
                            onChange={(e) => {
                              const val = col.numeric
                                ? Number(e.target.value) || 0
                                : e.target.value
                              setNewItem((p) => ({ ...p, [col.key]: val }))
                            }}
                            placeholder={col.label}
                          />
                        </td>
                      )
                    })}
                    <td className="p-1.5 text-center">
                      <Button size="sm" variant="default" onClick={handleAddRow} disabled={isProcessing} className="h-7 font-bold bg-brand-primary hover:bg-brand-primary/95 text-white">
                        {isProcessing ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Save'}
                      </Button>
                    </td>
                  </tr>
                )}

                {/* Data Rows */}
                {loadingInventory
                  ? Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i} className="border-b">
                        {COLUMNS.map((col) => (
                          <td key={col.key} className="p-2">
                            <Skeleton className="h-4 w-full" />
                          </td>
                        ))}
                        <td className="p-2"><Skeleton className="h-4 w-12 mx-auto" /></td>
                      </tr>
                    ))
                  : filtered.length === 0
                  ? (
                    <tr>
                      <td colSpan={COLUMNS.length + 1} className="text-center p-8 text-muted-foreground italic">
                        No inventory materials registered in database.
                      </td>
                    </tr>
                  )
                  : filtered.map((item) => (
                      <tr key={item.id} className="hover:bg-muted/10 transition-colors">
                        {COLUMNS.map((col) => {
                          const isEditing =
                            editingCell?.itemId === item.id &&
                            editingCell?.field === col.key
                          return (
                            <td
                              key={col.key}
                              className={`p-2 ${col.numeric ? 'text-right font-mono' : ''}`}
                              onDoubleClick={() => {
                                if (!col.computed) {
                                  startEdit(item.id, col.key, getCellValue(item, col))
                                }
                              }}
                            >
                              {isEditing ? (
                                <Input
                                  ref={editInputRef}
                                  type={col.numeric ? 'number' : 'text'}
                                  step={col.numeric ? '0.01' : undefined}
                                  className="h-7 text-xs w-full"
                                  value={editValue}
                                  onChange={(e) => setEditValue(e.target.value)}
                                  onBlur={commitEdit}
                                  onKeyDown={handleKeyDown}
                                />
                              ) : (
                                <span className={col.computed ? 'text-muted-foreground font-semibold' : ''}>
                                  {getCellValue(item, col)}
                                </span>
                              )}
                            </td>
                          )
                        })}
                        <td className="p-2 text-center">
                          <div className="flex justify-center gap-1.5">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-6 w-6 p-0 border-blue-500/30 text-blue-500 hover:bg-blue-500/10 font-bold"
                              onClick={() => {
                                setAdjustDialogItem(item)
                                setAdjustQty(0)
                              }}
                              title="Adjust Stock Qty"
                            >
                              ±
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-6 w-6 p-0 border-red-500/30 text-red-500 hover:bg-red-500/10"
                              onClick={() => handleDeleteItem(item.id)}
                              title="Delete Item"
                            >
                              <Trash className="h-3 w-3" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Card List View */}
          <div className="md:hidden divide-y border-t">
            {loadingInventory ? (
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="p-4 space-y-3">
                  <div className="flex justify-between">
                    <Skeleton className="h-4 w-28" />
                    <Skeleton className="h-4 w-12" />
                  </div>
                  <Skeleton className="h-3 w-40" />
                  <div className="flex justify-between">
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-4 w-20" />
                  </div>
                </div>
              ))
            ) : filtered.length === 0 ? (
              <div className="text-center p-8 text-muted-foreground italic text-xs">
                No inventory materials registered in database.
              </div>
            ) : (
              filtered.map((item) => {
                const totalCost = ((item.purchasePrice || 0) + (item.freightDuty || 0)).toFixed(2)
                const sellingPrice = (parseFloat(totalCost) * (1 + (item.markupPercent || 0) / 100)).toFixed(2)
                return (
                  <div
                    key={item.id}
                    className="p-4 hover:bg-muted/10 transition-colors space-y-2.5 active:bg-muted/20"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h4 className="font-bold text-sm text-foreground">{item.name}</h4>
                        <span className="font-mono text-[10px] text-muted-foreground uppercase">{item.sku}</span>
                      </div>
                      <Badge variant="outline" className="text-[9px] uppercase px-1.5 py-0 shrink-0">
                        {item.categoryName}
                      </Badge>
                    </div>

                    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                      <div>
                        <span className="text-[10px] text-muted-foreground font-semibold uppercase">On Hand:</span>{' '}
                        <span className="font-bold text-foreground">{item.onHand} {item.uom}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-muted-foreground font-semibold uppercase">Location:</span>{' '}
                        <span className="text-foreground">{item.location || '—'}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-muted-foreground font-semibold uppercase">Cost Price:</span>{' '}
                        <span className="font-mono text-foreground font-bold">${parseFloat(totalCost).toFixed(2)}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-muted-foreground font-semibold uppercase">Selling Price:</span>{' '}
                        <span className="font-mono text-emerald-600 font-bold">${parseFloat(sellingPrice).toFixed(2)}</span>
                      </div>
                    </div>

                    {item.notes && (
                      <div className="bg-muted/10 p-2 rounded text-[11px] text-muted-foreground italic">
                        Notes: {item.notes}
                      </div>
                    )}

                    <div className="flex justify-between items-center pt-2 border-t">
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 px-2.5 border-blue-500/20 text-blue-500 hover:bg-blue-500/10 font-bold"
                          onClick={() => {
                            setAdjustDialogItem(item)
                            setAdjustQty(0)
                          }}
                        >
                          Adjust (±)
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 px-2.5 border-red-500/20 text-red-500 hover:bg-red-500/10"
                          onClick={() => handleDeleteItem(item.id)}
                        >
                          Delete
                        </Button>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 px-2.5 font-bold border-brand-primary/20 text-brand-primary hover:bg-brand-primary/10"
                        onClick={() => startEditDialog(item)}
                      >
                        Edit Details
                      </Button>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </CardContent>
      </Card>

      {/* Stock Adjust Dialog (simple inline) */}
      {adjustDialogItem && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 backdrop-blur-sm">
          <Card className="w-full max-w-sm border shadow-lg bg-card rounded-xl">
            <CardHeader>
              <CardTitle className="text-base">Stock Correction: {adjustDialogItem.name}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-xs text-muted-foreground">
                Current Balance: <strong>{adjustDialogItem.onHand}</strong> {adjustDialogItem.uom}
              </p>
              <div className="space-y-2">
                <Label className="font-semibold text-xs text-muted-foreground uppercase">Adjustment Qty (+ / -)</Label>
                <Input
                  type="number"
                  value={adjustQty}
                  onChange={(e) => setAdjustQty(Number(e.target.value))}
                  placeholder="e.g. 10 or -5"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setAdjustDialogItem(null)}
                >
                  Cancel
                </Button>
                <Button 
                  size="sm" 
                  onClick={handleStockAdjust} 
                  disabled={adjustQty === 0 || isProcessing}
                  className="bg-brand-primary hover:bg-brand-primary/95 text-white font-bold"
                >
                  {isProcessing ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
                  Commit Adjustment
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Edit Details Dialog (Mobile / Desktop full modal editor) */}
      {editingDialogItem && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 backdrop-blur-sm p-4 overflow-y-auto">
          <Card className="w-full max-w-md border shadow-lg bg-card rounded-xl my-8">
            <CardHeader>
              <CardTitle className="text-base">Edit Material: {editingDialogItem.name}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label className="font-semibold text-xs text-muted-foreground uppercase">Material Name</Label>
                <Input
                  value={editForm.name}
                  onChange={(e) => setEditForm(p => ({ ...p, name: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label className="font-semibold text-xs text-muted-foreground uppercase">SKU</Label>
                <Input
                  value={editForm.sku}
                  onChange={(e) => setEditForm(p => ({ ...p, sku: e.target.value }))}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="font-semibold text-xs text-muted-foreground uppercase">Purchase Price ($)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={editForm.purchasePrice}
                    onChange={(e) => setEditForm(p => ({ ...p, purchasePrice: Number(e.target.value) || 0 }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="font-semibold text-xs text-muted-foreground uppercase">Freight Duty ($)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={editForm.freightDuty}
                    onChange={(e) => setEditForm(p => ({ ...p, freightDuty: Number(e.target.value) || 0 }))}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="font-semibold text-xs text-muted-foreground uppercase">Markup %</Label>
                  <Input
                    type="number"
                    value={editForm.markupPercent}
                    onChange={(e) => setEditForm(p => ({ ...p, markupPercent: Number(e.target.value) || 0 }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="font-semibold text-xs text-muted-foreground uppercase">Location</Label>
                  <Input
                    value={editForm.location}
                    onChange={(e) => setEditForm(p => ({ ...p, location: e.target.value }))}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="font-semibold text-xs text-muted-foreground uppercase">Notes</Label>
                <Input
                  value={editForm.notes}
                  onChange={(e) => setEditForm(p => ({ ...p, notes: e.target.value }))}
                  placeholder="Additional item descriptions..."
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditingDialogItem(null)}
                >
                  Cancel
                </Button>
                <Button 
                  size="sm" 
                  onClick={handleSaveEditDialog} 
                  disabled={isProcessing}
                  className="bg-brand-primary hover:bg-brand-primary/95 text-white font-bold"
                >
                  {isProcessing ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
                  Save Material Changes
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
