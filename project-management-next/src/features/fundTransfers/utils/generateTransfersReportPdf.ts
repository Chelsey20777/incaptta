import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import {
  setupFonts,
  setupDoc,
  getSealImage,
  drawWatermarkOnAllPages,
  removeWhiteBackground,
  toFormattedDate,
  PAGE_MARGIN,
  type CompanySettingsLike,
} from '@/features/jobCards/utils/pdfBranding'

const ORANGE: [number, number, number] = [249, 115, 22]
const DARK: [number, number, number] = [38, 38, 38]
const LIGHT: [number, number, number] = [250, 250, 250]

const fmt = (n: number) =>
  Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export const generateTransfersReportPdf = async (
  transfers: any[],
  companySettings?: CompanySettingsLike,
  generatedBy?: string
) => {
  const doc = new jsPDF({ orientation: 'landscape' })
  await setupFonts(doc)
  setupDoc(doc)

  const sealImg = await getSealImage(companySettings)
  const pageW = doc.internal.pageSize.width
  const PAGE_CENTER = pageW / 2
  let y = 15

  const logoDataUrl = (companySettings as any)?.logoDataUrl
  const logoUrl = companySettings?.logoUrl
  let logoImgEl: HTMLImageElement | null = null
  let logoH = 22
  let logoW = 44

  if (logoDataUrl || logoUrl) {
    try {
      const src = logoDataUrl ?? (await removeWhiteBackground(logoUrl as string))
      await new Promise<void>((resolve) => {
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
    } catch {
      /* skip */
    }
  }

  if (logoImgEl) {
    doc.addImage(logoImgEl, 'PNG', PAGE_CENTER - logoW / 2, y, logoW, logoH)
    y += logoH + 8
  } else {
    y += 18
  }

  doc.setFont('DejaVuSansCondensed', 'bold')
  doc.setFontSize(16)
  doc.setTextColor(...ORANGE)
  doc.text('FUND TRANSFERS REPORT', PAGE_CENTER, y, { align: 'center' })
  y += 6

  doc.setFont('DejaVuSansCondensed', 'normal')
  doc.setFontSize(7)
  doc.setTextColor(120, 120, 120)
  doc.text(
    `Generated: ${new Date().toLocaleDateString()}  |  By: ${generatedBy || 'System'}`,
    PAGE_CENTER,
    y,
    { align: 'center' }
  )
  y += 6

  doc.setDrawColor(...ORANGE)
  doc.setLineWidth(0.5)
  doc.line(PAGE_MARGIN, y, pageW - PAGE_MARGIN, y)
  y += 8

  const total = transfers.reduce((s, t) => s + (Number(t.amount) || 0), 0)
  autoTable(doc, {
    startY: y,
    body: [['Total Transfers', String(transfers.length), 'Total Amount', `$${fmt(total)}`]],
    theme: 'grid',
    styles: { font: 'DejaVuSansCondensed', fontSize: 8, cellPadding: 3 },
    columnStyles: {
      0: { fontStyle: 'bold', fillColor: LIGHT },
      1: { halign: 'center', fontStyle: 'bold' },
      2: { fontStyle: 'bold', fillColor: LIGHT },
      3: { halign: 'right', fontStyle: 'bold', textColor: DARK },
    },
    margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
  })

  // @ts-ignore
  y = doc.lastAutoTable.finalY + 8

  autoTable(doc, {
    startY: y,
    head: [['#', 'Date', 'From', 'To', 'Amount', 'Status', 'Reference', 'Description', 'Initiated By']],
    body: transfers.map((t, i) => [
      String(i + 1),
      t.date || toFormattedDate(t.createdAt || new Date()),
      t.fromAccount || '—',
      t.toAccount || '—',
      `$${fmt(t.amount || 0)}`,
      t.status || 'PENDING_ACCOUNTANT',
      t.reference || '—',
      t.description || '—',
      t.initiatedByName || t.createdByName || t.initiatedByEmail || '—',
    ]),
    theme: 'striped',
    styles: {
      font: 'DejaVuSansCondensed',
      fontSize: 7,
      cellPadding: 2,
      overflow: 'ellipsize',
    },
    headStyles: {
      fillColor: ORANGE,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 7.5,
    },
    columnStyles: {
      0: { cellWidth: 8, halign: 'center' },
      4: { halign: 'right', fontStyle: 'bold' },
    },
    margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
  })

  if (sealImg) drawWatermarkOnAllPages(doc, sealImg)
  doc.save(`Transfers_Report_${new Date().toISOString().slice(0, 10)}.pdf`)
}
