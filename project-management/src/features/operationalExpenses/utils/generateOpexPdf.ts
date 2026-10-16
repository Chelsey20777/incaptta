import jsPDF from 'jspdf'
import {
    setupFonts,
    setupDoc,
    drawFooter,
    getSealImage,
    drawWatermarkOnAllPages,
    removeWhiteBackground,
    toFormattedDate,
    PAGE_MARGIN,
    type CompanySettingsLike,
    type FinanceSettingsLike
} from '@/features/jobCards/utils/pdfBranding'
import autoTable from 'jspdf-autotable'
import QRCode from 'qrcode'

const ORANGE_COLOR: [number, number, number] = [249, 115, 22]
const SECONDARY_TEXT_COLOR: [number, number, number] = [38, 38, 38]

const APPROVED_STATUSES = ['APPROVED', 'APPROVED_FOR_PAYMENT', 'PAYMENT_PROCESSED']
const CELL_PADDING = { top: 1.5, right: 2, bottom: 1.5, left: 2 }

export const generateOpexPdf = async (
    expense: any,
    companySettings?: CompanySettingsLike,
    financeSettings?: FinanceSettingsLike,
    creatorName?: string,
    verificationToken?: string
) => {
    const isApproved = APPROVED_STATUSES.includes(expense?.status)

    const doc = new jsPDF()
    await setupFonts(doc)
    setupDoc(doc)

    const sealImg = isApproved ? await getSealImage(companySettings) : null

    // 1. Custom Centered Header
    const pageWidth = doc.internal.pageSize.width
    const PAGE_CENTER = pageWidth / 2
    let currentY = 12

    // ── QR Code (top-left, generated early so it sits in the header) ─────────
    let qrDataUrl: string | null = null
    if (verificationToken) {
        try {
            const origin = window.location.origin.replace(/\.+$/, '')
            qrDataUrl = await QRCode.toDataURL(`${origin}/verify/${verificationToken}`, {
                width: 256, margin: 1, color: { dark: '#1a1a1a', light: '#ffffff' }
            })
        } catch { /* non-critical */ }
    }

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
            currentY += logoHeight + 5
        } catch (err) {
            console.error("jsPDF error adding OPEX logo:", err);
            currentY += 20;
        }
    } else {
        currentY += 20; // Spacer if no logo
    }

    // Title and Reference
    doc.setFont("DejaVuSansCondensed", "bold")
    doc.setFontSize(22)
    doc.setTextColor(...ORANGE_COLOR)
    doc.text("INTERNAL REQUISITION", PAGE_CENTER, currentY, { align: "center" })

    currentY += 8
    const titleRef = expense.id ? String(expense.id).substring(0, 8).toUpperCase() : "N/A"
    doc.setFontSize(12)
    doc.setTextColor(...SECONDARY_TEXT_COLOR)
    doc.text(`#OPEX-${titleRef}`, PAGE_CENTER, currentY, { align: "center" })

    currentY += 6
    doc.setFontSize(10)
    doc.setFont("DejaVuSansCondensed", "normal")
    doc.text(`Date Issued: ${toFormattedDate(expense.createdAt || new Date())}`, PAGE_CENTER, currentY, { align: "center" })

    currentY += 8

    // Simple Line Divider
    doc.setDrawColor(...ORANGE_COLOR)
    doc.setLineWidth(0.5)
    doc.line(PAGE_MARGIN, currentY, pageWidth - PAGE_MARGIN, currentY)

    currentY += 5

    // Payee & General Info
    doc.setFont("DejaVuSansCondensed", "bold")
    doc.setFontSize(9)
    doc.setTextColor(0, 0, 0)
    doc.text("REQUISITION METADATA:", PAGE_MARGIN, currentY)

    currentY += 4

    // 4-column layout: [Label] [Value] [Label] [Value]
    autoTable(doc, {
        startY: currentY,
        body: [
            ['Requisition Title', expense.title || expense.description || 'N/A', 'Department', expense.department || 'N/A'],
            ['Request Type', String(expense.requestType || 'N/A').toUpperCase(), 'Category', expense.category || 'N/A'],
            ['Beneficiary', expense.beneficiary || expense.recipientName || 'N/A', 'Account/Ecocash', expense.accountNo || 'N/A'],
            ['Due Date', expense.dueDate || 'N/A', 'Payment Method', String(expense.paymentMethod || 'N/A').toUpperCase()],
            ['Status', String(expense.status || 'PENDING').toUpperCase(), 'Source Account', String(expense.pettyCashAccount || 'N/A').toUpperCase()],
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
            0: { cellWidth: 33, fontStyle: 'bold', fillColor: [240, 237, 232] },
            1: { cellWidth: 58 },
            2: { cellWidth: 33, fontStyle: 'bold', fillColor: [240, 237, 232] },
            3: { cellWidth: 'auto' }
        },
        margin: { left: PAGE_MARGIN, right: PAGE_MARGIN }
    })

    // @ts-ignore
    currentY = doc.lastAutoTable.finalY + 5

    // 2. Tabular Expense Items
    if (expense.items && expense.items.length > 0) {
        doc.setFont("DejaVuSansCondensed", "bold")
        doc.setFontSize(9)
        doc.setTextColor(...ORANGE_COLOR)
        doc.text("REQUISITION LINE ITEMS:", PAGE_MARGIN, currentY)
        currentY += 3

        autoTable(doc, {
            startY: currentY,
            head: [['Description', 'Qty', 'Unit Cost', 'Total']],
            body: expense.items.map((item: any) => [
                item.description,
                item.quantity,
                `$${Number(item.estCost || item.cost || 0).toFixed(2)}`,
                `$${(Number(item.quantity || 1) * Number(item.estCost || item.cost || 0)).toFixed(2)}`
            ]),
            theme: 'grid',
            styles: {
                font: "DejaVuSansCondensed",
                fontSize: 8,
                cellPadding: CELL_PADDING,
                lineColor: ORANGE_COLOR,
                lineWidth: 0.1,
            },
            headStyles: {
                fillColor: ORANGE_COLOR,
                textColor: [255, 255, 255],
                fontStyle: 'bold'
            },
            columnStyles: {
                0: { cellWidth: 'auto' },
                1: { cellWidth: 12, halign: 'center' },
                2: { cellWidth: 27, halign: 'right' },
                3: { cellWidth: 27, halign: 'right', fontStyle: 'bold' }
            },
            margin: { left: PAGE_MARGIN, right: PAGE_MARGIN }
        })

        // @ts-ignore
        currentY = doc.lastAutoTable.finalY + 5
    }

    // Total Amount Box
    const formattedAmount = `$${Number(expense.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    doc.setFillColor(...ORANGE_COLOR)
    doc.rect(pageWidth - PAGE_MARGIN - 80, currentY, 80, 10, "F")

    doc.setFontSize(9)
    doc.setFont("DejaVuSansCondensed", "bold")
    doc.setTextColor(255, 255, 255)
    doc.text("TOTAL REQUISITION", pageWidth - PAGE_MARGIN - 75, currentY + 6.5)
    doc.text(formattedAmount, pageWidth - PAGE_MARGIN - 5, currentY + 6.5, { align: "right" })

    currentY += 10

    // 3. Approval Chain Section
    doc.setFont("DejaVuSansCondensed", "bold")
    doc.setFontSize(9)
    doc.setTextColor(...ORANGE_COLOR)
    doc.text("AUTHORIZATION TRAIL:", PAGE_MARGIN, currentY)
    currentY += 4

    const approvalRows: string[][] = [
        ['Requested By', expense.createdByName || expense.createdByEmail || 'Unknown',
         'Date Submitted', toFormattedDate(expense.createdAt || new Date())]
    ]

    if (expense.accountantApprovedBy) {
        approvalRows.push([
            'Accountant Approved By', expense.accountantApprovedBy,
            'Accountant Approval Date', toFormattedDate(expense.accountantApprovedAt || '')
        ])
    }
    if (expense.accountantComment) {
        approvalRows.push(['Accountant Comments', expense.accountantComment, '', ''])
    }

    if (expense.managerApprovedBy) {
        approvalRows.push([
            'Manager Approved By', expense.managerApprovedBy,
            'Manager Approval Date', toFormattedDate(expense.managerApprovedAt || expense.approvedAt || '')
        ])
    }
    if (expense.managerComment) {
        approvalRows.push(['Manager Comments', expense.managerComment, '', ''])
    }

    if (expense.paymentDetails) {
        approvalRows.push(['---', '---', '---', '---'])
        approvalRows.push([
            'Payment Method', String(expense.paymentDetails.paymentMethod || 'N/A').toUpperCase(),
            'Transaction Date', expense.paymentDetails.transactionDate || 'N/A'
        ])
        approvalRows.push([
            'Ledger Account', expense.paymentDetails.ledgerAccount || 'N/A',
            'Reference Number', expense.paymentDetails.referenceNumber || 'N/A'
        ])
        approvalRows.push([
            'Processed By', expense.paymentProcessedBy || 'Finance',
            'Expense Request ID', expense.id || 'N/A'
        ])
    }

    autoTable(doc, {
        startY: currentY,
        body: approvalRows,
        theme: 'grid',
        styles: {
            font: "DejaVuSansCondensed",
            fontSize: 8,
            cellPadding: CELL_PADDING,
            lineColor: [230, 230, 230],
            lineWidth: 0.1,
        },
        columnStyles: {
            0: { cellWidth: 42, fontStyle: 'bold', fillColor: [250, 250, 250], textColor: [100, 100, 100] },
            1: { cellWidth: 55 },
            2: { cellWidth: 42, fontStyle: 'bold', fillColor: [250, 250, 250], textColor: [100, 100, 100] },
            3: { cellWidth: 55 }
        },
        margin: { left: PAGE_MARGIN, right: PAGE_MARGIN }
    })

    // @ts-ignore
    currentY = doc.lastAutoTable.finalY + 6

    await drawFooter(doc, currentY + 6, companySettings, financeSettings,
        isApproved
            ? (companySettings as any)?.managerName || creatorName
            : 'Pending Authorization',
        {
            position: isApproved
                ? (companySettings as any)?.managerPosition || 'FINANCE DEPARTMENT'
                : 'AWAITING MANAGER APPROVAL',
            skipPaymentBox: true,
            skipTerms: true,
            skipSeal: !isApproved,
            signatureUrl: isApproved
                ? ((companySettings as any)?.managerSignatureDataUrl || (companySettings as any)?.managerSignatureUrl)
                : undefined,
            qrDataUrl: qrDataUrl ?? undefined,
            qrSize: 29,
            qrLabel: 'Scan to verify'
        }
    )

    if (sealImg) drawWatermarkOnAllPages(doc, sealImg)

    if (!isApproved) {
        const pageCount = doc.getNumberOfPages()
        const docAny = doc as any
        const supportsOpacity = !!docAny.GState && (() => {
            try { docAny.saveGraphicsState(); docAny.restoreGraphicsState(); return true } catch { return false }
        })()
        for (let i = 1; i <= pageCount; i++) {
            doc.setPage(i)
            if (supportsOpacity) {
                docAny.saveGraphicsState()
                docAny.setGState(new docAny.GState({ opacity: 0.12 }))
            }
            doc.setFontSize(80)
            doc.setFont('DejaVuSansCondensed', 'bold')
            doc.setTextColor(118, 185, 0)
            doc.text('DRAFT', doc.internal.pageSize.width / 2, doc.internal.pageSize.height / 2, {
                align: 'center',
                angle: 45
            })
            if (supportsOpacity) docAny.restoreGraphicsState()
        }
    }

    doc.save(`${isApproved ? '' : 'DRAFT_'}OPEX_${titleRef}.pdf`)
}
