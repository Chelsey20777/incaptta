import ExcelJS from 'exceljs'
import { 
    toFormattedDate, 
    type CompanySettingsLike,
    removeWhiteBackground
} from '@/features/jobCards/utils/pdfBranding'

const ORANGE = 'F97316'
const GREEN = '79C21B'
const DARK = '1E1E1E'
const RED = 'EF4444'
const LIGHT = 'F8FAFC'

const fmt = (n: number) =>
    Math.abs(Number(n || 0)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/**
 * Helper to fetch image as base64 for ExcelJS
 */
async function getImageBase64(url: string): Promise<{ base64: string; extension: string } | null> {
    try {
        const dataUrl = await removeWhiteBackground(url)
        const [meta, base64] = dataUrl.split(',')
        const extension = meta?.split('/')[1]?.split(';')[0] || 'png'
        return { base64: base64 || '', extension: extension as any }
    } catch (err) {
        console.error('Failed to process image for Excel:', err)
        return null
    }
}

export const generateLedgerReportExcel = async (
    entries: any[],
    accountLabel: string,
    dateRange: { from: string; to: string } | null,
    companySettings?: CompanySettingsLike,
    generatedBy?: string
) => {
    const workbook = new ExcelJS.Workbook()
    const worksheet = workbook.addWorksheet('Ledger Report')

    // ── Setup Columns ────────────────────────────────────────────────
    worksheet.columns = [
        { header: '#', key: 'index', width: 6 },
        { header: 'Date', key: 'date', width: 15 },
        { header: 'Account', key: 'account', width: 15 },
        { header: 'Description', key: 'description', width: 45 },
        { header: 'Type', key: 'type', width: 12 },
        { header: 'Amount', key: 'amount', width: 18 },
        { header: 'Running Balance', key: 'balance', width: 22 },
    ]

    let currentRow = 1

    // ── Branding Section ─────────────────────────────────────────────
    // Handle Logo
    const logoUrl = companySettings?.logoUrl
    if (logoUrl) {
        const logo = await getImageBase64(logoUrl)
        if (logo) {
            const imageId = workbook.addImage({
                base64: logo.base64,
                extension: logo.extension as any,
            })
            // Place logo (Roughly centered over the first few columns)
            worksheet.addImage(imageId, {
                tl: { col: 1.5, row: 0.5 },
                ext: { width: 180, height: 90 }
            })
            currentRow = 7 // Move past logo
        }
    }

    // Company Info
    if (companySettings?.companyName) {
        const companyNameCell = worksheet.getCell(`D${currentRow}`)
        companyNameCell.value = companySettings.companyName.toUpperCase()
        companyNameCell.font = { bold: true, size: 14, color: { argb: ORANGE } }
        companyNameCell.alignment = { horizontal: 'left' }
        
        const addrCell = worksheet.getCell(`D${currentRow + 1}`)
        addrCell.value = `${companySettings.address || ''} | ${companySettings.phone || ''} | ${companySettings.email || ''}`
        addrCell.font = { size: 9, color: { argb: '666666' } }
        
        currentRow += 3
    }

    // ── Report Metadata ──────────────────────────────────────────────
    const titleCell = worksheet.getCell(`A${currentRow}`)
    titleCell.value = 'LEDGER REPORT'
    titleCell.font = { bold: true, size: 16, color: { argb: ORANGE } }
    
    worksheet.getCell(`A${currentRow + 1}`).value = `Account: ${accountLabel}`
    const rangeText = dateRange?.from && dateRange?.to
        ? `${dateRange.from} to ${dateRange.to}`
        : 'All Time'
    worksheet.getCell(`A${currentRow + 2}`).value = `Period: ${rangeText}`
    worksheet.getCell(`A${currentRow + 3}`).value = `Generated: ${new Date().toLocaleDateString()} | By: ${generatedBy || 'System'}`
    
    currentRow += 5

    // ── Summary Table ────────────────────────────────────────────────
    const totalIn  = entries.filter(e => e.amount > 0).reduce((s, e) => s + e.amount, 0)
    const totalOut = entries.filter(e => e.amount < 0).reduce((s, e) => s + Math.abs(e.amount), 0)
    const net      = totalIn - totalOut
    const closing  = entries.length > 0 ? (entries[entries.length - 1].balance ?? entries[entries.length - 1].globalBalance ?? 0) : 0

    const summaryStart = currentRow
    worksheet.getCell(`A${currentRow}`).value = 'SUMMARY'
    worksheet.getCell(`A${currentRow}`).font = { bold: true, color: { argb: ORANGE } }
    
    worksheet.getCell(`A${currentRow + 1}`).value = 'Total Credits'
    worksheet.getCell(`B${currentRow + 1}`).value = totalIn
    worksheet.getCell(`B${currentRow + 1}`).numFmt = '"$"#,##0.00'
    worksheet.getCell(`B${currentRow + 1}`).font = { bold: true, color: { argb: GREEN } }

    worksheet.getCell(`A${currentRow + 2}`).value = 'Total Debits'
    worksheet.getCell(`B${currentRow + 2}`).value = totalOut
    worksheet.getCell(`B${currentRow + 2}`).numFmt = '"$"#,##0.00'
    worksheet.getCell(`B${currentRow + 2}`).font = { bold: true, color: { argb: RED } }

    worksheet.getCell(`D${currentRow + 1}`).value = 'Net Movement'
    worksheet.getCell(`E${currentRow + 1}`).value = net
    worksheet.getCell(`E${currentRow + 1}`).numFmt = '"$"#,##0.00'
    worksheet.getCell(`E${currentRow + 1}`).font = { bold: true, color: { argb: net >= 0 ? GREEN : RED } }

    worksheet.getCell(`D${currentRow + 2}`).value = 'Closing Balance'
    worksheet.getCell(`E${currentRow + 2}`).value = closing
    worksheet.getCell(`E${currentRow + 2}`).numFmt = '"$"#,##0.00'
    worksheet.getCell(`E${currentRow + 2}`).font = { bold: true }

    // Add Seal if available
    const sealUrl = companySettings?.sealUrl || companySettings?.officialSealUrl
    if (sealUrl) {
        const seal = await getImageBase64(sealUrl)
        if (seal) {
            const sealId = workbook.addImage({
                base64: seal.base64,
                extension: seal.extension as any,
            })
            worksheet.addImage(sealId, {
                tl: { col: 5.5, row: summaryStart - 1 },
                ext: { width: 120, height: 120 }
            })
        }
    }

    currentRow += 4

    // ── Data Table Header ────────────────────────────────────────────
    const headerRow = worksheet.getRow(currentRow)
    headerRow.values = ['#', 'Date', 'Account', 'Description', 'Type', 'Amount', 'Running Balance']
    headerRow.font = { bold: true, color: { argb: 'FFFFFF' } }
    headerRow.eachCell((cell) => {
        cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: ORANGE }
        }
        cell.alignment = { horizontal: 'center' }
        cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' }
        }
    })
    
    currentRow++

    // ── Data Rows ────────────────────────────────────────────────────
    entries.forEach((e, i) => {
        const row = worksheet.getRow(currentRow + i)
        row.values = [
            i + 1,
            e.date || toFormattedDate(e.createdAt || new Date()),
            e.account || '—',
            e.description || '—',
            e.type || '—',
            e.amount || 0,
            e.balance ?? e.globalBalance ?? 0
        ]

        // Formatting
        row.getCell('amount').numFmt = '"$"#,##0.00'
        row.getCell('amount').font = { color: { argb: e.amount >= 0 ? GREEN : RED }, bold: true }
        
        row.getCell('balance').numFmt = '"$"#,##0.00'
        row.getCell('balance').font = { bold: true }

        row.eachCell((cell) => {
            cell.border = {
                top: { style: 'thin', color: { argb: 'EEEEEE' } },
                left: { style: 'thin', color: { argb: 'EEEEEE' } },
                bottom: { style: 'thin', color: { argb: 'EEEEEE' } },
                right: { style: 'thin', color: { argb: 'EEEEEE' } }
            }
        })
    })

    // ── Download File ────────────────────────────────────────────────
    const buffer = await workbook.xlsx.writeBuffer()
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    
    const acctSlug = accountLabel.replace(/\s+/g, '_').toLowerCase()
    const fromStr  = dateRange?.from?.replace(/\//g, '-') || 'all'
    const toStr    = dateRange?.to?.replace(/\//g, '-')   || 'time'
    const fileName = `Ledger_${acctSlug}_${fromStr}_to_${toStr}.xlsx`

    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = fileName
    link.click()
    URL.revokeObjectURL(link.href)
}
