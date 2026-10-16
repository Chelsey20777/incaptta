'use client'

import React, { useState, useEffect, useMemo, useCallback } from 'react'
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Plus, Trash2, Lock, Search, ChevronDown, LayoutGrid, Package, Loader2, AlertTriangle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import EditableCell from './EditableCell'
import { useAdminStore } from '@/stores/admin-store'
import { useInventoryStore } from '@/stores/inventory-store'
import type { BomRequisitionSection, BulkInventoryApprovalResult } from '../types'
import { toast } from 'sonner'
import { lineExtendedAmounts } from '@/lib/crm/quotation-commercial'

type AvailabilityState = 'sufficient' | 'shortage' | 'issued' | 'invalid' | 'missing' | 'unlinked' | 'loading'

interface InventoryAvailability {
  state: AvailabilityState
  onHand?: number
  outstandingRequired?: number
  shortfall?: number
  uom?: string
}

const quantityFormatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 4 })

function AvailabilityDisplay({ availability }: { availability: InventoryAvailability }) {
  const baseClass = 'rounded-md border px-2 py-1 text-[10px] leading-tight'
  if (availability.state === 'unlinked') {
    return <div className={`${baseClass} border-border/50 bg-muted/20 text-muted-foreground`}>Not stock-linked</div>
  }
  if (availability.state === 'loading') {
    return <div className={`${baseClass} border-border/50 bg-muted/20 text-muted-foreground`}>Loading stock…</div>
  }
  if (availability.state === 'missing') {
    return <div className={`${baseClass} border-amber-500/30 bg-amber-500/10 font-semibold text-amber-700`}>Inventory record unavailable</div>
  }
  if (availability.state === 'invalid') {
    return <div className={`${baseClass} border-amber-500/30 bg-amber-500/10 font-semibold text-amber-700`}>Invalid required quantity</div>
  }

  const unit = availability.uom ? ` ${availability.uom}` : ''
  if (availability.state === 'issued') {
    return (
      <div className={`${baseClass} border-emerald-500/30 bg-emerald-500/10 text-emerald-700`}>
        <div className="font-black uppercase">Issued</div>
        <div>Remaining: {availability.onHand == null ? 'Unavailable' : `${quantityFormatter.format(availability.onHand)}${unit}`}</div>
      </div>
    )
  }

  const isShort = availability.state === 'shortage'
  return (
    <div className={`${baseClass} ${isShort ? 'border-red-500/30 bg-red-500/10 text-red-700' : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700'}`}>
      <div>Available: <span className="font-bold">{quantityFormatter.format(availability.onHand || 0)}{unit}</span></div>
      <div>Required (all rows): <span className="font-bold">{quantityFormatter.format(availability.outstandingRequired || 0)}{unit}</span></div>
      <div className="font-black uppercase">
        {isShort ? `Shortfall: ${quantityFormatter.format(availability.shortfall || 0)}${unit}` : 'In stock'}
      </div>
    </div>
  )
}

interface InventoryRequisitionGridProps {
  modelValue: BomRequisitionSection[]
  generalInfo?: any
  isAdmin?: boolean
  isAccountant?: boolean
  isManager?: boolean
  isJobApproved?: boolean
  onUpdate: (sections: BomRequisitionSection[]) => void
  onApproveItem?: (itemId: string, status: string) => void
  onApproveAll?: (status: string) => Promise<BulkInventoryApprovalResult | void>
}

export default function InventoryRequisitionGrid({
  modelValue,
  generalInfo,
  isAdmin: _isAdmin = false,
  isAccountant = false,
  isManager = false,
  isJobApproved = false,
  onUpdate,
  onApproveItem,
  onApproveAll,
}: InventoryRequisitionGridProps) {
  const adminStore = useAdminStore()
  const inventoryStore = useInventoryStore()
  const [inventoryItems, setInventoryItems] = useState<any[]>([])
  const [activeRowIndex, setActiveRowIndex] = useState(-1)
  const [activeColIndex, setActiveColIndex] = useState(-1)
  const [isEditingActive, setIsEditingActive] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [isApprovingAll, setIsApprovingAll] = useState(false)
  const [bulkApprovalFailures, setBulkApprovalFailures] = useState<BulkInventoryApprovalResult['failed']>([])

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768)
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  useEffect(() => {
    inventoryStore.fetchItems({ isActive: true })
  }, [])

  useEffect(() => {
    setInventoryItems(inventoryStore.items)
  }, [inventoryStore.items])

  const isItemLocked = useCallback(
    (item: any) =>
      item.approvalStatus === 'APPROVED_MANAGER'
      || item.postingState === 'POSTED'
      || item.inventoryDeducted === true,
    []
  )

  const getSortedItems = useCallback((items: any[]) => {
    return (items || [])
      .map((item, originalIdx) => ({ item, originalIdx }))
      .sort((a, b) => {
        const aApproved = a.item.approvalStatus === 'APPROVED_MANAGER'
        const bApproved = b.item.approvalStatus === 'APPROVED_MANAGER'
        if (aApproved && !bApproved) return 1
        if (!aApproved && bApproved) return -1
        return 0
      })
  }, [])

  const columns = useMemo(() => {
    const cols = [
      { key: 'index', label: '#', width: 'w-[50px]', editable: false, align: 'center' as const },
      { key: 'itemName', label: 'Item / Service Name', editable: true },
      { key: 'description', label: 'Description', editable: true },
      { key: 'qtyRequired', label: 'Qty', width: 'w-[80px]', editable: true, align: 'right' as const },
      { key: 'availability', label: 'Availability', width: 'w-[170px]', editable: false, align: 'left' as const },
      { key: 'unit', label: 'Unit', width: 'w-[80px]', editable: false, align: 'left' as const },
      { key: 'irdSellingPrice', label: 'Unit Price', width: 'w-[120px]', editable: true, align: 'right' as const },
      { key: 'totalInventoryPrice', label: 'Total Price', width: 'w-[120px]', editable: false, align: 'right' as const },
    ]
    if (isJobApproved) {
      cols.push({ key: 'approval', label: 'Status/Approval', width: 'w-[180px]', editable: false, align: 'center' as const })
    }
    return cols
  }, [isJobApproved])

  const jobCategoryOptions = useMemo(
    () =>
      (adminStore.jobCategories || []).map((cat: any) => ({
        value: cat.id,
        label: cat.name,
      })),
    [adminStore.jobCategories]
  )

  const inventoryOptions = useMemo(
    () =>
      inventoryItems.map((item: any) => ({
        value: item.id,
        label: `${item.name}${item.sku ? ` (${item.sku})` : ''}`,
        description: item.description || '',
        price: item.sellingPrice,
        cost: item.totalCost ?? 0,
        stockCount: item.onHand ?? 0,
        uom: item.uom || '',
      })),
    [inventoryItems]
  )

  const eligibleApprovalCount = useMemo(() => {
    const items = modelValue.flatMap(section => section.items || [])
    if (isManager) {
      return items.filter(item => item.approvalStatus === 'APPROVED_ACCOUNTANT').length
    }
    if (isAccountant) {
      return items.filter(item => !item.approvalStatus || item.approvalStatus === 'PENDING').length
    }
    return 0
  }, [modelValue, isAccountant, isManager])

  const inventoryById = useMemo(
    () => new Map(inventoryItems.map(item => [item.id, item])),
    [inventoryItems]
  )

  const outstandingDemandByInventoryId = useMemo(() => {
    const demand = new Map<string, number>()
    for (const item of modelValue.flatMap(section => section.items || [])) {
      const isIssued = item.approvalStatus === 'APPROVED_MANAGER' || item.postingState === 'POSTED' || item.inventoryDeducted
      if (!item.inventoryItemId || isIssued) continue
      const required = Number(item.qtyRequired)
      if (!Number.isFinite(required) || required <= 0) continue
      demand.set(item.inventoryItemId, (demand.get(item.inventoryItemId) || 0) + required)
    }
    return demand
  }, [modelValue])

  const getAvailability = (item: any): InventoryAvailability => {
    if (!item.inventoryItemId) return { state: 'unlinked' }
    const inventoryItem = inventoryById.get(item.inventoryItemId)
    const isIssued = item.approvalStatus === 'APPROVED_MANAGER' || item.postingState === 'POSTED' || item.inventoryDeducted
    if (isIssued) {
      return {
        state: 'issued',
        onHand: inventoryItem?.onHand,
        uom: inventoryItem?.uom,
      }
    }
    if (inventoryStore.loading && inventoryItems.length === 0) return { state: 'loading' }
    if (!inventoryItem) return { state: 'missing' }

    const rowRequired = Number(item.qtyRequired)
    if (!Number.isFinite(rowRequired) || rowRequired <= 0) {
      return { state: 'invalid', onHand: inventoryItem.onHand, uom: inventoryItem.uom }
    }

    const outstandingRequired = outstandingDemandByInventoryId.get(item.inventoryItemId) || 0
    const onHand = Number(inventoryItem.available ?? (Number(inventoryItem.onHand || 0) - Number(inventoryItem.reserved || 0)))
    const shortfall = Math.max(0, outstandingRequired - onHand)
    return {
      state: shortfall > 0 ? 'shortage' : 'sufficient',
      onHand,
      outstandingRequired,
      shortfall,
      uom: inventoryItem.uom,
    }
  }

  const handleApproveAll = async () => {
    if (!onApproveAll || isApprovingAll || eligibleApprovalCount === 0) return
    setIsApprovingAll(true)
    setBulkApprovalFailures([])
    try {
      const result = await onApproveAll(isManager ? 'APPROVED_MANAGER' : 'APPROVED_ACCOUNTANT')
      if (!result) return
      setBulkApprovalFailures(result.failed)

      const succeeded = result.approved + result.alreadyPosted
      if (result.failed.length === 0) {
        toast.success(
          succeeded > 0
            ? `${succeeded} inventory item${succeeded === 1 ? '' : 's'} approved`
            : 'No inventory items needed approval'
        )
      } else if (succeeded > 0) {
        toast.warning(`${succeeded} approved, ${result.failed.length} failed`, {
          description: 'Review the highlighted rows and retry after correcting them.',
        })
      } else {
        toast.error(`Unable to approve ${result.failed.length} inventory item${result.failed.length === 1 ? '' : 's'}`, {
          description: result.failed[0]?.reason,
        })
      }
    } catch (error: any) {
      toast.error('Approve all failed', {
        description: error?.message || 'Please try again.',
      })
    } finally {
      setIsApprovingAll(false)
    }
  }

  const getPostingError = (item: any): string | null => {
    if (item.approvalStatus === 'APPROVED_MANAGER') return null
    if (item.postingState === 'FAILED' && item.postingError) return String(item.postingError)
    const failure = bulkApprovalFailures.find(candidate =>
      candidate.lineId ? candidate.lineId === item.id : candidate.itemName === item.itemName
    )
    return failure?.reason || null
  }

  const calculateRow = (item: any) => {
    const amounts = lineExtendedAmounts(item)
    return {
      baseIRD: amounts.baseIRD,
      twidMU: amounts.markupValue,
      subTotal: amounts.totalPrice,
      totalInventoryPrice: amounts.totalPrice,
    }
  }

  const calculateSectionTotal = (section: any) => {
    return (section.items || []).reduce((sum: number, item: any) => {
      return sum + calculateRow(item).totalInventoryPrice
    }, 0)
  }

  const resolveDepartmentName = (id: string) => {
    const dept = adminStore.departments.find((d: any) => d.id === id)
    return dept?.name || 'Unknown'
  }

  const resolveJobCategoryName = (id: string) => {
    const cat = adminStore.jobCategories.find((c: any) => c.id === id)
    return (cat?.name || 'Unknown Category').toUpperCase()
  }

  const filteredSections = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return modelValue
      .map((section, sIdx) => {
        const sortedItems = getSortedItems(section.items)
        if (!q) return { section, sIdx, filteredItems: sortedItems }

        const categoryName = resolveJobCategoryName(section.jobCategoryId).toLowerCase()
        const sectionMatches =
          (section.description || '').toLowerCase().includes(q) ||
          categoryName.includes(q) ||
          (section.unit || '').toLowerCase().includes(q)

        const filteredItems = sortedItems.filter(({ item }) => {
          // Keep incomplete/new rows visible so Add → edit is not hidden by search
          const incomplete =
            !item.inventoryItemId &&
            (!(item.itemName || '').trim() || item.itemName === 'New Service') &&
            !(item.description || '').trim()
          if (incomplete) return true
          if (sectionMatches) return true
          return (
            (item.itemName || '').toLowerCase().includes(q) ||
            (item.description || '').toLowerCase().includes(q)
          )
        })

        if (filteredItems.length === 0 && !sectionMatches) return null
        return { section, sIdx, filteredItems }
      })
      .filter((entry): entry is { section: BomRequisitionSection; sIdx: number; filteredItems: ReturnType<typeof getSortedItems> } => entry !== null)
  }, [modelValue, searchQuery, getSortedItems, adminStore.jobCategories])

  const setActiveCell = (rowIndex: number, colIndex: number, editing = false) => {
    setActiveRowIndex(rowIndex)
    setActiveColIndex(colIndex)
    setIsEditingActive(editing)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (activeRowIndex === -1) return

    if (isEditingActive) {
      if (e.key === 'Enter') {
        e.preventDefault()
        setIsEditingActive(false)
      } else if (e.key === 'Escape') {
        e.preventDefault()
        setIsEditingActive(false)
      } else if (e.key === 'Tab') {
        e.preventDefault()
        setIsEditingActive(false)
        if (e.shiftKey) {
          if (activeColIndex > 0) setActiveColIndex(activeColIndex - 1)
        } else {
          if (activeColIndex < columns.length - 1) setActiveColIndex(activeColIndex + 1)
        }
      }
      return
    }

    switch (e.key) {
      case 'ArrowUp':
        e.preventDefault()
        if (activeRowIndex > 0) setActiveRowIndex(activeRowIndex - 1)
        break
      case 'ArrowDown':
        e.preventDefault()
        if (activeRowIndex < getMaxRow()) setActiveRowIndex(activeRowIndex + 1)
        break
      case 'Enter':
        e.preventDefault()
        if (columns[activeColIndex]?.editable) setIsEditingActive(true)
        break
    }
  }

  const getMaxRow = () => {
    return modelValue.reduce((max, s) => max + (s.items?.length || 0), 0) + modelValue.length
  }

  const updateSection = (index: number, field: string, value: any) => {
    const newSections = [...modelValue]
    const section = { ...newSections[index] }

    if (field === 'qty') {
      const oldQty = Number(section.qty) || 1
      const newQty = Math.max(1, Number(value) || 1)
      section.qty = newQty

      const factor = newQty / oldQty
      if (section.items && section.items.length > 0) {
        section.items = section.items.map((item: any) => {
          if (isItemLocked(item)) return item
          const currentQty = item.qtyRequired || 0
          return {
            ...item,
            qtyRequired: parseFloat((currentQty * factor).toFixed(4)),
          }
        })
      }
    } else if (field === 'jobCategoryId') {
      section.jobCategoryId = value
      const cat = adminStore.jobCategories?.find((c: any) => c.id === value)
      if (cat && cat.unit && (!section.unit || section.unit === 'Unit')) {
        section.unit = cat.unit
      }
    } else {
      (section as any)[field] = value
    }

    newSections[index] = section
    onUpdate(newSections)
  }

  const updateItemInSection = (sIdx: number, iIdx: number, field: string, value: any) => {
    if (isItemLocked(modelValue[sIdx]?.items?.[iIdx])) return
    const newSections = [...modelValue]
    const section = { ...newSections[sIdx] }
    const items = [...section.items]
    let item = { ...items[iIdx], [field]: value }

    if (field === 'irdSellingPrice') {
      item.irdSellingPrice = Math.round(Number(value) * 10000) / 10000
    }
    if (field === 'costSnapshot') {
      item.costSnapshot = Math.round(Number(value) * 10000) / 10000
    }

    if (field === 'inventoryItemId') {
      const option = inventoryOptions.find((o) => o.value === value)
      if (option) {
        item.inventoryItemId = option.value
        item.itemName = option.label
        item.irdSellingPrice = Math.round((option.price || 0) * 10000) / 10000
        item.costSnapshot = Math.round((option.cost ?? 0) * 10000) / 10000
        item.markupPercent = 0
        item.description = option.description
        item.uom = option.uom || item.uom || 'PCS'
      }
    }

    items[iIdx] = item
    section.items = items
    newSections[sIdx] = section
    onUpdate(newSections)
  }

  const removeSection = (index: number) => {
    const newSections = modelValue.filter((_, i) => i !== index)
    onUpdate(newSections)
  }

  const removeItemFromSection = (sIdx: number, iIdx: number) => {
    if (isItemLocked(modelValue[sIdx]?.items?.[iIdx])) return
    const newSections = [...modelValue]
    const section = { ...newSections[sIdx] }
    section.items = section.items.filter((_: any, i: number) => i !== iIdx)
    newSections[sIdx] = section
    onUpdate(newSections)
  }

  const allItemsCompleteGlobally = useMemo(() => {
    return modelValue.every((section) =>
      (section.items || []).every((item: any) => !!item.inventoryItemId || !!item.itemName)
    )
  }, [modelValue])

  const addNewSection = () => {
    if (!allItemsCompleteGlobally) return
    setSearchQuery('')
    const newSection: BomRequisitionSection = {
      id: crypto.randomUUID(),
      jobCategoryId: '',
      description: '',
      qty: 1,
      unit: 'Unit',
      items: [],
    }
    onUpdate([...modelValue, newSection])
  }

  const canAddItemToSection = (section: any) => {
    if (!allItemsCompleteGlobally) return false
    if (!section.items || section.items.length === 0) return true
    return section.items.every((item: any) => !!item.inventoryItemId || !!item.itemName)
  }

  const addNewItemToSection = (sIdx: number) => {
    if (!canAddItemToSection(modelValue[sIdx])) return
    setSearchQuery('')
    const newSections = [...modelValue]
    const section = { ...newSections[sIdx] }
    const newItem = {
      id: crypto.randomUUID(),
      inventoryItemId: '',
      itemName: 'New Service',
      description: '',
      qtyRequired: 1,
      irdSellingPrice: 0,
      markupPercent: 0,
      uom: 'PCS',
      costSnapshot: 0,
    }
    section.items = [...section.items, newItem]
    newSections[sIdx] = section
    onUpdate(newSections)
  }

  const handleAddFromCatalog = (sIdx: number, itemId: string) => {
    if (!canAddItemToSection(modelValue[sIdx])) return
    const option = inventoryOptions.find((o) => o.value === itemId)
    if (!option) return
    setSearchQuery('')
    const newSections = [...modelValue]
    const section = { ...newSections[sIdx] }
    const newItem = {
      id: crypto.randomUUID(),
      inventoryItemId: option.value,
      itemName: option.label,
      description: option.description,
      qtyRequired: 1,
      irdSellingPrice: Math.round((option.price || 0) * 10000) / 10000,
      costSnapshot: Math.round((option.cost ?? 0) * 10000) / 10000,
      markupPercent: 0,
      uom: option.uom || 'PCS',
    }
    section.items = [...(section.items || []), newItem]
    newSections[sIdx] = section
    onUpdate(newSections)
  }

  return (
    <div className="border rounded-md overflow-hidden bg-background font-sans" onKeyDown={handleKeyDown}>
      {/* General Info Header */}
      {generalInfo && (
        <div className="bg-muted/30 border-b px-4 py-2 flex flex-wrap items-center gap-x-8 gap-y-2 text-[11px] w-full">
          <div className="flex items-center gap-2">
            <span className="font-bold text-muted-foreground uppercase tracking-tight">Job #:</span>
            <span className="font-mono text-primary font-bold">{generalInfo.jobNumber || 'N/A'}</span>
          </div>
          {generalInfo.projectLocation && (
            <div className="flex items-center gap-2">
              <span className="font-bold text-muted-foreground uppercase tracking-tight">Location:</span>
              <span className="font-medium truncate max-w-[200px]">{generalInfo.projectLocation}</span>
            </div>
          )}
          {generalInfo.recipientName && (
            <div className="flex items-center gap-2 border-l pl-8">
              <span className="font-bold text-muted-foreground uppercase tracking-tight">Customer:</span>
              <span className="font-bold text-foreground">{generalInfo.recipientName}</span>
            </div>
          )}
          {isJobApproved && (isAccountant || isManager) && onApproveAll && (
            <div className="ml-auto">
              <Button
                variant="outline"
                size="sm"
                className="h-6 text-[10px] font-bold border-green-500/40 text-green-600 hover:bg-green-50"
                disabled={isApprovingAll || eligibleApprovalCount === 0}
                onClick={handleApproveAll}
              >
                {isApprovingAll && <Loader2 className="mr-1 size-3 animate-spin" />}
                {isApprovingAll
                  ? 'Approving…'
                  : `Approve All ${isManager ? '(Manager)' : '(Accountant)'}`}
              </Button>
            </div>
          )}
        </div>
      )}

      <div className="relative max-w-sm px-4 py-2 border-b">
        <Search className="absolute left-6 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search items, description, category…"
          className="pl-8 h-8"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      <div className="overflow-x-auto max-h-[600px] overflow-y-auto relative custom-scrollbar">
        {!isMobile ? (
          <Table className="border-collapse table-fixed w-full min-w-[1070px] border-t border-l border-white/80">
            <TableHeader className="sticky top-0 bg-background z-40 border-b shadow-sm">
              <TableRow className="h-10 hover:bg-transparent">
                {columns.map((col) => (
                  <TableHead
                    key={col.key}
                    className={`${col.width || ''} ${col.align === 'right' ? 'text-right' : ''} text-[12px] font-bold px-4 border-r border-b border-white/80`}
                  >
                    {col.label}
                  </TableHead>
                ))}
                <TableHead className="w-[50px] border-b border-r border-white/80"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredSections.length === 0 && searchQuery.trim() && (
                <TableRow>
                  <TableCell
                    colSpan={columns.length + 1}
                    className="text-center py-10 text-sm text-muted-foreground"
                  >
                    No matching items
                  </TableCell>
                </TableRow>
              )}
              {filteredSections.map(({ section, sIdx, filteredItems }) => (
                <React.Fragment key={section.id}>
                  {/* Category Header Row */}
                  <TableRow className="h-10 bg-muted/50 border-y-2 border-muted hover:bg-muted/60">
                    <TableCell className="p-0 border-r border-b border-white/80 bg-muted text-center text-[10px] font-black opacity-30">
                      S{sIdx + 1}
                    </TableCell>
                    <TableCell className="p-0 border-r border-b border-white/80 bg-primary/5">
                      <div className="px-4 py-2 flex items-center gap-2">
                        <span className="text-[10px] font-black bg-primary text-primary-foreground size-5 flex items-center justify-center rounded-full">
                          {String.fromCharCode(65 + sIdx)}
                        </span>
                        <EditableCell
                          value={section.jobCategoryId}
                          type="select"
                          options={jobCategoryOptions}
                          onUpdate={(v) => updateSection(sIdx, 'jobCategoryId', v)}
                          className="font-black uppercase text-xs flex-1"
                        />
                      </div>
                    </TableCell>
                    <TableCell className="p-0 border-r border-b border-white/80 bg-primary/5">
                      <EditableCell
                        value={section.description}
                        type="textarea"
                        onUpdate={(v) => updateSection(sIdx, 'description', v)}
                        placeholder="Enter category description..."
                        className="font-semibold italic !py-1 text-[11px]"
                      />
                    </TableCell>
                    <TableCell className="p-0 border-r border-b border-white/80 bg-primary/5">
                      <EditableCell
                        value={section.qty || 1}
                        type="number"
                        onUpdate={(v) => updateSection(sIdx, 'qty', v)}
                        className="font-bold text-xs"
                      />
                    </TableCell>
                    <TableCell className="p-0 border-r border-b border-white/80 bg-primary/5" />
                    <TableCell className="p-0 border-r border-b border-white/80 bg-primary/5">
                      <EditableCell
                        value={section.unit || 'Unit'}
                        type="text"
                        onUpdate={(v) => updateSection(sIdx, 'unit', v)}
                        placeholder="e.g. sqm, birds, m"
                        className="font-medium text-xs uppercase"
                      />
                    </TableCell>
                    <TableCell className="p-0 border-r border-b border-white/80 bg-primary/5" />
                    <TableCell className="p-0 border-r border-b border-white/80 bg-primary/5 text-right font-black text-sm">
                      <div className="px-2 py-1 text-[12px]">
                        ${calculateSectionTotal(section).toFixed(2)}
                      </div>
                    </TableCell>
                    {isJobApproved && <TableCell className="p-0 border-r border-b border-white/80 bg-primary/5" />}
                    <TableCell className="p-0 text-center bg-muted/50 border-r border-b border-white/80">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive"
                        onClick={() => removeSection(sIdx)}
                      >
                        <Trash2 className="size-3" />
                      </Button>
                    </TableCell>
                  </TableRow>

                  {/* Nested Items */}
                  {filteredItems.map(({ item, originalIdx }, displayIdx) => (
                    <TableRow
                      key={item.id}
                      className="group h-10 border-b border-white/80 transition-colors"
                    >
                      <TableCell className="text-center tabular-nums font-bold text-[11px] opacity-50 border-r border-b border-white/80">
                        {displayIdx + 1}
                      </TableCell>
                      <TableCell className="p-0 border-r border-b border-white/80 group-hover:bg-muted/30 pl-4">
                        <div className="flex flex-col py-1">
                          <div className="flex items-center gap-2">
                            <div className="relative flex-1">
                              <EditableCell
                                value={item.itemName || ''}
                                type="text"
                                readOnly={isItemLocked(item)}
                                onUpdate={(v) => updateItemInSection(sIdx, originalIdx, 'itemName', v)}
                                placeholder="Enter item name..."
                              />
                              {!isItemLocked(item) && (
                                <div className="inline-flex ml-1">
                                  <EditableCell
                                    value=""
                                    type="searchable-select"
                                    options={inventoryOptions}
                                    onUpdate={(v) => updateItemInSection(sIdx, originalIdx, 'inventoryItemId', v)}
                                  >
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-6 w-6 text-muted-foreground hover:text-primary"
                                    >
                                      <Search className="size-3" />
                                    </Button>
                                  </EditableCell>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="p-0 border-r border-b border-white/80">
                        <EditableCell
                          value={item.description || ''}
                          type="textarea"
                          readOnly={isItemLocked(item)}
                          onUpdate={(v) => updateItemInSection(sIdx, originalIdx, 'description', v)}
                          placeholder="Description"
                        />
                      </TableCell>
                      <TableCell className="p-0 border-r border-b border-white/80">
                        <EditableCell
                          value={item.qtyRequired || 0}
                          type="number"
                          readOnly={isItemLocked(item)}
                          commitOnChange
                          onUpdate={(v) => updateItemInSection(sIdx, originalIdx, 'qtyRequired', v)}
                        />
                      </TableCell>
                      <TableCell className="p-1 border-r border-b border-white/80 align-middle">
                        <AvailabilityDisplay availability={getAvailability(item)} />
                      </TableCell>
                      <TableCell className="p-0 border-r border-b border-white/80">
                        {!item.inventoryItemId ? (
                          <EditableCell
                            value={item.uom || 'PCS'}
                            type="text"
                            readOnly={isItemLocked(item)}
                            onUpdate={(v) => updateItemInSection(sIdx, originalIdx, 'uom', v)}
                            placeholder="PCS"
                            className="uppercase text-xs"
                          />
                        ) : (
                          <div className="px-2 py-1 text-[11px] font-medium uppercase text-muted-foreground">
                            {item.uom || getAvailability(item).uom || 'PCS'}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="p-0 border-r border-b border-white/80 text-right">
                        <EditableCell
                          value={item.irdSellingPrice || 0}
                          type="unit-price"
                          readOnly={isItemLocked(item)}
                          onUpdate={(v) => updateItemInSection(sIdx, originalIdx, 'irdSellingPrice', v)}
                        />
                      </TableCell>
                      <TableCell className="p-0 border-r border-b border-white/80 text-right bg-accent/5 font-medium">
                        <div className="px-2 py-1 text-[11px]">
                          ${calculateRow(item).totalInventoryPrice.toFixed(2)}
                        </div>
                      </TableCell>
                      {isJobApproved && (
                        <TableCell className="p-1 text-center border-r border-b border-white/80">
                          <div className="flex flex-col items-center justify-center gap-1">
                            <div className="flex items-center justify-center gap-1">
                              <Badge variant={item.approvalStatus === 'APPROVED_MANAGER' ? 'default' : item.approvalStatus === 'APPROVED_ACCOUNTANT' ? 'secondary' : 'outline'} className="text-[9px] px-1 py-0 uppercase">
                                {item.approvalStatus === 'APPROVED_MANAGER' ? 'MGR OK' : item.approvalStatus === 'APPROVED_ACCOUNTANT' ? 'ACCT OK' : 'PENDING'}
                              </Badge>
                            {(!item.approvalStatus || item.approvalStatus === 'PENDING') && isAccountant && (
                              <div className="flex items-center gap-0.5">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-5 w-5 text-emerald-500 hover:bg-emerald-50"
                                  onClick={() => onApproveItem?.(item.id, 'APPROVED_ACCOUNTANT')}
                                >
                                  <svg className="size-3" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5"/></svg>
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-5 w-5 text-red-500 hover:bg-red-50"
                                  onClick={() => onApproveItem?.(item.id, 'REJECTED')}
                                >
                                  <svg className="size-3" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                                </Button>
                              </div>
                            )}
                              {item.approvalStatus === 'APPROVED_ACCOUNTANT' && isManager && (
                              <div className="flex items-center gap-0.5">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-5 w-5 text-emerald-500 hover:bg-emerald-50"
                                  onClick={() => onApproveItem?.(item.id, 'APPROVED_MANAGER')}
                                >
                                  <svg className="size-3" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5"/></svg>
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-5 w-5 text-red-500 hover:bg-red-50"
                                  onClick={() => onApproveItem?.(item.id, 'REJECTED')}
                                >
                                  <svg className="size-3" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                                </Button>
                              </div>
                              )}
                            </div>
                            {getPostingError(item) && (
                              <div
                                className="flex max-w-[170px] items-start gap-1 text-left text-[9px] leading-tight text-red-600"
                                title={getPostingError(item) || undefined}
                              >
                                <AlertTriangle className="mt-0.5 size-2.5 shrink-0" />
                                <span className="line-clamp-2">{getPostingError(item)}</span>
                              </div>
                            )}
                          </div>
                        </TableCell>
                      )}
                      <TableCell className="p-0 text-center border-r border-b border-white/80">
                        {isItemLocked(item) ? (
                          <Lock className="size-3 mx-auto text-muted-foreground/50" />
                        ) : (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive opacity-0 group-hover:opacity-100"
                            onClick={() => removeItemFromSection(sIdx, originalIdx)}
                          >
                            <Trash2 className="size-3" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}

                  {/* Add Item Row */}
                  <TableRow className="h-8 hover:bg-transparent border-b-2 border-muted/30 mb-2">
                    <TableCell colSpan={columns.length + 1} className="p-1 px-4">
                      <div className="flex items-center gap-2">
                        <EditableCell
                          value=""
                          type="searchable-select"
                          options={inventoryOptions}
                          onUpdate={(v: string) => handleAddFromCatalog(sIdx, v)}
                        >
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 text-[10px] font-bold"
                            disabled={!canAddItemToSection(section)}
                          >
                            <Plus className="size-3 mr-1" /> Add from Catalog
                          </Button>
                        </EditableCell>
                        <span className="text-muted-foreground text-[10px]">|</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 text-[10px] font-bold"
                          disabled={!canAddItemToSection(section)}
                          onClick={() => addNewItemToSection(sIdx)}
                        >
                          <Plus className="size-3 mr-1" /> Add Other Service
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                </React.Fragment>
              ))}
            </TableBody>
          </Table>
        ) : (
          /* Mobile View */
          <div className="space-y-4 px-2 py-2">
            {filteredSections.length === 0 && searchQuery.trim() && (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <h4 className="text-sm font-bold text-muted-foreground">No matching items</h4>
              </div>
            )}
            {filteredSections.map(({ section, sIdx, filteredItems }) => (
              <div key={section.id} className="space-y-3 rounded-xl border bg-muted/10 p-1 shadow-sm">
                {/* Section Header */}
                <div className="relative overflow-hidden rounded-lg border bg-card shadow-sm">
                  <div className="flex items-center justify-between px-3 py-1.5 bg-brand-primary/5 border-b border-brand-primary/10">
                    <span className="text-[9px] font-black uppercase tracking-widest text-brand-primary">
                      Section {sIdx + 1}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive"
                      onClick={() => removeSection(sIdx)}
                    >
                      <Trash2 className="size-3" />
                    </Button>
                  </div>
                  <div className="p-3 space-y-3">
                    <div className="space-y-1.5">
                      <label className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/60 ml-1">
                        Category
                      </label>
                      <EditableCell
                        value={section.jobCategoryId}
                        type="select"
                        options={jobCategoryOptions}
                        onUpdate={(v) => updateSection(sIdx, 'jobCategoryId', v)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/60 ml-1">
                        Description
                      </label>
                      <textarea
                        value={section.description}
                        onChange={(e) => updateSection(sIdx, 'description', e.target.value)}
                        className="w-full bg-background border border-border/60 rounded-lg px-3 py-2 text-xs italic min-h-[60px]"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/60 ml-1">
                          Qty
                        </label>
                        <input
                          type="number"
                          value={section.qty || 1}
                          onChange={(e) => updateSection(sIdx, 'qty', Number(e.target.value))}
                          className="h-9 w-full rounded-lg border-border/60 bg-background px-3 text-xs font-bold"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/60 ml-1">
                          Unit
                        </label>
                        <input
                          type="text"
                          value={section.unit || 'Unit'}
                          onChange={(e) => updateSection(sIdx, 'unit', e.target.value)}
                          placeholder="e.g. sqm, birds, m"
                          className="h-9 w-full rounded-lg border-border/60 bg-background px-3 text-xs font-bold uppercase"
                        />
                      </div>
                    </div>
                    <div className="flex justify-between items-center p-2 rounded-lg bg-brand-primary/5">
                      <span className="text-[9px] font-black text-muted-foreground uppercase">Section Total</span>
                      <span className="text-base font-black text-brand-primary">
                        ${calculateSectionTotal(section).toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Items */}
                <div className="space-y-2 px-1">
                  {filteredItems.map(({ item, originalIdx }, displayIdx) => (
                    <div
                      key={item.id}
                      className="relative overflow-hidden rounded-xl border bg-card shadow-sm"
                    >
                      <div className="flex items-center justify-between px-3 py-1.5 bg-muted/5 border-b">
                        <span className="text-[9px] font-bold text-muted-foreground uppercase">
                          Item {displayIdx + 1}
                        </span>
                      </div>
                      <div className="p-3 space-y-3">
                        <div className="space-y-1.5">
                          <label className="text-[9px] font-black uppercase text-muted-foreground/60 ml-1">
                            Name
                          </label>
                          <input
                            value={item.itemName || ''}
                            onChange={(e) =>
                              updateItemInSection(sIdx, originalIdx, 'itemName', e.target.value)
                            }
                            className="h-9 w-full rounded-lg border-border/60 bg-background px-3 text-xs font-bold"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[9px] font-black uppercase text-muted-foreground/60 ml-1">
                            Description
                          </label>
                          <textarea
                            value={item.description || ''}
                            onChange={(e) =>
                              updateItemInSection(sIdx, originalIdx, 'description', e.target.value)
                            }
                            className="w-full bg-background border border-border/60 rounded-lg px-3 py-1.5 text-xs min-h-[40px]"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <label className="text-[9px] font-black uppercase text-muted-foreground/60 ml-1">
                              Qty
                            </label>
                            <input
                              type="number"
                              value={item.qtyRequired || 0}
                              onChange={(e) =>
                                updateItemInSection(sIdx, originalIdx, 'qtyRequired', Number(e.target.value))
                              }
                              className="h-9 w-full rounded-lg border-border/60 bg-background px-3 text-xs font-bold"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[9px] font-black uppercase text-muted-foreground/60 ml-1">
                              Unit Price ($)
                            </label>
                            <input
                              type="number"
                              step="any"
                              value={item.irdSellingPrice || 0}
                              onChange={(e) =>
                                updateItemInSection(
                                  sIdx,
                                  originalIdx,
                                  'irdSellingPrice',
                                  Number(e.target.value)
                                )
                              }
                              className="h-9 w-full rounded-lg border-border/60 bg-background px-3 text-xs font-bold text-blue-600"
                            />
                          </div>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[9px] font-black uppercase text-muted-foreground/60 ml-1">
                            Availability
                          </label>
                          <AvailabilityDisplay availability={getAvailability(item)} />
                        </div>
                        {isJobApproved && (
                          <div className="pt-2 flex items-center justify-between border-t border-dashed">
                            <span className="text-[9px] font-black uppercase text-muted-foreground/60">Status</span>
                            <div className="flex flex-col items-end gap-1.5">
                              <div className="flex items-center gap-1.5">
                                <Badge variant={item.approvalStatus === 'APPROVED_MANAGER' ? 'default' : item.approvalStatus === 'APPROVED_ACCOUNTANT' ? 'secondary' : 'outline'} className="text-[9px] px-1.5 py-0 uppercase">
                                  {item.approvalStatus === 'APPROVED_MANAGER' ? 'MGR OK' : item.approvalStatus === 'APPROVED_ACCOUNTANT' ? 'ACCT OK' : 'PENDING'}
                                </Badge>
                              {(!item.approvalStatus || item.approvalStatus === 'PENDING') && isAccountant && (
                                <div className="flex items-center gap-1">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-6 px-2 text-[9px] font-black text-emerald-600 border-emerald-500/30 hover:bg-emerald-50 bg-emerald-50/50"
                                    onClick={() => onApproveItem?.(item.id, 'APPROVED_ACCOUNTANT')}
                                  >
                                    Approve
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-6 px-2 text-[9px] font-black text-red-600 border-red-500/30 hover:bg-red-50 bg-red-50/50"
                                    onClick={() => onApproveItem?.(item.id, 'REJECTED')}
                                  >
                                    Reject
                                  </Button>
                                </div>
                              )}
                                {item.approvalStatus === 'APPROVED_ACCOUNTANT' && isManager && (
                                <div className="flex items-center gap-1">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-6 px-2 text-[9px] font-black text-emerald-600 border-emerald-500/30 hover:bg-emerald-50 bg-emerald-50/50"
                                    onClick={() => onApproveItem?.(item.id, 'APPROVED_MANAGER')}
                                  >
                                    Approve
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-6 px-2 text-[9px] font-black text-red-600 border-red-500/30 hover:bg-red-50 bg-red-50/50"
                                    onClick={() => onApproveItem?.(item.id, 'REJECTED')}
                                  >
                                    Reject
                                  </Button>
                                </div>
                                )}
                              </div>
                              {getPostingError(item) && (
                                <div className="flex max-w-[240px] items-start gap-1 text-right text-[10px] leading-tight text-red-600">
                                  <AlertTriangle className="mt-0.5 size-3 shrink-0" />
                                  <span>{getPostingError(item)}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                        <div className="pt-2 flex items-center justify-between border-t">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-destructive"
                            onClick={() => removeItemFromSection(sIdx, originalIdx)}
                          >
                            <Trash2 className="size-3" />
                          </Button>
                          <span className="text-sm font-black text-brand-primary">
                            ${calculateRow(item).totalInventoryPrice.toFixed(2)}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}

                  {/* Add Item (Mobile) */}
                  <div className="grid grid-cols-2 gap-2">
                    <EditableCell
                      value=""
                      type="searchable-select"
                      options={inventoryOptions}
                      onUpdate={(v: string) => handleAddFromCatalog(sIdx, v)}
                    >
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full h-9 rounded-lg border-dashed text-[10px] font-black uppercase"
                      >
                        <Search className="size-3 mr-1" /> Catalog
                      </Button>
                    </EditableCell>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full h-9 rounded-lg border-dashed text-[10px] font-black uppercase"
                      onClick={() => addNewItemToSection(sIdx)}
                    >
                      <Plus className="size-3 mr-1" /> Custom
                    </Button>
                  </div>
                </div>
              </div>
            ))}

            {modelValue.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <LayoutGrid className="size-10 text-muted-foreground/30 mb-2" />
                <h4 className="text-base font-black text-muted-foreground">Requisition Empty</h4>
                <p className="text-sm text-muted-foreground/60">Add job category sections to start.</p>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="p-3 border-t bg-muted/10 flex flex-col md:flex-row gap-4">
        <Button
          variant="default"
          size="sm"
          className="h-9 md:h-8 shadow-sm font-bold"
          disabled={!allItemsCompleteGlobally}
          onClick={addNewSection}
        >
          <Plus className="size-4 mr-1" /> Add Job Category Section
        </Button>
        <p className="text-[10px] text-muted-foreground flex items-center italic">
          * Category rows appear as summarized lines on the Project Invoice.
        </p>
      </div>
    </div>
  )
}
