import { readFileSync } from 'node:fs'
import path from 'node:path'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { BRAND_CONFIG } from '../../config/branding'
import { DEJAVU_BOLD, DEJAVU_REGULAR } from '../../features/jobCards/utils/fonts'
import { formatIssuedAtCat, receiptEntryPdfFilename, type PostedReceiptEmailInput } from './pmo-acknowledgement-email'

const PAGE_MARGIN = 14

async function setupFonts(doc: jsPDF) {
  try {
    doc.addFileToVFS('DejaVuSansCondensed.ttf', DEJAVU_REGULAR)
    doc.addFont('DejaVuSansCondensed.ttf', 'DejaVuSansCondensed', 'normal')
    if (DEJAVU_BOLD) {
      doc.addFileToVFS('DejaVuSansCondensed-Bold.ttf', DEJAVU_BOLD)
      doc.addFont('DejaVuSansCondensed-Bold.ttf', 'DejaVuSansCondensed', 'bold')
    }
    doc.setFont('DejaVuSansCondensed', 'normal')
  } catch {
    doc.setFont('helvetica', 'normal')
  }
}

const ORANGE: [number, number, number] = [251, 130, 35]
const INK: [number, number, number] = [38, 38, 38]
const FOOTER_SPACE = 36

function pngSize(buf: Buffer) {
  if (buf.length < 24) return { width: 1, height: 1 }
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
}

function loadPng(filename: string) {
  try {
    const buf = readFileSync(path.join(process.cwd(), 'public', filename))
    return {
      dataUrl: `data:image/png;base64,${buf.toString('base64')}`,
      ...pngSize(buf),
    }
  } catch {
    return null
  }
}

export async function buildPmoReceiptEntryPdf(input: PostedReceiptEmailInput) {
  const doc = new jsPDF()
  await setupFonts(doc)
  const logo = loadPng('pmo-lithott-akker-logo.png')
  const seal = loadPng('pmo-stock-release-seal.png')
  const incaptta = loadPng('pmo-incaptta-logo.png')
  const pageWidth = doc.internal.pageSize.width
  const pageHeight = doc.internal.pageSize.height
  const contentWidth = pageWidth - PAGE_MARGIN * 2
  const companyName = String(BRAND_CONFIG.name || 'Incaptta').toUpperCase()
  const address = String(BRAND_CONFIG.defaultAddress || '')
  const phone = String(BRAND_CONFIG.defaultPhone || '')
  const companyWidth = contentWidth - 96
  const companyCenterX = pageWidth / 2
  doc.setFont('DejaVuSansCondensed', 'bold')
  doc.setFontSize(11)
  const companyLines = doc.splitTextToSize(companyName, companyWidth) as string[]
  doc.setFont('DejaVuSansCondensed', 'normal')
  doc.setFontSize(8)
  const contactLines = doc.splitTextToSize([address, phone].filter(Boolean).join('\n'), companyWidth) as string[]
  const headerBottom = Math.max(46, 18 + companyLines.length * 5 + contactLines.length * 4)
  const contentTop = headerBottom + 24

  const drawPage = () => {
    if (seal) {
      doc.saveGraphicsState()
      try {
        doc.setGState(doc.GState({ opacity: 0.07 }))
        doc.addImage(seal.dataUrl, 'PNG', (pageWidth - 110) / 2, (pageHeight - 110) / 2, 110, 110)
      } catch { /* Branding failure must not prevent the document. */ }
      finally { doc.restoreGraphicsState() }
    }
    if (logo && logo.width > 0 && logo.height > 0) {
      try {
        const scale = Math.min(40 / logo.width, 30 / logo.height)
        doc.addImage(logo.dataUrl, 'PNG', PAGE_MARGIN, 14, logo.width * scale, logo.height * scale)
      } catch { /* Keep company details even without the logo. */ }
    }
    if (incaptta && incaptta.width > 0 && incaptta.height > 0) {
      try {
        const scale = Math.min(40 / incaptta.width, 30 / incaptta.height)
        const height = incaptta.height * scale
        doc.addImage(incaptta.dataUrl, 'PNG', pageWidth - PAGE_MARGIN - 40, 14 + (30 - height) / 2, incaptta.width * scale, height)
      } catch { /* Keep the PDF usable if the second logo cannot be drawn. */ }
    }
    doc.setFont('DejaVuSansCondensed', 'bold')
    doc.setFontSize(11)
    doc.setTextColor(...INK)
    doc.text(companyLines, companyCenterX, 18, { align: 'center', lineHeightFactor: 1.3 })
    doc.setFont('DejaVuSansCondensed', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(90, 90, 90)
    doc.text(contactLines, companyCenterX, 18 + companyLines.length * 5, { align: 'center', lineHeightFactor: 1.4 })
    doc.setDrawColor(...ORANGE)
    doc.setLineWidth(0.7)
    doc.line(PAGE_MARGIN, headerBottom, pageWidth - PAGE_MARGIN, headerBottom)
    doc.setFont('DejaVuSansCondensed', 'bold')
    doc.setFontSize(17)
    doc.setTextColor(...INK)
    doc.text('New inventory entry', PAGE_MARGIN, headerBottom + 10)
    doc.setFont('DejaVuSansCondensed', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(90, 90, 90)
    doc.text('Property Manager Officer', PAGE_MARGIN, headerBottom + 16)
  }

  const addPage = doc.addPage.bind(doc)
  doc.addPage = (...args: Parameters<typeof doc.addPage>) => {
    addPage(...args)
    drawPage()
    return doc
  }
  drawPage()
  const margins = { top: contentTop, bottom: FOOTER_SPACE, left: PAGE_MARGIN, right: PAGE_MARGIN }
  const unit = input.uom?.trim()
  const quantity = unit ? `${input.quantity} ${unit}` : String(input.quantity)

  autoTable(doc, {
    startY: contentTop,
    margin: margins,
    theme: 'plain',
    rowPageBreak: 'avoid',
    styles: { font: 'DejaVuSansCondensed', fontSize: 9, cellPadding: 1.2 },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 36, textColor: [90, 90, 90] },
      1: { textColor: [38, 38, 38] },
    },
    body: [
      ['Reference', input.reference.trim() || '—'],
      ['Note', input.note?.trim() || '—'],
      ['Submitted by', input.submittedBy.trim() || '—'],
      ['PMO approved by', input.pmoApprovedBy.trim() || '—'],
      ['Approved by', input.approvedBy.trim() || '—'],
      ['Approved at', formatIssuedAtCat(input.approvedAt)],
    ],
  })

  autoTable(doc, {
    startY: (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8,
    head: [['SKU', 'Product', 'Unit', 'Received', 'Stock before', 'Stock after']],
    body: [[
      input.sku?.trim() || '—',
      input.itemName.trim() || 'Inventory item',
      unit || '—',
      quantity,
      String(input.qtyBefore),
      String(input.qtyAfter),
    ]],
    margin: margins,
    rowPageBreak: 'avoid',
    theme: 'grid',
    bodyStyles: { fillColor: false },
    headStyles: { fillColor: INK, textColor: [255, 255, 255], font: 'DejaVuSansCondensed' },
    styles: { font: 'DejaVuSansCondensed', fontSize: 8, cellPadding: 2.4, textColor: INK, overflow: 'linebreak', lineColor: [205, 205, 205], lineWidth: 0.2 },
  })

  doc.setFont('DejaVuSansCondensed', 'normal')
  doc.setFontSize(9)
  const note = doc.splitTextToSize('This document confirms goods received into the warehouse. It is not an invoice and contains no prices.', contentWidth) as string[]
  let y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10
  if (y + note.length * 5 + 40 > pageHeight - FOOTER_SPACE) {
    doc.addPage()
    y = contentTop
  }
  doc.setTextColor(...INK)
  doc.text(note, PAGE_MARGIN, y, { lineHeightFactor: 1.5 })
  y += note.length * 5 + 16
  const lineWidth = 70
  doc.setDrawColor(150, 150, 150)
  doc.setLineWidth(0.25)
  doc.line(PAGE_MARGIN, y, PAGE_MARGIN + lineWidth, y)
  doc.line(pageWidth - PAGE_MARGIN - lineWidth, y, pageWidth - PAGE_MARGIN, y)
  doc.setFontSize(8)
  doc.setTextColor(90, 90, 90)
  doc.text('PMO signature', PAGE_MARGIN, y + 5)
  doc.text('Approver signature', pageWidth - PAGE_MARGIN - lineWidth, y + 5)

  const pageCount = doc.getNumberOfPages()
  for (let page = 1; page <= pageCount; page++) {
    doc.setPage(page)
    doc.setDrawColor(220, 220, 220)
    doc.setLineWidth(0.2)
    doc.line(PAGE_MARGIN, pageHeight - FOOTER_SPACE + 3, pageWidth - PAGE_MARGIN, pageHeight - FOOTER_SPACE + 3)
    doc.setFont('DejaVuSansCondensed', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(90, 90, 90)
    doc.text(`Page ${page} of ${pageCount}`, PAGE_MARGIN, pageHeight - 12)
  }

  const filename = receiptEntryPdfFilename(input.reference)
  const bytes = doc.output('arraybuffer')
  return { filename, content: Buffer.from(bytes).toString('base64') }
}
