'use client'

import { useState, useEffect, useRef } from 'react'
import { useBomTemplateStore, type BomTemplate, type BomTemplateRow } from '@/stores/bom-templates-store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription
} from '@/components/ui/dialog'
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell
} from '@/components/ui/table'
import { Card, CardContent } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import {
  Plus,
  Trash2,
  Edit2,
  ChevronDown,
  ChevronRight,
  PackageOpen,
  Check,
  X
} from 'lucide-react'
import { STRUCTURE_SIZES } from '@/features/jobCards/constants/bomTemplates'

export default function BomTemplatesAdmin() {
  const store = useBomTemplateStore()
  const { templates, loading } = store

  const [expandedTemplates, setExpandedTemplates] = useState<Set<string>>(new Set())
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [newTemplateName, setNewTemplateName] = useState('')
  const [isAddItemDialogOpen, setIsAddItemDialogOpen] = useState(false)
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null)
  const [newItemName, setNewItemName] = useState('')
  const [editingCell, setEditingCell] = useState<{
    templateId: string
    rowId: string
    sizeIdx: number
  } | null>(null)
  const [cellValue, setCellValue] = useState('')
  const cellInputRef = useRef<HTMLInputElement>(null)

  // Subscribe on mount
  useEffect(() => {
    store.listen()
    return () => {
      store.cleanup()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function toggleExpand(templateId: string) {
    setExpandedTemplates((prev) => {
      const next = new Set(prev)
      if (next.has(templateId)) {
        next.delete(templateId)
      } else {
        next.add(templateId)
      }
      return next
    })
  }

  // Cell editing
  function startEdit(templateId: string, rowId: string, sizeIdx: number, currentValue: number) {
    setEditingCell({ templateId, rowId, sizeIdx })
    setCellValue(String(currentValue || 0))
  }

  function commitEdit() {
    if (!editingCell) return
    const template = templates.find((t) => t.id === editingCell.templateId)
    if (!template) return

    const newRows = template.rows.map((row) => {
      if (row.id !== editingCell.rowId) return row
      const size = STRUCTURE_SIZES[editingCell.sizeIdx]
      return {
        ...row,
        quantities: {
          ...row.quantities,
          [size]: parseFloat(cellValue) || 0
        }
      }
    })

    store.saveRows(template.id, newRows)
    setEditingCell(null)
  }

  function handleCellKeydown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault()
      commitEdit()
      if (e.key === 'Tab' && editingCell) {
        // Move to next cell
        const { templateId, sizeIdx } = editingCell
        const template = templates.find((t) => t.id === templateId)
        if (!template) return
        const nextSizeIdx = sizeIdx + 1
        if (nextSizeIdx < STRUCTURE_SIZES.length) {
          const row = template.rows.find((r) => r.id === editingCell.rowId)
          if (row) {
            const nextValue = row.quantities[STRUCTURE_SIZES[nextSizeIdx]] || 0
            startEdit(templateId, editingCell.rowId, nextSizeIdx, nextValue)
          }
        }
      }
    } else if (e.key === 'Escape') {
      setEditingCell(null)
    }
  }

  function handleCellBlur() {
    commitEdit()
  }

  // Template CRUD
  async function handleCreateTemplate() {
    if (!newTemplateName.trim()) return
    await store.createTemplate(newTemplateName.trim())
    setIsCreateDialogOpen(false)
    setNewTemplateName('')
  }

  async function handleRenameTemplate(template: BomTemplate, newName: string) {
    if (!newName.trim()) return
    await store.renameTemplate(template.id, newName.trim())
  }

  async function handleDeleteTemplate(id: string) {
    if (window.confirm('Are you sure you want to delete this template?')) {
      await store.deleteTemplate(id)
    }
  }

  // Item CRUD
  function openAddItem(templateId: string) {
    setSelectedTemplateId(templateId)
    setNewItemName('')
    setIsAddItemDialogOpen(true)
  }

  async function handleAddItem() {
    if (!selectedTemplateId || !newItemName.trim()) return
    const template = templates.find((t) => t.id === selectedTemplateId)
    if (!template) return

    const newRow: BomTemplateRow = {
      id: crypto.randomUUID(),
      name: newItemName.trim(),
      quantities: Object.fromEntries(STRUCTURE_SIZES.map((s) => [s, 0]))
    }

    await store.saveRows(template.id, [...template.rows, newRow])
    setIsAddItemDialogOpen(false)
    setNewItemName('')
    setSelectedTemplateId(null)
  }

  async function handleDeleteRow(template: BomTemplate, rowId: string) {
    const newRows = template.rows.filter((r) => r.id !== rowId)
    await store.saveRows(template.id, newRows)
  }

  const sizeLabels = STRUCTURE_SIZES.map((s) => s.replace('m', ''))

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-medium">BOM Templates</h3>
          <p className="text-sm text-muted-foreground">
            Manage Bills of Materials templates for structure sizes.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => store.seedDefaults()} disabled={loading}>
            Seed Defaults
          </Button>
          <Button size="sm" onClick={() => setIsCreateDialogOpen(true)}>
            <Plus className="mr-2 size-4" />
            New Template
          </Button>
        </div>
      </div>

      {templates.length === 0 && !loading && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 gap-3">
            <PackageOpen className="size-12 text-muted-foreground" />
            <p className="text-muted-foreground text-sm">
              No templates yet. Click "Seed Defaults" or create a new template.
            </p>
          </CardContent>
        </Card>
      )}

      {templates.map((template) => (
        <Card key={template.id}>
          <CardContent className="p-4">
            {/* Template Header */}
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => toggleExpand(template.id)}
                className="size-8"
              >
                {expandedTemplates.has(template.id) ? (
                  <ChevronDown className="size-4" />
                ) : (
                  <ChevronRight className="size-4" />
                )}
              </Button>
              <InlineEditField
                value={template.name}
                onSave={(newName) => handleRenameTemplate(template, newName)}
              />
              <Button
                variant="ghost"
                size="icon"
                className="text-destructive ml-auto"
                onClick={() => handleDeleteTemplate(template.id)}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>

            {/* Expanded Content */}
            {expandedTemplates.has(template.id) && (
              <div className="mt-4 space-y-4">
                {/* Category meta */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs">Job Category</Label>
                    <Input
                      placeholder="e.g. Water System"
                      value={template.jobCategoryId || ''}
                      onChange={(e) =>
                        store.updateTemplateMeta(template.id, {
                          jobCategoryId: e.target.value,
                          categoryDescription: template.categoryDescription || ''
                        })
                      }
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Category Description</Label>
                    <Textarea
                      placeholder="Brief description"
                      className="min-h-[60px]"
                      value={template.categoryDescription || ''}
                      onChange={(e) =>
                        store.updateTemplateMeta(template.id, {
                          jobCategoryId: template.jobCategoryId || '',
                          categoryDescription: e.target.value
                        })
                      }
                    />
                  </div>
                </div>

                {/* Items Table */}
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="min-w-[200px]">Item</TableHead>
                        {STRUCTURE_SIZES.map((size) => (
                          <TableHead key={size} className="text-center text-xs">
                            {size.replace('m', '')}
                          </TableHead>
                        ))}
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {template.rows.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell className="font-medium">{row.name}</TableCell>
                          {STRUCTURE_SIZES.map((size, idx) => {
                            const isEditing =
                              editingCell?.templateId === template.id &&
                              editingCell?.rowId === row.id &&
                              editingCell?.sizeIdx === idx
                            return (
                              <TableCell
                                key={size}
                                className="text-center cursor-pointer hover:bg-muted/50"
                                onClick={() => startEdit(template.id, row.id, idx, row.quantities[size] || 0)}
                              >
                                {isEditing ? (
                                  <input
                                    ref={cellInputRef}
                                    type="number"
                                    value={cellValue}
                                    onChange={(e) => setCellValue(e.target.value)}
                                    onKeyDown={handleCellKeydown}
                                    onBlur={handleCellBlur}
                                    className="w-20 text-center h-8 rounded border border-input bg-background px-2 py-1 text-sm"
                                    autoFocus
                                    min="0"
                                    step="any"
                                  />
                                ) : (
                                  <span className="text-sm">
                                    {row.quantities[size] || 0}
                                  </span>
                                )}
                              </TableCell>
                            )
                          })}
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-destructive"
                              onClick={() => handleDeleteRow(template, row.id)}
                            >
                              <Trash2 className="size-3" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                      {template.rows.length === 0 && (
                        <TableRow>
                          <TableCell
                            colSpan={STRUCTURE_SIZES.length + 2}
                            className="h-16 text-center text-muted-foreground italic text-sm"
                          >
                            No items in this template. Add an item below.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => openAddItem(template.id)}
                >
                  <Plus className="mr-2 size-3" />
                  Add Item
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      ))}

      {/* Create Template Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New BOM Template</DialogTitle>
            <DialogDescription>
              Create a new Bill of Materials template.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="template-name" className="text-right">
                Name
              </Label>
              <Input
                id="template-name"
                value={newTemplateName}
                onChange={(e) => setNewTemplateName(e.target.value)}
                placeholder="e.g. Water System, Curtains"
                className="col-span-3"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateTemplate} disabled={loading || !newTemplateName.trim()}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Item Dialog */}
      <Dialog open={isAddItemDialogOpen} onOpenChange={setIsAddItemDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add BOM Item</DialogTitle>
            <DialogDescription>
              Add a new item to this template.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="item-name" className="text-right">
                Name
              </Label>
              <Input
                id="item-name"
                value={newItemName}
                onChange={(e) => setNewItemName(e.target.value)}
                placeholder="e.g. U-Nails"
                className="col-span-3"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddItemDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddItem} disabled={!newItemName.trim()}>
              Add Item
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/**
 * Inline editable field component used for renaming templates.
 */
function InlineEditField({
  value,
  onSave
}: {
  value: string
  onSave: (newValue: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editing])

  useEffect(() => {
    setDraft(value)
  }, [value])

  function handleSave() {
    const trimmed = draft.trim()
    if (trimmed && trimmed !== value) {
      onSave(trimmed)
    }
    setEditing(false)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      handleSave()
    } else if (e.key === 'Escape') {
      setDraft(value)
      setEditing(false)
    }
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <Input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleSave}
          className="h-8 w-[200px]"
        />
      </div>
    )
  }

  return (
    <div className="flex items-center gap-1">
      <span className="font-medium">{value}</span>
      <Button
        variant="ghost"
        size="icon"
        className="size-6"
        onClick={() => setEditing(true)}
      >
        <Edit2 className="size-3" />
      </Button>
    </div>
  )
}