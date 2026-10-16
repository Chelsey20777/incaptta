'use client'

import React, { useState, useMemo, useCallback, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Plus, Trash2, Search, ChevronDown } from 'lucide-react'
import { useAdminStore } from '@/stores/admin-store'
import EditableCell from '@/features/jobCards/components/EditableCell'
import type { QuoteRequisitionSection, QuoteItem } from '../types'
import { lineExtendedAmounts, sectionExtendedTotal } from '@/lib/crm/quotation-commercial'

interface QuoteRequisitionGridProps {
  modelValue: QuoteRequisitionSection[]
  inventoryItems: any[]
  onUpdate: (sections: QuoteRequisitionSection[]) => void
}

export default function QuoteRequisitionGrid({
  modelValue,
  inventoryItems,
  onUpdate,
}: QuoteRequisitionGridProps) {
  const adminStore = useAdminStore()

  const inventoryOptions = useMemo(
    () =>
      inventoryItems.map((item: any) => ({
        value: item.id,
        label: `${item.name}${item.sku ? ` (${item.sku})` : ''}`,
        description: item.description || '',
        price: item.sellingPrice ?? 0,
        cost: item.totalCost ?? 0,
        stockCount: item.onHand ?? 0,
        uom: item.uom || '',
      })),
    [inventoryItems],
  )

  const jobCategoryOptions = useMemo(
    () =>
      (adminStore.jobCategories || []).map((cat: any) => ({
        value: cat.id,
        label: cat.name,
      })),
    [adminStore.jobCategories],
  )

  const calculateRow = useCallback((item: QuoteItem) => {
    const amounts = lineExtendedAmounts(item)
    return { baseIRD: amounts.baseIRD, markupValue: amounts.markupValue, totalPrice: amounts.totalPrice }
  }, [])

  const calculateSectionTotal = useCallback(
    (section: QuoteRequisitionSection) => sectionExtendedTotal(section),
    [],
  )

  useEffect(() => {
    if (!inventoryOptions.length || !modelValue.length) return
    let changed = false
    const next = modelValue.map(section => ({
      ...section,
      items: (section.items || []).map(item => {
        if (!item.inventoryItemId || Number(item.costSnapshot) > 0) return item
        const option = inventoryOptions.find(option => option.value === item.inventoryItemId)
        if (!option || !(Number(option.cost) > 0)) return item
        changed = true
        return { ...item, costSnapshot: option.cost }
      }),
    }))
    if (changed) onUpdate(next)
  }, [inventoryOptions, modelValue, onUpdate])

  // ── Section CRUD ──

  const allItemsCompleteGlobally = useMemo(() => {
    return modelValue.every((section) =>
      (section.items || []).every((item) => !!item.inventoryItemId || !!item.itemName),
    )
  }, [modelValue])

  const addNewSection = useCallback(() => {
    if (!allItemsCompleteGlobally && modelValue.length > 0) return
    const newSection: QuoteRequisitionSection = {
      id: crypto.randomUUID(),
      jobCategoryId: '',
      description: '',
      qty: 1,
      unit: 'Unit',
      items: [],
    }
    onUpdate([...modelValue, newSection])
  }, [modelValue, allItemsCompleteGlobally, onUpdate])

  const removeSection = useCallback(
    (index: number) => {
      onUpdate(modelValue.filter((_, i) => i !== index))
    },
    [modelValue, onUpdate],
  )

  const updateSection = useCallback(
    (index: number, field: string, value: any) => {
      const newSections = [...modelValue]
      const section = { ...newSections[index] }

      if (field === 'qty') {
        const oldQty = Number(section.qty) || 1
        const newQty = Math.max(1, Number(value) || 1)
        section.qty = newQty

        const factor = newQty / oldQty
        if (section.items && section.items.length > 0) {
          section.items = section.items.map((item: any) => {
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
    },
    [modelValue, onUpdate, adminStore.jobCategories],
  )

  // ── Item CRUD ──

  const canAddItemToSection = useCallback(
    (section: QuoteRequisitionSection) => {
      if (!allItemsCompleteGlobally && (section.items || []).length > 0) return false
      if (!section.items || section.items.length === 0) return true
      return section.items.every((item) => !!item.inventoryItemId || !!item.itemName)
    },
    [allItemsCompleteGlobally],
  )

  const addNewItemToSection = useCallback(
    (sIdx: number) => {
      if (!canAddItemToSection(modelValue[sIdx])) return
      const newSections = [...modelValue]
      const section = { ...newSections[sIdx] }
      const newItem: QuoteItem = {
        id: crypto.randomUUID(),
        inventoryItemId: '',
        itemName: 'New Item',
        description: '',
        qtyRequired: 1,
        irdSellingPrice: 0,
        markupPercent: 0,
        uom: 'PCS',
      }
      section.items = [...(section.items || []), newItem]
      newSections[sIdx] = section
      onUpdate(newSections)
    },
    [modelValue, canAddItemToSection, onUpdate],
  )

  const handleAddFromCatalog = useCallback(
    (sIdx: number, itemId: string) => {
      if (!canAddItemToSection(modelValue[sIdx])) return
      const option = inventoryOptions.find((o) => o.value === itemId)
      if (!option) return
      const newSections = [...modelValue]
      const section = { ...newSections[sIdx] }
      const newItem: QuoteItem = {
        id: crypto.randomUUID(),
        inventoryItemId: option.value,
        itemName: option.label,
        description: option.description,
        qtyRequired: 1,
        irdSellingPrice: option.price,
        markupPercent: 0,
        uom: option.uom || 'PCS',
        priceOverride: false,
        costSnapshot: option.cost ?? 0,
      }
      section.items = [...(section.items || []), newItem]
      newSections[sIdx] = section
      onUpdate(newSections)
    },
    [modelValue, inventoryOptions, canAddItemToSection, onUpdate],
  )

  const updateItemInSection = useCallback(
    (sIdx: number, iIdx: number, field: string, value: any) => {
      const newSections = [...modelValue]
      const section = { ...newSections[sIdx] }
      const items = [...(section.items || [])]
      const item = { ...items[iIdx], [field]: value }

      if (field === 'inventoryItemId') {
        const option = inventoryOptions.find((o) => o.value === value)
        if (option) {
          item.inventoryItemId = option.value
          item.itemName = option.label
          item.markupPercent = 0
          item.description = option.description
          item.uom = option.uom || item.uom || 'PCS'
          item.costSnapshot = option.cost ?? 0
          if (!item.priceOverride) {
            item.irdSellingPrice = option.price
          }
        }
      }

      if (field === 'irdSellingPrice' && item.inventoryItemId) {
        item.priceOverride = true
      }

      if (field === 'priceOverride' && value === false) {
        const option = inventoryOptions.find((o) => o.value === item.inventoryItemId)
        if (option) item.irdSellingPrice = option.price
      }

      items[iIdx] = item
      section.items = items
      newSections[sIdx] = section
      onUpdate(newSections)
    },
    [modelValue, inventoryOptions, onUpdate],
  )

  const removeItemFromSection = useCallback(
    (sIdx: number, iIdx: number) => {
      const newSections = [...modelValue]
      const section = { ...newSections[sIdx] }
      section.items = (section.items || []).filter((_, i) => i !== iIdx)
      newSections[sIdx] = section
      onUpdate(newSections)
    },
    [modelValue, onUpdate],
  )

  // ── Render ──

  return (
    <div className="border rounded-md overflow-hidden bg-background font-sans">
      <div className="overflow-x-auto max-h-[600px] overflow-y-auto custom-scrollbar">
        <table className="w-full min-w-[980px] table-fixed border-collapse">
          <thead className="sticky top-0 bg-background z-10 border-b shadow-sm">
            <tr className="h-10">
              <th className="w-[50px] text-center text-[11px] font-bold uppercase text-muted-foreground border-r">#</th>
              <th className="text-left text-[11px] font-bold uppercase text-muted-foreground px-2 border-r">Item / Category</th>
              <th className="text-left text-[11px] font-bold uppercase text-muted-foreground px-2 border-r">Description</th>
              <th className="w-[70px] text-right text-[11px] font-bold uppercase text-muted-foreground px-2 border-r">Qty</th>
              <th className="w-[80px] text-left text-[11px] font-bold uppercase text-muted-foreground px-2 border-r">Unit</th>
              <th className="w-[100px] text-right text-[11px] font-bold uppercase text-muted-foreground px-2 border-r">Base Price</th>
              <th className="w-[90px] text-right text-[11px] font-bold uppercase text-muted-foreground px-2 border-r">Markup %</th>
              <th className="w-[110px] text-right text-[11px] font-bold uppercase text-muted-foreground px-2 border-r">Total</th>
              <th className="w-[50px]" />
            </tr>
          </thead>
          <tbody>
            {modelValue.length === 0 ? (
              <tr>
                <td colSpan={9} className="text-center py-20 text-sm text-muted-foreground">
                  No requisition sections yet. Click "Add Section" below to get started.
                </td>
              </tr>
            ) : (
              modelValue.map((section, sIdx) => (
                <React.Fragment key={section.id}>
                  {/* Section Header Row */}
                  <tr className="h-10 bg-muted/50 border-y-2 border-muted hover:bg-muted/60">
                    <td className="text-center text-[10px] font-black opacity-30 border-r">S{sIdx + 1}</td>
                    <td className="p-0 border-r bg-primary/5">
                      <div className="flex items-center gap-2 px-3">
                        <span className="text-[10px] font-black bg-primary text-primary-foreground size-5 flex items-center justify-center rounded-full shrink-0">
                          {String.fromCharCode(65 + sIdx)}
                        </span>
                        <div className="flex-1 min-w-0">
                          <EditableCell
                            value={section.jobCategoryId}
                            type="select"
                            options={jobCategoryOptions}
                            onUpdate={(v) => updateSection(sIdx, 'jobCategoryId', v)}
                            className="font-black uppercase text-xs"
                          />
                        </div>
                      </div>
                    </td>
                    <td className="p-0 border-r bg-primary/5">
                      <EditableCell
                        value={section.description}
                        type="textarea"
                        onUpdate={(v) => updateSection(sIdx, 'description', v)}
                        placeholder="Section description..."
                        className="font-semibold italic !py-1 text-[11px]"
                      />
                    </td>
                    <td className="p-0 border-r bg-primary/5">
                      <EditableCell
                        value={section.qty || 1}
                        type="number"
                        onUpdate={(v) => updateSection(sIdx, 'qty', v)}
                        className="font-bold text-xs"
                      />
                    </td>
                    <td className="p-0 border-r bg-primary/5">
                      <EditableCell
                        value={section.unit || 'Unit'}
                        type="text"
                        onUpdate={(v) => updateSection(sIdx, 'unit', v)}
                        placeholder="e.g. sqm, birds, m"
                        className="font-medium text-xs uppercase"
                      />
                    </td>
                    <td className="p-0 border-r bg-primary/5" />
                    <td className="p-0 border-r bg-primary/5" />
                    <td className="text-right px-2 font-black text-sm border-r bg-primary/5">
                      ${calculateSectionTotal(section).toFixed(2)}
                    </td>
                    <td className="p-0 text-center bg-muted/50">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive"
                        onClick={() => removeSection(sIdx)}
                      >
                        <Trash2 className="size-3" />
                      </Button>
                    </td>
                  </tr>

                  {/* Item Rows */}
                  {(section.items || []).map((item, iIdx) => (
                    <tr key={`${section.id}-${iIdx}`} className="group h-10 border-b hover:bg-muted/30 transition-colors">
                      <td className="text-center tabular-nums font-bold text-[11px] opacity-50 border-r">
                        {iIdx + 1}
                      </td>
                      <td className="p-0 border-r">
                        <div className="flex items-center">
                          <div className="flex-1 min-w-0">
                            <EditableCell
                              value={item.itemName || ''}
                              type="text"
                              onUpdate={(v) => updateItemInSection(sIdx, iIdx, 'itemName', v)}
                              placeholder="Enter item name..."
                            />
                          </div>
                          <EditableCell
                            value=""
                            type="searchable-select"
                            options={inventoryOptions}
                            onUpdate={(v) => updateItemInSection(sIdx, iIdx, 'inventoryItemId', v)}
                          >
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-muted-foreground hover:text-primary shrink-0"
                            >
                              <Search className="size-3" />
                            </Button>
                          </EditableCell>
                        </div>
                      </td>
                      <td className="p-0 border-r">
                        <EditableCell
                          value={item.description || ''}
                          type="textarea"
                          onUpdate={(v) => updateItemInSection(sIdx, iIdx, 'description', v)}
                          placeholder="Description"
                        />
                      </td>
                      <td className="p-0 border-r">
                        <EditableCell
                          value={item.qtyRequired || 0}
                          type="number"
                          commitOnChange
                          onUpdate={(v) => updateItemInSection(sIdx, iIdx, 'qtyRequired', v)}
                        />
                      </td>
                      <td className="p-0 border-r">
                        {!item.inventoryItemId ? (
                          <EditableCell
                            value={item.uom || 'PCS'}
                            type="text"
                            onUpdate={(v) => updateItemInSection(sIdx, iIdx, 'uom', v)}
                            placeholder="PCS"
                            className="uppercase text-xs"
                          />
                        ) : (
                          <div className="px-2 py-1 text-[11px] font-medium uppercase text-muted-foreground">
                            {item.uom || 'PCS'}
                          </div>
                        )}
                      </td>
                      <td className="p-0 border-r text-right">
                        {!item.inventoryItemId || item.priceOverride ? (
                          <div className="flex items-center justify-end gap-1">
                            <EditableCell
                              value={item.irdSellingPrice || 0}
                              type="currency"
                              onUpdate={(v) => updateItemInSection(sIdx, iIdx, 'irdSellingPrice', v)}
                            />
                            {item.inventoryItemId && item.priceOverride && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 px-1 text-[9px] shrink-0"
                                title="Restore catalog base price"
                                onClick={() => updateItemInSection(sIdx, iIdx, 'priceOverride', false)}
                              >
                                Reset
                              </Button>
                            )}
                          </div>
                        ) : (
                          <div className="flex items-center justify-end gap-1 px-1">
                            <div className="px-2 py-1 text-[11px] font-mono tabular-nums text-muted-foreground">
                              ${(item.irdSellingPrice || 0).toFixed(2)}
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 px-1 text-[9px] shrink-0"
                              title="Override catalog base price"
                              onClick={() => updateItemInSection(sIdx, iIdx, 'priceOverride', true)}
                            >
                              Override
                            </Button>
                          </div>
                        )}
                      </td>
                      <td className="p-0 border-r">
                        <EditableCell
                          value={item.markupPercent || 0}
                          type="number"
                          commitOnChange
                          onUpdate={(v) => updateItemInSection(sIdx, iIdx, 'markupPercent', v)}
                        />
                      </td>
                      <td className="p-0 border-r text-right bg-accent/5 font-medium">
                        <div className="px-2 py-1 text-[11px] font-mono font-bold tabular-nums">
                          ${calculateRow(item).totalPrice.toFixed(2)}
                        </div>
                      </td>
                      <td className="p-0 text-center">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive opacity-0 group-hover:opacity-100"
                          onClick={() => removeItemFromSection(sIdx, iIdx)}
                        >
                          <Trash2 className="size-3" />
                        </Button>
                      </td>
                    </tr>
                  ))}

                  {/* Add Item Row */}
                  <tr className="h-8 hover:bg-transparent border-b-2 border-muted/30">
                    <td colSpan={9} className="p-1 px-4">
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
                          <Plus className="size-3 mr-1" /> Add Custom Item
                        </Button>
                      </div>
                    </td>
                  </tr>
                </React.Fragment>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="flex items-center gap-4 p-3 border-t bg-muted/10">
        <Button
          variant="default"
          size="sm"
          className="h-9 shadow-sm font-bold"
          disabled={!allItemsCompleteGlobally && modelValue.length > 0}
          onClick={addNewSection}
        >
          <Plus className="size-4 mr-1" /> Add Job Category Section
        </Button>
        <p className="text-[10px] text-muted-foreground italic">
          Category rows appear as summarized lines on the generated PDF.
        </p>
      </div>
    </div>
  )
}