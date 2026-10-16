import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import {
    setupFonts,
    setupDoc,
    drawHeader,
    drawGreenBar,
    drawFooter,
    getSealImage,
    drawWatermarkOnAllPages,
    toFormattedDate,
    PAGE_MARGIN,
    PRIMARY_COLOR,
    SECONDARY_TEXT_COLOR,
    type CompanySettingsLike,
    type FinanceSettingsLike,
} from '@/features/jobCards/utils/pdfBranding'
import type { PurchaseOrder } from '../types/procurement'

const CELL_PADDING = { top: 1.5, right: 2, bottom: 1.5, left: 2 }

function fmt(amount: number): string {
    return `$${Number(amount || 0).toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })}`
}

function fmtDateStr(dateStr: string | null | undefined): string {
    if (!dateStr) return 'TBC'
    try {
        return new Date(dateStr).toLocaleDateString('en-US', {
            month: 'short',
            day: '2-digit',
            year: 'numeric',
        })
    } catch {
        return dateStr
    }
}

export async function generatePurchaseOrderPdf(
    po: PurchaseOrder,
    companySettings?: CompanySettingsLike,
    financeSettings?: FinanceSettingsLike,
    creatorName?: string
): Promise<void> {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    await setupFonts(doc)
    setupDoc(doc)

    // Seal — only draw on confirmed (SENT/ACKNOWLEDGED/COMPLETE) POs
    const isConfirmed = ['SENT', 'ACKNOWLEDGED', 'PARTIALLY_FULFILLED', 'COMPLETE'].includes(po.status)
    const sealImg = isConfirmed ? await getSealImage(companySettings) : null

    // ── Header ──────────────────────────────────────────────────────────────
    let currentY = await drawHeader(doc, companySettings)

    // ── Green accent bar ────────────────────────────────────────────────────
    drawGreenBar(doc, currentY)

    // Document title on green bar
    doc.setFont('DejaVuSansCondensed', 'bold')
    doc.setFontSize(11)
    doc.setTextColor(255, 255, 255)
    doc.text('PURCHASE ORDER', PAGE_MARGIN + 2, currentY + 5.5)
    currentY += 12

    // ── PO Summary block (3-column grid) ────────────────────────────────────
    const pageWidth = doc.internal.pageSize.width
    const col1X = PAGE_MARGIN
    const col2X = PAGE_MARGIN + 62
    const col3X = pageWidth - PAGE_MARGIN

    // Row 1 — labels
    doc.setFont('DejaVuSansCondensed', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(120, 120, 120)
    doc.text('PO NUMBER', col1X, currentY)
    doc.text('DATE ISSUED', col2X, currentY)
    doc.text('STATUS', col3X, currentY, { align: 'right' })

    currentY += 4
    // Row 1 — values
    doc.setFont('DejaVuSansCondensed', 'bold')
    doc.setFontSize(13)
    doc.setTextColor(...SECONDARY_TEXT_COLOR)
    doc.text(po.poNumber, col1X, currentY)

    doc.setFontSize(9)
    doc.text(toFormattedDate(po.createdAt), col2X, currentY)

    doc.setFontSize(10)
    doc.setTextColor(...PRIMARY_COLOR)
    doc.text(po.status.replace(/_/g, ' '), col3X, currentY, { align: 'right' })

    currentY += 6

    // Row 2 — labels
    doc.setFontSize(7.5)
    doc.setTextColor(120, 120, 120)
    doc.setFont('DejaVuSansCondensed', 'normal')
    doc.text('PR REFERENCE', col1X, currentY)
    doc.text('DEPARTMENT', col2X, currentY)
    doc.text('EXPECTED DELIVERY', col3X, currentY, { align: 'right' })

    currentY += 4
    // Row 2 — values
    doc.setFont('DejaVuSansCondensed', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(...SECONDARY_TEXT_COLOR)
    doc.text(po.prNumber || '—', col1X, currentY)
    doc.text(po.department || '—', col2X, currentY)
    doc.text(fmtDateStr(po.expectedDeliveryDate), col3X, currentY, { align: 'right' })

    currentY += 8

    // Divider
    doc.setDrawColor(...PRIMARY_COLOR)
    doc.setLineWidth(0.3)
    doc.line(PAGE_MARGIN, currentY, pageWidth - PAGE_MARGIN, currentY)
    currentY += 6

    // ── Supplier block + Delivery block ─────────────────────────────────────
    const halfW = (pageWidth - PAGE_MARGIN * 2 - 6) / 2

    // LEFT — Supplier info
    doc.setFont('DejaVuSansCondensed', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(...PRIMARY_COLOR)
    doc.text('SUPPLIER', col1X, currentY)

    doc.setFont('DejaVuSansCondensed', 'normal')
    doc.setTextColor(...SECONDARY_TEXT_COLOR)
    doc.setFontSize(9)
    currentY += 4.5
    doc.setFont('DejaVuSansCondensed', 'bold')
    doc.text(po.supplierName || '—', col1X, currentY)
    currentY += 4.5
    doc.setFont('DejaVuSansCondensed', 'normal')
    doc.setFontSize(8)
    if (po.supplierEmail) {
        doc.text(po.supplierEmail, col1X, currentY)
        currentY += 3.5
    }
    if (po.supplierPhone) {
        doc.text(po.supplierPhone, col1X, currentY)
        currentY += 3.5
    }
    if (po.paymentTerms) {
        doc.setFont('DejaVuSansCondensed', 'bold')
        doc.text(`Payment Terms: ${po.paymentTerms}`, col1X, currentY)
        currentY += 3.5
    }

    // RIGHT — Delivery info
    const rightX = PAGE_MARGIN + halfW + 6
    let rightY = currentY - (po.supplierEmail ? 15.5 : 12) - (po.supplierPhone ? 3.5 : 0) - (po.paymentTerms ? 3.5 : 0)
    if (rightY < currentY - 20) rightY = currentY - 20

    doc.setFont('DejaVuSansCondensed', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(...PRIMARY_COLOR)
    doc.text('DELIVER TO', rightX, rightY)

    doc.setFont('DejaVuSansCondensed', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...SECONDARY_TEXT_COLOR)
    rightY += 4.5
    const deliveryLines = doc.splitTextToSize(po.deliveryAddress || '—', halfW)
    doc.text(deliveryLines, rightX, rightY)
    rightY += deliveryLines.length * 3.5

    if (po.jobCardTitle) {
        doc.setFont('DejaVuSansCondensed', 'bold')
        const jcLines = doc.splitTextToSize(`Job Card: ${po.jobCardTitle}`, halfW)
        doc.text(jcLines, rightX, rightY)
    }

    currentY += 6

    // Divider
    doc.setDrawColor(200, 200, 200)
    doc.setLineWidth(0.2)
    doc.line(PAGE_MARGIN, currentY, pageWidth - PAGE_MARGIN, currentY)
    currentY += 5

    // ── Line Items table ─────────────────────────────────────────────────────
    doc.setFont('DejaVuSansCondensed', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(...PRIMARY_COLOR)
    doc.text('ORDER LINE ITEMS', PAGE_MARGIN, currentY)
    currentY += 3

    const tableBody = po.items.map((item, idx) => [
        String(idx + 1),
        item.description + (item.sku ? `\nSKU: ${item.sku}` : ''),
        item.uom,
        String(item.qty),
        fmt(item.unitCostPrice),
        fmt(item.freightDuty || 0),
        fmt(item.totalCost),
        `${item.markupPercent || 0}%`,
        fmt(item.sellingPrice || 0),
    ])

    autoTable(doc, {
        startY: currentY,
        head: [['#', 'Description / SKU', 'UOM', 'Qty', 'Unit Cost', 'Freight', 'Total Cost', 'Markup', 'Sell Price']],
        body: tableBody,
        theme: 'grid',
        styles: {
            font: 'DejaVuSansCondensed',
            fontSize: 7.5,
            overflow: 'linebreak',
            cellPadding: CELL_PADDING,
            lineColor: PRIMARY_COLOR,
            lineWidth: 0.15,
            valign: 'top',
            textColor: SECONDARY_TEXT_COLOR,
        },
        headStyles: {
            fillColor: PRIMARY_COLOR,
            textColor: [255, 255, 255],
            fontStyle: 'bold',
            halign: 'center',
            valign: 'middle',
            fontSize: 7,
        },
        bodyStyles: {
            fillColor: (companySettings as any)?.uiColors?.pdfBackgroundColor
                ? [255, 255, 255]
                : [255, 255, 255],
        },
        columnStyles: {
            0: { cellWidth: 7, halign: 'center' },
            1: { cellWidth: 'auto', halign: 'left' },
            2: { cellWidth: 12, halign: 'center' },
            3: { cellWidth: 10, halign: 'center' },
            4: { cellWidth: 20, halign: 'right' },
            5: { cellWidth: 18, halign: 'right' },
            6: { cellWidth: 22, halign: 'right', fontStyle: 'bold' },
            7: { cellWidth: 14, halign: 'center' },
            8: { cellWidth: 22, halign: 'right', textColor: [22, 163, 74] },
        },
        margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
    })

    // @ts-ignore
    currentY = (doc as any).lastAutoTable.finalY + 4

    // ── Totals box ──────────────────────────────────────────────────────────
    const totalOrderValue = po.totalOrderValue || po.items.reduce((s, i) => s + (i.totalCost || 0), 0)
    const totalSellingValue = po.items.reduce((s, i) => s + (i.sellingPrice || 0), 0)
    const margin = totalSellingValue - totalOrderValue

    const boxW = 80
    const boxX = pageWidth - PAGE_MARGIN - boxW
    const rowH = 6.5

    // Total Cost row
    doc.setFillColor(240, 240, 240)
    doc.rect(boxX, currentY, boxW, rowH, 'F')
    doc.setFont('DejaVuSansCondensed', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...SECONDARY_TEXT_COLOR)
    doc.text('Total Order Cost:', boxX + 3, currentY + 4.5)
    doc.setFont('DejaVuSansCondensed', 'bold')
    doc.text(fmt(totalOrderValue), pageWidth - PAGE_MARGIN - 2, currentY + 4.5, { align: 'right' })
    currentY += rowH

    // Total Selling Value row
    doc.setFillColor(232, 245, 232)
    doc.rect(boxX, currentY, boxW, rowH, 'F')
    doc.setFont('DejaVuSansCondensed', 'normal')
    doc.setTextColor(22, 163, 74)
    doc.text('Total Selling Value:', boxX + 3, currentY + 4.5)
    doc.setFont('DejaVuSansCondensed', 'bold')
    doc.text(fmt(totalSellingValue), pageWidth - PAGE_MARGIN - 2, currentY + 4.5, { align: 'right' })
    currentY += rowH

    // Margin row
    doc.setFillColor(...PRIMARY_COLOR)
    doc.rect(boxX, currentY, boxW, rowH + 1, 'F')
    doc.setFont('DejaVuSansCondensed', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(255, 255, 255)
    doc.text('Margin:', boxX + 3, currentY + 5)
    doc.text(fmt(margin), pageWidth - PAGE_MARGIN - 2, currentY + 5, { align: 'right' })
    currentY += rowH + 1 + 8

    // ── Notes ────────────────────────────────────────────────────────────────
    if (po.notes) {
        doc.setFont('DejaVuSansCondensed', 'bold')
        doc.setFontSize(8)
        doc.setTextColor(...PRIMARY_COLOR)
        doc.text('NOTES:', PAGE_MARGIN, currentY)
        currentY += 4
        doc.setFont('DejaVuSansCondensed', 'normal')
        doc.setTextColor(...SECONDARY_TEXT_COLOR)
        const noteLines = doc.splitTextToSize(po.notes, pageWidth - PAGE_MARGIN * 2)
        doc.text(noteLines, PAGE_MARGIN, currentY)
        currentY += noteLines.length * 3.5 + 6
    }

    // ── Authorization section ────────────────────────────────────────────────
    autoTable(doc, {
        startY: currentY,
        head: [['AUTHORIZATION INFORMATION']],
        body: [
            [`Created By: ${po.createdBy || '—'}   |   Created At: ${toFormattedDate(po.createdAt)}`],
            [po.sentAt ? `Sent At: ${toFormattedDate(po.sentAt)}` : 'Status: Pending Dispatch'],
        ],
        theme: 'grid',
        styles: {
            font: 'DejaVuSansCondensed',
            fontSize: 8,
            cellPadding: CELL_PADDING,
            lineColor: [200, 200, 200],
            lineWidth: 0.1,
            textColor: SECONDARY_TEXT_COLOR,
        },
        headStyles: {
            fillColor: [50, 50, 50],
            textColor: [255, 255, 255],
            fontStyle: 'bold',
            fontSize: 8,
        },
        margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
    })

    // @ts-ignore
    currentY = (doc as any).lastAutoTable.finalY + 8

    // ── Footer (signature + bank details) ────────────────────────────────────
    await drawFooter(doc, currentY, companySettings, financeSettings, creatorName, {
        skipTerms: true,
        position: 'Authorized Procurement Officer',
        signatureUrl: (companySettings as any)?.managerSignatureDataUrl
            || (companySettings as any)?.managerSignatureUrl,
    })

    // Watermark seal on all pages for confirmed POs
    if (sealImg) drawWatermarkOnAllPages(doc, sealImg)

    // DRAFT watermark for non-confirmed POs
    if (!isConfirmed) {
        const pageCount = doc.getNumberOfPages()
        const docAny = doc as any
        const supportsOpacity = !!docAny.GState && (() => {
            try { docAny.saveGraphicsState(); docAny.restoreGraphicsState(); return true }
            catch { return false }
        })()
        for (let i = 1; i <= pageCount; i++) {
            doc.setPage(i)
            if (supportsOpacity) {
                docAny.saveGraphicsState()
                docAny.setGState(new docAny.GState({ opacity: 0.08 }))
            }
            doc.setFontSize(80)
            doc.setFont('DejaVuSansCondensed', 'bold')
            doc.setTextColor(...PRIMARY_COLOR)
            doc.text('DRAFT', doc.internal.pageSize.width / 2, doc.internal.pageSize.height / 2, {
                align: 'center',
                angle: 45,
            })
            if (supportsOpacity) docAny.restoreGraphicsState()
        }
    }

    doc.save(`${po.poNumber}.pdf`)
}
