/**
 * generateAnalyticsPdf
 *
 * Produces a branded manager-level Analytics Report PDF from the locally-
 * computed AnalyticsPayload (and optionally an AiBriefResponse if the manager
 * has already generated one on the dashboard).
 *
 * Follows the same pdfBranding.ts + jsPDF + jspdf-autotable approach used by
 * generatePdf.ts (job cards) and generateOpexPdf.ts (OPEX).
 *
 * No chart images are embedded — all data is presented as formatted tables.
 * No new npm dependencies are introduced.
 */

import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import {
  setupFonts,
  setupDoc,
  drawHeader,
  drawGreenBar,
  getSealImage,
  drawWatermarkOnAllPages,
  drawFooter,
  toFormattedDate,
  PRIMARY_COLOR,
  PAGE_MARGIN,
  type CompanySettingsLike,
  type FinanceSettingsLike,
} from '@/features/jobCards/utils/pdfBranding'
import type { AiBriefResponse } from './types-analytics'
import type { UnifiedOperationalContext } from './types-unified-context'

// ── Internal helpers ──────────────────────────────────────────────────────────

const CELL_PADDING = 2.5
const LABEL_COLOR: [number, number, number] = [245, 245, 245]
const LABEL_TEXT: [number, number, number] = [80, 80, 80]
const GRID_LINE: [number, number, number] = [220, 220, 220]

function fmt(v: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(v)
}

function pct(v: number): string {
  return `${Math.round(v)}%`
}

/** Draw a section heading bar (green fill + white uppercase label) */
function sectionHeading(doc: jsPDF, label: string, y: number): number {
  const pageWidth = doc.internal.pageSize.width
  doc.setFillColor(...PRIMARY_COLOR)
  doc.rect(PAGE_MARGIN, y, pageWidth - PAGE_MARGIN * 2, 7, 'F')
  doc.setFont('DejaVuSansCondensed', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(255, 255, 255)
  doc.text(label.toUpperCase(), PAGE_MARGIN + 3, y + 5)
  return y + 7 + 3 // returns y after bar + small gap
}

/** Returns shared autoTable style defaults */
function baseTableStyles() {
  return {
    font: 'DejaVuSansCondensed',
    fontSize: 8,
    cellPadding: CELL_PADDING,
    lineColor: GRID_LINE,
    lineWidth: 0.15,
  }
}

function headStyles() {
  return {
    fillColor: PRIMARY_COLOR as [number, number, number],
    textColor: [255, 255, 255] as [number, number, number],
    fontStyle: 'bold' as const,
    fontSize: 7.5,
  }
}

function labelColStyles() {
  return {
    fontStyle: 'bold' as const,
    fillColor: LABEL_COLOR as [number, number, number],
    textColor: LABEL_TEXT as [number, number, number],
  }
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function generateAnalyticsPdf(
  payload: UnifiedOperationalContext,
  aiBrief: AiBriefResponse | null,
  companySettings?: CompanySettingsLike,
  financeSettings?: FinanceSettingsLike,
): Promise<void> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  await setupFonts(doc)
  setupDoc(doc)

  const pageWidth = doc.internal.pageSize.width

  // ── Branding assets ───────────────────────────────────────────────────────
  const sealImg = await getSealImage(companySettings)

  // ── Header ────────────────────────────────────────────────────────────────
  const headerBottomY = await drawHeader(doc, companySettings)
  let currentY = headerBottomY + 4

  // ── Green bar under header ────────────────────────────────────────────────
  drawGreenBar(doc, currentY)
  currentY += 9

  // ── Report title block ────────────────────────────────────────────────────
  doc.setFont('DejaVuSansCondensed', 'bold')
  doc.setFontSize(14)
  doc.setTextColor(...PRIMARY_COLOR)
  doc.text('ANALYTICS REPORT', pageWidth / 2, currentY, { align: 'center' })

  currentY += 6
  doc.setFont('DejaVuSansCondensed', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(80, 80, 80)

  const periodLabel = `Period: Last ${payload.periodDays} days  ·  From: ${payload.operations.periodStart}  ·  Generated: ${toFormattedDate(payload.generatedAt)}`
  doc.text(periodLabel, pageWidth / 2, currentY, { align: 'center' })

  currentY += 8

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 1 — KPI SUMMARY
  // ═══════════════════════════════════════════════════════════════════════════
  currentY = sectionHeading(doc, '1. KPI Summary', currentY)

  const totalPending =
    payload.operations.jobCards.pendingApprovals +
    payload.operations.expenses.pendingApprovalCount +
    payload.operations.expenses.pendingManagerCount +
    payload.operations.transfers.pendingAccountantCount +
    payload.operations.transfers.pendingManagerCount

  const totalTreasury = payload.operations.accountBalances.reduce((s, a) => s + a.balance, 0)

  autoTable(doc, {
    startY: currentY,
    body: [
      ['Total Pending Approvals', String(totalPending), 'Overdue Job Cards', String(payload.operations.jobCards.overdueOpenCards.length)],
      ['Job Cards Completed (Period)', String(payload.operations.jobCards.completedInPeriod), 'Total Job Cards (All Time)', String(payload.operations.jobCards.total)],
      ['Approved Expenses (Period)', fmt(payload.operations.expenses.approvedAmount), 'Requested Expenses (Period)', fmt(payload.operations.expenses.totalAmount)],
      ['Total Treasury Balance', fmt(totalTreasury), 'Low Stock Items', String(payload.inventory.lowStockCount)],
    ],
    theme: 'grid',
    styles: baseTableStyles(),
    columnStyles: {
      0: { cellWidth: 55, ...labelColStyles() },
      1: { cellWidth: 40, fontStyle: 'bold' },
      2: { cellWidth: 55, ...labelColStyles() },
      3: { cellWidth: 'auto', fontStyle: 'bold' },
    },
    margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
  })

  // @ts-ignore
  currentY = doc.lastAutoTable.finalY + 6

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 2 — JOB CARDS
  // ═══════════════════════════════════════════════════════════════════════════
  currentY = sectionHeading(doc, '2. Job Card Status Breakdown', currentY)

  autoTable(doc, {
    startY: currentY,
    head: [['Status', 'Count', '% of Total']],
    body: payload.operations.jobCards.byStatus.map(s => [
      s.status.replace(/_/g, ' '),
      String(s.count),
      payload.operations.jobCards.total > 0 ? pct((s.count / payload.operations.jobCards.total) * 100) : '0%',
    ]),
    theme: 'grid',
    styles: baseTableStyles(),
    headStyles: headStyles(),
    columnStyles: {
      0: { cellWidth: 'auto' },
      1: { cellWidth: 22, halign: 'center' },
      2: { cellWidth: 22, halign: 'center' },
    },
    margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
  })

  // @ts-ignore
  currentY = doc.lastAutoTable.finalY + 5

  // Pending approvals breakdown
  doc.setFont('DejaVuSansCondensed', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(80, 80, 80)
  doc.text('Pending Approvals by Queue', PAGE_MARGIN, currentY)
  currentY += 3

  autoTable(doc, {
    startY: currentY,
    body: [
      ['Job Card Workflow', String(payload.operations.jobCards.pendingApprovals)],
      ['OPEX — Awaiting Accountant', String(payload.operations.expenses.pendingApprovalCount)],
      ['OPEX — Awaiting Manager', String(payload.operations.expenses.pendingManagerCount)],
      ['Transfers — Awaiting Accountant', String(payload.operations.transfers.pendingAccountantCount)],
      ['Transfers — Awaiting Manager', String(payload.operations.transfers.pendingManagerCount)],
    ],
    theme: 'grid',
    styles: baseTableStyles(),
    columnStyles: {
      0: { cellWidth: 80, ...labelColStyles() },
      1: { cellWidth: 20, halign: 'center', fontStyle: 'bold' },
    },
    margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
  })

  // @ts-ignore
  currentY = doc.lastAutoTable.finalY + 6

  // Overdue job cards (if any)
  if (payload.operations.jobCards.overdueOpenCards.length > 0) {
    doc.setFont('DejaVuSansCondensed', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(200, 40, 40)
    doc.text(`Overdue Job Cards (${payload.operations.jobCards.overdueOpenCards.length} total — threshold: 14 days)`, PAGE_MARGIN, currentY)
    currentY += 3

    autoTable(doc, {
      startY: currentY,
      head: [['Job #', 'Title', 'Department', 'Status', 'Created', 'Days Open']],
      body: payload.operations.jobCards.overdueOpenCards.slice(0, 15).map(c => [
        c.jobNumber,
        c.jobTitle,
        c.departmentName,
        c.status.replace(/_/g, ' '),
        c.createdAt,
        `${c.daysOpen}d`,
      ]),
      theme: 'grid',
      styles: { ...baseTableStyles(), fontSize: 7.5 },
      headStyles: { ...headStyles(), fillColor: [200, 40, 40] },
      columnStyles: {
        0: { cellWidth: 24 },
        1: { cellWidth: 'auto' },
        2: { cellWidth: 30 },
        3: { cellWidth: 36 },
        4: { cellWidth: 20 },
        5: { cellWidth: 16, halign: 'center', fontStyle: 'bold', textColor: [200, 40, 40] as [number, number, number] },
      },
      margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
    })

    // @ts-ignore
    currentY = doc.lastAutoTable.finalY + 6
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 3 — EXPENSES
  // ═══════════════════════════════════════════════════════════════════════════
  currentY = sectionHeading(doc, '3. Operational Expenses', currentY)

  autoTable(doc, {
    startY: currentY,
    body: [
      ['Total Requested (Period)', fmt(payload.operations.expenses.totalAmount), 'Total Approved (Period)', fmt(payload.operations.expenses.approvedAmount)],
      ['Pending Accountant Queue', String(payload.operations.expenses.pendingApprovalCount), 'Pending Manager Queue', String(payload.operations.expenses.pendingManagerCount)],
    ],
    theme: 'grid',
    styles: baseTableStyles(),
    columnStyles: {
      0: { cellWidth: 55, ...labelColStyles() },
      1: { cellWidth: 40, fontStyle: 'bold' },
      2: { cellWidth: 55, ...labelColStyles() },
      3: { cellWidth: 'auto', fontStyle: 'bold' },
    },
    margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
  })

  // @ts-ignore
  currentY = doc.lastAutoTable.finalY + 4

  // Top expense categories
  if (payload.operations.expenses.byCategory.length > 0) {
    doc.setFont('DejaVuSansCondensed', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(80, 80, 80)
    doc.text('Top Categories by Amount', PAGE_MARGIN, currentY)
    currentY += 3

    autoTable(doc, {
      startY: currentY,
      head: [['Category', 'Transactions', 'Total Amount', '% of Period']],
      body: payload.operations.expenses.byCategory.slice(0, 10).map(c => [
        c.category,
        String(c.count),
        fmt(c.total),
        payload.operations.expenses.totalAmount > 0 ? pct((c.total / payload.operations.expenses.totalAmount) * 100) : '0%',
      ]),
      theme: 'grid',
      styles: baseTableStyles(),
      headStyles: headStyles(),
      columnStyles: {
        0: { cellWidth: 'auto' },
        1: { cellWidth: 22, halign: 'center' },
        2: { cellWidth: 35, halign: 'right', fontStyle: 'bold' },
        3: { cellWidth: 20, halign: 'center' },
      },
      margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
    })

    // @ts-ignore
    currentY = doc.lastAutoTable.finalY + 4
  }

  // Largest expense items
  if (payload.operations.expenses.largestItems.length > 0) {
    doc.setFont('DejaVuSansCondensed', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(80, 80, 80)
    doc.text('Largest Individual Expenses', PAGE_MARGIN, currentY)
    currentY += 3

    autoTable(doc, {
      startY: currentY,
      head: [['Description', 'Category', 'Method', 'Status', 'Amount']],
      body: payload.operations.expenses.largestItems.map(e => [
        e.description,
        e.category,
        e.paymentMethod,
        e.status.replace(/_/g, ' '),
        fmt(e.amount),
      ]),
      theme: 'grid',
      styles: { ...baseTableStyles(), fontSize: 7.5 },
      headStyles: headStyles(),
      columnStyles: {
        0: { cellWidth: 'auto' },
        1: { cellWidth: 28 },
        2: { cellWidth: 20 },
        3: { cellWidth: 32 },
        4: { cellWidth: 28, halign: 'right', fontStyle: 'bold' },
      },
      margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
    })

    // @ts-ignore
    currentY = doc.lastAutoTable.finalY + 6
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 4 — ACCOUNT BALANCES & TRANSFERS
  // ═══════════════════════════════════════════════════════════════════════════
  currentY = sectionHeading(doc, '4. Account Balances & Fund Transfers', currentY)

  autoTable(doc, {
    startY: currentY,
    head: [['Account', 'Current Balance']],
    body: [
      ...payload.operations.accountBalances.map(a => [a.account, fmt(a.balance)]),
      ['TOTAL TREASURY', fmt(payload.operations.accountBalances.reduce((s, a) => s + a.balance, 0))],
    ],
    theme: 'grid',
    styles: baseTableStyles(),
    headStyles: headStyles(),
    columnStyles: {
      0: { cellWidth: 60 },
      1: { cellWidth: 'auto', halign: 'right', fontStyle: 'bold' },
    },
    willDrawCell: (data) => {
      // Highlight the totals row
      if (data.row.index === payload.operations.accountBalances.length) {
        doc.setFillColor(...PRIMARY_COLOR)
        doc.setTextColor(255, 255, 255)
      }
    },
    margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
  })

  // @ts-ignore
  currentY = doc.lastAutoTable.finalY + 4

  autoTable(doc, {
    startY: currentY,
    body: [
      ['Completed Transfers (Period)', String(payload.operations.transfers.completedInPeriod), 'Total Completed Amount (All Time)', fmt(payload.operations.transfers.totalCompletedAmount)],
      ['Transfers — Pending Accountant', String(payload.operations.transfers.pendingAccountantCount), 'Transfers — Pending Manager', String(payload.operations.transfers.pendingManagerCount)],
    ],
    theme: 'grid',
    styles: baseTableStyles(),
    columnStyles: {
      0: { cellWidth: 55, ...labelColStyles() },
      1: { cellWidth: 30, fontStyle: 'bold' },
      2: { cellWidth: 55, ...labelColStyles() },
      3: { cellWidth: 'auto', fontStyle: 'bold' },
    },
    margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
  })

  // @ts-ignore
  currentY = doc.lastAutoTable.finalY + 6

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 5 — DEPARTMENT PERFORMANCE
  // ═══════════════════════════════════════════════════════════════════════════
  currentY = sectionHeading(doc, '5. Department Performance', currentY)

  const deptRows = payload.operations.departmentMetrics
    .filter(d => d.jobCardCount > 0)

  if (deptRows.length > 0) {
    autoTable(doc, {
      startY: currentY,
      head: [['Department', 'Total JCs', 'Completed', 'Completion Rate', 'Invoice Value']],
      body: deptRows.map(d => [
        d.departmentName,
        String(d.jobCardCount),
        String(d.completedCount),
        pct(d.completionRate),
        fmt(d.totalInvoiceValue),
      ]),
      theme: 'grid',
      styles: baseTableStyles(),
      headStyles: headStyles(),
      columnStyles: {
        0: { cellWidth: 'auto' },
        1: { cellWidth: 20, halign: 'center' },
        2: { cellWidth: 22, halign: 'center' },
        3: { cellWidth: 26, halign: 'center', fontStyle: 'bold' },
        4: { cellWidth: 33, halign: 'right' },
      },
      margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
    })
  } else {
    doc.setFont('DejaVuSansCondensed', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(120, 120, 120)
    doc.text('No department data available.', PAGE_MARGIN, currentY + 4)
    currentY += 10
  }

  // @ts-ignore
  currentY = (doc.lastAutoTable?.finalY ?? currentY) + 6

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 6 — INVENTORY SNAPSHOT
  // ═══════════════════════════════════════════════════════════════════════════
  currentY = sectionHeading(doc, '6. Inventory Snapshot', currentY)

  autoTable(doc, {
    startY: currentY,
    body: [
      ['Total SKUs', String(payload.inventory.totalItems), 'Active Items', String(payload.inventory.activeItems)],
      ['Low Stock (at/below reorder)', String(payload.inventory.lowStockCount), 'Stock Value (Cost Basis)', fmt(payload.inventory.totalInventoryValue)],
    ],
    theme: 'grid',
    styles: baseTableStyles(),
    columnStyles: {
      0: { cellWidth: 55, ...labelColStyles() },
      1: { cellWidth: 40, fontStyle: 'bold' },
      2: { cellWidth: 55, ...labelColStyles() },
      3: { cellWidth: 'auto', fontStyle: 'bold' },
    },
    margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
  })

  // @ts-ignore
  currentY = doc.lastAutoTable.finalY + 6

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 7 — AI MANAGER BRIEF (optional)
  // ═══════════════════════════════════════════════════════════════════════════
  if (aiBrief) {
    currentY = sectionHeading(doc, '7. AI Manager Brief', currentY)

    // Provenance metadata
    doc.setFont('DejaVuSansCondensed', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(120, 120, 120)
    const aiMeta = `AI-generated · Model confidence: ${aiBrief.modelConfidence.toUpperCase()} · ${new Date(aiBrief.generatedAt).toLocaleString()}`
    doc.text(aiMeta, PAGE_MARGIN, currentY)
    currentY += 5

    // Daily brief paragraph — word-wrap to page width
    doc.setFont('DejaVuSansCondensed', 'normal')
    doc.setFontSize(8.5)
    doc.setTextColor(30, 30, 30)
    const briefLines = doc.splitTextToSize(
      aiBrief.dailyBrief,
      pageWidth - PAGE_MARGIN * 2
    )
    doc.text(briefLines, PAGE_MARGIN, currentY)
    currentY += briefLines.length * 4.5 + 4

    // Key findings
    if (aiBrief.keyFindings.length > 0) {
      doc.setFont('DejaVuSansCondensed', 'bold')
      doc.setFontSize(8)
      doc.setTextColor(80, 80, 80)
      doc.text('Key Findings', PAGE_MARGIN, currentY)
      currentY += 3

      autoTable(doc, {
        startY: currentY,
        body: aiBrief.keyFindings.map(f => [`→  ${f}`]),
        theme: 'plain',
        styles: {
          ...baseTableStyles(),
          cellPadding: { top: 1.5, bottom: 1.5, left: 3, right: 3 },
          fontSize: 8,
        },
        margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
      })

      // @ts-ignore
      currentY = doc.lastAutoTable.finalY + 4
    }

    // Anomalies
    if (aiBrief.anomalies.length > 0) {
      doc.setFont('DejaVuSansCondensed', 'bold')
      doc.setFontSize(8)
      doc.setTextColor(80, 80, 80)
      doc.text('Anomalies Detected', PAGE_MARGIN, currentY)
      currentY += 3

      autoTable(doc, {
        startY: currentY,
        head: [['Severity', 'Metric', 'Observation']],
        body: aiBrief.anomalies.map(a => [
          a.severity.toUpperCase(),
          a.metric,
          a.observation,
        ]),
        theme: 'grid',
        styles: { ...baseTableStyles(), fontSize: 8 },
        headStyles: headStyles(),
        columnStyles: {
          0: { cellWidth: 22, halign: 'center', fontStyle: 'bold' },
          1: { cellWidth: 40 },
          2: { cellWidth: 'auto' },
        },
        margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
      })

      // @ts-ignore
      currentY = doc.lastAutoTable.finalY + 4
    }

    // Recommendations
    if (aiBrief.recommendations.length > 0) {
      doc.setFont('DejaVuSansCondensed', 'bold')
      doc.setFontSize(8)
      doc.setTextColor(80, 80, 80)
      doc.text('Recommendations', PAGE_MARGIN, currentY)
      currentY += 3

      autoTable(doc, {
        startY: currentY,
        head: [['Priority', 'Title', 'Rationale']],
        body: aiBrief.recommendations.map(r => [
          r.priority.toUpperCase(),
          r.title,
          r.rationale,
        ]),
        theme: 'grid',
        styles: { ...baseTableStyles(), fontSize: 8 },
        headStyles: headStyles(),
        columnStyles: {
          0: { cellWidth: 22, halign: 'center', fontStyle: 'bold' },
          1: { cellWidth: 45 },
          2: { cellWidth: 'auto' },
        },
        margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
      })

      // @ts-ignore
      currentY = doc.lastAutoTable.finalY + 4
    }

    // Chart annotations (if any)
    if (aiBrief.chartAnnotations.length > 0) {
      doc.setFont('DejaVuSansCondensed', 'bold')
      doc.setFontSize(8)
      doc.setTextColor(80, 80, 80)
      doc.text('Chart Notes', PAGE_MARGIN, currentY)
      currentY += 3

      autoTable(doc, {
        startY: currentY,
        head: [['Label', 'Metric', 'Note']],
        body: aiBrief.chartAnnotations.map(a => [a.label, a.metric, a.note]),
        theme: 'grid',
        styles: { ...baseTableStyles(), fontSize: 8 },
        headStyles: headStyles(),
        columnStyles: {
          0: { cellWidth: 20 },
          1: { cellWidth: 40 },
          2: { cellWidth: 'auto' },
        },
        margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
      })

      // @ts-ignore
      currentY = doc.lastAutoTable.finalY + 4
    }

    currentY += 2
  }

  // ── Footer + watermark ────────────────────────────────────────────────────
  await drawFooter(
    doc,
    currentY,
    companySettings,
    financeSettings,
    companySettings?.managerName || 'Manager',
    {
      position: companySettings?.managerPosition || 'MANAGEMENT',
      skipPaymentBox: true,
      skipTerms: true,
      skipSeal: !sealImg,
      signatureUrl: companySettings?.managerSignatureDataUrl || companySettings?.managerSignatureUrl,
    }
  )

  if (sealImg) drawWatermarkOnAllPages(doc, sealImg)

  // ── Save ──────────────────────────────────────────────────────────────────
  const dateTag = new Date(payload.generatedAt)
    .toISOString()
    .slice(0, 10)
    .replace(/-/g, '')
  doc.save(`Analytics_Report_${dateTag}.pdf`)
}
