import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { Payroll, Employee } from '../types'
import {
    setupFonts,
    setupDoc,
    getSealImage,
    drawWatermarkOnAllPages,
    removeWhiteBackground,
    toFormattedDate,
    PAGE_MARGIN,
    type CompanySettingsLike
} from '@/features/jobCards/utils/pdfBranding'

// Color definitions matching the professional branding
const PRIMARY_COLOR: [number, number, number] = [118, 185, 0] // Lime Green #76b900
const DARK_NAVY: [number, number, number] = [26, 31, 54] // #1a1f36
const SECONDARY_TEXT_COLOR: [number, number, number] = [38, 38, 38]
const WHITE: [number, number, number] = [255, 255, 255]
const LIGHT_GRAY: [number, number, number] = [245, 245, 245]

const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
]

/**
 * Draw centered header with logo and title (Opex-like)
 */
async function drawCenteredHeader(
    doc: jsPDF,
    companySettings: CompanySettingsLike,
    month: string,
    year: number
): Promise<number> {
    const pageWidth = doc.internal.pageSize.width
    const PAGE_CENTER = pageWidth / 2
    let currentY = 12

    let logoHeight = 25
    let logoWidth = 50
    let logoImgElement: HTMLImageElement | null = null

    const logoDataUrl = (companySettings as any)?.logoDataUrl
    const logoUrl = companySettings?.logoUrl

    if (logoDataUrl || logoUrl) {
        try {
            const transparentLogo = logoDataUrl ? logoDataUrl : await removeWhiteBackground(logoUrl as string)
            await new Promise<void>((resolve) => {
                const img = new Image()
                if (!logoDataUrl) img.crossOrigin = "anonymous"
                img.src = transparentLogo
                img.onload = () => {
                    logoImgElement = img
                    const aspect = img.width / img.height
                    logoHeight = logoWidth / aspect
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
            console.error("jsPDF error adding logo:", err)
            currentY += 20
        }
    } else {
        currentY += 20
    }

    // Title
    doc.setFont("DejaVuSansCondensed", "bold")
    doc.setFontSize(22)
    doc.setTextColor(...PRIMARY_COLOR)
    doc.text("EMPLOYEE PAYSLIP", PAGE_CENTER, currentY, { align: "center" })

    currentY += 8
    doc.setFontSize(12)
    doc.setTextColor(...SECONDARY_TEXT_COLOR)
    doc.text(`${month.toUpperCase()} ${year}`, PAGE_CENTER, currentY, { align: "center" })

    currentY += 6
    doc.setFontSize(10)
    doc.setFont("DejaVuSansCondensed", "normal")
    doc.text(`Generated: ${toFormattedDate(new Date())}`, PAGE_CENTER, currentY, { align: "center" })

    currentY += 8

    // Divider line
    doc.setDrawColor(...PRIMARY_COLOR)
    doc.setLineWidth(0.5)
    doc.line(PAGE_MARGIN, currentY, pageWidth - PAGE_MARGIN, currentY)

    return currentY + 10
}

/**
 * Draw employee and pay info section
 */
function drawInfoSection(
    doc: jsPDF,
    payroll: Payroll,
    employee: Employee | null,
    startY: number
): number {
    const pageWidth = doc.internal.pageSize.width
    
    autoTable(doc, {
        startY,
        body: [
            ['Employee Name', payroll.employeeName || 'N/A', 'Employee ID', employee?.id || 'N/A'],
            ['Department', employee?.department || 'N/A', 'Designation', employee?.jobTitle || 'N/A'],
            ['National ID', employee?.nationalId || 'N/A', 'Pay Period', `${MONTH_NAMES[(payroll.month || 1) - 1]} ${payroll.year}`],
            ['Pay Date', toFormattedDate(new Date()), 'Status', payroll.status.toUpperCase()],
        ],
        theme: 'grid',
        styles: {
            font: "DejaVuSansCondensed",
            fontSize: 8,
            cellPadding: 3,
            lineColor: [240, 240, 240],
            lineWidth: 0.1,
        },
        columnStyles: {
            0: { cellWidth: 35, fontStyle: 'bold', fillColor: [245, 245, 245] },
            1: { cellWidth: 60 },
            2: { cellWidth: 35, fontStyle: 'bold', fillColor: [245, 245, 245] },
            3: { cellWidth: 'auto' }
        },
        margin: { left: PAGE_MARGIN, right: PAGE_MARGIN }
    })

    // @ts-ignore
    return doc.lastAutoTable.finalY + 8
}

/**
 * Draw earnings and deductions tables
 */
function drawPayDetails(
    doc: jsPDF,
    payroll: Payroll,
    startY: number,
    postings: any[] = []
): number {
    const pageWidth = doc.internal.pageSize.width
    const gap = 8
    const tableWidth = (pageWidth - PAGE_MARGIN * 2 - gap) / 2

    // Earnings
    const earningsBody: any[][] = [
        ['Basic Salary', `$${(payroll.basicSalary || 0).toFixed(2)}`],
    ]
    if (payroll.allowances) earningsBody.push(['Allowances', `$${payroll.allowances.toFixed(2)}`])
    if (payroll.jobCardEarnings) {
        earningsBody.push(['Incentives/Job Cards', `$${payroll.jobCardEarnings.toFixed(2)}`])
        if (postings && postings.length) {
            postings.forEach(p => {
                earningsBody.push([
                    {
                        content: `  ↳ Job ${p.jobNumber}`,
                        styles: { fontSize: 7, textColor: [100, 100, 100], fontStyle: 'italic', cellPadding: 1 }
                    },
                    {
                        content: `$${(p.amount || 0).toFixed(2)}`,
                        styles: { fontSize: 7, textColor: [100, 100, 100], fontStyle: 'italic', halign: 'right', cellPadding: 1 }
                    }
                ])
            })
        } else if ((payroll as any).jobCardReferences && (payroll as any).jobCardReferences.length) {
            earningsBody.push([
                { 
                    content: `Jobs: ${(payroll as any).jobCardReferences.join(', ')}`, 
                    colSpan: 2, 
                    styles: { fontSize: 7, textColor: [120, 120, 120], fontStyle: 'italic', cellPadding: 2 } 
                }
            ])
        }
    }
    
    const gross = (payroll.basicSalary || 0) + (payroll.allowances || 0) + (payroll.jobCardEarnings || 0)
    earningsBody.push([{ content: 'Gross Earnings', styles: { fontStyle: 'bold' } }, { content: `$${gross.toFixed(2)}`, styles: { fontStyle: 'bold' } }])

    autoTable(doc, {
        head: [['Earnings', 'Amount (USD)']],
        body: earningsBody,
        startY,
        theme: 'grid',
        styles: { font: "DejaVuSansCondensed", fontSize: 8, cellPadding: 3 },
        headStyles: { fillColor: PRIMARY_COLOR, textColor: WHITE },
        columnStyles: { 1: { halign: 'right' } },
        margin: { left: PAGE_MARGIN, right: PAGE_MARGIN + tableWidth + gap },
        tableWidth
    })

    // @ts-ignore
    const earningsY = doc.lastAutoTable.finalY

    // Deductions
    const deductionsBody: any[][] = []
    if (payroll.paye) deductionsBody.push(['P.A.Y.E', `$${payroll.paye.toFixed(2)}`])
    if (payroll.nssa) deductionsBody.push(['NSSA', `$${payroll.nssa.toFixed(2)}`])
    if (payroll.aidsLevy) deductionsBody.push(['AIDS Levy', `$${payroll.aidsLevy.toFixed(2)}`])
    if (payroll.zimdef) deductionsBody.push(['ZIMDEF', `$${payroll.zimdef.toFixed(2)}`])
    if (payroll.wcif) deductionsBody.push(['WCIF', `$${payroll.wcif.toFixed(2)}`])
    if (payroll.necEmployee) deductionsBody.push(['NEC', `$${payroll.necEmployee.toFixed(2)}`])
    if ((payroll as any).damagesDeduction) deductionsBody.push(['Damages', `$${(payroll as any).damagesDeduction.toFixed(2)}`])
    if ((payroll as any).uniformDeduction) deductionsBody.push(['Uniform', `$${(payroll as any).uniformDeduction.toFixed(2)}`])
    
    if (deductionsBody.length === 0) deductionsBody.push(['No Deductions', '$0.00'])
    
    deductionsBody.push([{ content: 'Total Deductions', styles: { fontStyle: 'bold' } }, { content: `$${(payroll.deductions || 0).toFixed(2)}`, styles: { fontStyle: 'bold' } }])

    autoTable(doc, {
        head: [['Deductions', 'Amount (USD)']],
        body: deductionsBody,
        startY,
        theme: 'grid',
        styles: { font: "DejaVuSansCondensed", fontSize: 8, cellPadding: 3 },
        headStyles: { fillColor: [180, 0, 0], textColor: WHITE },
        columnStyles: { 1: { halign: 'right' } },
        margin: { left: PAGE_MARGIN + tableWidth + gap, right: PAGE_MARGIN },
        tableWidth
    })

    // @ts-ignore
    const deductionsY = doc.lastAutoTable.finalY

    return Math.max(earningsY, deductionsY) + 10
}

/**
 * Draw net pay box
 */
function drawNetPay(
    doc: jsPDF,
    payroll: Payroll,
    startY: number
): number {
    const pageWidth = doc.internal.pageSize.width
    const boxWidth = 80
    const x = pageWidth - PAGE_MARGIN - boxWidth
    
    doc.setFillColor(...DARK_NAVY)
    doc.rect(x, startY, boxWidth, 12, 'F')
    
    doc.setFont("DejaVuSansCondensed", "bold")
    doc.setFontSize(10)
    doc.setTextColor(...WHITE)
    doc.text("NET TAKE HOME", x + 5, startY + 8)
    
    doc.setFontSize(12)
    doc.text(`$${(payroll.netPay || 0).toFixed(2)}`, pageWidth - PAGE_MARGIN - 5, startY + 8, { align: 'right' })
    
    return startY + 20
}

/**
 * Draw footer with signatures and seal
 */
async function drawSignatureAndSeal(
    doc: jsPDF,
    companySettings: CompanySettingsLike,
    startY: number
): Promise<number> {
    const pageWidth = doc.internal.pageSize.width
    let currentY = startY

    // Prepared by
    doc.setFont("DejaVuSansCondensed", "normal")
    doc.setFontSize(8)
    doc.setTextColor(...SECONDARY_TEXT_COLOR)
    doc.text("__________________________", PAGE_MARGIN + 10, currentY)
    doc.text("Employee Signature", PAGE_MARGIN + 10, currentY + 5)

    // Approved by
    const rightX = pageWidth - PAGE_MARGIN - 60
    doc.text("__________________________", rightX, currentY)
    doc.text("Authorized Signatory", rightX, currentY + 5)

    // Add seal if available
    const sealImg = await getSealImage(companySettings)
    if (sealImg) {
        try {
            doc.addImage(sealImg, "PNG", rightX + 5, currentY - 25, 40, 40)
        } catch (err) {
            console.error("Error adding seal to payslip:", err)
        }
    }

    return currentY + 20
}

/**
 * Main export: Download Payslip PDF
 */
export async function downloadPayslipPDF(
    payroll: Payroll,
    employee: Employee | null,
    verificationToken: string,
    companySettings: CompanySettingsLike,
    postings: any[] = []
): Promise<void> {
    const doc = new jsPDF()
    await setupFonts(doc)
    setupDoc(doc)

    const monthName = MONTH_NAMES[(payroll.month || 1) - 1] || 'Unknown'
    const year = payroll.year || new Date().getFullYear()
    
    // Draw Header
    let currentY = await drawCenteredHeader(doc, companySettings, monthName, year)
    
    // Draw Info
    currentY = drawInfoSection(doc, payroll, employee, currentY)
    
    // Draw Pay Details
    currentY = drawPayDetails(doc, payroll, currentY, postings)
    
    // Draw Net Pay
    currentY = drawNetPay(doc, payroll, currentY)
    
    // Draw Signatures and Seal
    await drawSignatureAndSeal(doc, companySettings, currentY + 10)

    // Add Watermark
    const sealImg = await getSealImage(companySettings)
    if (sealImg) {
        drawWatermarkOnAllPages(doc, sealImg)
    }

    const fileName = `payslip-${payroll.employeeName?.replace(/\s+/g, '_')}_${monthName}_${payroll.year}.pdf`
    doc.save(fileName)
}
