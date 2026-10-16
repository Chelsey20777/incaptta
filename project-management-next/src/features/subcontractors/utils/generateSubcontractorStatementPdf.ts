/* eslint-disable @typescript-eslint/no-explicit-any */
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import {
  setupFonts,
  setupDoc,
  removeWhiteBackground,
  PAGE_MARGIN,
  type CompanySettingsLike,
} from '@/features/jobCards/utils/pdfBranding'
import type { Subcontractor, SubcontractorTransaction } from '@/features/subcontractors/types'
import type { GeneratedDownload } from '@/lib/browser-download'

const ORANGE: [number, number, number] = [255, 137, 3]
const DARK: [number, number, number] = [30, 30, 30]
const MUTED: [number, number, number] = [100, 100, 100]

function fmtDate(val: any): string {
  if (!val) return '—'
  if (val?.toDate) return val.toDate().toLocaleDateString('en-GB')
  if (typeof val === 'string') {
    const parsed = new Date(val)
    return Number.isNaN(parsed.getTime()) ? '—' : parsed.toLocaleDateString('en-GB')
  }
  if (val instanceof Date) return val.toLocaleDateString('en-GB')
  return '—'
}

function fmtMoney(n: number): string {
  return `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmtGeneratedAt(d: Date): string {
  const date = d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
  const time = d.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
  return `${date} at ${time}`
}

async function loadCompanyLogo(
  companySettings?: CompanySettingsLike
): Promise<{ img: HTMLImageElement; width: number; height: number } | null> {
  const logoDataUrl = (companySettings as any)?.logoDataUrl
  const logoUrl = companySettings?.logoUrl
  if (!logoDataUrl && !logoUrl) return null

  const maxW = Number(companySettings?.pdfLogoMaxWidthMm) || 46
  const maxH = Number(companySettings?.pdfLogoMaxHeightMm) || 24

  try {
    const src = logoDataUrl ?? (await removeWhiteBackground(logoUrl as string))
    return await new Promise((resolve) => {
      const img = new Image()
      const timeout = window.setTimeout(() => resolve(null), 5_000)
      if (!logoDataUrl) img.crossOrigin = 'anonymous'
      img.src = src
      img.onload = () => {
        window.clearTimeout(timeout)
        const aspect = img.width / Math.max(img.height, 1)
        let width = maxW
        let height = width / aspect
        if (height > maxH) {
          height = maxH
          width = height * aspect
        }
        resolve({ img, width, height })
      }
      img.onerror = () => {
        window.clearTimeout(timeout)
        resolve(null)
      }
    })
  } catch {
    return null
  }
}

function drawPageFooters(doc: jsPDF, generatedAt: Date, companyName: string) {
  const pageCount = doc.getNumberOfPages()
  const pageWidth = doc.internal.pageSize.width
  const pageHeight = doc.internal.pageSize.height

  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.setDrawColor(...ORANGE)
    doc.setLineWidth(0.3)
    doc.line(PAGE_MARGIN, pageHeight - 14, pageWidth - PAGE_MARGIN, pageHeight - 14)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(...MUTED)
    doc.text(companyName, PAGE_MARGIN, pageHeight - 9)
    doc.text(
      `Generated ${fmtGeneratedAt(generatedAt)}`,
      pageWidth / 2,
      pageHeight - 9,
      { align: 'center' }
    )
    doc.text(`Page ${i} of ${pageCount}`, pageWidth - PAGE_MARGIN, pageHeight - 9, {
      align: 'right',
    })
  }
}

export async function generateSubcontractorStatementPdf(
  subcontractor: Subcontractor,
  transactions: SubcontractorTransaction[],
  companySettings?: CompanySettingsLike
): Promise<GeneratedDownload> {
  const doc = new jsPDF()
  await setupFonts(doc)
  setupDoc(doc)

  const generatedAt = new Date()
  const pageWidth = doc.internal.pageSize.width
  const centerX = pageWidth / 2
  const companyName = companySettings?.companyName || 'Incaptta'
  let y = 14

  // ── Company logo ──────────────────────────────────────────────────────────
  const logo = await loadCompanyLogo(companySettings)
  if (logo) {
    try {
      doc.addImage(
        logo.img,
        'PNG',
        centerX - logo.width / 2,
        y,
        logo.width,
        logo.height
      )
      y += logo.height + 6
    } catch {
      y += 4
    }
  }

  // ── Title block ───────────────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.setTextColor(...ORANGE)
  doc.text('SUBCONTRACTOR STATEMENT', centerX, y, { align: 'center' })
  y += 6

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(...DARK)
  doc.text(companyName, centerX, y, { align: 'center' })
  y += 5

  doc.setFontSize(8)
  doc.setTextColor(...MUTED)
  doc.text(`Generated: ${fmtGeneratedAt(generatedAt)}`, centerX, y, { align: 'center' })
  y += 4

  if (companySettings?.address || companySettings?.phone || companySettings?.email) {
    const contactBits = [
      companySettings.address,
      companySettings.phone || companySettings.phone1,
      companySettings.email,
    ].filter(Boolean)
    if (contactBits.length) {
      doc.setFontSize(7)
      doc.text(contactBits.join('  ·  '), centerX, y, { align: 'center' })
      y += 4
    }
  }

  doc.setDrawColor(...ORANGE)
  doc.setLineWidth(0.5)
  doc.line(PAGE_MARGIN, y, pageWidth - PAGE_MARGIN, y)
  y += 8

  // ── Party details ─────────────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(...DARK)
  doc.text(subcontractor.name || 'Subcontractor', PAGE_MARGIN, y)
  y += 5

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...MUTED)
  if (subcontractor.trade) {
    doc.text(`Trade: ${subcontractor.trade}`, PAGE_MARGIN, y)
    y += 4
  }
  if (subcontractor.contactPerson) {
    doc.text(`Contact: ${subcontractor.contactPerson}`, PAGE_MARGIN, y)
    y += 4
  }
  if (subcontractor.phone) {
    doc.text(`Phone: ${subcontractor.phone}`, PAGE_MARGIN, y)
    y += 4
  }
  if (subcontractor.email) {
    doc.text(`Email: ${subcontractor.email}`, PAGE_MARGIN, y)
    y += 4
  }
  y += 4

  // ── Transaction rows ──────────────────────────────────────────────────────
  const active = (transactions || []).filter((t) => !t.voided)
  const chronological = [...active].sort((a, b) => {
    const ta =
      a.createdAt && typeof a.createdAt !== 'string' && 'toMillis' in (a.createdAt as any)
        ? (a.createdAt as any).toMillis()
        : new Date(String(a.createdAt || 0)).getTime()
    const tb =
      b.createdAt && typeof b.createdAt !== 'string' && 'toMillis' in (b.createdAt as any)
        ? (b.createdAt as any).toMillis()
        : new Date(String(b.createdAt || 0)).getTime()
    return ta - tb
  })

  let running = 0
  let charges = 0
  let payments = 0
  const rows = chronological.map((tx) => {
    const amt = Number(tx.amount) || 0
    let debit = ''
    let credit = ''
    if (tx.type === 'CHARGE' || tx.type === 'ADJUSTMENT') {
      running += amt
      if (tx.type === 'CHARGE') charges += amt
      debit = fmtMoney(amt)
    } else {
      running -= amt
      payments += amt
      credit = fmtMoney(amt)
    }
    const jobOrContract = [tx.contractNumber, tx.jobCardNumber].filter(Boolean).join(' / ')
    return [
      fmtDate(tx.createdAt),
      tx.type,
      tx.description || '',
      jobOrContract,
      debit,
      credit,
      fmtMoney(running),
    ]
  })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...DARK)
  doc.text(`Total Charges: ${fmtMoney(charges)}`, PAGE_MARGIN, y)
  doc.text(`Total Payments: ${fmtMoney(payments)}`, pageWidth / 2, y)
  y += 5
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(...ORANGE)
  doc.text(`Balance Owed: ${fmtMoney(charges - payments)}`, PAGE_MARGIN, y)
  y += 7

  autoTable(doc, {
    startY: y,
    head: [['Date', 'Type', 'Description', 'Ref', 'Charge', 'Payment', 'Balance']],
    body: rows.length > 0 ? rows : [['—', '—', 'No transactions', '', '', '', '']],
    styles: { fontSize: 8, cellPadding: 1.5, textColor: DARK },
    headStyles: { fillColor: ORANGE, textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [252, 252, 252] },
    columnStyles: {
      4: { halign: 'right' },
      5: { halign: 'right' },
      6: { halign: 'right', fontStyle: 'bold' },
    },
    margin: { left: PAGE_MARGIN, right: PAGE_MARGIN, bottom: 20 },
  })

  // Simple page footers — no signature / seal block
  drawPageFooters(doc, generatedAt, companyName)

  return {
    blob: doc.output('blob'),
    filename: `Subcontractor-Statement-${(subcontractor.name || 'party').replace(/\s+/g, '-')}.pdf`,
  }
}
