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
const DARK:   [number, number, number] = [38, 38, 38]
const LIGHT:  [number, number, number] = [250, 250, 250]

const fmt = (n: number) =>
    Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const statusLabel = (s: string) => {
    if (s === 'APPROVED' || s === 'PAYMENT_PROCESSED') return 'Posted'
    if (s === 'APPROVED_ACCOUNTANT') return 'Awaiting Mgr'
    return 'Pending'
}

export const generateOpexReportPdf = async (
    expenses: any[],
    dateRange: { from: string; to: string } | null,
    companySettings?: CompanySettingsLike,
    financeSettings?: FinanceSettingsLike,
    generatedBy?: string
) => {
    const doc = new jsPDF({ orientation: 'landscape' })
    await setupFonts(doc)
    setupDoc(doc)

    const sealImg  = await getSealImage(companySettings)
    const pageW    = doc.internal.pageSize.width
    const PAGE_CENTER = pageW / 2
    let y          = 15

    // ── Logo ─────────────────────────────────────────────────
    const logoDataUrl = (companySettings as any)?.logoDataUrl
    const logoUrl     = companySettings?.logoUrl
    let logoImgEl: HTMLImageElement | null = null
    let logoH = 22, logoW = 44

    if (logoDataUrl || logoUrl) {
        try {
            const src = logoDataUrl ?? await removeWhiteBackground(logoUrl as string)
            await new Promise<void>(resolve => {
                const img = new Image()
                if (!logoDataUrl) img.crossOrigin = 'anonymous'
                img.src = src
                img.onload = () => {
                    logoImgEl = img
                    logoH = logoW / (img.width / img.height)
                    resolve()
                }
                img.onerror = () => resolve()
            })
        } catch { /* skip */ }
    }

    if (logoImgEl) {
        doc.addImage(logoImgEl, 'PNG', PAGE_CENTER - logoW / 2, y, logoW, logoH)
        y += logoH + 8
    } else {
        y += 18
    }

    // ── Title ─────────────────────────────────────────────────
    doc.setFont('DejaVuSansCondensed', 'bold')
    doc.setFontSize(16)
    doc.setTextColor(...ORANGE)
    doc.text('OPERATIONAL EXPENSES REPORT', PAGE_CENTER, y, { align: 'center' })
    y += 6

    // Date range subtitle
    doc.setFont('DejaVuSansCondensed', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...DARK)
    const rangeText = dateRange?.from && dateRange?.to
        ? `Period: ${dateRange.from}  →  ${dateRange.to}`
        : 'Period: All Time'
    doc.text(rangeText, PAGE_CENTER, y, { align: 'center' })
    y += 4
    doc.setFontSize(7)
    doc.setTextColor(120, 120, 120)
    doc.text(`Generated: ${new Date().toLocaleDateString()}  |  By: ${generatedBy || 'System'}`, PAGE_CENTER, y, { align: 'center' })
    y += 6

    // Divider
    doc.setDrawColor(...ORANGE)
    doc.setLineWidth(0.5)
    doc.line(PAGE_MARGIN, y, pageW - PAGE_MARGIN, y)
    y += 8

    // ── Summary Row ───────────────────────────────────────────
    const posted  = expenses.filter(e => e.status === 'APPROVED' || e.status === 'PAYMENT_PROCESSED')
    const pending = expenses.filter(e => e.status !== 'APPROVED' && e.status !== 'PAYMENT_PROCESSED')
    const totalAll    = expenses.reduce((s, e) => s + (e.amount || 0), 0)
    const totalPosted = posted.reduce((s, e) => s + (e.amount || 0), 0)

    autoTable(doc, {
        startY: y,
        body: [
            ['Total Expenses', String(expenses.length), `$${fmt(totalAll)}`, 'Posted', String(posted.length), `$${fmt(totalPosted)}`, 'Pending/Awaiting', String(pending.length)]
        ],
        theme: 'grid',
        styles: { font: 'DejaVuSansCondensed', fontSize: 7.5, cellPadding: 2.5 },
        columnStyles: {
            0: { fontStyle: 'bold', fillColor: LIGHT },
            1: { halign: 'center', fontStyle: 'bold' },
            2: { halign: 'right', fontStyle: 'bold', textColor: DARK },
            3: { fontStyle: 'bold', fillColor: LIGHT },
            4: { halign: 'center', fontStyle: 'bold', textColor: [22, 163, 74] },
            5: { halign: 'right', fontStyle: 'bold', textColor: [22, 163, 74] },
            6: { fontStyle: 'bold', fillColor: LIGHT },
            7: { halign: 'center', fontStyle: 'bold', textColor: [202, 138, 4] },
        },
        margin: { left: PAGE_MARGIN, right: PAGE_MARGIN }
    })

    // @ts-ignore
    y = doc.lastAutoTable.finalY + 8

    // ── Main Expenses Table ───────────────────────────────────
    doc.setFont('DejaVuSansCondensed', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(...ORANGE)
    doc.text('EXPENSE DETAIL', PAGE_MARGIN, y)
    y += 4

    autoTable(doc, {
        startY: y,
        head: [['#', 'Date', 'Category', 'Description / Beneficiary', 'Dept', 'Method', 'Status', 'Amount']],
        body: expenses.map((exp, i) => [
            String(i + 1),
            toFormattedDate(exp.createdAt || new Date()),
            (exp.category || '—').toUpperCase(),
            exp.title || exp.description || '—',
            exp.department || '—',
            (exp.paymentMethod || '—').toUpperCase(),
            statusLabel(exp.status || ''),
            `$${fmt(exp.amount || 0)}`
        ]),
        foot: [[
            '', '', '', '', '', '',
            { content: 'TOTAL', styles: { fontStyle: 'bold', halign: 'right' } },
            { content: `$${fmt(totalAll)}`, styles: { fontStyle: 'bold', halign: 'right' } }
        ]],
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
        footStyles: {
            fillColor: DARK,
            textColor: [255, 255, 255],
            fontStyle: 'bold',
            fontSize: 8
        },
        columnStyles: {
            0: { cellWidth: 7,  halign: 'center' },
            1: { cellWidth: 20 },
            2: { cellWidth: 22 },
            3: { cellWidth: 'auto' },
            4: { cellWidth: 40 },
            5: { cellWidth: 18 },
            6: { cellWidth: 18 },
            7: { cellWidth: 24, halign: 'right', fontStyle: 'bold' }
        },
        // Colour code status column
        didParseCell(data) {
            if (data.section === 'body' && data.column.index === 6) {
                const val = String(data.cell.raw)
                if (val === 'Posted')          { data.cell.styles.textColor = [22, 163, 74];  data.cell.styles.fontStyle = 'bold' }
                else if (val === 'Awaiting Mgr') { data.cell.styles.textColor = [37, 99, 235]; data.cell.styles.fontStyle = 'bold' }
                else                            { data.cell.styles.textColor = [202, 138, 4];  data.cell.styles.fontStyle = 'bold' }
            }
        },
        margin: { left: PAGE_MARGIN, right: PAGE_MARGIN }
    })

    if (sealImg) drawWatermarkOnAllPages(doc, sealImg)

    const fromStr = dateRange?.from?.replace(/\//g, '-') || 'all'
    const toStr   = dateRange?.to?.replace(/\//g, '-')   || 'time'
    doc.save(`OPEX_Report_${fromStr}_to_${toStr}.pdf`)
}
