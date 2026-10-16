'use client'

import React, { useState, useMemo, useEffect } from 'react'
import { Loader2, Zap, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { matchInventoryItem, normaliseSizeString } from '../utils/useBomTemplate'
import { STRUCTURE_SIZES } from '../constants/bomTemplates'
import { useBomTemplateStore } from '@/stores/bom-templates-store'
import type { UnmatchedBomItem, BomRequisitionSection } from '../types'

interface BomTemplateSelectorProps {
  structureSize: string
  inventoryItems: any[]
  jobCategories: any[]
  onApply: (payload: { sections: BomRequisitionSection[]; mode: 'replace' | 'append' }) => void
  onUnmatched: (items: UnmatchedBomItem[]) => void
}

export default function BomTemplateSelector({
  structureSize,
  inventoryItems,
  jobCategories,
  onApply,
  onUnmatched,
}: BomTemplateSelectorProps) {
  const bomStore = useBomTemplateStore()

  // Listen to database BOM templates
  useEffect(() => {
    bomStore.listen()
    return () => bomStore.cleanup()
  }, [])

  const [selectedTemplateId, setSelectedTemplateId] = useState('')
  const [selectedJobCategoryId, setSelectedJobCategoryId] = useState('')
  const [selectedCategoryDescription, setSelectedCategoryDescription] = useState('')
  const [applyMode, setApplyMode] = useState<'replace' | 'append'>('replace')
  const [isApplying, setIsApplying] = useState(false)
  const [referenceSize, setReferenceSize] = useState('')

  const selectedTemplate = useMemo(() => {
    return bomStore.templates.find(t => t.id === selectedTemplateId) || null
  }, [selectedTemplateId, bomStore.templates])

  // Sync category and description from chosen template
  useEffect(() => {
    const t = bomStore.templates.find(x => x.id === selectedTemplateId)
    if (t) {
      setSelectedJobCategoryId(t.jobCategoryId || '')
      setSelectedCategoryDescription(t.categoryDescription || '')
    }
  }, [selectedTemplateId, bomStore.templates])

  const isCustomSize = useMemo(() => {
    if (!structureSize) return false
    const norm = normaliseSizeString(structureSize)
    return !(STRUCTURE_SIZES as readonly string[]).includes(norm)
  }, [structureSize])

  const sizeIsEmpty = useMemo(() => !structureSize || structureSize.trim() === '', [structureSize])

  const canApply = useMemo(() => {
    return (
      selectedTemplateId !== '' &&
      !sizeIsEmpty &&
      (!isCustomSize || referenceSize !== '') &&
      inventoryItems.length > 0
    )
  }, [selectedTemplateId, sizeIsEmpty, isCustomSize, referenceSize, inventoryItems.length])

  async function handleApply() {
    if (!canApply || !selectedTemplate) return
    setIsApplying(true)

    try {
      const sizeToUse = isCustomSize ? referenceSize : normaliseSizeString(structureSize)
      const validSizes = STRUCTURE_SIZES as readonly string[]

      if (!validSizes.includes(sizeToUse)) {
        toast.error('Invalid Selection', {
          description: 'Please select a valid reference size for your custom dimensions.',
        })
        return
      }

      const items: any[] = []
      const unmatchedItems: UnmatchedBomItem[] = []
      let matchedCount = 0

      for (const row of selectedTemplate.rows) {
        const qty = row.quantities[sizeToUse] ?? 0
        if (qty === 0) continue

        const match = matchInventoryItem(row.name, inventoryItems)

        if (match) {
          matchedCount++
          items.push({
            id: crypto.randomUUID(),
            inventoryItemId: match.id,
            itemName: match.name,
            description: match.description || '',
            qtyRequired: qty,
            irdSellingPrice: match.sellingPrice || 0,
            markupPercent: 0,
            uom: match.uom || 'PCS',
            costSnapshot: match.totalCost || 0,
          })
        } else {
          unmatchedItems.push({ templateName: row.name, qty })
          items.push({
            id: crypto.randomUUID(),
            inventoryItemId: '',
            itemName: row.name,
            description: '',
            qtyRequired: qty,
            irdSellingPrice: 0,
            markupPercent: 0,
            uom: 'PCS',
          })
        }
      }

      const category = jobCategories.find((c: any) => c.id === selectedJobCategoryId)
      const sections: BomRequisitionSection[] = [
        {
          id: crypto.randomUUID(),
          jobCategoryId: selectedJobCategoryId,
          description: selectedCategoryDescription || `${selectedTemplate.name} — ${sizeToUse}`,
          qty: 1,
          unit: category?.unit || 'Unit',
          items,
        },
      ]

      onApply({ sections, mode: applyMode })
      onUnmatched(unmatchedItems)

      const statusLabel =
        unmatchedItems.length === 0
          ? `All ${items.length} items matched`
          : `${matchedCount} of ${items.length} items matched`
      toast.success('Template Applied', { description: statusLabel })
    } catch (err: any) {
      toast.error('Template Error', { description: err.message || 'Could not apply template.' })
    } finally {
      setIsApplying(false)
    }
  }

  return (
    <Card className="border-primary/20 bg-primary/[0.02]">
      <CardHeader className="pb-3 border-b bg-primary/5">
        <div className="flex items-center gap-2">
          <Zap className="size-4 text-primary" />
          <CardTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
            BOM Template
          </CardTitle>
        </div>
        <CardDescription className="text-xs mt-1">
          Auto-populate the inventory requisition from a system template based on structure size.
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-4">
        <div className="flex flex-wrap items-end gap-4">
          {/* Template selector */}
          <div className="space-y-1.5 min-w-[200px]">
            <Label className="text-xs text-muted-foreground uppercase font-semibold tracking-wide">
              Template
            </Label>
            <Select
              value={selectedTemplateId}
              onValueChange={(v) => {
                setSelectedTemplateId(v || '')
                setSelectedCategoryDescription('')
              }}
            >
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="Select template">
                  {selectedTemplateId
                    ? (bomStore.templates.find((t) => t.id === selectedTemplateId)?.name || selectedTemplateId)
                    : undefined}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {bomStore.templates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {bomStore.templates.length === 0 && (
              <p className="text-[10px] text-muted-foreground mt-1">
                No templates configured. Ask an admin to set up BOM templates in Settings.
              </p>
            )}
          </div>

          {/* Job Category */}
          <div className="space-y-1.5 min-w-[180px]">
            <Label className="text-xs text-muted-foreground uppercase font-semibold tracking-wide">
              Job Category
            </Label>
            <Select value={selectedJobCategoryId} onValueChange={(v) => v && setSelectedJobCategoryId(v)}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="Select category">
                  {selectedJobCategoryId
                    ? (jobCategories.find((cat: any) => cat.id === selectedJobCategoryId)?.name || selectedJobCategoryId)
                    : undefined}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {jobCategories.map((cat: any) => (
                  <SelectItem key={cat.id} value={cat.id}>
                    {cat.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Apply Mode */}
          <div className="space-y-1.5 min-w-[190px]">
            <Label className="text-xs text-muted-foreground uppercase font-semibold tracking-wide">
              Apply Mode
            </Label>
            <Select value={applyMode} onValueChange={(v) => setApplyMode(v as 'replace' | 'append')}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="replace">Replace existing items</SelectItem>
                <SelectItem value="append">Append to existing items</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Apply Button */}
          <div className="space-y-1.5">
            <Label className="text-xs text-transparent select-none">Apply</Label>
            <Button
              type="button"
              size="sm"
              disabled={!canApply || isApplying}
              onClick={handleApply}
              className="shadow-sm"
            >
              {isApplying ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <Zap className="mr-2 size-4" />
              )}
              Apply {isCustomSize ? 'as Draft' : 'Template'}
            </Button>
          </div>
        </div>

        {/* Custom Size Reference Picker */}
        {isCustomSize && (
          <div className="mt-4 p-3 bg-amber-500/10 border border-amber-500/20 rounded-md flex flex-wrap items-center gap-4 animate-in fade-in slide-in-from-top-1">
            <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
              <AlertTriangle className="size-4 shrink-0" />
              <span className="text-xs font-bold uppercase tracking-tight">
                Custom Dimensions Detected:
              </span>
            </div>
            <div className="space-y-1.5 min-w-[240px]">
              <Label className="text-[10px] text-muted-foreground uppercase font-semibold">
                Which standard size should we use as a base?
              </Label>
              <Select value={referenceSize} onValueChange={(v) => v && setReferenceSize(v)}>
                <SelectTrigger className="h-8 text-[11px] bg-background">
                  <SelectValue placeholder="Select reference size..." />
                </SelectTrigger>
                <SelectContent>
                  {STRUCTURE_SIZES.map((size) => (
                    <SelectItem key={size} value={size}>
                      {size} (Use these quantities)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="text-[10px] text-muted-foreground max-w-sm italic">
              Since "{structureSize}" isn't in the template, we'll use the quantities from your chosen
              reference size as a starting point. You can then adjust them in the grid below.
            </p>
          </div>
        )}

        {/* Description Preview/Edit */}
        {selectedTemplateId && (
          <div className="mt-4 space-y-2 max-w-2xl">
            <Label className="text-[10px] font-bold uppercase tracking-wider opacity-60">
              Section Description
            </Label>
            <Textarea
              value={selectedCategoryDescription}
              onChange={(e) => setSelectedCategoryDescription(e.target.value)}
              placeholder="Detailed description for this requisition section..."
              className="min-h-[70px] text-xs bg-background border-primary/10"
            />
            <p className="text-[10px] text-muted-foreground italic">
              You can tweak this description before applying the template.
            </p>
          </div>
        )}

        {/* Warning: no structure size entered */}
        {sizeIsEmpty && selectedTemplateId && (
          <div className="mt-3 flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
            <AlertTriangle className="size-4 shrink-0" />
            <span>
              Select <strong>Dimensions of Structure</strong> in the job information form first.
            </span>
          </div>
        )}

        {!sizeIsEmpty && inventoryItems.length === 0 && (
          <div className="mt-3 text-xs text-muted-foreground">Loading inventory items...</div>
        )}
      </CardContent>
    </Card>
  )
}