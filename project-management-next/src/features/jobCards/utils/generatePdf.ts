import jsPDF from 'jspdf'
import QRCode from 'qrcode'
import {
    setupFonts,
    setupDoc,
    drawHeader,
    drawGreenBar,
    drawJobCardInfoRow,
    renderBrandedItemsTable,
    drawTotalsRight,
    drawFooter,
    getSealImage,
    drawWatermarkOnAllPages,
    toFormattedDate,
    PRIMARY_COLOR,
    PAGE_MARGIN,
    removeWhiteBackground,
    type CompanySettingsLike,
    type FinanceSettingsLike
} from './pdfBranding'
import autoTable from 'jspdf-autotable'
import { formatDate } from '@/lib/utils'
import { lineExtendedAmounts, sectionExtendedTotal } from '@/lib/crm/quotation-commercial'

export type PdfSignerOptions = {
    signatureUrl?: string
    position?: string
}

function requisitionLineQty(item: any, fallback = 0): number {
    const raw = item?.qtyRequired ?? item?.qty ?? item?.quantity ?? fallback
    const qty = Number(raw)
    return Number.isFinite(qty) ? qty : fallback
}

function formatRequisitionQty(item: any, fallback = 0): string {
    const qty = requisitionLineQty(item, fallback)
    const unit = String(item?.unit || item?.uom || '').trim()
    return unit ? `${qty} ${unit}` : String(qty)
}

export const generateJobPdf = async (
    job: any,
    companySettings?: CompanySettingsLike,
    financeSettings?: FinanceSettingsLike,
    creatorName?: string,
    jobCategories: any[] = [],
    totalPaid: number = 0,
    signer?: PdfSignerOptions
) => {
    const doc = new jsPDF()
    await setupFonts(doc)
    setupDoc(doc)

    const sealImg = await getSealImage(companySettings)
    const headerBottomY = await drawHeader(doc, companySettings)

    const greenBarY = headerBottomY + 4
    drawGreenBar(doc, greenBarY)

    const jobRef = job?.generalInfo?.jobNumber ?? (job?.id ? String(job.id).substring(0, 8) : "N/A")
    const docTitle = (job.status === "APPROVED_MANAGER" || job.status === "COMPLETED") ? "INVOICE" : "QUOTATION"

    const adviceText =
        financeSettings?.termsAdvised ||
        companySettings?.invoiceAdviceText ||
        "For all onsite Installation services: Please note that you will provide transport (for the workforce ,material (herein stated in this invoice) and equipment committed to you from our premises and from your farm after service delivery.";

    const recipientDetails = [
        job?.generalInfo?.recipientName || job?.clientName || job?.preparedFor?.name || "N/A",
        job?.generalInfo?.recipientAddress || "N/A",
        job?.generalInfo?.recipientPhone || ""
    ].filter(Boolean);

    let y = drawJobCardInfoRow(doc, {
        leftTitle: "BILL ADDRESSED TO",
        leftLine1: recipientDetails[0],
        leftLine2: recipientDetails.slice(1).join('\n'),
        docTitle,
        docNumber: `#${jobRef}`,
        dateIssued: toFormattedDate(job?.generalInfo?.dateIssued || job?.createdAt || new Date()),
        adviceText: adviceText,
    }, greenBarY + 14)

    // Build table rows from job requisition items/sections
    const head = [
        "Item Name",
        "Description",
        "Qty",
        "Unit Price",
        "Total Cost"
    ]

    let itemsData: any[][] = []

    // Calculate implementation cost (ad-hoc + staff rates + subcontract works)
    const adHocTotal = (job.adHocExpenses || []).reduce((sum: number, e: any) => sum + (e.totalAmount || 0), 0)
    const staffRatesTotal = (job.staffRates || []).reduce((sum: number, r: any) => sum + (r.jobRateAmount || 0), 0)
    const subcontractWorksTotal = (job.subcontractWorks || []).reduce((sum: number, w: any) => {
      if (w.isScnLink || w.subcontractorJobId) {
        return sum + (Number(w.contractValue ?? w.totalAmount) || 0)
      }
      return sum + (w.totalAmount || 0)
    }, 0)
    const implementationCost = adHocTotal + staffRatesTotal + subcontractWorksTotal

    if (Array.isArray(job.requisitionSections) && job.requisitionSections.length > 0) {
        // Pre-compute total inventory value so we can distribute implementation cost proportionally
        const inventorySubtotal = job.requisitionSections.reduce(
            (sum: number, s: any) => sum + sectionExtendedTotal(s), 0
        )
        itemsData = job.requisitionSections.map((section: any) => {
            const sectionInventoryTotal = sectionExtendedTotal(section)
            const proportion = inventorySubtotal > 0 ? sectionInventoryTotal / inventorySubtotal : 0
            const sectionTotal = sectionInventoryTotal + (implementationCost * proportion)
            const sectionQty = Math.max(1, Number(section.qty) || 1)
            const catName = (jobCategories.find(c => c.id === section.jobCategoryId)?.name || section.name || section.category || 'Service').toUpperCase()
            return [
                catName,
                section.description || (section.items || []).map((it: any) => it.itemName).join(', '),
                String(sectionQty),
                (sectionTotal / sectionQty).toFixed(2),
                sectionTotal.toFixed(2)
            ]
        })
    } else {
        const items = Array.isArray(job.requisitionItems) ? job.requisitionItems : []
        itemsData = items.map((it: any) => {
            const qty = requisitionLineQty(it, 1)
            const unit = Number(it.irdSellingPrice || it.unitPrice || 0)
            const total = lineExtendedAmounts({
                qtyRequired: qty,
                irdSellingPrice: unit,
                markupPercent: it.markupPercent ?? it.twidMarkupPercent,
                costSnapshot: it.costSnapshot,
            }).totalPrice
            const nameWithAdj = it.isAdjustment 
                ? `${it.itemName || it.name || "N/A"}\n(Adj: ${formatDate(it.adjustmentDate || job.updatedAt)})`
                : (it.itemName || it.name || "N/A")
            return [
                nameWithAdj,
                it.description || it.notes || "N/A",
                String(qty),
                unit.toFixed(2),
                total.toFixed(2)
            ]
        })
    }

    y = renderBrandedItemsTable(doc, y, head, itemsData)

    // Subtotal now includes implementation cost baked into the line prices — do not add separately
    const subtotal = itemsData.reduce((sum: number, row: any[]) => sum + Number(row[4]), 0)
    const vatEnabled = Boolean((financeSettings as any)?.vatEnabled)
    const vatRate = vatEnabled ? Number((financeSettings as any)?.vatRate || 0) : 0
    const vatAmount = vatRate > 0 ? subtotal * vatRate / 100 : 0
    const total = subtotal + vatAmount
    y = drawTotalsRight(doc, y, {
        subtotal,
        // implementation cost is hidden from client — absorbed into unit prices above
        vat: vatAmount > 0 ? vatAmount : undefined,
        vatRate: vatRate > 0 ? vatRate : undefined,
        total,
        paid: totalPaid
    })

    await drawFooter(doc, y, companySettings, financeSettings, creatorName, {
        signatureUrl: signer?.signatureUrl || companySettings?.managerSignatureUrl,
        position:
            signer?.position ||
            job?.managerPosition ||
            companySettings?.managerPosition ||
            "TECHNICAL MANAGER",
    })

    if (sealImg) drawWatermarkOnAllPages(doc, sealImg)

    doc.save(`${docTitle}_${jobRef}.pdf`)
}


// Generate a QR code data URL encoding a verification URL for the given job ref
async function makeVerificationQr(jobRef: string): Promise<string | null> {
    try {
        return await QRCode.toDataURL(`https://incaptta.co.zw/verify/${jobRef}`, { margin: 1, width: 120 })
    } catch { return null }
}

// Basic async SHA-256 for browser
async function sha256(message: string) {
    const msgBuffer = new TextEncoder().encode(message)
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

const CELL_PADDING = { top: 1.5, right: 2, bottom: 1.5, left: 2 }

export async function generateApprovedRequisitionPdf(
    job: any,
    companySettings?: CompanySettingsLike,
    financeSettings?: FinanceSettingsLike,
    creatorName?: string,
    jobCategories: any[] = []
) {
    const items = job.requisitionItems || (job.requisitionSections ? job.requisitionSections.flatMap((s: any) => s.items || []) : [])
    const approvedItems = items.filter((i: any) => i.approvalStatus === 'APPROVED_MANAGER')
    if (approvedItems.length === 0) return

    const doc = new jsPDF()
    await setupFonts(doc)
    setupDoc(doc)

    const sealImg = await getSealImage(companySettings)

    // 1. Custom Centered Header
    const pageWidth = doc.internal.pageSize.width
    const PAGE_CENTER = pageWidth / 2
    let currentY = 12
    const headerStartY = currentY

    let logoHeight = 25;
    let logoWidth = 50;
    let logoImgElement: HTMLImageElement | null = null;

    const logoDataUrl = (companySettings as any)?.logoDataUrl;
    const logoUrl = companySettings?.logoUrl;

    if (logoDataUrl || logoUrl) {
        try {
            const transparentLogo = logoDataUrl ? logoDataUrl : await removeWhiteBackground(logoUrl as string)
            await new Promise<void>((resolve) => {
                const img = new Image()
                if (!logoDataUrl) img.crossOrigin = "anonymous"
                img.src = transparentLogo
                img.onload = () => {
                    logoImgElement = img;
                    const aspect = img.width / img.height;
                    logoHeight = logoWidth / aspect;
                    resolve()
                }
                img.onerror = () => resolve()
            })
        } catch (e) { console.warn("Logo load fail", e) }
    }

    if (logoImgElement) {
        try {
            doc.addImage(logoImgElement, "PNG", PAGE_CENTER - (logoWidth / 2), currentY, logoWidth, logoHeight)
            currentY += logoHeight + 7
        } catch (err) {
            console.error("jsPDF error adding logo:", err);
            currentY += 16;
        }
    } else {
        currentY += 16; // Spacer if no logo
    }

    const RED_COLOR: [number, number, number] = [220, 38, 38]

    // Title and Reference
    doc.setFont("DejaVuSansCondensed", "bold")
    doc.setFontSize(22)
    doc.setTextColor(...RED_COLOR)
    doc.text("APPROVED INVENTORY REQUISITION", PAGE_CENTER, currentY, { align: "center" })

    currentY += 8
    const jobRef = job?.generalInfo?.jobNumber ?? (job?.id ? String(job.id).substring(0, 8).toUpperCase() : "N/A")
    doc.setFontSize(12)
    doc.setTextColor(38, 38, 38)
    doc.text(`#${jobRef}`, PAGE_CENTER, currentY, { align: "center" })

    currentY += 6
    doc.setFontSize(10)
    doc.setFont("DejaVuSansCondensed", "normal")
    doc.text(`Date Issued: ${toFormattedDate(job?.generalInfo?.dateIssued || job?.createdAt || new Date())}`, PAGE_CENTER, currentY, { align: "center" })

    currentY += 8

    // Simple Line Divider
    doc.setDrawColor(...RED_COLOR)
    doc.setLineWidth(0.5)
    doc.line(PAGE_MARGIN, currentY, pageWidth - PAGE_MARGIN, currentY)

    currentY += 5

    // QR Code — top-right corner, aligned with logo top
    const qrDataUrl = await makeVerificationQr(jobRef)
    if (qrDataUrl) {
        const QR_SIZE = 20
        const qrX = pageWidth - PAGE_MARGIN - QR_SIZE
        doc.addImage(qrDataUrl, 'PNG', qrX, headerStartY, QR_SIZE, QR_SIZE)
        doc.setFont("DejaVuSansCondensed", "normal")
        doc.setFontSize(5.5)
        doc.setTextColor(100, 100, 100)
        doc.text("Scan to verify", qrX + QR_SIZE / 2, headerStartY + QR_SIZE + 2.5, { align: "center" })
    }

    const categoryName = jobCategories.find((c: any) => c.id === job.generalInfo?.jobCategoryId)?.name || "N/A"

    doc.setFont("DejaVuSansCondensed", "bold")
    doc.setFontSize(9)
    doc.setTextColor(0, 0, 0)
    doc.text("REQUISITION METADATA:", PAGE_MARGIN, currentY)

    currentY += 4

    autoTable(doc, {
        startY: currentY,
        body: [
            ['Job Card Reference', `#${jobRef}`],
            ['Category', categoryName],
            ['Start Date', job.generalInfo?.startDate || "N/A"],
            ['Project Location', job.generalInfo?.projectLocation || "N/A"],
            ['Recipient Name', job.generalInfo?.recipientName || "N/A"],
            ['Recipient Address', job.generalInfo?.recipientAddress || "N/A"]
        ],
        theme: 'grid',
        styles: {
            font: "DejaVuSansCondensed",
            fontSize: 8,
            cellPadding: CELL_PADDING,
            lineColor: [240, 240, 240],
            lineWidth: 0.1,
        },
        columnStyles: {
            0: { cellWidth: 45, fontStyle: 'bold', fillColor: [250, 250, 250] },
            1: { cellWidth: 'auto' }
        },
        margin: { left: PAGE_MARGIN, right: PAGE_MARGIN }
    })

    // @ts-ignore
    currentY = doc.lastAutoTable.finalY + 8

    const head = ['Item Name', 'Qty']
    const body = approvedItems.map((item: any) => [
        item.isAdjustment 
            ? `${item.itemName || 'Unnamed Item'}\n(Adj: ${formatDate(item.adjustmentDate || job.updatedAt)})`
            : (item.itemName || 'Unnamed Item'),
        formatRequisitionQty(item)
    ])

    doc.setFont("DejaVuSansCondensed", "bold")
    doc.setFontSize(9)
    doc.setTextColor(...RED_COLOR)
    doc.text("REQUISITION LINE ITEMS:", PAGE_MARGIN, currentY)
    currentY += 4

    autoTable(doc, {
        startY: currentY,
        head: [head],
        body: body,
        theme: 'grid',
        styles: {
            font: "DejaVuSansCondensed",
            fontSize: 8,
            cellPadding: CELL_PADDING,
            lineColor: [220, 220, 220],
            lineWidth: 0.1,
            textColor: [38, 38, 38]
        },
        headStyles: {
            fillColor: [245, 245, 245],
            textColor: [38, 38, 38],
            fontStyle: 'bold',
            halign: 'left'
        },
        columnStyles: {
            1: { halign: 'center', cellWidth: 40 }
        },
        margin: { left: PAGE_MARGIN, right: PAGE_MARGIN }
    })

    // @ts-ignore
    currentY = doc.lastAutoTable.finalY + 8

    // ── Signatories pinned to page footer ────────────────────────────────────
    const signatories = [
        'Technical Manager',
        'Accountant',
        'Manager',
        'IRD Custodian',
        'Security Guard',
    ]

    const usableWidth = pageWidth - PAGE_MARGIN * 2
    const boxW = (usableWidth - 8) / 3   // 3 per row, 4 pt gap each
    const boxH = 28
    const gap = 4
    const sigBlockHeight = 8 + 5 + boxH + gap + 4 + boxH // label + padding + row1 + gap + row2

    const pageHeight = doc.internal.pageSize.height
    // Anchor signatures to the bottom of the last page
    let sigY = pageHeight - PAGE_MARGIN - sigBlockHeight

    // If content has overrun the footer area, start a fresh page
    if (currentY > sigY - 6) {
        doc.addPage()
        sigY = pageHeight - PAGE_MARGIN - sigBlockHeight
    }

    // Thin divider line above signatures
    doc.setDrawColor(220, 220, 220)
    doc.setLineWidth(0.3)
    doc.line(PAGE_MARGIN, sigY, pageWidth - PAGE_MARGIN, sigY)
    sigY += 4

    doc.setFont('DejaVuSansCondensed', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(...RED_COLOR)
    doc.text('AUTHORISED SIGNATURES', PAGE_MARGIN, sigY)
    sigY += 5

    // Load manager signature image
    let managerSigImg: string | undefined
    const managerSigDataUrl = (companySettings as any)?.managerSignatureDataUrl
    const managerSigUrl = companySettings?.managerSignatureUrl
    if (managerSigDataUrl) {
        managerSigImg = managerSigDataUrl
    } else if (managerSigUrl) {
        try { managerSigImg = await removeWhiteBackground(managerSigUrl) } catch {}
    }

    const drawSignBox = (role: string, x: number, y: number, signatureImg?: string, stampImg?: string | null) => {
        doc.setDrawColor(180, 180, 180)
        doc.setLineWidth(0.3)
        doc.rect(x, y, boxW, boxH)
        doc.setFont('DejaVuSansCondensed', 'normal')
        doc.setFontSize(7)
        doc.setTextColor(120, 120, 120)
        doc.text('Name:', x + 3, y + 8)
        // Embed signature image above the sign line if provided
        if (signatureImg) {
            try { doc.addImage(signatureImg, 'PNG', x + 3, y + 9, boxW - 6, 10) } catch {}
        }
        doc.setDrawColor(...RED_COLOR)
        doc.setLineWidth(0.4)
        doc.line(x + 3, y + 20, x + boxW - 3, y + 20)
        // Seal stamp in bottom-right of box
        if (stampImg) {
            try { doc.addImage(stampImg, 'PNG', x + boxW - 14, y + 11, 12, 12) } catch {}
        }
        doc.setFont('DejaVuSansCondensed', 'bold')
        doc.setFontSize(7.5)
        doc.setTextColor(40, 40, 40)
        doc.text(role, x + boxW / 2, y + 25, { align: 'center' })
    }

    // Row 1 — 3 boxes (index 2 = Manager gets signature + seal)
    signatories.slice(0, 3).forEach((role, i) => {
        const sig = i === 2 ? managerSigImg : undefined
        const stamp = i === 2 ? (sealImg as any) : undefined
        drawSignBox(role, PAGE_MARGIN + i * (boxW + gap), sigY, sig, stamp)
    })

    sigY += boxH + gap + 4

    // Row 2 — remaining boxes centered
    const row2 = signatories.slice(3)
    const row2TotalW = row2.length * boxW + (row2.length - 1) * gap
    const row2StartX = PAGE_MARGIN + (usableWidth - row2TotalW) / 2
    row2.forEach((role, i) => {
        drawSignBox(role, row2StartX + i * (boxW + gap), sigY)
    })

    if (sealImg) drawWatermarkOnAllPages(doc, sealImg)

    doc.save(`Approved_Inventory_${jobRef}.pdf`)
}


export async function generateApprovedExpensesPdf(
    job: any,
    companySettings?: CompanySettingsLike,
    financeSettings?: FinanceSettingsLike,
    creatorName?: string,
    jobCategories: any[] = []
) {
    if (!job || !job.adHocExpenses) return

    const approvedExpenses = job.adHocExpenses.filter((e: any) => e.approvalStatus === 'APPROVED_MANAGER' && !e.isLockedAgainstPdf)
    if (approvedExpenses.length === 0) return

    const doc = new jsPDF()
    await setupFonts(doc)
    setupDoc(doc)

    const sealImg = await getSealImage(companySettings)

    // 1. Custom Centered Header
    const pageWidth = doc.internal.pageSize.width
    const PAGE_CENTER = pageWidth / 2
    let currentY = 15
    const headerStartY = currentY

    let logoHeight = 25;
    let logoWidth = 50;
    let logoImgElement: HTMLImageElement | null = null;

    const logoDataUrl = (companySettings as any)?.logoDataUrl;
    const logoUrl = companySettings?.logoUrl;

    if (logoDataUrl || logoUrl) {
        try {
            const transparentLogo = logoDataUrl ? logoDataUrl : await removeWhiteBackground(logoUrl as string)
            await new Promise<void>((resolve) => {
                const img = new Image()
                if (!logoDataUrl) img.crossOrigin = "anonymous"
                img.src = transparentLogo
                img.onload = () => {
                    logoImgElement = img;
                    const aspect = img.width / img.height;
                    logoHeight = logoWidth / aspect;
                    resolve()
                }
                img.onerror = () => resolve()
            })
        } catch (e) { console.warn("Logo load fail", e) }
    }

    if (logoImgElement) {
        try {
            doc.addImage(logoImgElement, "PNG", PAGE_CENTER - (logoWidth / 2), currentY, logoWidth, logoHeight)
            currentY += logoHeight + 7
        } catch (err) {
            console.error("jsPDF error adding logo:", err);
            currentY += 16;
        }
    } else {
        currentY += 16; // Spacer if no logo
    }

    const RED_COLOR: [number, number, number] = [220, 38, 38]

    // Title and Reference
    doc.setFont("DejaVuSansCondensed", "bold")
    doc.setFontSize(22)
    doc.setTextColor(...RED_COLOR)
    doc.text("APPROVED AD-HOC EXPENSE REQUISITION", PAGE_CENTER, currentY, { align: "center" })

    currentY += 8
    const jobRef = job?.generalInfo?.jobNumber ?? (job?.id ? String(job.id).substring(0, 8).toUpperCase() : "N/A")
    doc.setFontSize(12)
    doc.setTextColor(38, 38, 38)
    doc.text(`#${jobRef}`, PAGE_CENTER, currentY, { align: "center" })

    currentY += 6
    doc.setFontSize(10)
    doc.setFont("DejaVuSansCondensed", "normal")
    doc.text(`Date Issued: ${toFormattedDate(job?.generalInfo?.dateIssued || job?.createdAt || new Date())}`, PAGE_CENTER, currentY, { align: "center" })

    currentY += 8

    // Simple Line Divider
    doc.setDrawColor(...RED_COLOR)
    doc.setLineWidth(0.5)
    doc.line(PAGE_MARGIN, currentY, pageWidth - PAGE_MARGIN, currentY)

    currentY += 5

    // QR Code — top-right corner, aligned with logo top
    const qrDataUrl = await makeVerificationQr(jobRef)
    if (qrDataUrl) {
        const QR_SIZE = 20
        const qrX = pageWidth - PAGE_MARGIN - QR_SIZE
        doc.addImage(qrDataUrl, 'PNG', qrX, headerStartY, QR_SIZE, QR_SIZE)
        doc.setFont("DejaVuSansCondensed", "normal")
        doc.setFontSize(5.5)
        doc.setTextColor(100, 100, 100)
        doc.text("Scan to verify", qrX + QR_SIZE / 2, headerStartY + QR_SIZE + 2.5, { align: "center" })
    }

    const categoryName = jobCategories.find((c: any) => c.id === job.generalInfo?.jobCategoryId)?.name || "N/A"

    doc.setFont("DejaVuSansCondensed", "bold")
    doc.setFontSize(9)
    doc.setTextColor(0, 0, 0)
    doc.text("REQUISITION METADATA:", PAGE_MARGIN, currentY)

    currentY += 4

    autoTable(doc, {
        startY: currentY,
        body: [
            ['Job Card Reference', `#${jobRef}`],
            ['Category', categoryName],
            ['Start Date', job.generalInfo?.startDate || "N/A"],
            ['Project Location', job.generalInfo?.projectLocation || "N/A"],
            ['Recipient Name', job.generalInfo?.recipientName || "N/A"],
            ['Recipient Address', job.generalInfo?.recipientAddress || "N/A"]
        ],
        theme: 'grid',
        styles: {
            font: "DejaVuSansCondensed",
            fontSize: 8,
            cellPadding: CELL_PADDING,
            lineColor: [240, 240, 240],
            lineWidth: 0.1,
        },
        columnStyles: {
            0: { cellWidth: 45, fontStyle: 'bold', fillColor: [250, 250, 250] },
            1: { cellWidth: 'auto' }
        },
        margin: { left: PAGE_MARGIN, right: PAGE_MARGIN }
    })

    // @ts-ignore
    currentY = doc.lastAutoTable.finalY + 8

    const head = ['Qty', 'Description', 'Recipient Name', 'Phone', 'Unit Price', 'Method', 'Total']
    const body = approvedExpenses.map((exp: any) => [
        String(exp.quantity || 1),
        exp.isAdjustment 
            ? `${exp.description || 'N/A'}\n(Adj: ${formatDate(exp.adjustmentDate || job.updatedAt)})`
            : (exp.description || 'N/A'),
        exp.recipientName || '-',
        exp.recipientPhone || '-',
        Number(exp.unitPrice || 0).toFixed(2),
        String(exp.paymentMethod || 'CASH').toUpperCase(),
        Number(exp.totalAmount || 0).toFixed(2)
    ])

    doc.setFont("DejaVuSansCondensed", "bold")
    doc.setFontSize(9)
    doc.setTextColor(...RED_COLOR)
    doc.text("REQUISITION LINE ITEMS:", PAGE_MARGIN, currentY)
    currentY += 4

    autoTable(doc, {
        startY: currentY,
        head: [head],
        body: body,
        theme: 'grid',
        styles: {
            font: "DejaVuSansCondensed",
            fontSize: 8,
            cellPadding: CELL_PADDING,
            lineColor: [220, 220, 220],
            lineWidth: 0.1,
            textColor: [38, 38, 38]
        },
        headStyles: {
            fillColor: [245, 245, 245],
            textColor: [38, 38, 38],
            fontStyle: 'bold',
            halign: 'left'
        },
        columnStyles: {
            0: { halign: 'center', cellWidth: 15 },
            4: { halign: 'right' },
            6: { halign: 'right', fontStyle: 'bold' }
        },
        margin: { left: PAGE_MARGIN, right: PAGE_MARGIN }
    })

    // @ts-ignore
    currentY = doc.lastAutoTable.finalY + 6

    const subtotal = approvedExpenses.reduce((sum: number, e: any) => sum + (e.totalAmount || 0), 0)

    const valueX = pageWidth - PAGE_MARGIN;
    const labelRightAnchor = pageWidth - 45;

    doc.setFont("DejaVuSansCondensed", "bold");
    doc.setFontSize(9);
    doc.setTextColor(0, 0, 0);
    doc.text("GRAND TOTAL", labelRightAnchor, currentY, { align: "right" });
    doc.text(subtotal.toFixed(2), valueX, currentY, { align: "right" });

    currentY += 12;

    // ── Signatories block ─────────────────────────────────────────────────────
    const expSignatories = ['Accountant', 'Manager', 'Authorised By']
    const expUsableWidth = pageWidth - PAGE_MARGIN * 2
    const eBoxW = (expUsableWidth - 8) / 3
    const eBoxH = 28
    const eGap = 4
    const eSigBlockH = 8 + 5 + eBoxH
    const ePageHeight = doc.internal.pageSize.height
    let eSigY = ePageHeight - PAGE_MARGIN - eSigBlockH

    if (currentY > eSigY - 6) {
        doc.addPage()
        eSigY = ePageHeight - PAGE_MARGIN - eSigBlockH
    }

    doc.setDrawColor(220, 220, 220)
    doc.setLineWidth(0.3)
    doc.line(PAGE_MARGIN, eSigY, pageWidth - PAGE_MARGIN, eSigY)
    eSigY += 4

    doc.setFont('DejaVuSansCondensed', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(...RED_COLOR)
    doc.text('AUTHORISED SIGNATURES', PAGE_MARGIN, eSigY)
    eSigY += 5

    // Load manager signature image
    let expManagerSigImg: string | undefined
    const expMgrSigDataUrl = (companySettings as any)?.managerSignatureDataUrl
    const expMgrSigUrl = companySettings?.managerSignatureUrl
    if (expMgrSigDataUrl) {
        expManagerSigImg = expMgrSigDataUrl
    } else if (expMgrSigUrl) {
        try { expManagerSigImg = await removeWhiteBackground(expMgrSigUrl) } catch {}
    }

    const drawExpSignBox = (role: string, x: number, y: number, signatureImg?: string, stampImg?: string | null) => {
        doc.setDrawColor(180, 180, 180)
        doc.setLineWidth(0.3)
        doc.rect(x, y, eBoxW, eBoxH)
        doc.setFont('DejaVuSansCondensed', 'normal')
        doc.setFontSize(7)
        doc.setTextColor(120, 120, 120)
        doc.text('Name:', x + 3, y + 8)
        if (signatureImg) {
            try { doc.addImage(signatureImg, 'PNG', x + 3, y + 9, eBoxW - 6, 10) } catch {}
        }
        doc.setDrawColor(...RED_COLOR)
        doc.setLineWidth(0.4)
        doc.line(x + 3, y + 20, x + eBoxW - 3, y + 20)
        if (stampImg) {
            try { doc.addImage(stampImg, 'PNG', x + eBoxW - 14, y + 11, 12, 12) } catch {}
        }
        doc.setFont('DejaVuSansCondensed', 'bold')
        doc.setFontSize(7.5)
        doc.setTextColor(40, 40, 40)
        doc.text(role, x + eBoxW / 2, y + 25, { align: 'center' })
    }

    expSignatories.forEach((role, i) => {
        const sig = i === 1 ? expManagerSigImg : undefined   // index 1 = Manager
        const stamp = i === 1 ? (sealImg as any) : undefined
        drawExpSignBox(role, PAGE_MARGIN + i * (eBoxW + eGap), eSigY, sig, stamp)
    })

    if (sealImg) drawWatermarkOnAllPages(doc, sealImg)

    doc.save(`Approved_Expenses_${jobRef}.pdf`)
}


export async function generateFullJobCardPdf(
    job: any,
    requisitionItems: any[],
    adHocExpenses: any[],
    inventoryReturns: any[],
    recordedPayments: any[],
    financialSummary: any,
    companySettings?: CompanySettingsLike,
    financeSettings?: FinanceSettingsLike,
    creatorName?: string,
    jobCategories: any[] = [],
    signer?: PdfSignerOptions
) {
    const doc = new jsPDF()
    await setupFonts(doc)
    setupDoc(doc)

    const sealImg = await getSealImage(companySettings)
    const headerBottomY = await drawHeader(doc, companySettings)
    const greenBarY = headerBottomY + 4
    drawGreenBar(doc, greenBarY)

    const jobRef = job?.generalInfo?.jobNumber ?? (job?.id ? String(job.id).substring(0, 8) : 'N/A')
    const pageWidth = doc.internal.pageSize.width
    const W = pageWidth - PAGE_MARGIN * 2
    const GREEN = PRIMARY_COLOR
    const DARK: [number, number, number] = [30, 30, 30]
    const MUTED: [number, number, number] = [100, 100, 100]

    const recipientDetails = [
        job?.generalInfo?.recipientName || job?.clientName || 'N/A',
        job?.generalInfo?.recipientAddress || '',
        job?.generalInfo?.recipientPhone || ''
    ].filter(Boolean)

    let y = drawJobCardInfoRow(doc, {
        leftTitle: 'BILL ADDRESSED TO',
        leftLine1: recipientDetails[0],
        leftLine2: recipientDetails.slice(1).join('\n'),
        docTitle: 'JOB CARD FULL REPORT',
        docNumber: `#${jobRef}`,
        dateIssued: toFormattedDate(job?.generalInfo?.dateIssued || job?.createdAt || new Date()),
        adviceText: '',
    }, greenBarY + 14)

    y += 4

    // ── Helper: section heading ───────────────────────────────────────────────
    function sectionHeading(label: string) {
        if (y > 265) { doc.addPage(); y = 18 }
        doc.setFillColor(...GREEN)
        doc.rect(PAGE_MARGIN, y, W, 6, 'F')
        doc.setFont('DejaVuSansCondensed', 'bold')
        doc.setFontSize(8)
        doc.setTextColor(255, 255, 255)
        doc.text(label.toUpperCase(), PAGE_MARGIN + 3, y + 4.2)
        y += 9
    }

    function fmt(n: number) {
        return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n || 0)
    }

    // ── 1. Job Information ────────────────────────────────────────────────────
    sectionHeading('1. Job Information')
    const categoryName = jobCategories.find((c: any) => c.id === job?.generalInfo?.jobCategoryId)?.name || 'N/A'
    const statusLabel: Record<string, string> = {
        PENDING: 'Pending', APPROVED_MANAGER: 'Approved', COMPLETED: 'Completed', REJECTED: 'Rejected'
    }
    autoTable(doc, {
        startY: y,
        body: [
            ['Job Reference', `#${jobRef}`,         'Status',   statusLabel[job?.status] || job?.status || 'N/A'],
            ['Client',        recipientDetails[0],   'Category', categoryName],
            ['Start Date',    job?.generalInfo?.startDate || 'N/A', 'End Date', job?.generalInfo?.endDate || 'N/A'],
            ['Location',      job?.generalInfo?.projectLocation || 'N/A', 'Created By', creatorName || 'N/A'],
            ['Phone',         job?.generalInfo?.recipientPhone || 'N/A', 'Address', job?.generalInfo?.recipientAddress || 'N/A'],
        ],
        theme: 'grid',
        styles: { font: 'DejaVuSansCondensed', fontSize: 8, cellPadding: 2.5, lineColor: [220, 220, 220], lineWidth: 0.1 },
        columnStyles: {
            0: { cellWidth: 30, fontStyle: 'bold', fillColor: [248, 248, 248], textColor: MUTED },
            1: { cellWidth: W / 2 - 30 },
            2: { cellWidth: 30, fontStyle: 'bold', fillColor: [248, 248, 248], textColor: MUTED },
            3: { cellWidth: W / 2 - 30 },
        },
        margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
    })
    // @ts-ignore
    y = doc.lastAutoTable.finalY + 8

    // ── 2. Inventory Requisition ──────────────────────────────────────────────
    sectionHeading('2. Inventory Requisition')
    if (requisitionItems.length === 0) {
        doc.setFont('DejaVuSansCondensed', 'normal'); doc.setFontSize(8); doc.setTextColor(...MUTED)
        doc.text('No requisition items.', PAGE_MARGIN, y); y += 6
    } else {
        // Group by section
        const sectionMap: Map<string, any[]> = new Map()
        for (const item of requisitionItems) {
            const key = (item.sectionName || item.category || 'General').toUpperCase()
            if (!sectionMap.has(key)) sectionMap.set(key, [])
            sectionMap.get(key)!.push(item)
        }
        const head = [['Section', 'Item', 'Qty', 'IRD Price', 'TWID %', 'Row Total', 'Adj?']]
        const body: any[][] = []
        for (const [secName, items] of sectionMap) {
            for (const item of items) {
                const qty = requisitionLineQty(item)
                const amounts = lineExtendedAmounts(item)
                const ird = amounts.price
                const twid = amounts.markup
                const rowTotal = amounts.totalPrice
                body.push([
                    secName,
                    item.isAdjustment 
                        ? `${item.itemName || 'N/A'}\n(Adj: ${formatDate(item.adjustmentDate || job.updatedAt)})` 
                        : (item.itemName || 'N/A'),
                    String(qty),
                    fmt(ird),
                    `${twid}%`,
                    fmt(rowTotal),
                    item.isAdjustment ? 'Yes' : 'No',
                ])
            }
        }
        autoTable(doc, {
            startY: y, head, body,
            theme: 'grid',
            styles: { font: 'DejaVuSansCondensed', fontSize: 7.5, cellPadding: 2, lineColor: [220, 220, 220], lineWidth: 0.1 },
            headStyles: { fillColor: [240, 240, 240], textColor: DARK, fontStyle: 'bold' },
            columnStyles: {
                0: { cellWidth: 30 }, 2: { halign: 'center', cellWidth: 12 },
                3: { halign: 'right', cellWidth: 22 }, 4: { halign: 'center', cellWidth: 16 },
                5: { halign: 'right', cellWidth: 22, fontStyle: 'bold' }, 6: { halign: 'center', cellWidth: 14 },
            },
            margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
        })
        // @ts-ignore
        y = doc.lastAutoTable.finalY + 8
    }

    // ── 3. Ad-Hoc Expenses ────────────────────────────────────────────────────
    sectionHeading('3. Ad-Hoc Expenses')
    if (adHocExpenses.length === 0) {
        doc.setFont('DejaVuSansCondensed', 'normal'); doc.setFontSize(8); doc.setTextColor(...MUTED)
        doc.text('No ad-hoc expenses.', PAGE_MARGIN, y); y += 6
    } else {
        const head = [['Description', 'Qty', 'Unit Price', 'Total', 'Payment', 'Adj?', 'Status']]
        const body = adHocExpenses.map((e: any) => [
            e.isAdjustment 
                ? `${e.description || 'N/A'}\n(Adj: ${formatDate(e.adjustmentDate || job.updatedAt)})` 
                : (e.description || 'N/A'),
            String(e.quantity || 1),
            fmt(Number(e.unitPrice) || 0),
            fmt(Number(e.totalAmount) || 0),
            (e.paymentMethod || 'CASH').toUpperCase(),
            e.isAdjustment ? 'Yes' : 'No',
            e.approvalStatus?.replace('_', ' ') || 'Pending',
        ])
        const expTotal = adHocExpenses.reduce((s: number, e: any) => s + (Number(e.totalAmount) || 0), 0)
        autoTable(doc, {
            startY: y, head, body,
            theme: 'grid',
            styles: { font: 'DejaVuSansCondensed', fontSize: 7.5, cellPadding: 2, lineColor: [220, 220, 220], lineWidth: 0.1 },
            headStyles: { fillColor: [240, 240, 240], textColor: DARK, fontStyle: 'bold' },
            columnStyles: {
                1: { halign: 'center', cellWidth: 12 }, 2: { halign: 'right', cellWidth: 24 },
                3: { halign: 'right', cellWidth: 24, fontStyle: 'bold' }, 4: { halign: 'center', cellWidth: 22 },
                5: { halign: 'center', cellWidth: 14 }, 6: { halign: 'center', cellWidth: 24 },
            },
            margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
            foot: [['', '', 'TOTAL', fmt(expTotal), '', '', '']],
            footStyles: { fillColor: [245, 245, 245], fontStyle: 'bold', textColor: DARK },
        })
        // @ts-ignore
        y = doc.lastAutoTable.finalY + 8
    }

    // ── 4. Inventory Returns ──────────────────────────────────────────────────
    if (inventoryReturns.length > 0) {
        sectionHeading('4. Inventory Returns')
        const head = [['Item', 'Qty Returned', 'Cost / Unit', 'Credit Value', 'Reason', 'Date']]
        const body = inventoryReturns.map((r: any) => [
            r.isAdjustment 
                ? `${r.itemName || 'N/A'}\n(Adj: ${formatDate(r.adjustmentDate || job.updatedAt)})` 
                : (r.itemName || 'N/A'),
            String(r.qtyReturned || 0),
            fmt(Number(r.costSnapshot) || 0),
            fmt((Number(r.qtyReturned) || 0) * (Number(r.costSnapshot) || 0)),
            r.reason || 'N/A',
            r.returnedAt ? toFormattedDate(r.returnedAt) : 'N/A',
        ])
        autoTable(doc, {
            startY: y, head, body,
            theme: 'grid',
            styles: { font: 'DejaVuSansCondensed', fontSize: 7.5, cellPadding: 2, lineColor: [220, 220, 220], lineWidth: 0.1 },
            headStyles: { fillColor: [240, 240, 240], textColor: DARK, fontStyle: 'bold' },
            columnStyles: {
                1: { halign: 'center', cellWidth: 22 }, 2: { halign: 'right', cellWidth: 24 },
                3: { halign: 'right', cellWidth: 24, fontStyle: 'bold' },
            },
            margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
        })
        // @ts-ignore
        y = doc.lastAutoTable.finalY + 8
    }

    // ── 4b. Staff Rates ──────────────────────────────────────────────────────
    if (job.staffRates && job.staffRates.length > 0) {
        sectionHeading('4b. Staff Rates')
        const head = [['Staff Member', 'Rate Amount', 'Adj?', 'Status']]
        const body = job.staffRates.map((r: any) => {
            const staffLabel = r.employeeName && r.employeeName !== r.employeeId
              ? r.employeeName
              : (r.employeeName || r.employeeId || 'Unknown Staff')
            return [
              r.isAdjustment
                ? `${staffLabel}\n(Adj: ${formatDate(r.adjustmentDate || job.updatedAt)})`
                : staffLabel,
              fmt(Number(r.jobRateAmount) || 0),
              r.isAdjustment ? 'Yes' : 'No',
              r.approvalStatus?.replace('_', ' ') || 'Pending'
            ]
        })
        autoTable(doc, {
            startY: y, head, body,
            theme: 'grid',
            styles: { font: 'DejaVuSansCondensed', fontSize: 7.5, cellPadding: 2, lineColor: [220, 220, 220], lineWidth: 0.1 },
            headStyles: { fillColor: [240, 240, 240], textColor: DARK, fontStyle: 'bold' },
            columnStyles: {
                0: { cellWidth: 'auto' },
                1: { halign: 'right', cellWidth: 30, fontStyle: 'bold' },
                2: { halign: 'center', cellWidth: 14 },
                3: { halign: 'center', cellWidth: 30 }
            },
            margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
        })
        // @ts-ignore
        y = doc.lastAutoTable.finalY + 8
    }

    // ── 5. Financial Performance ──────────────────────────────────────────────
    if (financialSummary) {
        sectionHeading('5. Financial Performance')
        const fs = financialSummary
        autoTable(doc, {
            startY: y,
            head: [['P&L Component', 'Calculation / Formula', 'Amount']],
            body: [
                ['Initial Invoice Value', 'Base Job Value (Locked)', fmt(fs.initialInvoiceValue)],
                ['Operational Costs', 'IRD Gross + Staff + Adhoc + Commission', fmt(fs.totalOperationalGross)],
                ['T.W.I.D CUMULATIVE NET', 'Initial Value - Operational Costs', fmt(fs.twidNetAfterAdjustments)],
                ['TWID REVENUE %', '(TWID Net / Initial Value) × 100', `${fs.twidRevenuePercentage?.toFixed(2) ?? '0.00'}%`],
                ['', '', ''],
                ['Inventory Gross Value', 'Purchasing Price + IRD Markup', fmt(fs.irdGrossRevenue)],
                ['IRD Inventory Purchasing Price', 'Cumulative Base Cost (Freight + Duty)', fmt(fs.irdBaseCost)],
                ['I.R.D REMITTANCE', 'Gross Inventory Sales (To Account)', fmt(fs.irdNetRevenue)],
                ['I.R.D MARGIN', 'Gross Value - Purchasing Price', fmt(fs.irdCumulativeNetRevenue)],
                ['I.R.D REVENUE %', '(Margin / Gross Value) × 100', `${fs.irdRevenuePercentage?.toFixed(2) ?? '0.00'}%`],
                ['', '', ''],
                ['Total Project Revenue', 'Invoice Value - Adjustments', fmt(fs.totalRevenue)],
                ['Referral Commission', (fs.referrers && fs.referrers.length > 0)
                    ? fs.referrers.map((r: any) => `${r.name || 'Anonymous'}: ${fmt(r.amount)}`).join('\n')
                    : `Awarded to ${job.generalInfo?.referrerName || 'N/A'} (${(fs.commissionPercentage || 0).toFixed(1)}%)`,
                    `(${fmt(fs.referrerCommission)})`],
                ['Final Net Profit', 'The Bottom Line Profit', fmt(fs.netProfit)],
                ['Net Profit Margin', '(Net Profit / Revenue) × 100', `${fs.profitMargin?.toFixed(2) ?? '0.00'}%`],
            ],
            theme: 'grid',
            styles: { font: 'DejaVuSansCondensed', fontSize: 8, cellPadding: 2.5, lineColor: [220, 220, 220], lineWidth: 0.1 },
            headStyles: { fillColor: [240, 240, 240], textColor: DARK, fontStyle: 'bold', halign: 'left' },
            columnStyles: {
                0: { cellWidth: 55, fontStyle: 'bold' },
                1: { cellWidth: 85, textColor: MUTED },
                2: { cellWidth: 'auto', halign: 'right', fontStyle: 'bold' },
            },
            didParseCell: (data: any) => {
                const highlightRows = [2, 8, 14] // TWID NET, IRD REMITTANCE, FINAL NET
                if (highlightRows.includes(data.row.index)) {
                    data.cell.styles.fillColor = [235, 245, 220]
                    data.cell.styles.textColor = [40, 100, 0]
                    data.cell.styles.fontStyle = 'bold'
                }
                if (data.row.raw[0] === '') {
                    data.cell.styles.fillColor = [255, 255, 255]
                    data.cell.styles.lineColor = [255, 255, 255]
                }
            },
            margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
        })
        // @ts-ignore
        y = doc.lastAutoTable.finalY + 8
    }

    // ── 6. Payment History ────────────────────────────────────────────────────
    sectionHeading('6. Payment History')
    const totalPaid = recordedPayments.reduce((s: number, p: any) => s + (Number(p.amount) || 0), 0)
    if (recordedPayments.length === 0) {
        doc.setFont('DejaVuSansCondensed', 'normal'); doc.setFontSize(8); doc.setTextColor(...MUTED)
        doc.text('No payments recorded.', PAGE_MARGIN, y); y += 6
    } else {
        const head = [['Date', 'Description', 'Method', 'Amount']]
        const body = recordedPayments.map((p: any) => [
            p.createdAt ? toFormattedDate(p.createdAt) : 'N/A',
            p.description || 'Payment',
            (p.paymentMethod || 'N/A').toUpperCase(),
            fmt(Number(p.amount) || 0),
        ])
        autoTable(doc, {
            startY: y, head, body,
            theme: 'grid',
            styles: { font: 'DejaVuSansCondensed', fontSize: 7.5, cellPadding: 2, lineColor: [220, 220, 220], lineWidth: 0.1 },
            headStyles: { fillColor: [240, 240, 240], textColor: DARK, fontStyle: 'bold' },
            columnStyles: {
                0: { cellWidth: 28 }, 2: { halign: 'center', cellWidth: 28 },
                3: { halign: 'right', cellWidth: 28, fontStyle: 'bold' },
            },
            foot: [['', '', 'TOTAL PAID', fmt(totalPaid)]],
            footStyles: { fillColor: [235, 245, 220], fontStyle: 'bold', textColor: [40, 100, 0] },
            margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
        })
        // @ts-ignore
        y = doc.lastAutoTable.finalY + 8
    }

    await drawFooter(doc, y, companySettings, financeSettings, creatorName, {
        signatureUrl: signer?.signatureUrl || companySettings?.managerSignatureUrl,
        position:
            signer?.position ||
            job?.managerPosition ||
            companySettings?.managerPosition ||
            'TECHNICAL MANAGER',
    })

    if (sealImg) drawWatermarkOnAllPages(doc, sealImg)

    doc.save(`JobCard_FullReport_${jobRef}.pdf`)
}


export async function generatePaymentReceiptPdf(
    job: any,
    payment: any,
    companySettings?: CompanySettingsLike,
    financeSettings?: FinanceSettingsLike,
    creatorName?: string,
    signer?: PdfSignerOptions
) {
    if (!job || !payment) return

    const doc = new jsPDF()
    await setupFonts(doc)
    setupDoc(doc)

    const sealImg = await getSealImage(companySettings)
    const headerBottomY = await drawHeader(doc, companySettings)

    const greenBarY = headerBottomY + 4
    drawGreenBar(doc, greenBarY)

    const jobRef = job?.generalInfo?.jobNumber ?? (job?.id ? String(job.id).substring(0, 8) : "N/A")
    const receiptNo = payment.id ? `REC-${payment.id.substring(0, 6).toUpperCase()}` : `REC-${Date.now().toString().substring(7)}`

    let y = greenBarY + 18
    doc.setFont("DejaVuSansCondensed", "bold")
    doc.setFontSize(16)
    doc.setTextColor(...PRIMARY_COLOR)
    doc.text("PAYMENT RECEIPT", doc.internal.pageSize.width / 2, y, { align: 'center' })
    y += 10

    // Receipt details in a smaller info row style or custom
    doc.setFontSize(9)
    doc.setTextColor(0, 0, 0)
    doc.text(`Receipt No: ${receiptNo}`, PAGE_MARGIN, y)
    doc.text(`Job Ref: ${jobRef}`, doc.internal.pageSize.width - PAGE_MARGIN, y, { align: 'right' })
    y += 6

    const payerName = job?.clientName || job?.generalInfo?.recipientName || 'Not Specified'
    doc.text(`Received From: ${payerName}`, PAGE_MARGIN, y)
    y += 10

    const head = ['Description', 'Payment Method', 'Amount']
    const body = [
        [
            payment.description || `Payment for Job ${jobRef}`,
            (payment.paymentMethod || 'UNKNOWN').toUpperCase(),
            Number(payment.amount || 0).toFixed(2)
        ]
    ]

    y = renderBrandedItemsTable(doc, y, head, body)

    const subtotal = Number(payment.amount || 0)
    y = drawTotalsRight(doc, y, { subtotal, total: subtotal })

    await drawFooter(doc, y, companySettings, financeSettings, creatorName, {
        signatureUrl: signer?.signatureUrl || companySettings?.managerSignatureUrl,
        position:
            signer?.position ||
            companySettings?.managerPosition ||
            "MANAGER / AUTHORIZED SIGNATORY",
    })

    if (sealImg) drawWatermarkOnAllPages(doc, sealImg)

    doc.save(`Receipt_${receiptNo}_Job_${jobRef}.pdf`)
}
