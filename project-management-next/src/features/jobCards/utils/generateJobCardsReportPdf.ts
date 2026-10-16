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

const DARK:   [number, number, number] = [38, 38, 38]
const LIGHT:  [number, number, number] = [250, 250, 250]

const fmt = (n: number) =>
    Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export const generateJobCardsReportPdf = async (
    jobs: any[],
    searchQuery: string,
    selectedCategory: string,
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
    doc.text('JOB CARDS EXPORT REPORT', PAGE_CENTER, y, { align: 'center' })
    y += 6

    // 5. Render Filters and Metadata
    doc.setFont('DejaVuSansCondensed', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...DARK)
    
    const filterParts: string[] = []
    if (selectedCategory && selectedCategory.toLowerCase() !== 'all categories' && selectedCategory !== 'all') {
        filterParts.push(`Category: ${selectedCategory}`)
    }
    if (searchQuery) {
        filterParts.push(`Search: "${searchQuery}"`)
    }
    const filterText = filterParts.length > 0 ? `Filters applied: ${filterParts.join(' | ')}` : 'Filters: None'
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
    let totalInvoice = 0
    let totalOutstanding = 0
    jobs.forEach(job => {
        if (job.status && job.status.toUpperCase() === 'SUBMITTED') {
            return
        }
        
        const getSafeGrandTotal = (j: any) => {
            if (j.generalInfo?.linkedCrmTotal != null && j.generalInfo.linkedCrmTotal > 0) return j.generalInfo.linkedCrmTotal
            if (j.generalInfo?.jobInvoiceValue != null && j.generalInfo.jobInvoiceValue > 0) return j.generalInfo.jobInvoiceValue
            const totals = j.totals || {}
            const summary = j.summary || {}
            const isApproved = ['APPROVED_MANAGER', 'COMPLETED'].includes(j.status)
            const lockedCost = j.lockedImplementationCost
            const inventoryIRDTotal = totals.inventoryIRDTotal ?? summary.inventoryIRDTotal ?? 0
            const inventoryMUTotal = totals.inventoryMUTotal ?? summary.inventoryMUTotal ?? 0
            const implementationCost = isApproved && lockedCost != null ? lockedCost : (totals.implementationCost ?? summary.implementationCost ?? totals.inventoryIMPCostTotal ?? summary.inventoryIMPCostTotal ?? 0)
            return totals.grandTotal ?? summary.grandTotal ?? totals.overallGrandTotal ?? (inventoryIRDTotal + inventoryMUTotal + implementationCost)
        }
        const getAmountDue = (j: any) => {
            const invoice = getSafeGrandTotal(j)
            const paid = j.totalPaid || 0
            return Math.max(0, invoice - paid)
        }

        totalInvoice += getSafeGrandTotal(job)
        totalOutstanding += getAmountDue(job)
    })
    const totalCollected = Math.max(0, totalInvoice - totalOutstanding)

    // Render Cumulative Summary Row Box using autoTable
    autoTable(doc, {
        startY: y,
        body: [
            ['Total Job Cards', String(jobs.length), 'Total Invoice Value', `$${fmt(totalInvoice)}`, 'Total Payments Collected', `$${fmt(totalCollected)}`, 'Total Outstanding Balance', `$${fmt(totalOutstanding)}`]
        ],
        theme: 'grid',
        styles: { font: 'DejaVuSansCondensed', fontSize: 7.5, cellPadding: 2.5 },
        columnStyles: {
            0: { fontStyle: 'bold', fillColor: LIGHT },
            1: { halign: 'center', fontStyle: 'bold' },
            2: { fontStyle: 'bold', fillColor: LIGHT },
            3: { halign: 'right', fontStyle: 'bold', textColor: brandColor },
            4: { fontStyle: 'bold', fillColor: LIGHT },
            5: { halign: 'right', fontStyle: 'bold', textColor: [22, 163, 74] },
            6: { fontStyle: 'bold', fillColor: LIGHT },
            7: { halign: 'right', fontStyle: 'bold', textColor: [217, 119, 6] },
        },
        margin: { left: PAGE_MARGIN, right: PAGE_MARGIN }
    })

    // @ts-ignore
    y = doc.lastAutoTable.finalY + 8

    // 8. Main Job Cards Listing Table
    doc.setFont('DejaVuSansCondensed', 'bold')
    doc.setFontSize(8.5)
    doc.setTextColor(...brandColor)
    doc.text('JOB CARDS SPECIFICATION DETAIL', PAGE_MARGIN, y)
    y += 4

    // Build Rows
    const tableBody = jobs.map((job, idx) => {
        const getSafeGrandTotal = (j: any) => {
            if (j.generalInfo?.linkedCrmTotal != null && j.generalInfo.linkedCrmTotal > 0) return j.generalInfo.linkedCrmTotal
            if (j.generalInfo?.jobInvoiceValue != null && j.generalInfo.jobInvoiceValue > 0) return j.generalInfo.jobInvoiceValue
            const totals = j.totals || {}
            const summary = j.summary || {}
            const isApproved = ['APPROVED_MANAGER', 'COMPLETED'].includes(j.status)
            const lockedCost = j.lockedImplementationCost
            const inventoryIRDTotal = totals.inventoryIRDTotal ?? summary.inventoryIRDTotal ?? 0
            const inventoryMUTotal = totals.inventoryMUTotal ?? summary.inventoryMUTotal ?? 0
            const implementationCost = isApproved && lockedCost != null ? lockedCost : (totals.implementationCost ?? summary.implementationCost ?? totals.inventoryIMPCostTotal ?? summary.inventoryIMPCostTotal ?? 0)
            return totals.grandTotal ?? summary.grandTotal ?? totals.overallGrandTotal ?? (inventoryIRDTotal + inventoryMUTotal + implementationCost)
        }
        const getAmountDue = (j: any) => {
            const invoice = getSafeGrandTotal(j)
            const paid = j.totalPaid || 0
            return Math.max(0, invoice - paid)
        }

        const invoiceVal = getSafeGrandTotal(job)
        const dueVal = getAmountDue(job)

        const repName = job.submittedBy?.name || '---'

        return [
            String(idx + 1),
            job.generalInfo?.jobNumber || job.id.substring(0, 8),
            job.generalInfo?.recipientName || '—',
            job.generalInfo?.categoryName || '—',
            job.generalInfo?.dimensionsOfStructure || 'N/A',
            repName,
            job.status.replace(/_/g, ' '),
            `$${fmt(invoiceVal)}`,
            dueVal <= 0 ? 'Fully Paid' : `$${fmt(dueVal)}`
        ]
    })

    // Calculate Table overall footer totals
    let listInvoiceTotal = 0
    let listDueTotal = 0
    jobs.forEach(job => {
        const getSafeGrandTotal = (j: any) => {
            if (j.generalInfo?.linkedCrmTotal != null && j.generalInfo.linkedCrmTotal > 0) return j.generalInfo.linkedCrmTotal
            if (j.generalInfo?.jobInvoiceValue != null && j.generalInfo.jobInvoiceValue > 0) return j.generalInfo.jobInvoiceValue
            const totals = j.totals || {}
            const summary = j.summary || {}
            const isApproved = ['APPROVED_MANAGER', 'COMPLETED'].includes(j.status)
            const lockedCost = j.lockedImplementationCost
            const inventoryIRDTotal = totals.inventoryIRDTotal ?? summary.inventoryIRDTotal ?? 0
            const inventoryMUTotal = totals.inventoryMUTotal ?? summary.inventoryMUTotal ?? 0
            const implementationCost = isApproved && lockedCost != null ? lockedCost : (totals.implementationCost ?? summary.implementationCost ?? totals.inventoryIMPCostTotal ?? summary.inventoryIMPCostTotal ?? 0)
            return totals.grandTotal ?? summary.grandTotal ?? totals.overallGrandTotal ?? (inventoryIRDTotal + inventoryMUTotal + implementationCost)
        }
        const getAmountDue = (j: any) => {
            const invoice = getSafeGrandTotal(j)
            const paid = j.totalPaid || 0
            return Math.max(0, invoice - paid)
        }
        listInvoiceTotal += getSafeGrandTotal(job)
        listDueTotal += getAmountDue(job)
    })

    autoTable(doc, {
        startY: y,
        head: [['#', 'Job Number', 'Customer', 'Category', 'Dimensions', 'Sales Rep', 'Status', 'Invoice Value', 'Amount Due']],
        body: tableBody,
        foot: [[
            '', '', '', '', '', '',
            { content: 'TOTALS', styles: { fontStyle: 'bold', halign: 'right' } },
            { content: `$${fmt(listInvoiceTotal)}`, styles: { fontStyle: 'bold', halign: 'right' } },
            { content: `$${fmt(listDueTotal)}`, styles: { fontStyle: 'bold', halign: 'right' } }
        ]],
        theme: 'striped',
        styles: {
            font: 'DejaVuSansCondensed',
            fontSize: 7,
            cellPadding: { top: 1.5, right: 2, bottom: 1.5, left: 2 },
            lineColor: [220, 220, 220],
            lineWidth: 0.1,
            overflow: 'ellipsize',
            minCellHeight: 5
        },
        headStyles: {
            fillColor: brandColor,
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
            0: { cellWidth: 8, halign: 'center' },
            1: { cellWidth: 26, fontStyle: 'bold' },
            2: { cellWidth: 32 },
            3: { cellWidth: 'auto' },
            4: { cellWidth: 22 },
            5: { cellWidth: 26 },
            6: { cellWidth: 24, fontStyle: 'bold' },
            7: { cellWidth: 26, halign: 'right', fontStyle: 'bold' },
            8: { cellWidth: 26, halign: 'right', fontStyle: 'bold' }
        },
        didParseCell(data) {
            if (data.section === 'body' && data.column.index === 6) {
                const val = String(data.cell.raw).toUpperCase()
                if (val.includes('APPROVED') || val.includes('COMPLETED')) {
                    data.cell.styles.textColor = [22, 163, 74]
                } else if (val.includes('REJECTED')) {
                    data.cell.styles.textColor = [220, 38, 38]
                } else if (val.includes('PENDING')) {
                    data.cell.styles.textColor = [217, 119, 6]
                } else if (val.includes('SUBMITTED')) {
                    data.cell.styles.textColor = [37, 99, 235]
                } else {
                    data.cell.styles.textColor = [120, 120, 120]
                }
            }
            if (data.section === 'body' && data.column.index === 8) {
                const val = String(data.cell.raw)
                if (val === 'Fully Paid') {
                    data.cell.styles.textColor = [22, 163, 74]
                }
            }
        },
        margin: { left: PAGE_MARGIN, right: PAGE_MARGIN }
    })

    // 9. Draw Seal Watermark on all pages
    if (sealImg) drawWatermarkOnAllPages(doc, sealImg)

    // 10. Save Document
    doc.save(`JobCards_Export_${new Date().toISOString().split('T')[0]}.pdf`)
}
