import { STRUCTURE_SIZES, BOM_TEMPLATES, type TemplateType } from '../constants/bomTemplates'
import type { BomRequisitionItem, BomRequisitionSection, UnmatchedBomItem, ApplyTemplateResult } from '../types'

/** Extract the leading number from strings like "930m", "15kg", "440" */
export function parseQuantity(raw: string): number {
  const match = /^(\d+(?:\.\d+)?)/.exec(raw.trim())
  if (!match || !match[1]) return 0
  return parseFloat(match[1])
}

/** Normalise a size string to match STRUCTURE_SIZES format, e.g. "80 X 10M" → "80x10m" */
export function normaliseSizeString(input: string): string {
  return input.trim().toLowerCase().replace(/\s*x\s*/i, 'x').replace(/m$/, '') + 'm'
}

/** Find the column index for a given structure size. Returns -1 if not found. */
export function findSizeIndex(dimensionsString: string): number {
  const normalised = normaliseSizeString(dimensionsString)
  return (STRUCTURE_SIZES as readonly string[]).indexOf(normalised)
}

/**
 * Match a template item name to an inventory item using 3-pass fuzzy strategy:
 * 1. Exact case-insensitive name match
 * 2. Inventory name contains the template name (substring)
 * 3. Token intersection scoring (shared meaningful words)
 */
export function matchInventoryItem(templateName: string, inventoryItems: any[]): any | null {
  const lower = templateName.toLowerCase()

  // Pass 1: exact match
  const exact = inventoryItems.find(i => i.name?.toLowerCase() === lower)
  if (exact) return exact

  // Pass 2: inventory name contains the full template name
  const contains = inventoryItems.find(i => i.name?.toLowerCase().includes(lower))
  if (contains) return contains

  // Pass 3: token intersection
  const STOP_WORDS = new Set(['and', 'or', 'for', 'the', 'a', 'an', 'with', 'of', 'in', 'to'])
  const templateTokens = lower.split(/[\s\-\/+]+/).filter(t => t.length > 1 && !STOP_WORDS.has(t))

  let best: any = null
  let bestScore = 0

  for (const item of inventoryItems) {
    const itemLower = (item.name || '').toLowerCase()
    let score = 0
    for (const token of templateTokens) {
      if (itemLower.includes(token)) score++
    }
    if (score > bestScore) {
      bestScore = score
      best = item
    }
  }

  return bestScore >= 1 ? best : null
}

/** Build requisition sections from BOM template data + live inventory */
export function applyTemplate(opts: {
  templateType: TemplateType
  structureSize: string
  inventoryItems: any[]
  jobCategoryId: string
}): ApplyTemplateResult {
  const { templateType, structureSize, inventoryItems, jobCategoryId } = opts

  const sizeIndex = findSizeIndex(structureSize)
  if (sizeIndex === -1) {
    const valid = STRUCTURE_SIZES.join(', ')
    throw new Error(`Structure size "${structureSize}" not found in templates. Valid sizes: ${valid}`)
  }

  const rows = BOM_TEMPLATES[templateType]
  const items: BomRequisitionItem[] = []
  const unmatchedItems: UnmatchedBomItem[] = []
  let matchedCount = 0

  for (const row of rows) {
    const qty = parseQuantity(row.quantities[sizeIndex] ?? '0')
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

  const label = templateType === 'WATER_SYSTEM' ? 'Water System' : 'Curtains'
  const sections: BomRequisitionSection[] = [
    {
      id: crypto.randomUUID(),
      jobCategoryId,
      description: `${label} — ${normaliseSizeString(structureSize)}`,
      qty: 1,
      unit: 'Unit',
      items,
    },
  ]

  return {
    sections,
    unmatchedItems,
    matchedCount,
    totalCount: items.length,
  }
}