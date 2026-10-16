import { inventoryApi } from '../api/inventoryApi'
import type { InventoryItem } from '../types'

/**
 * Escapes a cell value for CSV encoding
 */
function escapeCsvValue(val: any): string {
    if (val === null || val === undefined) return ''
    const str = String(val)
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`
    }
    return str
}

/**
 * Downloads a template CSV for inventory stock takes and imports
 */
export function downloadInventoryTemplateCsv(currentItems: InventoryItem[], categories: any[]) {
    const headers = [
        'SKU',
        'Name',
        'Description',
        'UOM',
        'New Count (Stock Take)',
        'Category Name',
        'Location',
        'Reorder Level',
        'Purchase Price',
        'Freight Duty',
        'Markup %',
        'Active (TRUE/FALSE)'
    ]

    const rows: string[][] = [headers]

    // Pre-fill with existing items so users can just update "New Count"
    for (const item of currentItems) {
        rows.push([
            item.sku,
            item.name,
            item.description || '',
            item.uom || 'PCS',
            '', // Blank for New Count
            item.categoryName || '',
            item.location || '',
            String(item.reorderLevel || 0),
            String(item.purchasePrice || 0),
            String(item.freightDuty || 0),
            String(item.markupPercent || 0),
            item.isActive ? 'TRUE' : 'FALSE'
        ])
    }

    const csvContent = rows.map(r => r.map(escapeCsvValue).join(',')).join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })

    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    link.setAttribute('href', url)
    link.setAttribute('download', `Inventory_StockTake_Template_${new Date().toISOString().split('T')[0]}.csv`)
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
}

/**
 * Parses user CSV and uploads/adjusts inventory securely.
 * Note: Assumes comma separated.
 */
export async function parseAndUploadInventoryCsv(
    file: File,
    currentItems: InventoryItem[],
    categories: any[],
    user: { uid: string, email: string }
): Promise<{ success: number, errors: string[] }> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = async (e: ProgressEvent<FileReader>) => {
            try {
                const text = e.target?.result as string
                if (!text) throw new Error("File is empty")

                // Basic CSV Parser (Doesn't fully handle quotes with commas inside, but okay for basic use)
                const lines = text.split('\n').filter(line => line.trim())
                if (lines.length < 2) throw new Error("CSV has no data rows")

                const headerLine = lines[0]
                if (!headerLine) throw new Error("No header row")
                const headers = headerLine.split(',').map(h => h.trim().toLowerCase())

                const getIndex = (possibleNames: string[]) => {
                    for (const name of possibleNames) {
                        const idx = headers.findIndex(h => h.includes(name.toLowerCase()))
                        if (idx !== -1) return idx
                    }
                    return -1
                }

                const iSku = getIndex(['sku'])
                const iName = getIndex(['name', 'item name'])
                const iDesc = getIndex(['description', 'desc'])
                const iUom = getIndex(['uom', 'unit'])
                const iCount = getIndex(['count', 'stock take', 'qty', 'on hand'])
                const iCat = getIndex(['category'])
                const iLoc = getIndex(['location'])
                const iReorder = getIndex(['reorder'])
                const iPurchase = getIndex(['purchase', 'cost'])
                const iFreight = getIndex(['freight', 'duty'])
                const iMarkup = getIndex(['markup'])
                const iActive = getIndex(['active'])

                if (iSku === -1 || iName === -1) {
                    throw new Error("CSV must at least contain 'SKU' and 'Name' columns.")
                }

                let success = 0
                const errors: string[] = []

                for (let i = 1; i < lines.length; i++) {
                    const lineStr = lines[i]
                    if (!lineStr) continue

                    const row = lineStr.split(',').map(cell => cell.trim().replace(/^"|"$/g, ''))

                    // Safely extract values
                    const sku = (iSku !== -1 && row[iSku]) ? row[iSku] : ''
                    const name = (iName !== -1 && row[iName]) ? row[iName] : ''

                    if (!sku || !name) {
                        errors.push(`Row ${i + 1}: Missing SKU or Name`)
                        continue
                    }

                    // Map Category String to ID
                    const categoryName = (iCat !== -1 && row[iCat]) ? row[iCat] : ''
                    let categoryId = ''
                    if (categoryName) {
                        const found = categories.find(c => c.name.toLowerCase() === categoryName.toLowerCase())
                        if (found) categoryId = found.id
                    }

                    const newCountStr = (iCount !== -1 && row[iCount]) ? row[iCount] : ''
                    const desc = (iDesc !== -1 && row[iDesc]) ? row[iDesc] : ''
                    const uom = (iUom !== -1 && row[iUom]) ? row[iUom] : 'PCS'
                    const loc = (iLoc !== -1 && row[iLoc]) ? row[iLoc] : ''
                    const reorder = iReorder !== -1 && row[iReorder] ? parseInt(row[iReorder]) || 0 : 0
                    const purchase = iPurchase !== -1 && row[iPurchase] ? parseFloat(row[iPurchase]) || 0 : 0
                    const freight = iFreight !== -1 && row[iFreight] ? parseFloat(row[iFreight]) || 0 : 0
                    const markup = iMarkup !== -1 && row[iMarkup] ? parseFloat(row[iMarkup]) || 0 : 0
                    const isActiveStr = (iActive !== -1 && row[iActive]) ? row[iActive].toLowerCase() : 'true'
                    const isActive = isActiveStr === 'true' || isActiveStr === 'yes' || isActiveStr === '1'

                    const existingItem = currentItems.find(item => item.sku.toLowerCase() === sku.toLowerCase())

                    try {
                        if (existingItem) {
                            // UPDATE Phase
                            await inventoryApi.updateInventoryItem(existingItem.id, {
                                name, description: desc, uom, categoryName, categoryId, location: loc,
                                reorderLevel: reorder, purchasePrice: purchase, freightDuty: freight,
                                markupPercent: markup, isActive
                            }, user)

                            // ADJUST Phase if new count provided
                            if (newCountStr !== '') {
                                const parsedCount = parseInt(newCountStr)
                                if (!isNaN(parsedCount)) {
                                    await inventoryApi.adjustStock(existingItem.id, {
                                        type: 'SET',
                                        qty: parsedCount,
                                        reason: 'Stock Take',
                                        reference: 'CSV Bulk Import/Stock Take'
                                    })
                                }
                            }
                        } else {
                            // CREATE Phase
                            const parsedCount = newCountStr !== '' ? parseInt(newCountStr) || 0 : 0
                            await inventoryApi.createInventoryItem({
                                sku, name, description: desc, uom, onHand: parsedCount, isActive,
                                categoryId, categoryName, location: loc,
                                reorderLevel: reorder, purchasePrice: purchase, freightDuty: freight,
                                markupPercent: markup, totalCost: purchase + freight,
                                sellingPrice: (purchase + freight) * (1 + markup / 100),
                                notes: 'Imported via CSV'
                            }, user)
                        }
                        success++
                    } catch (itemErr: any) {
                        errors.push(`Row ${i + 1} (${sku}): ${itemErr.message}`)
                    }
                }

                resolve({ success, errors })
            } catch (err: any) {
                reject(err)
            }
        }
        reader.onerror = () => reject(new Error("Failed to read file"))
        reader.readAsText(file) // Assumes UTF-8
    })
}
