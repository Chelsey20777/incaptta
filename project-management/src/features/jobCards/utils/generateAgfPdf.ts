import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import {
  setupDoc,
  setupFonts,
  drawGreenBar,
  drawFooter,
  drawWatermarkOnAllPages,
  getSealImage,
  PRIMARY_COLOR,
  PAGE_MARGIN,
  toFormattedDate,
  type CompanySettingsLike,
  type FinanceSettingsLike,
} from './pdfBranding'
import { numberToWords } from './numberToWords'

declare module 'jspdf' {
  interface jsPDF {
    lastAutoTable: {
      finalY: number
    }
  }
}

const LABEL_FILL: [number, number, number] = [220, 220, 220]
const CELL_PAD = { top: 2, right: 3, bottom: 2, left: 3 }

export async function generateAgfPdf(
  jobCard: any,
  companySettings?: CompanySettingsLike,
  financeSettings?: FinanceSettingsLike
): Promise<void> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageWidth = doc.internal.pageSize.width

  await setupFonts(doc)
  setupDoc(doc)

  const sealImg = await getSealImage(companySettings)

  // ── Header: Centered logo ──────────────────────────────────────────────────
  let currentY = 12
  const PAGE_CENTER = pageWidth / 2
  let logoWidth = 50
  let logoHeight = 25
  let logoImgElement: HTMLImageElement | null = null

  const logoDataUrl = (companySettings as any)?.logoDataUrl
  const logoUrl = companySettings?.logoUrl
  if (logoDataUrl || logoUrl) {
    try {
      const src = logoDataUrl ?? logoUrl
      await new Promise<void>((resolve) => {
        const img = new Image()
        if (!logoDataUrl) img.crossOrigin = 'anonymous'
        img.src = src as string
        img.onload = () => {
          logoImgElement = img
          logoHeight = logoWidth / (img.width / img.height)
          resolve()
        }
        img.onerror = () => resolve()
      })
    } catch {
      /* ignore */
    }
  }

  if (logoImgElement) {
    try {
      doc.addImage(
        logoImgElement,
        'PNG',
        PAGE_CENTER - logoWidth / 2,
        currentY,
        logoWidth,
        logoHeight
      )
      currentY += logoHeight + 6
    } catch {
      currentY += 22
    }
  } else {
    currentY += 22
  }

  // ── Document Title ─────────────────────────────────────────────────────────
  doc.setFont('DejaVuSansCondensed', 'bold')
  doc.setFontSize(13)
  doc.setTextColor(...PRIMARY_COLOR)
  doc.text(
    'AGRICULTURAL CONSTRUCTION QUOTATION PROPOSAL',
    PAGE_CENTER,
    currentY,
    { align: 'center' }
  )
  currentY += 5

  // Green underline
  doc.setDrawColor(...PRIMARY_COLOR)
  doc.setLineWidth(0.6)
  doc.line(PAGE_MARGIN, currentY, pageWidth - PAGE_MARGIN, currentY)
  currentY += 8

  doc.setTextColor(0, 0, 0)

  // ── Quote Info Table ──────────────────────────────────────────────────────
  const labelW = 30
  const valueW = 56

  autoTable(doc, {
    startY: currentY,
    theme: 'grid',
    styles: {
      font: 'DejaVuSansCondensed',
      fontSize: 8,
      cellPadding: CELL_PAD,
      lineColor: [220, 220, 220],
      lineWidth: 0.1,
      textColor: [38, 38, 38],
    },
    columnStyles: {
      0: { cellWidth: labelW, fontStyle: 'bold', fillColor: LABEL_FILL },
      1: { cellWidth: valueW },
      2: { cellWidth: labelW, fontStyle: 'bold', fillColor: LABEL_FILL },
      3: { cellWidth: valueW },
    },
    body: [
      [
        'Quote Number',
        jobCard.jobNumber,
        'Status',
        jobCard.status,
      ],
      [
        'Client Name',
        jobCard.clientName || '—',
        'Date Issued',
        toFormattedDate(jobCard.createdAt),
      ],
      [
        'Site Location',
        jobCard.siteLocation || '—',
        'Structure Size',
        jobCard.fowlrunMeta?.size?.label || jobCard.generalInfo?.dimensionsOfStructure || '—',
      ],
    ],
    margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
  })

  // @ts-ignore
  currentY = doc.lastAutoTable.finalY

  // ── Structural Specifications ──────────────────────────────────────────────
  const meta = jobCard.fowlrunMeta
  if (meta) {
    drawGreenBar(doc, currentY)
    doc.setFont('DejaVuSansCondensed', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(255, 255, 255)
    doc.text('STRUCTURAL SPECIFICATIONS', PAGE_MARGIN + 2, currentY + 5.5)
    doc.setTextColor(0, 0, 0)
    currentY += 12

    autoTable(doc, {
      startY: currentY,
      theme: 'grid',
      styles: {
        font: 'DejaVuSansCondensed',
        fontSize: 8,
        cellPadding: CELL_PAD,
        lineColor: [220, 220, 220],
        lineWidth: 0.1,
        textColor: [38, 38, 38],
      },
      columnStyles: {
        0: { cellWidth: labelW + 10, fontStyle: 'bold', fillColor: LABEL_FILL },
        1: { cellWidth: valueW - 10 },
        2: { cellWidth: labelW + 10, fontStyle: 'bold', fillColor: LABEL_FILL },
        3: { cellWidth: valueW - 10 },
      },
      body: [
        ['Length', `${meta.size?.label || '—'}`, 'Width', `${meta.size?.width || 0}m`],
        ['Area', `${meta.area || 0}m²`, 'Perimeter', `${meta.perimeter || 0}m`],
        ['Wall Height', '1.8m', 'Wall Area', `${meta.wallArea || 0}m²`],
        ['Bays', `${meta.bays || 0}`, 'Scale Factor', (meta.scale || 0).toFixed(2)],
        [
          'Bird Capacity',
          `${meta.birdCapacityMin || 0} – ${meta.birdCapacityMax || 0}`,
          '',
          '',
        ],
      ],
      margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
    })

    // @ts-ignore
    currentY = doc.lastAutoTable.finalY + 6
  }

  // ── BOQ Table ──────────────────────────────────────────────────────────────
  drawGreenBar(doc, currentY)
  doc.setFont('DejaVuSansCondensed', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(255, 255, 255)
  doc.text('BILL OF QUANTITIES', PAGE_MARGIN + 2, currentY + 5.5)
  doc.setTextColor(0, 0, 0)
  currentY += 12

  // Collect all BOQ items from requisitionItems
  const boqItems = (jobCard.requisitionItems || []).map((item: any) => ({
    description: item.description || item.itemName,
    qty: item.qty || 0,
    unit: item.uom || '',
    unitPrice: item.irdSellingPrice || 0,
    total: item.rowGrandTot || (item.qty || 0) * (item.irdSellingPrice || 0),
    category: item.category || 'material',
  }))

  if (boqItems.length === 0) {
    // Fallback: Try sections
    const sectionItems = (jobCard.requisitionSections || []).flatMap((s: any) =>
      s.items || []
    )
    boqItems.push(
      ...sectionItems.map((item: any) => ({
        description: item.description || item.itemName,
        qty: item.qty || 0,
        unit: item.uom || '',
        unitPrice: item.irdSellingPrice || 0,
        total:
          item.rowGrandTot ||
          (item.qty || 0) * (item.irdSellingPrice || 0),
        category: item.category || 'material',
      }))
    )
  }

  // Group by category with subtotals
  const categoryLabels: Record<string, string> = {
    material: 'MATERIALS',
    labour: 'LABOUR',
    transport: 'TRANSPORT',
  }

  const tableBody: any[][] = []
  const subtotals: Record<string, number> = { material: 0, labour: 0, transport: 0 }

  boqItems.forEach((item: any) => {
    const cat = item.category || 'material'
    tableBody.push([
      item.description,
      item.qty.toString(),
      item.unit,
      item.unitPrice.toFixed(2),
      item.total.toFixed(2),
    ])
    subtotals[cat] = (subtotals[cat] || 0) + item.total
  })

  if (tableBody.length > 0) {
    autoTable(doc, {
      startY: currentY,
      head: [['Description', 'Qty', 'Unit', 'Unit Price', 'Total']],
      body: tableBody,
      theme: 'grid',
      styles: {
        font: 'DejaVuSansCondensed',
        fontSize: 8,
        cellPadding: CELL_PAD,
        lineColor: [220, 220, 220],
        lineWidth: 0.1,
        textColor: [38, 38, 38],
      },
      headStyles: {
        fillColor: LABEL_FILL,
        textColor: [0, 0, 0],
        fontStyle: 'bold',
        halign: 'center',
      },
      columnStyles: {
        0: { cellWidth: 'auto', halign: 'left' },
        1: { cellWidth: 15, halign: 'center' },
        2: { cellWidth: 18, halign: 'center' },
        3: { cellWidth: 22, halign: 'right' },
        4: { cellWidth: 25, halign: 'right' },
      },
      margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
    })

    // @ts-ignore
    currentY = doc.lastAutoTable.finalY + 4
  }

  // ── Cost Summary ───────────────────────────────────────────────────────────
  const materialsTotal = subtotals['material'] || 0
  const labourTotal = subtotals['labour'] || 0
  const transportTotal = subtotals['transport'] || 0
  const grandTotal = materialsTotal + labourTotal + transportTotal

  drawGreenBar(doc, currentY)
  doc.setFont('DejaVuSansCondensed', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(255, 255, 255)
  doc.text('COST SUMMARY', PAGE_MARGIN + 2, currentY + 5.5)
  doc.setTextColor(0, 0, 0)
  currentY += 12

  const summaryLabelX = pageWidth - PAGE_MARGIN - 70
  const summaryValueX = pageWidth - PAGE_MARGIN
  const summaryRowH = 6

  doc.setFont('DejaVuSansCondensed', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(38, 38, 38)

  doc.text('Materials', summaryLabelX, currentY + 4, { align: 'right' })
  doc.text(
    `$${materialsTotal.toFixed(2)}`,
    summaryValueX,
    currentY + 4,
    { align: 'right' }
  )
  currentY += summaryRowH

  doc.text('Labour', summaryLabelX, currentY + 4, { align: 'right' })
  doc.text(
    `$${labourTotal.toFixed(2)}`,
    summaryValueX,
    currentY + 4,
    { align: 'right' }
  )
  currentY += summaryRowH

  doc.text('Transport', summaryLabelX, currentY + 4, { align: 'right' })
  doc.text(
    `$${transportTotal.toFixed(2)}`,
    summaryValueX,
    currentY + 4,
    { align: 'right' }
  )
  currentY += summaryRowH

  // Divider line
  doc.setDrawColor(180, 180, 180)
  doc.setLineWidth(0.3)
  doc.line(summaryLabelX - 5, currentY, summaryValueX, currentY)
  currentY += 3

  doc.setFont('DejaVuSansCondensed', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(0, 0, 0)
  doc.text('GRAND TOTAL', summaryLabelX, currentY + 4, { align: 'right' })
  doc.setFontSize(14)
  doc.setTextColor(...PRIMARY_COLOR)
  doc.text(
    `$${grandTotal.toFixed(2)}`,
    summaryValueX,
    currentY + 4,
    { align: 'right' }
  )
  currentY += summaryRowH + 4

  // Paid and balance if payments exist
  if (jobCard.paidAmount > 0) {
    doc.setFontSize(9)
    doc.setTextColor(38, 38, 38)
    doc.setFont('DejaVuSansCondensed', 'normal')
    doc.text('Less Paid', summaryLabelX, currentY + 4, { align: 'right' })
    doc.text(
      `($${jobCard.paidAmount.toFixed(2)})`,
      summaryValueX,
      currentY + 4,
      { align: 'right' }
    )
    currentY += summaryRowH

    doc.setFont('DejaVuSansCondensed', 'bold')
    doc.setTextColor(0, 0, 0)
    doc.text('BALANCE DUE', summaryLabelX, currentY + 4, { align: 'right' })
    doc.text(
      `$${jobCard.balance.toFixed(2)}`,
      summaryValueX,
      currentY + 4,
      { align: 'right' }
    )
    currentY += summaryRowH + 2
  }

  // Amount in words
  currentY += 4
  doc.setFont('DejaVuSansCondensed', 'italic')
  doc.setFontSize(8)
  doc.setTextColor(80, 80, 80)
  const amountWords = numberToWords(grandTotal)
  doc.text(
    `Amount in words: ${amountWords}`,
    PAGE_MARGIN,
    currentY
  )
  currentY += 10

  // ── Signature Block ────────────────────────────────────────────────────────
  const signerName =
    companySettings?.managerName || 'Authorized Signatory'
  await drawFooter(
    doc,
    currentY,
    companySettings,
    financeSettings,
    signerName,
    {
      skipPaymentBox: true,
      skipTerms: false,
      signatureUrl: companySettings?.managerSignatureUrl,
      position: companySettings?.managerPosition || 'Manager',
      skipSeal: false,
    }
  )

  // ── Watermark ──────────────────────────────────────────────────────────────
  if (sealImg) {
    drawWatermarkOnAllPages(doc, sealImg)
  }

  const safeClientName = (jobCard.clientName || 'Client')
    .replace(/[^a-z0-9]/gi, '_')
    .substring(0, 30)
  doc.save(`AGF_Quote_${jobCard.jobNumber}_${safeClientName}.pdf`)
}
