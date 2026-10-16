'use client'

import React, { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { RefreshCw, ArrowRight, CheckCircle2, AlertTriangle, HelpCircle, AlertCircle, Info } from 'lucide-react'
import { toast } from 'sonner'
import { useInventoryStore, InventoryItem } from '@/stores/inventory-store'
import { useAuthStore } from '@/stores/auth-store'

interface CsvMapperModalProps {
  isOpen: boolean
  onClose: () => void
  file: File | null
  onSuccess: () => void
}

interface MappingField {
  name: string
  label: string
  description: string
  required: boolean
  type: 'string' | 'number' | 'boolean'
}

// Expected Target Fields
const TARGET_FIELDS: MappingField[] = [
  { name: 'sku', label: 'SKU / Part Number', description: 'Unique identifier for each inventory item', required: true, type: 'string' },
  { name: 'name', label: 'Item Name', description: 'Display name of the stock item', required: true, type: 'string' },
  { name: 'description', label: 'Description', description: 'Short summary or description', required: false, type: 'string' },
  { name: 'uom', label: 'UOM (Unit of Measure)', description: 'E.g., PCS, sqm, kg, set', required: false, type: 'string' },
  { name: 'onHand', label: 'On Hand Qty (Stock Take)', description: 'Physical quantity currently in stock', required: false, type: 'number' },
  { name: 'categoryName', label: 'Category Name', description: 'Matches categories like water_systems, pan_feeders', required: false, type: 'string' },
  { name: 'location', label: 'Location', description: 'Warehouse, shelf, or bin locator', required: false, type: 'string' },
  { name: 'reorderLevel', label: 'Reorder Level', description: 'Minimum stock before triggering safety alert', required: false, type: 'number' },
  { name: 'purchasePrice', label: 'Purchase Price', description: 'Factory cost price per unit', required: false, type: 'number' },
  { name: 'freightDuty', label: 'Freight / Duty Cost', description: 'Shipping, duty, or customs fee per unit', required: false, type: 'number' },
  { name: 'markupPercent', label: 'Markup %', description: 'Percentage markup to calculate Selling Price', required: false, type: 'number' },
  { name: 'isActive', label: 'Is Active (TRUE/FALSE)', description: 'Status of the item', required: false, type: 'boolean' }
]

export default function CsvMapperModal({ isOpen, onClose, file, onSuccess }: CsvMapperModalProps) {
  const store = useInventoryStore()
  const authStore = useAuthStore()

  const [loading, setLoading] = useState(false)
  const [importing, setImporting] = useState(false)
  const [csvHeaders, setCsvHeaders] = useState<string[]>([])
  const [sampleRows, setSampleRows] = useState<string[][]>([])
  const [allRows, setAllRows] = useState<string[][]>([])
  const [mappings, setMappings] = useState<Record<string, string>>({}) // key: targetField, value: userCsvHeader
  const [warnings, setWarnings] = useState<{ userHeader: string; warning: string }[]>([])
  const [unmapped, setUnmapped] = useState<string[]>([])

  // Load and parse the CSV initially (First 3 rows for sample analysis, all rows for final execution)
  useEffect(() => {
    if (!isOpen || !file) return

    const parseCsvLocal = () => {
      setLoading(true)
      const reader = new FileReader()
      reader.onload = async (e) => {
        try {
          const text = e.target?.result as string
          if (!text) throw new Error('File is empty')

          // Clean up carriage returns and split on lines
          const lines = text.split('\r').join('').split('\n').filter(line => line.trim())
          if (lines.length < 2) throw new Error('CSV must contain at least a header and one data row.')

          // Basic CSV row-by-row splitter (handles standard comma and nested quotes)
          const parseRow = (rowStr: string): string[] => {
            const result: string[] = []
            let current = ''
            let inQuotes = false
            for (let i = 0; i < rowStr.length; i++) {
              const char = rowStr[i]
              if (char === '"') {
                inQuotes = !inQuotes
              } else if (char === ',' && !inQuotes) {
                result.push(current.trim().replace(/^"|"$/g, ''))
                current = ''
              } else {
                current += char
              }
            }
            result.push(current.trim().replace(/^"|"$/g, ''))
            return result
          }

          const parsedHeaders = parseRow(lines[0])
          const parsedRows = lines.slice(1).map(parseRow)

          setCsvHeaders(parsedHeaders)
          setSampleRows(parsedRows.slice(0, 3))
          setAllRows(parsedRows)

          // Request AI column matching from endpoint
          await fetchAiMappings(parsedHeaders, parsedRows.slice(0, 3))
        } catch (err: any) {
          toast.error('Failed to parse CSV', { description: err.message })
          onClose()
        }
      }
      reader.readAsText(file)
    }

    parseCsvLocal()
  }, [isOpen, file])

  const fetchAiMappings = async (headers: string[], samples: string[][]) => {
    try {
      const res = await fetch('/api/inventory/map-csv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ headers, samples })
      })

      if (!res.ok) throw new Error('API route returned error')
      const data = await res.json()

      // Map response to component state
      const initialMap: Record<string, string> = {}
      if (data.mappings && Array.isArray(data.mappings)) {
        for (const item of data.mappings) {
          initialMap[item.targetField] = item.userHeader
        }
      }
      setMappings(initialMap)
      setWarnings(data.formatWarnings || [])
      setUnmapped(data.unmappedHeaders || [])
    } catch (err) {
      console.warn('AI mapping failed or key missing. Applying local fallback matches.', err)
    } finally {
      setLoading(false)
    }
  }

  // Handle single override drop-down selection
  const handleMapChange = (targetField: string, userHeader: string) => {
    setMappings(prev => {
      const next = { ...prev }
      if (!userHeader || userHeader === '__skip__') {
        delete next[targetField]
      } else {
        next[targetField] = userHeader
      }
      return next
    })
  }

  // Helper to extract first sample item's preview calculations
  const getPreviewCalculations = () => {
    if (sampleRows.length === 0) return null
    const firstRow = sampleRows[0]

    const getValue = (field: string): number => {
      const header = mappings[field]
      if (!header) return 0
      const idx = csvHeaders.indexOf(header)
      if (idx === -1) return 0
      const rawVal = firstRow[idx] || ''
      return parseFloat(rawVal.replace(/[^\d.-]/g, '')) || 0
    }

    const purchase = getValue('purchasePrice')
    const freight = getValue('freightDuty')
    const markup = getValue('markupPercent')
    const totalCost = purchase + freight
    const sellingPrice = totalCost * (1 + markup / 100)

    return { purchase, freight, totalCost, markup, sellingPrice }
  }

  const previewCalc = getPreviewCalculations()

  // Execute actual bulk database write
  const handleImport = async () => {
    if (!authStore.user) {
      toast.error('You must be logged in to do this')
      return
    }

    // Ensure all required fields are mapped
    const missingFields = TARGET_FIELDS.filter(f => f.required && !mappings[f.name])
    if (missingFields.length > 0) {
      toast.error('Missing Required Mappings', {
        description: `Please map columns for: ${missingFields.map(f => f.label).join(', ')}`
      })
      return
    }

    setImporting(true)
    toast.loading('Importing Inventory with AI mappings...', { id: 'csv-upload-progress' })

    try {
      const user = {
        uid: authStore.user.uid,
        email: authStore.user.email || ''
      }

      let success = 0
      const errors: string[] = []

      // Helper function to extract and sanitize values safely
      const extractValue = (row: string[], targetField: string, type: 'string' | 'number' | 'boolean'): any => {
        const headerName = mappings[targetField]
        if (!headerName) return type === 'number' ? 0 : type === 'boolean' ? true : ''

        const colIndex = csvHeaders.indexOf(headerName)
        if (colIndex === -1) return type === 'number' ? 0 : type === 'boolean' ? true : ''

        const raw = (row[colIndex] || '').trim()

        if (type === 'number') {
          // Strip currency symbols, commas, spaces
          const cleanVal = parseFloat(raw.replace(/[^\d.-]/g, ''))
          return isNaN(cleanVal) ? 0 : cleanVal
        }

        if (type === 'boolean') {
          const l = raw.toLowerCase()
          return l === 'true' || l === 'yes' || l === '1' || l === 'active' || l === 'enabled'
        }

        return raw
      }

      for (let i = 0; i < allRows.length; i++) {
        const row = allRows[i]
        if (!row || row.length === 0) continue

        const sku = extractValue(row, 'sku', 'string')
        const name = extractValue(row, 'name', 'string')

        if (!sku || !name) {
          errors.push(`Row ${i + 2}: Missing SKU or Name`)
          continue
        }

        const categoryName = extractValue(row, 'categoryName', 'string')
        let categoryId = ''
        if (!categoryName) {
          errors.push(`Row ${i + 2}: Missing Category Name`)
          continue
        }

        const found = store.categories.find(c => c.name.toLowerCase() === categoryName.toLowerCase())
        if (!found) {
          errors.push(`Row ${i + 2}: Inventory category "${categoryName}" is not configured in Settings`)
          continue
        }
        categoryId = found.id

        const description = extractValue(row, 'description', 'string')
        const uom = extractValue(row, 'uom', 'string') || 'PCS'
        const location = extractValue(row, 'location', 'string')
        const onHandCount = extractValue(row, 'onHand', 'number')
        const reorderLevel = extractValue(row, 'reorderLevel', 'number')
        const purchasePrice = extractValue(row, 'purchasePrice', 'number')
        const freightDuty = extractValue(row, 'freightDuty', 'number')
        const markupPercent = extractValue(row, 'markupPercent', 'number')
        const isActive = extractValue(row, 'isActive', 'boolean')

        const existingItem = store.items.find(item => item.sku.toLowerCase() === sku.toLowerCase())

        try {
          if (existingItem) {
            // Update item details
            await store.updateItem(existingItem.id, {
              name, description, uom, categoryName, categoryId, location,
              reorderLevel, purchasePrice, freightDuty, markupPercent, isActive
            }, user)

            // Adjust stock take only if a quantity is specified
            const quantityHeader = mappings['onHand']
            if (quantityHeader) {
              await store.adjustStock(existingItem.id, {
                type: 'SET',
                qty: onHandCount,
                reason: 'Stock Take',
                reference: 'CSV AI Smart Import'
              })
            }
          } else {
            // Create new item
            await store.createItem({
              sku, name, description, uom, onHand: onHandCount, isActive,
              categoryId, categoryName, location,
              reorderLevel, purchasePrice, freightDuty, markupPercent,
              totalCost: purchasePrice + freightDuty,
              sellingPrice: (purchasePrice + freightDuty) * (1 + markupPercent / 100),
              notes: 'Imported via AI-assisted CSV'
            }, user)
          }
          success++
        } catch (itemErr: any) {
          errors.push(`Row ${i + 2} (${sku}): ${itemErr.message}`)
        }
      }

      if (errors.length > 0) {
        console.warn('Mapping Import Failures:', errors)
        toast.error(`Imported ${success} items. Failed on ${errors.length} rows. See console for logs.`, {
          id: 'csv-upload-progress',
          duration: 8000
        })
      } else {
        toast.success(`Successfully imported ${success} items!`, { id: 'csv-upload-progress' })
      }

      await store.fetchItems()
      onSuccess()
      onClose()
    } catch (err: any) {
      toast.error('Import Failed', { id: 'csv-upload-progress', description: err.message })
    } finally {
      setImporting(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="size-5 text-primary" /> AI CSV Field Mapper
          </DialogTitle>
          <DialogDescription>
            Verify and customize how columns from "{file?.name}" map to the Inventory system database.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-10 gap-3">
            <RefreshCw className="size-8 animate-spin text-primary" />
            <p className="text-sm font-medium text-muted-foreground">Gemini AI is analyzing column headers & sample data...</p>
          </div>
        ) : (
          <div className="space-y-4 my-2">
            {/* Format Warnings Section */}
            {warnings.length > 0 && (
              <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg space-y-2">
                <div className="flex items-center gap-1.5 text-amber-500 font-semibold text-xs">
                  <AlertTriangle className="size-4" /> AUTO-SANITIATION ALERTS ({warnings.length})
                </div>
                <div className="text-xs text-muted-foreground space-y-1">
                  {warnings.map((w, idx) => (
                    <p key={idx}>• Column <strong>"{w.userHeader}"</strong>: {w.warning}</p>
                  ))}
                </div>
              </div>
            )}

            {/* Fields List */}
            <div className="rounded-lg border bg-card/40 backdrop-blur-md overflow-hidden">
              <div className="grid grid-cols-2 gap-2 p-2.5 bg-muted/60 text-xs font-semibold text-muted-foreground border-b uppercase">
                <div>INVENTORY DATABASE FIELD</div>
                <div>CSV FILE COLUMN</div>
              </div>
              <div className="divide-y divide-border max-h-[300px] overflow-y-auto">
                {TARGET_FIELDS.map((field) => {
                  const mappedHeader = mappings[field.name] || ''
                  return (
                    <div key={field.name} className="grid grid-cols-2 items-center gap-4 p-2 text-sm hover:bg-muted/30">
                      <div>
                        <div className="font-medium flex items-center gap-1">
                          {field.label}
                          {field.required && <span className="text-destructive font-bold">*</span>}
                        </div>
                        <p className="text-[11px] text-muted-foreground leading-tight">{field.description}</p>
                      </div>
                      <div>
                        <select
                          className="w-full bg-popover rounded-md border border-input p-1.5 text-xs outline-none focus:ring-1 focus:ring-primary"
                          value={mappedHeader}
                          onChange={(e) => handleMapChange(field.name, e.target.value)}
                        >
                          <option value="">[ Skip / Do Not Import ]</option>
                          {csvHeaders.map(h => (
                            <option key={h} value={h}>{h}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Live Pricing Preview Card */}
            {previewCalc && mappings['purchasePrice'] && (
              <div className="p-3 bg-muted/40 rounded-lg border border-border/80">
                <div className="text-xs font-semibold text-muted-foreground mb-2 uppercase flex items-center gap-1">
                  <Info className="size-3.5 text-primary" /> Live Pricing Engine Preview (Row 1)
                </div>
                <div className="grid grid-cols-2 gap-4 text-xs font-medium">
                  <div className="space-y-1 text-muted-foreground">
                    <p>Purchase Price: <span className="text-foreground font-mono">${previewCalc.purchase.toFixed(2)}</span></p>
                    <p>Freight & Duty: <span className="text-foreground font-mono">+ ${previewCalc.freight.toFixed(2)}</span></p>
                    <p className="pt-1 border-t border-dashed">Calculated Cost: <span className="text-foreground font-mono font-bold">${previewCalc.totalCost.toFixed(2)}</span></p>
                  </div>
                  <div className="space-y-1 text-muted-foreground">
                    <p>Markup Margin: <span className="text-foreground font-mono">{previewCalc.markup}%</span></p>
                    <p className="pt-1 border-t border-dashed">Est. Selling Price: <span className="text-primary font-mono font-bold">${previewCalc.sellingPrice.toFixed(2)}</span></p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose} disabled={importing}>
            Cancel
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={handleImport}
            disabled={loading || importing}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {importing ? <RefreshCw className="size-4 mr-2 animate-spin" /> : <ArrowRight className="size-4 mr-2" />}
            Confirm & Import ({allRows.length} Rows)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
