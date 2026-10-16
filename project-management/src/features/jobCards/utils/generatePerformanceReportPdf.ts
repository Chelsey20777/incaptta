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
    removeWhiteBackground,
    toFormattedDate,
    PAGE_MARGIN,
    PRIMARY_COLOR,
    SECONDARY_TEXT_COLOR,
    type CompanySettingsLike,
    type FinanceSettingsLike,
} from './pdfBranding'
import type { FinancialSummary } from '@shared/financialEngine'

const GREEN:   [number, number, number] = [76, 175, 80]
const RED:     [number, number, number] = [211, 47, 47]
const AMBER:   [number, number, number] = [245, 124, 0]
const DARK:    [number, number, number] = [38, 38, 38]
const LIGHT:   [number, number, number] = [250, 250, 250]
const PANEL:   [number, number, number] = [245, 245, 245]

const fmt = (n: number) =>
    `$${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const fmtPct = (n: number) => `${Number(n || 0).toFixed(2)}%`

function statusColor(value: number): [number, number, number] {
    if (value > 0) return GREEN
    if (value < 0) return RED
    return AMBER
}

export interface JobCardPerformanceData {
    jobId?: string
    jobCardNumber: string
    jobCardTitle?: string
    clientName?: string
    department?: string
    createdAt?: any
    status?: string
    financials: FinancialSummary
    totalPaid: number
    payments?: { amount: number; date?: any; method?: string }[]
    generatedBy?: string
}

export async function generatePerformanceReportPdf(
    data: JobCardPerformanceData,
    companySettings?: CompanySettingsLike,
    financeSettings?: FinanceSettingsLike,
    creatorName?: string
) {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    await setupFonts(doc)
    setupDoc(doc)

    const pageW = doc.internal.pageSize.width
    const f = data.financials
    const balanceDue = f.totalInvoiceValue - data.totalPaid
    const collectionPct = f.totalInvoiceValue > 0 ? (data.totalPaid / f.totalInvoiceValue) * 100 : 0

    // ── Header ────────────────────────────────────────────────────────────────
    let y = await drawHeader(doc, companySettings)
    y += 4

    drawGreenBar(doc, y)
    doc.setFont('DejaVuSansCondensed', 'bold')
    doc.setFontSize(11)
    doc.setTextColor(255, 255, 255)
    doc.text('JOB CARD PERFORMANCE REPORT', pageW / 2, y + 5.5, { align: 'center' })
    y += 14

    // ── Job Info Row ──────────────────────────────────────────────────────────
    const infoColW = (pageW - PAGE_MARGIN * 2) / 3
    const col2X = PAGE_MARGIN + infoColW
    const col3X = PAGE_MARGIN + infoColW * 2

    const labelStyle = () => {
        doc.setFont('DejaVuSansCondensed', 'normal')
        doc.setFontSize(7)
        doc.setTextColor(120, 120, 120)
    }
    const valueStyle = () => {
        doc.setFont('DejaVuSansCondensed', 'bold')
        doc.setFontSize(9)
        doc.setTextColor(...DARK)
    }

    labelStyle(); doc.text('JOB CARD', PAGE_MARGIN, y)
    valueStyle(); doc.text(data.jobCardNumber, PAGE_MARGIN, y + 4)

    labelStyle(); doc.text('CLIENT', col2X, y)
    valueStyle(); doc.text(data.clientName || 'N/A', col2X, y + 4)

    labelStyle(); doc.text('DATE ISSUED', col3X, y)
    valueStyle(); doc.text(toFormattedDate(data.createdAt) || toFormattedDate(new Date()), col3X, y + 4)

    y += 12

    if (data.jobCardTitle) {
        labelStyle(); doc.text('TITLE', PAGE_MARGIN, y)
        valueStyle(); doc.text(data.jobCardTitle, PAGE_MARGIN, y + 4)
        y += 10
    }

    y += 2

    // ── Section: 1. REVENUE & BILLING (Formula Row) ──────────────────────────
    doc.setFillColor(...PRIMARY_COLOR)
    doc.rect(PAGE_MARGIN, y, pageW - PAGE_MARGIN * 2, 6.5, 'F')
    doc.setFont('DejaVuSansCondensed', 'bold')
    doc.setFontSize(8.5)
    doc.setTextColor(255, 255, 255)
    doc.text('1. REVENUE & BILLING PERFORMANCE (Formula Row)', PAGE_MARGIN + 3, y + 4.5)
    y += 10

    autoTable(doc, {
        startY: y,
        head: [['P&L Component', 'Calculation / Formula', 'Amount']],
        body: [
            ['Initial Invoice Value', 'Base Job Value (Locked/CRM)', fmt(f.initialInvoiceValue)],
            ['Operational Costs', 'IRD Gross + Staff + Adhoc + Commission', fmt(f.totalOperationalGross)],
            ['T.W.I.D CUMULATIVE NET', 'Initial Value - Operational Costs', fmt(f.twidNetAfterAdjustments)],
            ['TWID REVENUE %', '(TWID Net / Initial Value) × 100', fmtPct(f.twidRevenuePercentage)],
        ],
        theme: 'grid',
        styles: { font: 'DejaVuSansCondensed', fontSize: 8, cellPadding: 2, textColor: DARK },
        headStyles: { fillColor: [220, 220, 220], textColor: [0, 0, 0], fontStyle: 'bold', halign: 'center' },
        columnStyles: {
            0: { cellWidth: 50, fontStyle: 'bold' },
            1: { cellWidth: 80, textColor: [100, 100, 100] },
            2: { cellWidth: 'auto', halign: 'right', fontStyle: 'bold' },
        },
        margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
    })
    y = (doc as any).lastAutoTable.finalY + 8

    // ── Section: 2. I.R.D PERFORMANCE (Formula Row) ──────────────────────────
    doc.setFillColor(...PRIMARY_COLOR)
    doc.rect(PAGE_MARGIN, y, pageW - PAGE_MARGIN * 2, 6.5, 'F')
    doc.setFont('DejaVuSansCondensed', 'bold')
    doc.setFontSize(8.5)
    doc.setTextColor(255, 255, 255)
    doc.text('2. I.R.D INVENTORY PERFORMANCE (Formula Row)', PAGE_MARGIN + 3, y + 4.5)
    y += 10

    autoTable(doc, {
        startY: y,
        head: [['Component', 'Formula', 'Amount']],
        body: [
            ['Inventory Gross Value', 'Purchasing Price + IRD Markup', fmt(f.irdGrossRevenue)],
            ['IRD Inventory Purchasing Price', 'Cumulative Base Cost (Freight + Duty)', fmt(f.irdBaseCost)],
            ['I.R.D REMITTANCE (To Account)', 'Same as Inventory Gross Value', fmt(f.irdNetRevenue)],
            ['I.R.D MARGIN', 'Gross Value - Purchasing Price', fmt(f.irdCumulativeNetRevenue)],
            ['I.R.D REVENUE %', '(Margin / Gross Value) × 100', fmtPct(f.irdRevenuePercentage)],
        ],
        theme: 'grid',
        styles: { font: 'DejaVuSansCondensed', fontSize: 8, cellPadding: 2, textColor: DARK },
        headStyles: { fillColor: [220, 220, 220], textColor: [0, 0, 0], fontStyle: 'bold', halign: 'center' },
        columnStyles: {
            0: { cellWidth: 50, fontStyle: 'bold' },
            1: { cellWidth: 80, textColor: [100, 100, 100] },
            2: { cellWidth: 'auto', halign: 'right', fontStyle: 'bold' },
        },
        margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
    })
    y = (doc as any).lastAutoTable.finalY + 8

    // ── Section: 3. ADJUSTMENTS & COLLECTION ──────────────────────────────────
    doc.setFillColor(...PRIMARY_COLOR)
    doc.rect(PAGE_MARGIN, y, pageW - PAGE_MARGIN * 2, 6.5, 'F')
    doc.setFont('DejaVuSansCondensed', 'bold')
    doc.setFontSize(8.5)
    doc.setTextColor(255, 255, 255)
    doc.text('3. ADJUSTMENTS & COLLECTION SUMMARY', PAGE_MARGIN + 3, y + 4.5)
    y += 10

    autoTable(doc, {
        startY: y,
        head: [['Metric', 'Value', 'Notes']],
        body: [
            ['Total Adjustments (Reductions)', fmt(f.totalAdjustments), 'Post-approval additions deducted from TWID'],
            ['Total Collected', fmt(data.totalPaid), `${data.payments?.length ?? 0} recorded payment(s)`],
            ['Balance Outstanding', fmt(balanceDue), balanceDue > 0 ? 'Collection pending' : 'Fully settled'],
            ['Collection Rate', fmtPct(collectionPct), collectionPct >= 100 ? 'Fully collected' : 'Pending recovery'],
        ],
        theme: 'grid',
        styles: { font: 'DejaVuSansCondensed', fontSize: 8, cellPadding: 2, textColor: DARK },
        headStyles: { fillColor: [220, 220, 220], textColor: [0, 0, 0], fontStyle: 'bold', halign: 'center' },
        columnStyles: {
            0: { cellWidth: 65 },
            1: { cellWidth: 35, halign: 'right', fontStyle: 'bold' },
            2: { cellWidth: 'auto', textColor: [100, 100, 100] },
        },
        margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
    })
    y = (doc as any).lastAutoTable.finalY + 8

    // ── Section: 4. PROFIT & LOSS SUMMARY ─────────────────────────────────────
    doc.setFillColor(...PRIMARY_COLOR)
    doc.rect(PAGE_MARGIN, y, pageW - PAGE_MARGIN * 2, 6.5, 'F')
    doc.setFont('DejaVuSansCondensed', 'bold')
    doc.setFontSize(8.5)
    doc.setTextColor(255, 255, 255)
    doc.text('4. FINAL PROFIT & LOSS (BOTTOM LINE)', PAGE_MARGIN + 3, y + 4.5)
    y += 10

    autoTable(doc, {
        startY: y,
        head: [['P&L Line Item', 'Amount', 'Description']],
        body: [
            ['Total Project Revenue', fmt(f.totalRevenue), 'Invoice Value minus Adjustments'],
            ['Cost of Goods Sold (COGS)', fmt(f.irdBaseCost), 'Direct material/inventory costs'],
            ['Gross Profit', fmt(f.totalRevenue - f.irdBaseCost), 'Revenue − COGS'],
            ['Operating Expenses (OPEX)', fmt(f.totalOperatingExpenses), 'Staff labor and ad-hoc expenses'],
            ['Referral Commission', fmt(f.referrerCommission), 'Awarded to referrer'],
            ['Final Net Profit', fmt(f.netProfit), 'The bottom line for this job'],
            ['Net Profit Margin', fmtPct(f.profitMargin), 'Profitability as a percentage of revenue'],
        ],
        theme: 'striped',
        styles: { font: 'DejaVuSansCondensed', fontSize: 8.5, cellPadding: 3, textColor: DARK },
        headStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: 'bold', halign: 'left' },
        columnStyles: {
            0: { cellWidth: 65, fontStyle: 'bold' },
            1: { cellWidth: 35, halign: 'right', fontStyle: 'bold' },
            2: { cellWidth: 'auto', textColor: [100, 100, 100] },
        },
        margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
    })
    y = (doc as any).lastAutoTable.finalY + 10

    // ── Section: KPI Highlights ──────────────────────────────────────────
    const tileW = (pageW - PAGE_MARGIN * 2 - 4) / 2
    const tileH = 22
    const tiles = [
        { label: 'TWID Revenue Health', value: fmt(f.twidNetAfterAdjustments), sub: `${fmtPct(f.twidRevenuePercentage)} of Initial Value`, color: f.twidNetAfterAdjustments >= 0 ? GREEN : RED },
        { label: 'IRD Remittance', value: fmt(f.irdNetRevenue), sub: `Gross Inventory Sales`, color: f.irdNetRevenue > 0 ? GREEN : AMBER },
        { label: 'Performance vs Target', value: fmt(f.netProfit - f.targetJobNet), sub: f.netProfit >= f.targetJobNet ? 'Above Original Target' : 'Below Original Target', color: f.netProfit >= f.targetJobNet ? GREEN : RED },
        { label: 'Final Net Profit', value: fmt(f.netProfit), sub: `${f.profitMargin.toFixed(1)}% Margin`, color: statusColor(f.netProfit) },
    ]

    if (y + tileH * 2 + 4 > 270) { doc.addPage(); y = 20 }

    tiles.forEach((tile, i) => {
        const col = i % 2
        const row = Math.floor(i / 2)
        const tx = PAGE_MARGIN + col * (tileW + 4)
        const ty = y + row * (tileH + 4)

        doc.setFillColor(...PANEL)
        doc.roundedRect(tx, ty, tileW, tileH, 2, 2, 'F')

        doc.setFont('DejaVuSansCondensed', 'normal')
        doc.setFontSize(7)
        doc.setTextColor(120, 120, 120)
        doc.text(tile.label.toUpperCase(), tx + 3, ty + 5)

        doc.setFont('DejaVuSansCondensed', 'bold')
        doc.setFontSize(14)
        doc.setTextColor(...tile.color)
        doc.text(tile.value, tx + 3, ty + 14)

        doc.setFont('DejaVuSansCondensed', 'normal')
        doc.setFontSize(7)
        doc.setTextColor(150, 150, 150)
        doc.text(tile.sub, tx + 3, ty + 20)
    })

    y += tileH * 2 + 4 + 10

    // Net Profit Variance full-width tile
    if (y + 16 > 270) { doc.addPage(); y = 20 }

    const variance = f.netProfit - f.targetJobNet
    const profitColor = variance >= 0 ? GREEN : RED
    doc.setFillColor(...PANEL)
    doc.roundedRect(PAGE_MARGIN, y, pageW - PAGE_MARGIN * 2, 16, 2, 2, 'F')
    doc.setFont('DejaVuSansCondensed', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(120, 120, 120)
    doc.text('NET PROFIT VARIANCE (vs Original Target)', PAGE_MARGIN + 3, y + 5)
    doc.setFont('DejaVuSansCondensed', 'bold')
    doc.setFontSize(13)
    doc.setTextColor(...profitColor)
    doc.text(fmt(variance), PAGE_MARGIN + 3, y + 13)
    doc.setFont('DejaVuSansCondensed', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...profitColor)
    doc.text(`${variance >= 0 ? '+' : ''}${fmt(variance)} variance against original target of ${fmt(f.targetJobNet)}`, PAGE_MARGIN + 45, y + 13)

    y += 24

    // ── 4. Referral & Commission ─────────────────────────────────────────────
    if (f.commissionPercentage > 0 || (data as any).referrerName) {
        if (y + 35 > 270) { doc.addPage(); y = 20 }

        doc.setFillColor(...PRIMARY_COLOR)
        doc.rect(PAGE_MARGIN, y, pageW - PAGE_MARGIN * 2, 6.5, 'F')
        doc.setFont('DejaVuSansCondensed', 'bold')
        doc.setFontSize(8.5)
        doc.setTextColor(255, 255, 255)
        doc.text('5. REFERRAL & COMMISSION', PAGE_MARGIN + 3, y + 4.5)
        y += 10

        const commissionItems = [
            { label: 'Referrer Name', value: (data as any).referrerName || 'N/A', formula: 'Awarded to' },
            { label: 'Invoice Value', value: fmt(f.totalRevenue), formula: 'Base for calculation' },
            { label: 'Commission Rate', value: `${f.commissionPercentage}%`, formula: 'Agreed percentage' },
            { label: 'COMMISSION PAYABLE', value: fmt(f.referrerCommission), formula: 'Invoice Value × Rate', highlight: true },
        ]

        commissionItems.forEach(item => {
            doc.setFont('DejaVuSansCondensed', 'bold')
            doc.setFontSize(8)
            doc.setTextColor(...DARK)
            doc.text(item.label, PAGE_MARGIN + 2, y)

            doc.setFont('DejaVuSansCondensed', 'normal')
            doc.setFontSize(7)
            doc.setTextColor(120, 120, 120)
            doc.text(item.formula, PAGE_MARGIN + 55, y)

            doc.setFont('DejaVuSansCondensed', 'bold')
            doc.setFontSize(9)
            if (item.highlight) {
                doc.setTextColor(...RED)
            } else {
                doc.setTextColor(...DARK)
            }
            doc.text(item.value, pageW - PAGE_MARGIN - 2, y, { align: 'right' })

            y += 4
            doc.setDrawColor(230, 230, 230)
            doc.setLineWidth(0.1)
            doc.line(PAGE_MARGIN, y, pageW - PAGE_MARGIN, y)
            y += 5
        })
        y += 5
    }

    // ── Section: Key Findings ─────────────────────────────────────────────────
    if (y + 10 > 260) { doc.addPage(); y = 20 }

    doc.setFillColor(...PRIMARY_COLOR)
    doc.rect(PAGE_MARGIN, y, pageW - PAGE_MARGIN * 2, 6.5, 'F')
    doc.setFont('DejaVuSansCondensed', 'bold')
    doc.setFontSize(8.5)
    doc.setTextColor(255, 255, 255)
    doc.text('6. KEY ACCOUNTING FINDINGS', PAGE_MARGIN + 3, y + 4.5)
    y += 10

    const findings: { flag: string; title: string; detail: string }[] = []

    if (f.irdCumulativeNetRevenue === 0) {
        findings.push({
            flag: 'CRITICAL',
            title: 'Zero Material Markup',
            detail: `Inventory was billed at base cost ($${fmt(f.irdBaseCost)}). No gross profit is being generated from materials on this job.`,
        })
    }

    if (f.targetJobNet === 0) {
        findings.push({
            flag: 'WARNING',
            title: 'Baseline Missing',
            detail: 'No initial profit target was defined. Variance analysis is compared against a $0.00 baseline.',
        })
    }

    if (f.totalOperatingExpenses > 0) {
        const opexRatio = f.totalRevenue > 0 ? (f.totalOperatingExpenses / f.totalRevenue) * 100 : 0
        const flag = opexRatio > 50 ? 'CRITICAL' : opexRatio > 30 ? 'WARNING' : 'INFO'
        findings.push({
            flag,
            title: `OPEX at ${fmtPct(opexRatio)} of Revenue`,
            detail: `Operating expenses (Staff + Ad-hoc) total ${fmt(f.totalOperatingExpenses)}. ${opexRatio > 50 ? 'Expenses are consuming more than half of project revenue.' : 'Review expense allocation for efficiency.'}`,
        })
    }

    if (f.adjustmentAdhoc > 0 || f.adjustmentItems > 0) {
        findings.push({
            flag: 'INFO',
            title: `Job Adjustments of ${fmt(f.totalAdjustments)} Absorbed`,
            detail: `Adjustments total ${fmtPct(f.adjustmentPercent)} of invoice value. These are absorbed from TWID. Since TWID is ${fmt(f.twidAmount)}, this results in a TWID net of ${fmt(f.twidNetAfterAdjustments)}.`,
        })
    }

    if (collectionPct < 100 && balanceDue > 0) {
        findings.push({
            flag: collectionPct < 75 ? 'WARNING' : 'INFO',
            title: `Outstanding Balance of ${fmt(balanceDue)} (${fmtPct(100 - collectionPct)} uncollected)`,
            detail: `${fmtPct(collectionPct)} of the invoice has been collected. Follow up with the client to recover the remaining ${fmt(balanceDue)}.`,
        })
    }

    if (f.netProfit < 0) {
        findings.push({
            flag: 'CRITICAL',
            title: `Net Loss of ${fmt(Math.abs(f.netProfit))}`,
            detail: 'This project closed at a net loss. Operating costs exceeded the total billed revenue.',
        })
    }

    const flagColors: Record<string, [number, number, number]> = {
        CRITICAL: RED,
        WARNING: AMBER,
        INFO: GREEN,
    }

    if (findings.length === 0) {
        findings.push({
            flag: 'INFO',
            title: 'No significant anomalies detected',
            detail: 'Job card performance is within expected parameters.',
        })
    }

    findings.forEach(finding => {
        if (y + 22 > 270) { doc.addPage(); y = 20 }

        const fc = flagColors[finding.flag] ?? DARK
        doc.setFillColor(...fc)
        doc.roundedRect(PAGE_MARGIN, y, 18, 6, 1, 1, 'F')
        doc.setFont('DejaVuSansCondensed', 'bold')
        doc.setFontSize(6.5)
        doc.setTextColor(255, 255, 255)
        doc.text(finding.flag, PAGE_MARGIN + 9, y + 4.2, { align: 'center' })

        doc.setFont('DejaVuSansCondensed', 'bold')
        doc.setFontSize(8.5)
        doc.setTextColor(...DARK)
        doc.text(finding.title, PAGE_MARGIN + 22, y + 4.2)
        y += 8

        doc.setFont('DejaVuSansCondensed', 'normal')
        doc.setFontSize(8)
        doc.setTextColor(80, 80, 80)
        const detailLines = doc.splitTextToSize(finding.detail, pageW - PAGE_MARGIN * 2 - 22)
        doc.text(detailLines, PAGE_MARGIN + 22, y)
        y += detailLines.length * 4 + 5
    })

    // ── Footer ────────────────────────────────────────────────────────────────
    if (y + 45 > 270) { doc.addPage(); y = 20 }

    doc.setFont('DejaVuSansCondensed', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(150, 150, 150)
    doc.text(`Report generated: ${new Date().toLocaleString()}`, PAGE_MARGIN, y)
    if (data.generatedBy) {
        doc.text(`Generated by: ${data.generatedBy}`, PAGE_MARGIN, y + 4)
        y += 4
    }
    y += 8

    await drawFooter(doc, y, companySettings, financeSettings, creatorName, {
        skipPaymentBox: true,
        skipTerms: true,
        position: companySettings?.managerPosition || 'Manager',
    })

    // Watermark
    const sealImg = await getSealImage(companySettings)
    if (sealImg) drawWatermarkOnAllPages(doc, sealImg)

    const fileName = `Performance_Report_${data.jobCardNumber}_${new Date().toISOString().slice(0, 10)}.pdf`
    doc.save(fileName)
}
