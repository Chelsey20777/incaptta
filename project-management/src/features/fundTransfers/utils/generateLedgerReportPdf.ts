import jsPDF from 'jspdf'
import {
    setupFonts,
    setupDoc,
    getSealImage,
    drawWatermarkOnAllPages,
    removeWhiteBackground,
    toFormattedDate,
    PAGE_MARGIN,
    type CompanySettingsLike,
    type FinanceSettingsLike
} from '@/features/jobCards/utils/pdfBranding'
import autoTable from 'jspdf-autotable'

const ORANGE: [number, number, number] = [249, 115, 22]
const GREEN:  [number, number, number] = [121, 194, 27]
const DARK:   [number, number, number] = [30, 30, 30]
const RED:    [number, number, number] = [239, 68, 68]
const LIGHT:  [number, number, number] = [248, 250, 252]

const fmt = (n: number) =>
    Math.abs(Number(n || 0)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const typeColor = (type: string): [number, number, number] => {
    if (type === 'INCOME' || type === 'TOPUP') return GREEN
    if (type === 'EXPENSE') return RED
    return [100, 100, 100]
}

export const generateLedgerReportPdf = async (
    entries: any[],
    accountLabel: string,
    dateRange: { from: string; to: string } | null,
    companySettings?: CompanySettingsLike,
    financeSettings?: FinanceSettingsLike,
    generatedBy?: string
) => {
    const doc  = new jsPDF({ orientation: 'landscape' })
    await setupFonts(doc)
    setupDoc(doc)

    const sealImg = await getSealImage(companySettings)
    const pageW   = doc.internal.pageSize.width
    const CENTER  = pageW / 2
    let y         = 12

    // ── Logo ─────────────────────────────────────────────────────────
    const logoDataUrl = (companySettings as any)?.logoDataUrl
    const logoUrl     = companySettings?.logoUrl
    let logoEl: HTMLImageElement | null = null
    let logoW = 44, logoH = 22

    if (logoDataUrl || logoUrl) {
        try {
            const src = logoDataUrl ?? await removeWhiteBackground(logoUrl as string)
            await new Promise<void>(resolve => {
                const img = new Image()
                if (!logoDataUrl) img.crossOrigin = 'anonymous'
                img.src = src
                img.onload = () => { logoEl = img; logoH = logoW / (img.width / img.height); resolve() }
                img.onerror = () => resolve()
            })
        } catch { /* skip */ }
    }

    if (logoEl) {
        doc.addImage(logoEl, 'PNG', CENTER - logoW / 2, y, logoW, logoH)
        y += logoH + 5
    } else {
        y += 15
    }

    // ── Title ─────────────────────────────────────────────────────────
    doc.setFont('DejaVuSansCondensed', 'bold')
    doc.setFontSize(16)
    doc.setTextColor(...ORANGE)
    doc.text('LEDGER REPORT', CENTER, y, { align: 'center' })
    y += 5

    doc.setFont('DejaVuSansCondensed', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...DARK)
    doc.text(`Account: ${accountLabel}`, CENTER, y, { align: 'center' })
    y += 4

    const rangeText = dateRange?.from && dateRange?.to
        ? `Period: ${dateRange.from}  →  ${dateRange.to}`
        : 'Period: All Time'
    doc.text(rangeText, CENTER, y, { align: 'center' })
    y += 4

    doc.setFontSize(7)
    doc.setTextColor(120, 120, 120)
    doc.text(`Generated: ${new Date().toLocaleDateString()}  |  By: ${generatedBy || 'System'}`, CENTER, y, { align: 'center' })
    y += 5

    // Divider
    doc.setDrawColor(...ORANGE)
    doc.setLineWidth(0.5)
    doc.line(PAGE_MARGIN, y, pageW - PAGE_MARGIN, y)
    y += 5

    // ── Summary Row ───────────────────────────────────────────────────
    const totalIn  = entries.filter(e => e.amount > 0).reduce((s, e) => s + e.amount, 0)
    const totalOut = entries.filter(e => e.amount < 0).reduce((s, e) => s + Math.abs(e.amount), 0)
    const net      = totalIn - totalOut
    const closing  = entries.length > 0 ? (entries[entries.length - 1].balance ?? entries[entries.length - 1].globalBalance ?? 0) : 0

    autoTable(doc, {
        startY: y,
        body: [[
            'Total Credits', `+$${fmt(totalIn)}`,
            'Total Debits',  `-$${fmt(totalOut)}`,
            'Net Movement',  `${net >= 0 ? '+' : '-'}$${fmt(net)}`,
            'Closing Balance', `$${fmt(closing)}`
        ]],
        theme: 'grid',
        styles: { font: 'DejaVuSansCondensed', fontSize: 7.5, cellPadding: { top: 1.5, right: 2, bottom: 1.5, left: 2 } },
        columnStyles: {
            0: { fontStyle: 'bold', fillColor: LIGHT },
            1: { halign: 'right', fontStyle: 'bold', textColor: GREEN as [number,number,number] },
            2: { fontStyle: 'bold', fillColor: LIGHT },
            3: { halign: 'right', fontStyle: 'bold', textColor: RED as [number,number,number] },
            4: { fontStyle: 'bold', fillColor: LIGHT },
            5: { halign: 'right', fontStyle: 'bold', textColor: net >= 0 ? GREEN as [number,number,number] : RED as [number,number,number] },
            6: { fontStyle: 'bold', fillColor: LIGHT },
            7: { halign: 'right', fontStyle: 'bold' },
        },
        margin: { left: PAGE_MARGIN, right: PAGE_MARGIN }
    })

    // @ts-ignore
    y = doc.lastAutoTable.finalY + 5

    // ── Section heading ───────────────────────────────────────────────
    doc.setFont('DejaVuSansCondensed', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(...ORANGE)
    doc.text('TRANSACTION DETAIL', PAGE_MARGIN, y)
    y += 4

    // ── Main Table ───────────────────────────────────────────────────
    autoTable(doc, {
        startY: y,
        head: [['#', 'Date', 'Account', 'Description', 'Type', 'Amount', 'Running Balance']],
        body: entries.map((e, i) => [
            String(i + 1),
            e.date || toFormattedDate(e.createdAt || new Date()),
            e.account || '—',
            e.description || '—',
            e.type || '—',
            `${e.amount >= 0 ? '+' : '-'}$${fmt(e.amount)}`,
            `$${fmt(e.balance ?? e.globalBalance ?? 0)}`
        ]),
        theme: 'striped',
        styles: {
            font: 'DejaVuSansCondensed',
            fontSize: 7,
            cellPadding: { top: 1, right: 2, bottom: 1, left: 2 },
            lineColor: [220, 220, 220],
            lineWidth: 0.1,
            overflow: 'ellipsize',
            minCellHeight: 5
        },
        headStyles: {
            fillColor: ORANGE,
            textColor: [255, 255, 255],
            fontStyle: 'bold',
            fontSize: 7.5,
            cellPadding: { top: 2, right: 2, bottom: 2, left: 2 }
        },
        columnStyles: {
            0: { cellWidth: 7,  halign: 'center' },
            1: { cellWidth: 20 },
            2: { cellWidth: 22 },
            3: { cellWidth: 'auto' },
            4: { cellWidth: 20 },
            5: { cellWidth: 26, halign: 'right', fontStyle: 'bold' },
            6: { cellWidth: 30, halign: 'right', fontStyle: 'bold' }
        },
        didParseCell(data) {
            if (data.section === 'body') {
                // Colour amount column
                if (data.column.index === 5) {
                    const raw = entries[data.row.index]
                    if (raw) data.cell.styles.textColor = raw.amount >= 0 ? GREEN : RED
                }
                // Colour type badge
                if (data.column.index === 4) {
                    const raw = entries[data.row.index]
                    if (raw) data.cell.styles.textColor = typeColor(raw.type || '')
                    data.cell.styles.fontStyle = 'bold'
                }
            }
        },
        margin: { left: PAGE_MARGIN, right: PAGE_MARGIN }
    })

    if (sealImg) drawWatermarkOnAllPages(doc, sealImg)

    const acctSlug = accountLabel.replace(/\s+/g, '_').toLowerCase()
    const fromStr  = dateRange?.from?.replace(/\//g, '-') || 'all'
    const toStr    = dateRange?.to?.replace(/\//g, '-')   || 'time'
    doc.save(`Ledger_${acctSlug}_${fromStr}_to_${toStr}.pdf`)
}
