import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import {
    setupFonts,
    setupDoc,
    getSealImage,
    drawWatermarkOnAllPages,
    removeWhiteBackground,
    PAGE_MARGIN,
    hexToRgb,
    PRIMARY_COLOR,
    type CompanySettingsLike
} from '@/features/jobCards/utils/pdfBranding'
import { format } from 'date-fns'

const DARK:   [number, number, number] = [38, 38, 38]
const LIGHT:  [number, number, number] = [250, 250, 250]

const fmt = (n: number) =>
    Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export const generateAutoApprovalsReportPdf = async (
    expenses: any[],
    activeTab: string,
    searchQuery: string,
    companySettings?: CompanySettingsLike,
    generatedBy?: string
) => {
    // 1. Initialize Document
    const doc = new jsPDF({ orientation: 'landscape' })
    await setupFonts(doc)
    setupDoc(doc)

    // 2. Determine Primary Branding Colors
    let brandColor = PRIMARY_COLOR
    const hexColor = (companySettings as any)?.uiColors?.brandPrimaryColor
    if (hexColor) {
        try {
            brandColor = hexToRgb(hexColor)
        } catch { /* fallback to default */ }
    }

    const sealImg = await getSealImage(companySettings)
    const pageW = doc.internal.pageSize.width
    const PAGE_CENTER = pageW / 2
    let y = 15

    // 3. Render Logo
    const logoDataUrl = (companySettings as any)?.logoDataUrl
    const logoUrl = companySettings?.logoUrl
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
        } catch { /* ignore */ }
    }

    if (logoImgEl) {
        doc.addImage(logoImgEl, 'PNG', PAGE_CENTER - logoW / 2, y, logoW, logoH)
        y += logoH + 8
    } else {
        y += 18
    }

    // 4. Render Document Title
    doc.setFont('DejaVuSansCondensed', 'bold')
    doc.setFontSize(16)
    doc.setTextColor(...brandColor)
    doc.text('AUTO-APPROVALS AUDIT TRAIL REPORT', PAGE_CENTER, y, { align: 'center' })
    y += 6

    // 5. Render Filters and Metadata
    doc.setFont('DejaVuSansCondensed', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...DARK)
    
    const filterParts: string[] = [`View Group: ${activeTab.toUpperCase()}`]
    if (searchQuery) {
        filterParts.push(`Search Query: "${searchQuery}"`)
    }
    const filterText = `Filters applied: ${filterParts.join(' | ')}`
    doc.text(filterText, PAGE_CENTER, y, { align: 'center' })
    y += 4

    doc.setFontSize(7)
    doc.setTextColor(120, 120, 120)
    doc.text(`Generated: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}  |  By: ${generatedBy || 'System'}`, PAGE_CENTER, y, { align: 'center' })
    y += 6

    // 6. Draw Primary Color Divider Line
    doc.setDrawColor(...brandColor)
    doc.setLineWidth(0.5)
    doc.line(PAGE_MARGIN, y, pageW - PAGE_MARGIN, y)
    y += 8

    // 7. Calculate Financial Cumulative Summary Stats
    const totalTransactions = expenses.length
    const totalValue = expenses.reduce((s, e) => s + Math.abs(Number(e.amount || 0)), 0)

    // Render Cumulative Summary Row Box using autoTable
    autoTable(doc, {
        startY: y,
        body: [
            ['Total Auto-Approved Transactions', String(totalTransactions), 'Total Bypassed Value', `$${fmt(totalValue)}`, 'Auto-Approval Limit Rule', '< $300.00']
        ],
        theme: 'grid',
        styles: { font: 'DejaVuSansCondensed', fontSize: 8, cellPadding: 3 },
        columnStyles: {
            0: { fontStyle: 'bold', fillColor: LIGHT },
            1: { halign: 'center', fontStyle: 'bold', textColor: brandColor },
            2: { fontStyle: 'bold', fillColor: LIGHT },
            3: { halign: 'right', fontStyle: 'bold', textColor: [217, 119, 6] },
            4: { fontStyle: 'bold', fillColor: LIGHT },
            5: { halign: 'center', fontStyle: 'bold', textColor: [22, 163, 74] },
        },
        margin: { left: PAGE_MARGIN, right: PAGE_MARGIN }
    })

    // @ts-ignore
    y = doc.lastAutoTable.finalY + 8

    // 8. Main Audit Trail Table
    doc.setFont('DejaVuSansCondensed', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(...brandColor)
    doc.text('AUDIT LOG SPECIFICATION DETAILS', PAGE_MARGIN, y)
    y += 4

    // Helpers to match grid cell values
    const getDate = (e: any): Date => {
        if (e.accountantApprovedAt?.toDate) return e.accountantApprovedAt.toDate()
        if (e.createdAt?.toDate) return e.createdAt.toDate()
        return new Date()
    }
    const fd = (e: any) => format(getDate(e), 'dd MMM yyyy, HH:mm')
    const getCategoryLabel = (e: any) => {
        if (e.category === 'job-card-expense') return 'Ad-hoc'
        return (e.category || e.title || 'Opex').replace(/-/g, ' ')
    }

    // Build Rows
    const tableBody = expenses.map((item, idx) => [
        String(idx + 1),
        fd(item),
        getCategoryLabel(item),
        item.description || item.title || '—',
        item.accountantApprovedBy || '—',
        `$${fmt(Math.abs(Number(item.amount || 0)))}`,
        '< $300'
    ])

    autoTable(doc, {
        startY: y,
        head: [['#', 'Date & Time', 'Type', 'Description', 'Approved By', 'Amount', 'Rule']],
        body: tableBody,
        foot: [[
            '', '', '', '',
            { content: 'TOTAL BYPASSED EXPENDITURE', styles: { fontStyle: 'bold', halign: 'right' } },
            { content: `$${fmt(totalValue)}`, styles: { fontStyle: 'bold', halign: 'right' } },
            ''
        ]],
        theme: 'striped',
        styles: {
            font: 'DejaVuSansCondensed',
            fontSize: 7.5,
            cellPadding: { top: 2, right: 2.5, bottom: 2, left: 2.5 },
            lineColor: [220, 220, 220],
            lineWidth: 0.1,
            overflow: 'ellipsize',
            minCellHeight: 5
        },
        headStyles: {
            fillColor: brandColor,
            textColor: [255, 255, 255],
            fontStyle: 'bold',
            fontSize: 8,
            cellPadding: { top: 2.5, right: 2.5, bottom: 2.5, left: 2.5 }
        },
        footStyles: {
            fillColor: DARK,
            textColor: [255, 255, 255],
            fontStyle: 'bold',
            fontSize: 8
        },
        columnStyles: {
            0: { cellWidth: 10, halign: 'center' },
            1: { cellWidth: 36, halign: 'center' },
            2: { cellWidth: 26, fontStyle: 'bold' },
            3: { cellWidth: 'auto' },
            4: { cellWidth: 44 },
            5: { cellWidth: 28, halign: 'right', fontStyle: 'bold' },
            6: { cellWidth: 22, halign: 'center', fontStyle: 'bold', textColor: [22, 163, 74] }
        },
        margin: { left: PAGE_MARGIN, right: PAGE_MARGIN }
    })

    // 9. Draw Seal Watermark on all pages
    if (sealImg) drawWatermarkOnAllPages(doc, sealImg)

    // 10. Save Document
    doc.save(`AutoApprovals_Audit_${new Date().toISOString().split('T')[0]}.pdf`)
}
