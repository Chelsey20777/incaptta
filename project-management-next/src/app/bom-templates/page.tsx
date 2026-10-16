'use client'

import React, { useState, useMemo, useEffect } from 'react'
import {
  Plus,
  Trash2,
  Edit2,
  ChevronDown,
  ChevronRight,
  Database,
  Zap,
  Loader2
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useBomTemplateStore, type BomTemplateRow } from '@/stores/bom-templates-store'
import { useAdminStore } from '@/stores/admin-store'
import { useInventoryStore } from '@/stores/inventory-store'
import { STRUCTURE_SIZES } from '@/features/jobCards/constants/bomTemplates'

export default function BomTemplatesPage() {
  const {
    templates,
    loading,
    listen,
    cleanup,
    seedDefaults,
    createTemplate,
    renameTemplate,
    deleteTemplate,
    saveRows,
    updateTemplateMeta
  } = useBomTemplateStore()

  const { jobCategories, fetchAll: fetchAllAdmin } = useAdminStore()
  const { items: inventoryItems, fetchItems: fetchInventoryItems } = useInventoryStore()

  // ── Expand/collapse state ──────────────────────────────────────────────────
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const toggleExpand = (id: string) => {
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }))
  }

  // ── Sync data ──────────────────────────────────────────────────────────────
  useEffect(() => {
    listen()
    fetchAllAdmin()
    fetchInventoryItems({ isActive: true })
    return () => {
      cleanup()
    }
  }, [])

  // ── New template dialog state ──────────────────────────────────────────────
  const [showNewTemplate, setShowNewTemplate] = useState(false)
  const [newTemplateName, setNewTemplateName] = useState('')

  const handleCreateTemplate = async () => {
    if (!newTemplateName.trim()) return
    await createTemplate(newTemplateName.trim())
    setNewTemplateName('')
    setShowNewTemplate(false)
  }

  // ── Rename template state ──────────────────────────────────────────────────
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

  const startRename = (id: string, currentName: string) => {
    setRenamingId(id)
    setRenameValue(currentName)
  }

  const commitRename = async () => {
    if (!renamingId || !renameValue.trim()) {
      setRenamingId(null)
      return
    }
    await renameTemplate(renamingId, renameValue.trim())
    setRenamingId(null)
  }

  // ── Add/Edit Item dialog state ─────────────────────────────────────────────
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [addingToTemplateId, setAddingToTemplateId] = useState('')
  const [rowName, setRowName] = useState('')
  const [searchTerm, setSearchTerm] = useState('')

  const [showEditNameDialog, setShowEditNameDialog] = useState(false)
  const [editNameTemplateId, setEditNameTemplateId] = useState('')
  const [editNameRowId, setEditNameRowId] = useState('')
  const [editNameValue, setEditNameValue] = useState('')
  const [editSearchTerm, setEditSearchTerm] = useState('')

  // ── Filtered inventory lists ───────────────────────────────────────────────
  const filteredInventory = useMemo(() => {
    if (!searchTerm.trim()) return inventoryItems.slice(0, 15)
    const term = searchTerm.toLowerCase()
    return inventoryItems.filter(
      item =>
        item.isActive &&
        (item.name.toLowerCase().includes(term) || item.sku.toLowerCase().includes(term))
    )
  }, [inventoryItems, searchTerm])

  const filteredEditInventory = useMemo(() => {
    if (!editSearchTerm.trim()) return inventoryItems.slice(0, 15)
    const term = editSearchTerm.toLowerCase()
    return inventoryItems.filter(
      item =>
        item.isActive &&
        (item.name.toLowerCase().includes(term) || item.sku.toLowerCase().includes(term))
    )
  }, [inventoryItems, editSearchTerm])

  const openAddRow = (templateId: string) => {
    setAddingToTemplateId(templateId)
    setRowName('')
    setSearchTerm('')
    setShowAddDialog(true)
  }

  const handleAddRow = async () => {
    if (!rowName.trim()) {
      toast.error('Item name is required')
      return
    }
    const template = templates.find(t => t.id === addingToTemplateId)
    if (!template) return
    const quantities = Object.fromEntries(STRUCTURE_SIZES.map(s => [s, 0]))
    const newRows = [...template.rows, { id: crypto.randomUUID(), name: rowName.trim(), quantities }]
    await saveRows(addingToTemplateId, newRows)
    toast.success('Item added — click any cell to enter quantities')
    setShowAddDialog(false)
  }

  const openEditName = (templateId: string, row: BomTemplateRow) => {
    setEditNameTemplateId(templateId)
    setEditNameRowId(row.id)
    setEditNameValue(row.name)
    setEditSearchTerm(row.name)
    setShowEditNameDialog(true)
  }

  const handleSaveItemName = async () => {
    if (!editNameValue.trim()) return
    const template = templates.find(t => t.id === editNameTemplateId)
    if (!template) return
    const newRows = template.rows.map(r =>
      r.id === editNameRowId ? { ...r, name: editNameValue.trim() } : r
    )
    await saveRows(editNameTemplateId, newRows)
    toast.success('Item name updated')
    setShowEditNameDialog(false)
  }

  // ── Spreadsheet inline cell editing state ──────────────────────────────────
  interface CellId {
    templateId: string
    rowId: string
    sizeIdx: number
  }
  const [editingCell, setEditingCell] = useState<CellId | null>(null)
  const [editingValue, setEditingValue] = useState('')

  const cellDataKey = (templateId: string, rowId: string, sizeIdx: number) => {
    return `${templateId}__${rowId}__${sizeIdx}`
  }

  const isEditingCell = (templateId: string, rowId: string, sizeIdx: number) => {
    return (
      editingCell !== null &&
      editingCell.templateId === templateId &&
      editingCell.rowId === rowId &&
      editingCell.sizeIdx === sizeIdx
    )
  }

  const startEdit = (templateId: string, rowId: string, sizeIdx: number, currentQty: number) => {
    setEditingCell({ templateId, rowId, sizeIdx })
    setEditingValue(currentQty > 0 ? String(currentQty) : '')
  }

  const commitEdit = async (moveToNext: boolean) => {
    if (!editingCell) return
    const { templateId, rowId, sizeIdx } = editingCell
    setEditingCell(null) // clear immediately

    const size = STRUCTURE_SIZES[sizeIdx]
    const template = templates.find(t => t.id === templateId)
    if (!template || !size) return
    const row = template.rows.find(r => r.id === rowId)
    if (!row) return

    const newQty = parseFloat(editingValue) || 0
    if (newQty !== (row.quantities[size] ?? 0)) {
      const newRows = template.rows.map(r =>
        r.id === rowId ? { ...r, quantities: { ...r.quantities, [size]: newQty } } : r
      )
      saveRows(templateId, newRows) // fire and forget
    }

    if (moveToNext) {
      let nextCell: CellId | null = null
      if (sizeIdx + 1 < STRUCTURE_SIZES.length) {
        nextCell = { templateId, rowId, sizeIdx: sizeIdx + 1 }
      } else {
        const rowIdx = template.rows.findIndex(r => r.id === rowId)
        const nextRow = template.rows[rowIdx + 1]
        if (nextRow) nextCell = { templateId, rowId: nextRow.id, sizeIdx: 0 }
      }

      if (nextCell) {
        const nextTemplate = templates.find(t => t.id === nextCell!.templateId)
        const nextRow = nextTemplate?.rows.find(r => r.id === nextCell!.rowId)
        const nextQty = nextRow?.quantities[STRUCTURE_SIZES[nextCell.sizeIdx]] ?? 0
        setEditingCell(nextCell)
        setEditingValue(nextQty > 0 ? String(nextQty) : '')
      }
    }
  }

  const handleCellKeydown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault()
      commitEdit(true)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      commitEdit(false)
    } else if (e.key === 'Escape') {
      setEditingCell(null)
    }
  }

  // Focus and select the editing cell input
  useEffect(() => {
    if (editingCell) {
      const key = cellDataKey(editingCell.templateId, editingCell.rowId, editingCell.sizeIdx)
      const input = document.querySelector(`[data-cell="${key}"] input`) as HTMLInputElement
      if (input) {
        input.focus()
        input.select()
      }
    }
  }, [editingCell])

  const handleDeleteRow = async (templateId: string, rowId: string, name: string) => {
    if (!confirm(`Delete "${name}" from this template?`)) return
    const template = templates.find(t => t.id === templateId)
    if (!template) return
    await saveRows(templateId, template.rows.filter(r => r.id !== rowId))
    toast.success('Item Removed')
  }

  const handleDeleteTemplate = async (id: string, name: string) => {
    if (!confirm(`Delete the entire "${name}" template? This cannot be undone.`)) return
    await deleteTemplate(id)
  }

  const [savingMeta, setSavingMeta] = useState<string | null>(null)
  const handleUpdateMeta = async (template: any, patch: { jobCategoryId?: string; categoryDescription?: string }) => {
    setSavingMeta(template.id)
    await updateTemplateMeta(template.id, {
      jobCategoryId: patch.jobCategoryId !== undefined ? patch.jobCategoryId : (template.jobCategoryId || ''),
      categoryDescription: patch.categoryDescription !== undefined ? patch.categoryDescription : (template.categoryDescription || '')
    })
    setSavingMeta(null)
  }

  const sizeLabels = STRUCTURE_SIZES.map(s => s.replace('m', ''))

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-lg font-medium text-foreground">BOM Templates</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Click any quantity cell to edit inline. Tab moves to the next cell.</p>
        </div>
        <div className="flex gap-2">
          {templates.length === 0 && (
            <Button
              variant="outline"
              size="sm"
              disabled={loading}
              onClick={seedDefaults}
              className="h-8 text-xs"
            >
              {loading ? <Loader2 className="mr-2 size-3 animate-spin" /> : <Database className="mr-2 size-3" />}
              Seed Defaults
            </Button>
          )}
          <Button size="sm" onClick={() => setShowNewTemplate(true)} className="h-8 text-xs">
            <Plus className="mr-2 size-3" />
            New Template
          </Button>
        </div>
      </div>

      {/* Empty State */}
      {templates.length === 0 && !loading && (
        <div className="rounded-lg border border-dashed border-muted-foreground/30 p-10 text-center text-sm text-muted-foreground bg-card/20">
          <Zap className="mx-auto mb-3 size-8 opacity-30 text-brand-secondary" />
          <p className="font-semibold text-foreground">No BOM templates yet.</p>
          <p className="mt-1 text-xs">Click <strong>Seed Defaults</strong> to load the standard templates, or create a new one.</p>
        </div>
      )}

      {/* Templates List */}
      <div className="space-y-4">
        {templates.map(template => (
          <div key={template.id} className="rounded-lg border bg-card shadow-sm overflow-hidden">
            {/* Header row */}
            <div
              className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors select-none"
              onClick={() => toggleExpand(template.id)}
            >
              <div className="flex items-center gap-3">
                {expanded[template.id] ? (
                  <ChevronDown className="size-4 text-muted-foreground shrink-0" />
                ) : (
                  <ChevronRight className="size-4 text-muted-foreground shrink-0" />
                )}
                {renamingId === template.id ? (
                  <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                    <Input
                      value={renameValue}
                      onChange={e => setRenameValue(e.target.value)}
                      className="h-7 w-48 text-xs px-2 py-0.5"
                      onKeyDown={e => {
                        if (e.key === 'Enter') commitRename()
                        else if (e.key === 'Escape') setRenamingId(null)
                      }}
                      autoFocus
                    />
                    <Button size="sm" className="h-7 px-2 text-xs" onClick={commitRename}>Save</Button>
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-muted-foreground" onClick={() => setRenamingId(null)}>Cancel</Button>
                  </div>
                ) : (
                  <>
                    <span className="font-semibold text-sm text-foreground">{template.name}</span>
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                      {template.rows?.length ?? 0} items
                    </Badge>
                  </>
                )}
              </div>
              <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => startRename(template.id, template.name)}>
                  <Edit2 className="size-3 text-muted-foreground hover:text-foreground" />
                </Button>
                <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => openAddRow(template.id)}>
                  <Plus className="size-3 mr-1" />
                  Add Item
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={() => handleDeleteTemplate(template.id, template.name)}
                >
                  <Trash2 className="size-3" />
                </Button>
              </div>
            </div>

            {/* Collapsed panels body */}
            {expanded[template.id] && (
              <>
                <div className="p-4 bg-muted/10 border-t grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80">Template Category</Label>
                    <Select
                      value={template.jobCategoryId || '_empty'}
                      onValueChange={(val) => handleUpdateMeta(template, { jobCategoryId: (val === '_empty' ? '' : val) || undefined })}
                    >
                      <SelectTrigger className="h-9 bg-background border-muted-foreground/20 text-xs">
                        <SelectValue placeholder="Assign a category to this BOM">
                          {template.jobCategoryId
                            ? (jobCategories.find((c) => c.id === template.jobCategoryId)?.name || template.jobCategoryId)
                            : 'No Category'}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_empty">No Category</SelectItem>
                        {jobCategories.map(cat => (
                          <SelectItem key={cat.id} value={cat.id}>
                            {cat.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-[10px] text-muted-foreground italic">Items will populate under this category in the Job Card.</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80">Category Description</Label>
                    <Textarea
                      defaultValue={template.categoryDescription || ''}
                      onBlur={(e) => handleUpdateMeta(template, { categoryDescription: e.target.value })}
                      placeholder="Detailed description for this category/section..."
                      className="min-h-[70px] text-xs bg-background border-muted-foreground/20 resize-none py-1.5"
                    />
                    <p className="text-[10px] text-muted-foreground italic">This will populate the section description in the Job Card.</p>
                  </div>
                </div>

                {/* Spreadsheet Table */}
                <div className="border-t overflow-x-auto w-full">
                  <table className="w-full text-xs border-collapse">
                    <thead className="bg-muted/40">
                      <tr>
                        <th className="text-left px-3 py-2 font-semibold sticky left-0 bg-muted/60 min-w-[180px] border-r border-border/40 z-10">
                          Item Name
                        </th>
                        {sizeLabels.map(size => (
                          <th
                            key={size}
                            className="text-center px-1 py-2 font-semibold min-w-[60px] whitespace-nowrap border-r border-border/20 last:border-r-0 text-[10px]"
                          >
                            {size}
                          </th>
                        ))}
                        <th className="px-2 py-2 w-16 sticky right-0 bg-muted/60 z-10 border-l border-border/40"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {template.rows?.map(row => (
                        <tr
                          key={row.id}
                          className="border-t border-border/30 hover:bg-muted/5 transition-colors group"
                        >
                          {/* Sticky Item Name Cell */}
                          <td className="px-3 py-0 font-medium sticky left-0 bg-card border-r border-border/40 h-8 z-10 truncate max-w-[200px]">
                            {row.name}
                          </td>

                          {/* Quantities cells */}
                          {STRUCTURE_SIZES.map((size, idx) => (
                            <td
                              key={size}
                              data-cell={cellDataKey(template.id, row.id, idx)}
                              className="p-0 border-r border-border/20 last:border-r-0 h-8 select-none"
                              onClick={() => {
                                if (!isEditingCell(template.id, row.id, idx)) {
                                  startEdit(template.id, row.id, idx, row.quantities[size] ?? 0)
                                }
                              }}
                            >
                              {isEditingCell(template.id, row.id, idx) ? (
                                <input
                                  type="number"
                                  min="0"
                                  value={editingValue}
                                  onChange={e => setEditingValue(e.target.value)}
                                  onKeyDown={handleCellKeydown}
                                  onBlur={() => commitEdit(false)}
                                  className="w-full h-8 px-1 text-center tabular-nums bg-primary/10 border-0 outline-hidden ring-2 ring-inset ring-brand-primary text-foreground text-xs"
                                />
                              ) : (
                                <div
                                  className="w-full h-8 flex items-center justify-center tabular-nums cursor-cell hover:bg-muted/30 transition-colors"
                                  style={{ color: (row.quantities[size] ?? 0) > 0 ? 'var(--foreground)' : 'var(--muted-foreground)' }}
                                >
                                  {(row.quantities[size] ?? 0) > 0 ? row.quantities[size] : '—'}
                                </div>
                              )}
                            </td>
                          ))}

                          {/* Row Actions */}
                          <td className="px-2 py-0 sticky right-0 bg-card h-8 z-10 border-l border-border/40">
                            <div className="flex gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                              <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => openEditName(template.id, row)} title="Rename item">
                                <Edit2 className="size-3 text-muted-foreground hover:text-foreground" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 w-6 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                                onClick={() => handleDeleteRow(template.id, row.id, row.name)}
                              >
                                <Trash2 className="size-3" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {(!template.rows || template.rows.length === 0) && (
                        <tr>
                          <td colSpan={STRUCTURE_SIZES.length + 2} className="px-3 py-6 text-center text-muted-foreground text-xs bg-muted/5">
                            No items yet. Click <strong>Add Item</strong> to get started.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        ))}
      </div>

      {/* New Template Dialog */}
      <Dialog open={showNewTemplate} onOpenChange={setShowNewTemplate}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>New BOM Template</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Label className="text-xs">Template Name</Label>
            <Input
              value={newTemplateName}
              onChange={e => setNewTemplateName(e.target.value)}
              placeholder="e.g. Fan Ventilation"
              onKeyDown={e => {
                if (e.key === 'Enter') handleCreateTemplate()
              }}
              className="text-xs h-9"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" className="h-8 text-xs" onClick={() => setShowNewTemplate(false)}>Cancel</Button>
            <Button className="h-8 text-xs" onClick={handleCreateTemplate} disabled={!newTemplateName.trim()}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Item Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Item</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label className="text-xs">Search Inventory or Type Custom Item</Label>
              <Input
                value={searchTerm}
                onChange={e => {
                  setSearchTerm(e.target.value)
                  setRowName(e.target.value)
                }}
                placeholder="Search items by name or SKU, or type custom..."
                className="text-xs h-9"
              />
            </div>
            {filteredInventory.length > 0 && (
              <div className="border rounded-lg overflow-hidden bg-card/30">
                <ScrollArea className="h-44">
                  <div className="p-1.5 space-y-0.5">
                    {filteredInventory.map(item => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          setRowName(item.name)
                          setSearchTerm(item.name)
                        }}
                        className="w-full flex items-center justify-between text-left px-3 py-1.5 text-xs rounded hover:bg-muted/70 transition-colors"
                      >
                        <div className="truncate pr-4">
                          <span className="font-medium text-foreground">{item.name}</span>
                          <span className="text-[10px] text-muted-foreground ml-1.5">({item.sku})</span>
                        </div>
                        <span className="text-[10px] font-bold text-muted-foreground/60 shrink-0">
                          {item.onHand ?? 0} {item.uom || 'PCS'}
                        </span>
                      </button>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            )}
            {rowName && (
              <p className="text-[10px] text-muted-foreground">
                Selected: <span className="font-semibold text-foreground">{rowName}</span>
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" className="h-8 text-xs" onClick={() => setShowAddDialog(false)}>Cancel</Button>
            <Button className="h-8 text-xs" onClick={handleAddRow} disabled={!rowName.trim()}>Add Item</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Item Name Dialog */}
      <Dialog open={showEditNameDialog} onOpenChange={setShowEditNameDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Item Name</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label className="text-xs">Search Inventory or Type Custom Item</Label>
              <Input
                value={editSearchTerm}
                onChange={e => {
                  setEditSearchTerm(e.target.value)
                  setEditNameValue(e.target.value)
                }}
                placeholder="Search items by name or SKU, or type custom..."
                className="text-xs h-9"
              />
            </div>
            {filteredEditInventory.length > 0 && (
              <div className="border rounded-lg overflow-hidden bg-card/30">
                <ScrollArea className="h-44">
                  <div className="p-1.5 space-y-0.5">
                    {filteredEditInventory.map(item => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          setEditNameValue(item.name)
                          setEditSearchTerm(item.name)
                        }}
                        className="w-full flex items-center justify-between text-left px-3 py-1.5 text-xs rounded hover:bg-muted/70 transition-colors"
                      >
                        <div className="truncate pr-4">
                          <span className="font-medium text-foreground">{item.name}</span>
                          <span className="text-[10px] text-muted-foreground ml-1.5">({item.sku})</span>
                        </div>
                        <span className="text-[10px] font-bold text-muted-foreground/60 shrink-0">
                          {item.onHand ?? 0} {item.uom || 'PCS'}
                        </span>
                      </button>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            )}
            {editNameValue && (
              <p className="text-[10px] text-muted-foreground">
                Selected: <span className="font-semibold text-foreground">{editNameValue}</span>
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" className="h-8 text-xs" onClick={() => setShowEditNameDialog(false)}>Cancel</Button>
            <Button className="h-8 text-xs" onClick={handleSaveItemName} disabled={!editNameValue.trim()}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
