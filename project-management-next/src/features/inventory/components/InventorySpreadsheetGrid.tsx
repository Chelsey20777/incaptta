'use client'

import React, { useState, useEffect, useMemo, useRef } from 'react'
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Plus, Save, Loader2, Trash2, CheckSquare, Square, Pencil } from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/components/ui/sheet'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import type { InventoryItem } from '@/stores/inventory-store'
import EditableCell from './EditableCell'
import { computeTotalCost, computeSellingPrice, formatCurrency } from '../utils/pricing'
import { useInventoryStore } from '@/stores/inventory-store'
import { useAuthStore } from '@/stores/auth-store'
import { toast } from 'sonner'
import InventoryAuditLog from './InventoryAuditLog'
import { StockDraft, stockQuantity, submitStockAdditions } from '../utils/stock-additions'

interface InventorySpreadsheetGridProps {
  items: InventoryItem[]
  categories: any[]
  canManage?: boolean
  canCreateItem?: boolean
  onStockModeChange?: (active: boolean) => void
  onRefresh: () => void
}

function nonNegativeNumber(value: unknown, label: string): number {
  if (value === '' || value === null || value === undefined) {
    throw new Error(`${label} must be a non-negative number.`)
  }
  const number = Number(value)
  if (!Number.isFinite(number) || number < 0) {
    throw new Error(`${label} must be a non-negative number.`)
  }
  return number
}

export default function InventorySpreadsheetGrid({
  items,
  categories,
  canManage: mayManage = false,
  canCreateItem = mayManage,
  onStockModeChange,
  onRefresh,
}: InventorySpreadsheetGridProps) {
  const [stockMode, setStockMode] = useState(false)
  const [stockSaving, setStockSaving] = useState(false)
  const [drafts, setDrafts] = useState<Record<string, StockDraft>>({})
  const stockLock = useRef(false)
  const canManage = mayManage && !stockMode
  const changeStockMode = (active: boolean) => { setStockMode(active); onStockModeChange?.(active) }
  const saveStock = async () => {
    if (stockLock.current) return
    stockLock.current = true
    setStockSaving(true)
    try {
      const remaining = await submitStockAdditions(drafts, (id, qty, requestId) => store.adjustStock(id, {
        type: 'ADD', qty, requestId, deferRefresh: true, skipFinancials: true,
        reason: 'Stock received through Inventory Master', reference: 'Inventory Master Add Stock',
      }), () => crypto.randomUUID())
      setDrafts(remaining)
      await store.fetchItems()
      if (Object.keys(remaining).length) toast.error('Some entries could not be confirmed. Retry the remaining entries.')
      else { changeStockMode(false); toast.success('Stock added successfully') }
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Unable to add stock') }
    finally { stockLock.current = false; setStockSaving(false) }
  }
  const stockInput = (item: InventoryItem) => (
    <div className="p-2 min-w-40" onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>
      <Input aria-label={`Stock to add for ${item.name}`} inputMode="decimal"
        value={drafts[item.id]?.value ?? ''} disabled={stockSaving || !!drafts[item.id]?.requestId}
        onChange={e => setDrafts(previous => ({ ...previous, [item.id]: { value: e.target.value } }))} />
      <span className="text-xs text-muted-foreground">{item.uom}</span>
      {drafts[item.id]?.error && <p role="alert" className="text-xs text-destructive">{drafts[item.id].error} Retry keeps this quantity to prevent duplicates.</p>}
    </div>
  )
  const store = useInventoryStore()
  const authStore = useAuthStore()
  
  const [savingId, setSavingId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [isMobile, setIsMobile] = useState(false)
  const [isMobileEditOpen, setIsMobileEditOpen] = useState(false)
  const [mobileEditItem, setMobileEditItem] = useState<any | null>(null)
  const [showAddRow, setShowAddRow] = useState(false)

  // Quick Add Row State
  const [newItem, setNewItem] = useState({
    sku: '',
    name: '',
    description: '',
    categoryId: '',
    categoryName: '',
    uom: 'PCS',
    location: '',
    reorderLevel: 0,
    onHand: 0,
    isActive: true,
    purchasePrice: 0,
    freightDuty: 0,
    totalCost: 0,
    markupPercent: 0,
    sellingPrice: 0
  })

  // Keyboard navigation state
  const [activeRowIndex, setActiveRowIndex] = useState(-1)
  const [activeColIndex, setActiveColIndex] = useState(-1)
  const [isEditingActive, setIsEditingActive] = useState(false)

  const setActiveCell = (rIdx: number, cIdx: number, editing = false) => {
    setActiveRowIndex(rIdx)
    setActiveColIndex(cIdx)
    setIsEditingActive(editing)
  }

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768)
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  const isAllSelected = useMemo(() => {
    return items.length > 0 && selectedIds.size === items.length
  }, [items, selectedIds])

  const toggleAllSelection = () => {
    if (isAllSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(items.map(i => i.id)))
    }
  }

  const toggleSelection = (id: string) => {
    const next = new Set(selectedIds)
    if (next.has(id)) {
      next.delete(id)
    } else {
      next.add(id)
    }
    setSelectedIds(next)
  }

  const handleDeleteItem = async (item: InventoryItem) => {
    if (!window.confirm(`Are you sure you want to delete "${item.name}"? This action cannot be undone.`)) return
    try {
      setSavingId(item.id)
      await store.deleteItem(item.id)
      toast.success('Item Deleted', { description: `${item.name} has been removed.` })
      onRefresh()
    } catch (err: any) {
      toast.error('Deletion Failed', { description: err.message })
    } finally {
      setSavingId(null)
    }
  }

  const handleBulkDelete = async () => {
    const count = selectedIds.size
    if (count === 0) return
    if (!window.confirm(`Are you sure you want to delete ${count} selected items? This action cannot be undone.`)) return
    try {
      setSavingId('bulk')
      for (const id of Array.from(selectedIds)) {
        await store.deleteItem(id)
      }
      toast.success('Bulk Deletion Successful', { description: `${count} items removed.` })
      setSelectedIds(new Set())
      onRefresh()
    } catch (err: any) {
      toast.error('Bulk Deletion Failed', { description: err.message })
    } finally {
      setSavingId(null)
    }
  }

  const updateNewItemPricing = (pPrice: number, fDuty: number, mPercent: number) => {
    const totalCost = computeTotalCost(pPrice, fDuty)
    const sellingPrice = computeSellingPrice(totalCost, mPercent)
    setNewItem(prev => ({
      ...prev,
      purchasePrice: pPrice,
      freightDuty: fDuty,
      markupPercent: mPercent,
      totalCost,
      sellingPrice
    }))
  }

  const handleSaveNewItem = async () => {
    if (!newItem.sku || !newItem.name || !newItem.categoryId) {
      toast.error('Missing Required Fields', { description: 'SKU, Name, and Category are required.' })
      return
    }
    try {
      setSavingId('new')
      const category = categories.find(c => c.id === newItem.categoryId)
      const categoryName = category?.name || ''
      const user = {
        uid: authStore.user?.uid || '',
        email: authStore.user?.email || 'system'
      }

      await store.createItem({
        ...newItem,
        categoryName
      }, user)

      toast.success('Item Created', { description: `${newItem.name} added to inventory.` })
      setShowAddRow(false)
      setNewItem({
        sku: '', name: '', description: '', categoryId: '', categoryName: '', uom: 'PCS',
        location: '', reorderLevel: 0,
        onHand: 0, isActive: true, purchasePrice: 0, freightDuty: 0,
        totalCost: 0, markupPercent: 0, sellingPrice: 0
      })
      onRefresh()
    } catch (err: any) {
      toast.error('Failed to Create Item', { description: err.message })
    } finally {
      setSavingId(null)
    }
  }

  const updateItem = async (item: InventoryItem, field: keyof InventoryItem, value: any) => {
    try {
      setSavingId(item.id)

      if (field === 'onHand') {
        const quantity = nonNegativeNumber(value, 'Quantity')
        if (quantity !== item.onHand) {
          await store.adjustStock(item.id, {
            type: 'SET',
            qty: quantity,
            reason: 'Admin inline inventory edit',
            reference: 'Inventory Master inline quantity edit',
            skipFinancials: true,
          })
        }
        toast.success('Quantity updated', { description: `${item.name}: ${quantity}` })
        return
      }

      const patch: any = { [field]: value }

      if (['purchasePrice', 'freightDuty', 'markupPercent'].includes(field)) {
        const pPrice = field === 'purchasePrice' ? Number(value) : (item.purchasePrice || 0)
        const fDuty = field === 'freightDuty' ? Number(value) : (item.freightDuty || 0)
        const mPercent = field === 'markupPercent' ? Number(value) : (item.markupPercent || 0)

        const newTotal = computeTotalCost(pPrice, fDuty)
        const newSelling = computeSellingPrice(newTotal, mPercent)

        patch.totalCost = newTotal
        patch.sellingPrice = newSelling
      }

      if (field === 'categoryId') {
        const cat = categories.find(c => c.id === value)
        patch.categoryName = cat?.name || ''
      }

      const user = {
        uid: authStore.user?.uid || '',
        email: authStore.user?.email || 'system'
      }

      await store.updateItem(item.id, patch, user)
      toast.success('Item updated', { description: `${item.name}: ${String(field)}` })
    } catch (err: any) {
      toast.error('Update Failed', { description: err.message })
    } finally {
      setSavingId(null)
      setIsEditingActive(false)
    }
  }

  const openMobileEdit = (item: InventoryItem) => {
    if (!canManage) return
    setMobileEditItem(JSON.parse(JSON.stringify(item)))
    setIsMobileEditOpen(true)
  }

  const handleMobileSave = async () => {
    if (!mobileEditItem) return
    try {
      setSavingId(mobileEditItem.id)
      const user = {
        uid: authStore.user?.uid || '',
        email: authStore.user?.email || 'system'
      }

      const purchasePrice = nonNegativeNumber(mobileEditItem.purchasePrice, 'Purchase price')
      const freightDuty = nonNegativeNumber(mobileEditItem.freightDuty, 'Freight / duty')
      const markupPercent = nonNegativeNumber(mobileEditItem.markupPercent, 'Markup')
      const reorderLevel = nonNegativeNumber(mobileEditItem.reorderLevel, 'Reorder level')
      const quantity = nonNegativeNumber(mobileEditItem.onHand, 'Quantity')
      const totalCost = computeTotalCost(purchasePrice, freightDuty)
      const sellingPrice = computeSellingPrice(totalCost, markupPercent)
      const category = categories.find(c => c.id === mobileEditItem.categoryId)
      const categoryName = category?.name || ''

      if (mobileEditItem.id === 'new') {
        if (!mobileEditItem.sku || !mobileEditItem.name || !mobileEditItem.categoryId) {
          toast.error('Missing Fields', { description: 'SKU, Name, and Category are required.' })
          return
        }
        await store.createItem({
          sku: mobileEditItem.sku,
          name: mobileEditItem.name,
          description: mobileEditItem.description || '',
          categoryId: mobileEditItem.categoryId,
          categoryName,
          uom: mobileEditItem.uom,
          location: mobileEditItem.location || '',
          reorderLevel,
          onHand: quantity,
          isActive: Boolean(mobileEditItem.isActive),
          purchasePrice,
          freightDuty,
          markupPercent,
          totalCost,
          sellingPrice,
        }, user)
        toast.success('Item Created')
      } else {
        const originalItem = items.find(item => item.id === mobileEditItem.id)
        if (!originalItem) throw new Error('Inventory item no longer exists.')
        const editableFields: Partial<InventoryItem> = {
          sku: mobileEditItem.sku,
          name: mobileEditItem.name,
          description: mobileEditItem.description || '',
          categoryId: mobileEditItem.categoryId,
          categoryName,
          uom: mobileEditItem.uom,
          location: mobileEditItem.location || '',
          reorderLevel,
          isActive: Boolean(mobileEditItem.isActive),
          purchasePrice,
          freightDuty,
          markupPercent,
          totalCost,
          sellingPrice,
        }
        await store.updateItem(mobileEditItem.id, editableFields, user)
        if (quantity !== originalItem.onHand) {
          await store.adjustStock(mobileEditItem.id, {
            type: 'SET',
            qty: quantity,
            reason: 'Admin mobile inventory edit',
            reference: 'Inventory Master mobile quantity edit',
            skipFinancials: true,
          })
        }
        toast.success('Item Updated')
      }
      setIsMobileEditOpen(false)
      onRefresh()
    } catch (err: any) {
      toast.error('Operation Failed', { description: err.message })
    } finally {
      setSavingId(null)
    }
  }

  const updateMobilePricing = () => {
    if (!mobileEditItem) return
    const total = computeTotalCost(mobileEditItem.purchasePrice || 0, mobileEditItem.freightDuty || 0)
    const selling = computeSellingPrice(total, mobileEditItem.markupPercent || 0)
    setMobileEditItem((p: any) => ({ ...p, totalCost: total, sellingPrice: selling }))
  }

  const openMobileAdd = () => {
    setMobileEditItem({
      id: 'new',
      sku: '',
      name: '',
      description: '',
      categoryId: '',
      categoryName: '',
      uom: 'PCS',
      location: '',
      reorderLevel: 0,
      onHand: 0,
      isActive: true,
      purchasePrice: 0,
      freightDuty: 0,
      totalCost: 0,
      markupPercent: 0,
      sellingPrice: 0
    })
    setIsMobileEditOpen(true)
  }

  const columns = useMemo(() => [
    { key: 'categoryId', label: 'Category', width: 'w-[180px]', editable: true, type: 'select' as const },
    { key: 'name', label: 'Name', width: 'w-[250px]', editable: true, type: 'text' as const },
    { key: 'description', label: 'Description', width: 'w-[250px]', editable: true, type: 'text' as const },
    { key: 'sku', label: 'SKU', width: 'w-[120px]', editable: true, type: 'text' as const },
    { key: 'uom', label: 'UOM', width: 'w-[80px]', editable: true, type: 'text' as const },
    { key: 'location', label: 'Location', width: 'w-[130px]', editable: true, type: 'text' as const },
    { key: 'reorderLevel', label: 'Reorder Level', width: 'w-[110px]', editable: true, type: 'number' as const, align: 'right' as const },
    { key: 'isActive', label: 'Status', width: 'w-[100px]', editable: true, type: 'boolean' as const },
    { key: 'onHand', label: 'Qty', width: 'w-[100px]', editable: true, type: 'number' as const, align: 'right' as const },
    ...(stockMode ? [{ key: 'stockToAdd', label: 'Stock to Add', width: 'w-[190px]', editable: false, type: 'number' as const, align: 'right' as const }] : []),
    { key: 'purchasePrice', label: 'Purchase $', width: 'w-[120px]', editable: true, type: 'currency' as const, align: 'right' as const },
    { key: 'freightDuty', label: 'Freight', width: 'w-[100px]', editable: true, type: 'number' as const, align: 'right' as const },
    { key: 'totalCost', label: 'Cost $', width: 'w-[120px]', editable: false, type: 'currency' as const, align: 'right' as const },
    { key: 'markupPercent', label: 'Markup %', width: 'w-[90px]', editable: true, type: 'percent' as const, align: 'right' as const },
    { key: 'sellingPrice', label: 'IRD (Selling $)', width: 'w-[120px]', editable: false, type: 'currency' as const, align: 'right' as const },
    { key: 'totalPurchaseVal', label: 'Total Purchase $', width: 'w-[130px]', editable: false, type: 'currency' as const, align: 'right' as const },
    { key: 'totalFreightVal', label: 'Total Freight', width: 'w-[120px]', editable: false, type: 'number' as const, align: 'right' as const },
    { key: 'totalCostVal', label: 'Total Cost $', width: 'w-[130px]', editable: false, type: 'currency' as const, align: 'right' as const },
    { key: 'totalSellingVal', label: 'Total IRD Selling $', width: 'w-[140px]', editable: false, type: 'currency' as const, align: 'right' as const }
  ], [stockMode])

  const gridTotals = useMemo(() => {
    return items.reduce(
      (acc, item) => {
        acc.totalPurchase += (item.onHand || 0) * (item.purchasePrice || 0)
        acc.totalFreight += (item.onHand || 0) * (item.freightDuty || 0)
        acc.totalCost += (item.onHand || 0) * (item.totalCost || 0)
        acc.totalSelling += (item.onHand || 0) * (item.sellingPrice || 0)
        return acc
      },
      { totalPurchase: 0, totalFreight: 0, totalCost: 0, totalSelling: 0 }
    )
  }, [items])

  const categoryOptions = useMemo(() => {
    return categories.map(c => ({ value: c.id, label: c.name }))
  }, [categories])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (activeRowIndex === -1) return

    const maxRow = items.length + (showAddRow ? 0 : -1)
    const maxCol = columns.length - 1

    if (isEditingActive) return

    switch (e.key) {
      case 'ArrowUp':
        if (activeRowIndex > 0) setActiveRowIndex(prev => prev - 1)
        e.preventDefault()
        break
      case 'ArrowDown':
        if (activeRowIndex < maxRow) setActiveRowIndex(prev => prev + 1)
        e.preventDefault()
        break
      case 'ArrowLeft':
        if (activeColIndex > 0) setActiveColIndex(prev => prev - 1)
        e.preventDefault()
        break
      case 'ArrowRight':
        if (activeColIndex < maxCol) setActiveColIndex(prev => prev + 1)
        e.preventDefault()
        break
      case 'Tab':
        if (e.shiftKey) {
          if (activeColIndex > 0) setActiveColIndex(prev => prev - 1)
        } else {
          if (activeColIndex < maxCol) setActiveColIndex(prev => prev + 1)
        }
        e.preventDefault()
        break
      case 'Enter':
        setIsEditingActive(true)
        e.preventDefault()
        break
    }
  }

  return (
    <div className="space-y-4" onKeyDown={handleKeyDown}>
      <div className="flex flex-wrap items-center gap-2">
        <InventoryAuditLog items={store.items} />
        {mayManage && authStore.claims.isActive === true && !stockMode && <Button onClick={() => { setShowAddRow(false); setIsMobileEditOpen(false); setIsEditingActive(false); changeStockMode(true) }} disabled={savingId !== null}>Add Stock</Button>}
        {stockMode && <>
          <Button onClick={saveStock} disabled={stockSaving || !Object.values(drafts).some(d => d.value.trim() !== '' && d.value.trim() !== '0')}>{stockSaving ? 'Saving…' : 'Save Stock'}</Button>
          <Button variant="outline" disabled={stockSaving} onClick={() => { setDrafts({}); changeStockMode(false) }}>Cancel</Button>
          <span className="text-sm">{Object.values(drafts).filter(d => { try { return stockQuantity(d.value) > 0 } catch { return true } }).length} pending items (including hidden rows)</span>
        </>}
      </div>
      {/* Bulk actions and mobile add buttons */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {selectedIds.size > 0 && canManage && (
            <Button
              variant="destructive"
              size="sm"
              onClick={handleBulkDelete}
              disabled={savingId !== null}
            >
              <Trash2 className="size-4 mr-2" />
              Delete Selected ({selectedIds.size})
            </Button>
          )}
          {isMobile && canManage && (
            <Button size="sm" onClick={openMobileAdd} disabled={!canCreateItem}>
              <Plus className="size-4 mr-2" /> Add Item
            </Button>
          )}
          {!isMobile && canManage && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAddRow(prev => !prev)}
              disabled={!canCreateItem}
            >
              <Plus className="size-4 mr-2" />
              {showAddRow ? 'Cancel Add' : 'Inline Quick Add'}
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground italic">
          {stockMode ? 'Enter received quantities, then save stock.' : !isMobile
            ? canManage
              ? 'Click a highlighted cell to edit • Enter saves • Escape cancels'
              : 'Inventory is read-only for your role'
            : canManage ? 'Tap a row to edit' : 'Inventory is read-only for your role'}
        </p>
      </div>

      {!isMobile ? (
        <div className="border rounded-md overflow-x-auto max-h-[600px] overflow-y-auto relative custom-scrollbar bg-background">
          <Table className="border-collapse table-fixed w-full min-w-[2400px] border-t border-l border-white/80">
            <TableHeader className="sticky top-0 bg-background z-40 border-b shadow-sm">
              <TableRow className="h-10 hover:bg-transparent">
                <TableHead className="w-[50px] border-r border-b text-center px-0">
                  {canManage && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={toggleAllSelection}
                    >
                      {isAllSelected ? <CheckSquare className="size-4" /> : <Square className="size-4" />}
                    </Button>
                  )}
                </TableHead>
                {columns.map((col) => (
                  <TableHead
                    key={col.key}
                    className={`${col.width || ''} ${col.align === 'right' ? 'text-right' : ''} text-[11px] font-bold px-3 border-r border-b border-white/80`}
                  >
                    <span className="inline-flex items-center gap-1">
                      {col.label}
                      {canManage && col.editable && <Pencil className="size-3 text-primary/70" />}
                    </span>
                  </TableHead>
                ))}
                <TableHead className="w-[100px] border-b border-r border-white/80 text-center">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {/* Quick Add Row */}
              {showAddRow && (
                <TableRow className="bg-primary/5 hover:bg-primary/10 transition-colors">
                  <TableCell className="border-r border-b text-center px-0">
                    <Badge variant="outline" className="text-[9px] py-0 px-1 font-semibold uppercase bg-primary text-primary-foreground">ADD</Badge>
                  </TableCell>
                  <TableCell className="p-0 border-r border-b">
                    <EditableCell
                      value={newItem.categoryId}
                      type="select"
                      options={categoryOptions}
                      onUpdate={(v) => setNewItem(prev => ({ ...prev, categoryId: v }))}
                    />
                  </TableCell>
                  <TableCell className="p-0 border-r border-b">
                    <EditableCell
                      value={newItem.name}
                      onUpdate={(v) => setNewItem(prev => ({ ...prev, name: v }))}
                      placeholder="Product Name..."
                    />
                  </TableCell>
                  <TableCell className="p-0 border-r border-b">
                    <EditableCell
                      value={newItem.description}
                      onUpdate={(v) => setNewItem(prev => ({ ...prev, description: v }))}
                      placeholder="Description..."
                    />
                  </TableCell>
                  <TableCell className="p-0 border-r border-b">
                    <EditableCell
                      value={newItem.sku}
                      onUpdate={(v) => setNewItem(prev => ({ ...prev, sku: v }))}
                      placeholder="SKU-Code..."
                    />
                  </TableCell>
                  <TableCell className="p-0 border-r border-b">
                    <EditableCell
                      value={newItem.uom}
                      onUpdate={(v) => setNewItem(prev => ({ ...prev, uom: v }))}
                    />
                  </TableCell>
                  <TableCell className="p-0 border-r border-b">
                    <EditableCell
                      value={newItem.location}
                      onUpdate={(v) => setNewItem(prev => ({ ...prev, location: v }))}
                      placeholder="Warehouse / bin..."
                    />
                  </TableCell>
                  <TableCell className="p-0 border-r border-b text-right">
                    <EditableCell
                      value={newItem.reorderLevel}
                      type="number"
                      onUpdate={(v) => setNewItem(prev => ({ ...prev, reorderLevel: v }))}
                    />
                  </TableCell>
                  <TableCell className="p-0 border-r border-b">
                    <EditableCell
                      value={newItem.isActive}
                      type="boolean"
                      onUpdate={(v) => setNewItem(prev => ({ ...prev, isActive: v }))}
                    />
                  </TableCell>
                  <TableCell className="p-0 border-r border-b text-right">
                    <EditableCell
                      value={newItem.onHand}
                      type="number"
                      onUpdate={(v) => setNewItem(prev => ({ ...prev, onHand: v }))}
                    />
                  </TableCell>
                  <TableCell className="p-0 border-r border-b text-right">
                    <EditableCell
                      value={newItem.purchasePrice}
                      type="number"
                      onUpdate={(v) => updateNewItemPricing(Number(v), newItem.freightDuty, newItem.markupPercent)}
                    />
                  </TableCell>
                  <TableCell className="p-0 border-r border-b text-right">
                    <EditableCell
                      value={newItem.freightDuty}
                      type="number"
                      onUpdate={(v) => updateNewItemPricing(newItem.purchasePrice, Number(v), newItem.markupPercent)}
                    />
                  </TableCell>
                  <TableCell className="p-2 border-r border-b text-right text-xs bg-muted/10 font-bold tabular-nums">
                    {formatCurrency(newItem.totalCost)}
                  </TableCell>
                  <TableCell className="p-0 border-r border-b text-right">
                    <EditableCell
                      value={newItem.markupPercent}
                      type="number"
                      onUpdate={(v) => updateNewItemPricing(newItem.purchasePrice, newItem.freightDuty, Number(v))}
                    />
                  </TableCell>
                  <TableCell className="p-2 border-r border-b text-right text-xs bg-primary/5 font-bold tabular-nums text-primary">
                    {formatCurrency(newItem.sellingPrice)}
                  </TableCell>
                  {/* Totals columns (empty for quick add row) */}
                  <TableCell className="border-r border-b" colSpan={4} />
                  <TableCell className="p-1 border-r border-b text-center">
                    <Button
                      size="sm"
                      className="h-7 w-full text-[10px] font-bold"
                      onClick={handleSaveNewItem}
                      disabled={savingId !== null}
                    >
                      {savingId === 'new' ? <Loader2 className="size-3 animate-spin" /> : <Save className="size-3 mr-1" />}
                      Save
                    </Button>
                  </TableCell>
                </TableRow>
              )}

              {/* Data Rows */}
              {items.map((item, rIdx) => (
                <TableRow
                  key={item.id}
                  className="group hover:bg-muted/30 transition-colors h-9"
                >
                  <TableCell className="border-r border-b text-center px-0">
                    {canManage && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => toggleSelection(item.id)}
                      >
                        {selectedIds.has(item.id) ? <CheckSquare className="size-4 text-primary" /> : <Square className="size-4 opacity-40 group-hover:opacity-100" />}
                      </Button>
                    )}
                  </TableCell>

                  {/* Columns loop with custom EditableCell bindings */}
                  {columns.map((col, cIdx) => {
                    if (col.key === 'stockToAdd') return <TableCell key={col.key}>{stockInput(item)}</TableCell>
                    const isCellActive = activeRowIndex === rIdx && activeColIndex === cIdx
                    const isCellEditing = isCellActive && isEditingActive
                    
                    const editable = col.editable && canManage
                    
                    // Value calculations
                    let val: any = (item as any)[col.key]
                    if (col.key === 'totalPurchaseVal') val = (item.onHand || 0) * (item.purchasePrice || 0)
                    else if (col.key === 'totalFreightVal') val = (item.onHand || 0) * (item.freightDuty || 0)
                    else if (col.key === 'totalCostVal') val = (item.onHand || 0) * (item.totalCost || 0)
                    else if (col.key === 'totalSellingVal') val = (item.onHand || 0) * (item.sellingPrice || 0)

                    return (
                      <TableCell
                        key={col.key}
                        className={`p-0 border-r border-b border-white/80 tabular-nums ${col.align === 'right' ? 'text-right' : ''} ${isCellActive ? 'ring-2 ring-primary ring-inset' : ''} ${editable ? 'bg-primary/[0.03] hover:bg-primary/10 cursor-text' : 'bg-muted/5'}`}
                        onClick={() => setActiveCell(rIdx, cIdx, editable)}
                      >
                        <EditableCell
                          value={val}
                          type={col.type}
                          options={col.key === 'categoryId' ? categoryOptions : undefined}
                          readOnly={!isCellEditing}
                          isActive={isCellActive}
                          isEditing={isCellEditing}
                          onUpdate={(v) => updateItem(item, col.key as keyof InventoryItem, v)}
                          onCancel={() => setIsEditingActive(false)}
                        />
                      </TableCell>
                    )
                  })}

                  <TableCell className="p-1 border-r border-b text-center">
                    <div className="flex items-center justify-center gap-1">
                      <InventoryAuditLog items={store.items} itemId={item.id} compact />
                      {canManage && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className={`h-7 w-7 text-destructive hover:bg-destructive/10 transition-opacity ${savingId === item.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                          onClick={() => handleDeleteItem(item)}
                          disabled={savingId !== null}
                        >
                          {savingId === item.id ? <Loader2 className="size-3 animate-spin" /> : <Trash2 className="size-3.5" />}
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}

              {/* Total Aggregate Row */}
              <TableRow className="h-10 bg-muted/30 border-t-2 border-muted hover:bg-muted/40 font-bold">
                <TableCell className="border-r border-b text-center px-0">Total</TableCell>
                <TableCell className="border-r border-b px-3 text-xs" colSpan={8}>
                  {items.length} Products
                </TableCell>
                <TableCell className="border-r border-b px-3 text-right text-xs tabular-nums bg-muted/10">
                  {items.reduce((s, i) => s + (i.onHand || 0), 0).toLocaleString()}
                </TableCell>
                {stockMode && <TableCell />}
                <TableCell className="border-r border-b px-3 text-right text-xs tabular-nums bg-muted/10">
                  {formatCurrency(gridTotals.totalPurchase)}
                </TableCell>
                <TableCell className="border-r border-b px-3 text-right text-xs tabular-nums bg-muted/10">
                  {gridTotals.totalFreight.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </TableCell>
                <TableCell className="border-r border-b px-3 text-right text-xs tabular-nums bg-muted/20 text-foreground font-black">
                  {formatCurrency(gridTotals.totalCost)}
                </TableCell>
                <TableCell className="border-r border-b" />
                <TableCell className="border-r border-b px-3 text-right text-xs tabular-nums bg-primary/5 text-primary font-black">
                  {formatCurrency(items.reduce((s, i) => s + (i.sellingPrice || 0), 0))}
                </TableCell>
                <TableCell className="border-r border-b px-3 text-right text-xs tabular-nums">
                  {formatCurrency(gridTotals.totalPurchase)}
                </TableCell>
                <TableCell className="border-r border-b px-3 text-right text-xs tabular-nums">
                  {gridTotals.totalFreight.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </TableCell>
                <TableCell className="border-r border-b px-3 text-right text-xs tabular-nums bg-muted/10 font-bold">
                  {formatCurrency(gridTotals.totalCost)}
                </TableCell>
                <TableCell className="border-r border-b px-3 text-right text-xs tabular-nums bg-primary/5 text-primary font-extrabold">
                  {formatCurrency(gridTotals.totalSelling)}
                </TableCell>
                <TableCell className="border-r border-b" />
              </TableRow>
            </TableBody>
          </Table>
        </div>
      ) : (
        /* Mobile Card Grid & Sheet Fallback */
        <div className="space-y-4">
          {items.map((item, idx) => (
            <Card
              key={item.id}
              className={`border shadow transition-shadow ${canManage ? 'hover:shadow-md cursor-pointer' : ''}`}
              onClick={() => { if (!stockMode) openMobileEdit(item) }}
            >
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-sm text-foreground">{item.name}</h4>
                  <p className="text-[11px] text-muted-foreground uppercase tracking-tight">SKU: {item.sku} • {item.categoryName || 'No Category'}</p>
                </div>
                <div className="text-right">
                  <div className="text-sm font-bold text-emerald-600 tabular-nums">Qty: {item.onHand}</div>
                  <div className="text-[11px] text-muted-foreground tabular-nums">Price: {formatCurrency(item.sellingPrice)}</div>
                </div>
              </CardContent>
              {stockMode && stockInput(item)}
              <div className="px-4 pb-3" onClick={e => e.stopPropagation()}><InventoryAuditLog items={store.items} itemId={item.id} compact /></div>
            </Card>
          ))}
        </div>
      )}

      {/* Mobile edit slide sheet */}
      <Sheet open={isMobileEditOpen} onOpenChange={setIsMobileEditOpen}>
        <SheetContent side="right" className="w-[90%] sm:w-[400px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{mobileEditItem?.id === 'new' ? 'Create New Item' : 'Edit Inventory Item'}</SheetTitle>
            <SheetDescription>Update item details, cost base, and profit markup.</SheetDescription>
          </SheetHeader>
          {mobileEditItem && (
            <div className="space-y-4 py-4">
              <div className="space-y-1">
                <Label>SKU Code *</Label>
                <Input
                  value={mobileEditItem.sku}
                  onChange={(e) => setMobileEditItem((p: any) => ({ ...p, sku: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>Item Name *</Label>
                <Input
                  value={mobileEditItem.name}
                  onChange={(e) => setMobileEditItem((p: any) => ({ ...p, name: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>Description</Label>
                <Input
                  value={mobileEditItem.description || ''}
                  onChange={(e) => setMobileEditItem((p: any) => ({ ...p, description: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>Category *</Label>
                <select
                  value={mobileEditItem.categoryId || ''}
                  onChange={(e) => setMobileEditItem((p: any) => ({ ...p, categoryId: e.target.value }))}
                  className="w-full bg-background border rounded px-3 py-2 text-sm focus:outline-none"
                >
                  <option value="" disabled>Select category...</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label>UOM</Label>
                  <Input
                    value={mobileEditItem.uom}
                    onChange={(e) => setMobileEditItem((p: any) => ({ ...p, uom: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Quantity</Label>
                  <Input
                    type="number"
                    min="0"
                    step="any"
                    value={mobileEditItem.onHand}
                    onChange={(e) => setMobileEditItem((p: any) => ({ ...p, onHand: e.target.value }))}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label>Location</Label>
                  <Input
                    value={mobileEditItem.location || ''}
                    onChange={(e) => setMobileEditItem((p: any) => ({ ...p, location: e.target.value }))}
                    placeholder="Warehouse / bin"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Reorder Level</Label>
                  <Input
                    type="number"
                    min="0"
                    step="any"
                    value={mobileEditItem.reorderLevel ?? 0}
                    onChange={(e) => setMobileEditItem((p: any) => ({ ...p, reorderLevel: e.target.value }))}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label>Status</Label>
                <select
                  value={mobileEditItem.isActive ? 'true' : 'false'}
                  onChange={(e) => setMobileEditItem((p: any) => ({ ...p, isActive: e.target.value === 'true' }))}
                  className="w-full bg-background border rounded px-3 py-2 text-sm focus:outline-none"
                >
                  <option value="true">Active</option>
                  <option value="false">Inactive</option>
                </select>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1">
                  <Label>Purchase $</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={mobileEditItem.purchasePrice}
                    onChange={(e) => setMobileEditItem((p: any) => ({ ...p, purchasePrice: Number(e.target.value) }))}
                    onBlur={updateMobilePricing}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Freight</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={mobileEditItem.freightDuty}
                    onChange={(e) => setMobileEditItem((p: any) => ({ ...p, freightDuty: Number(e.target.value) }))}
                    onBlur={updateMobilePricing}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Markup %</Label>
                  <Input
                    type="number"
                    value={mobileEditItem.markupPercent}
                    onChange={(e) => setMobileEditItem((p: any) => ({ ...p, markupPercent: Number(e.target.value) }))}
                    onBlur={updateMobilePricing}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 bg-muted/20 p-3 rounded-lg text-xs font-semibold">
                <div>Total Cost: <span className="font-bold tabular-nums">{formatCurrency(mobileEditItem.totalCost)}</span></div>
                <div>Selling Price: <span className="font-bold text-primary tabular-nums">{formatCurrency(mobileEditItem.sellingPrice)}</span></div>
              </div>
            </div>
          )}
          <SheetFooter className="mt-4 gap-2 flex-row justify-end">
            <Button variant="outline" onClick={() => setIsMobileEditOpen(false)}>Cancel</Button>
            <Button onClick={handleMobileSave} disabled={savingId !== null}>
              {savingId !== null && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
              Save Changes
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  )
}
