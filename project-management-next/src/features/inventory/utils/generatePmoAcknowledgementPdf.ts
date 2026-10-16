import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { formatDate } from '@/lib/utils'
import { BRAND_CONFIG } from '@/config/branding'
import { PAGE_MARGIN, setupFonts, type CompanySettingsLike } from '@/features/jobCards/utils/pdfBranding'

export interface PmoAcknowledgementPdfItem {
  itemName: string
  issuedQty: number
  damagedQty?: number
  fulfilmentState?: string
}

export interface PmoAcknowledgementPdfInput {
  jobNumber: string
  destination?: string
  recipient?: string
  itemName?: string
  issuedQty?: number
  damagedQty?: number
  fulfilmentState?: string
  items?: PmoAcknowledgementPdfItem[]
  dispatchId?: string | null
  sessionId?: string | null
  releasedBy: string
  releasedAt?: string
  acknowledgedBy?: string | null
  acknowledgedAt?: string | null
}

const PMO_SEAL_PATH = '/pmo-stock-release-seal.png'
const PMO_LOGO_PATH = '/pmo-lithott-akker-logo.png'
const INCAPTTA_LOGO_PATH = '/pmo-incaptta-logo.png'
const ORANGE: [number, number, number] = [251, 130, 35]
const INK: [number, number, number] = [38, 38, 38]
const FOOTER_SPACE = 36

function safeFilePart(value: string) {
  return String(value || 'item').replace(/[^A-Za-z0-9_-]+/g, '_').slice(0, 40)
}

function loadImage(path: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    if (typeof Image === 'undefined') return resolve(null)
    const img = new Image()
    const timeout = setTimeout(() => resolve(null), 5000)
    img.onload = () => { clearTimeout(timeout); resolve(img) }
    img.onerror = () => { clearTimeout(timeout); resolve(null) }
    img.src = path
  })
}

// Ignore transparent padding while retaining the original bundled artwork.
function logoArtwork(img: HTMLImageElement): HTMLCanvasElement | HTMLImageElement {
  try {
    const canvas = document.createElement('canvas')
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return img
    ctx.drawImage(img, 0, 0)
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)
    let left = canvas.width, top = canvas.height, right = -1, bottom = -1
    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width; x++) {
        if (data[(y * canvas.width + x) * 4 + 3] > 0) {
          left = Math.min(left, x); right = Math.max(right, x)
          top = Math.min(top, y); bottom = Math.max(bottom, y)
        }
      }
    }
    if (right < left) return img
    canvas.width = right - left + 1
    canvas.height = bottom - top + 1
    ctx.drawImage(img, -left, -top)
    return canvas
  } catch { return img }
}

export async function generatePmoAcknowledgementPdf(
  input: PmoAcknowledgementPdfInput,
  companySettings?: CompanySettingsLike,
) {
  const doc = new jsPDF()
  await setupFonts(doc)
  const [logoImg, sealImg, incapttaImg] = await Promise.all([loadImage(PMO_LOGO_PATH), loadImage(PMO_SEAL_PATH), loadImage(INCAPTTA_LOGO_PATH)])
  const incapttaLogo = incapttaImg ? logoArtwork(incapttaImg) : null
  const logo = logoImg ? logoArtwork(logoImg) : null
  const pageWidth = doc.internal.pageSize.width
  const pageHeight = doc.internal.pageSize.height
  const contentWidth = pageWidth - PAGE_MARGIN * 2
  const companyName = String(companySettings?.companyName || BRAND_CONFIG.name || 'Incaptta').toUpperCase()
  const address = String(companySettings?.address || BRAND_CONFIG.defaultAddress || '')
  const phone = String(companySettings?.phone || companySettings?.phone1 || BRAND_CONFIG.defaultPhone || '')
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
    if (sealImg) {
      doc.saveGraphicsState()
      try {
        doc.setGState(doc.GState({ opacity: 0.07 }))
        doc.addImage(sealImg, 'PNG', (pageWidth - 110) / 2, (pageHeight - 110) / 2, 110, 110)
      } catch { /* Branding failure must not prevent download. */ }
      finally { doc.restoreGraphicsState() }
    }
    if (logo) {
      try {
        const scale = Math.min(40 / logo.width, 30 / logo.height)
        doc.addImage(logo, 'PNG', PAGE_MARGIN, 14, logo.width * scale, logo.height * scale)
      } catch { /* Keep company details even without the logo. */ }
    }
    if (incapttaLogo) {
      try {
        const scale = Math.min(40 / incapttaLogo.width, 30 / incapttaLogo.height)
        const height = incapttaLogo.height * scale
        doc.addImage(incapttaLogo, 'PNG', pageWidth - PAGE_MARGIN - 40, 14 + (30 - height) / 2, incapttaLogo.width * scale, height)
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
    doc.text('Stock release acknowledgement', PAGE_MARGIN, headerBottom + 10)
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

  const releasedAt = input.releasedAt ? formatDate(input.releasedAt) : formatDate(new Date().toISOString())
  const meta = [
    ['Job', input.jobNumber || '—'],
    ['Destination', input.destination || '—'],
    ['Recipient', input.recipient || '—'],
    ['Released by', input.releasedBy || '—'],
    ['Released on', releasedAt],
    ['Session ID', input.sessionId || input.dispatchId || '—'],
  ]

  autoTable(doc, {
    startY: contentTop,
    margin: margins,
    theme: 'plain',
    rowPageBreak: 'avoid',
    styles: { font: 'DejaVuSansCondensed', fontSize: 9, cellPadding: 1.2 },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 32, textColor: [90, 90, 90] },
      1: { textColor: [38, 38, 38] },
    },
    body: meta,
  })

  const items = (input.items && input.items.length > 0)
    ? input.items
    : [{
        itemName: input.itemName || 'Inventory item',
        issuedQty: Number(input.issuedQty ?? 0),
        fulfilmentState: input.fulfilmentState || 'ISSUED',
      }]

  autoTable(doc, {
    startY: (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8,
    head: [['Item', 'Released qty', 'State']],
    body: items.map(item => [
      item.itemName || 'Inventory item',
      String(item.issuedQty ?? 0),
      item.fulfilmentState || 'ISSUED',
    ]),
    margin: margins,
    rowPageBreak: 'avoid',
    showHead: 'everyPage',
    columnStyles: { 0: { cellWidth: 110 }, 1: { halign: 'right', cellWidth: 32 }, 2: { cellWidth: 36 } },
    theme: 'grid',
    bodyStyles: { fillColor: false },
    headStyles: { fillColor: INK, textColor: [255, 255, 255], font: 'DejaVuSansCondensed' },
    styles: { font: 'DejaVuSansCondensed', fontSize: 9, cellPadding: 3, textColor: INK, overflow: 'linebreak', lineColor: [205, 205, 205], lineWidth: 0.2 },
  })

  doc.setFont('DejaVuSansCondensed', 'normal')
  doc.setFontSize(9)
  const note = doc.splitTextToSize('This document confirms physical issue of reserved materials. It is not an invoice and contains no prices or margins.', contentWidth) as string[]
  const acknowledgement = input.acknowledgedAt
    ? [`By: ${input.acknowledgedBy || '—'}`, `At: ${formatDate(input.acknowledgedAt)}`]
    : ['Recipient acknowledgement is pending.']
  const authorityTextWidth = 58
  const ackLines = acknowledgement.flatMap(line => doc.splitTextToSize(line, authorityTextWidth) as string[])
  const authorityHeight = Math.max(ackLines.length * 5, 24)
  const blockHeight = note.length * 5 + 8 + (input.acknowledgedAt ? 6 : 0) + authorityHeight + 17
  let y = doc.lastAutoTable.finalY + 10
  if (y + blockHeight > pageHeight - FOOTER_SPACE) {
    doc.addPage()
    y = contentTop
  }
  doc.setFont('DejaVuSansCondensed', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...INK)
  doc.text(note, PAGE_MARGIN, y, { lineHeightFactor: 1.5 })
  y += note.length * 5 + 8
  if (input.acknowledgedAt) {
    doc.setFont('DejaVuSansCondensed', 'bold')
    doc.text('Stock Release Authority (SRA)', PAGE_MARGIN, y)
    y += 6
  }
  doc.setFont('DejaVuSansCondensed', 'normal')
  doc.text(ackLines, PAGE_MARGIN, y, { lineHeightFactor: 1.5 })
  if (sealImg) {
    try {
      doc.addImage(sealImg, 'PNG', PAGE_MARGIN + authorityTextWidth + 4, y - 3, 24, 24)
    } catch { /* Keep authority details even if the seal cannot be drawn. */ }
  }
  y += authorityHeight + 12
  const lineWidth = 70
  doc.setDrawColor(150, 150, 150)
  doc.setLineWidth(0.25)
  doc.line(PAGE_MARGIN, y, PAGE_MARGIN + lineWidth, y)
  doc.line(pageWidth - PAGE_MARGIN - lineWidth, y, pageWidth - PAGE_MARGIN, y)
  doc.setFontSize(8)
  doc.setTextColor(90, 90, 90)
  doc.text('PMO signature', PAGE_MARGIN, y + 5)
  doc.text('Recipient signature', pageWidth - PAGE_MARGIN - lineWidth, y + 5)

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

  const filename = `PMO_Ack_${safeFilePart(input.jobNumber)}_${safeFilePart(input.sessionId || input.dispatchId || items[0]?.itemName || 'session')}.pdf`
  doc.save(filename)
}
