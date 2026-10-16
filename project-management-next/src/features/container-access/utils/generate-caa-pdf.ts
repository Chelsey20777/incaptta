import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import QRCode from 'qrcode'
import {
  setupDoc,
  setupFonts,
  drawGreenBar,
  drawFooter,
  drawWatermarkOnAllPages,
  getSealImage,
  removeWhiteBackground,
  PRIMARY_COLOR,
  PAGE_MARGIN,
  toFormattedDate,
  type CompanySettingsLike,
  type FinanceSettingsLike,
} from '@/features/jobCards/utils/pdfBranding'
import type { ContainerAccessRequest } from '../types'

declare module 'jspdf' {
  interface jsPDF {
    lastAutoTable: {
      finalY: number
    }
  }
}

const LABEL_FILL: [number, number, number] = [220, 220, 220]
const CELL_PAD = { top: 2, right: 3, bottom: 2, left: 3 }

export async function generateCaaPdf(
  request: ContainerAccessRequest,
  companySettings?: CompanySettingsLike,
  financeSettings?: FinanceSettingsLike
): Promise<void> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageWidth = doc.internal.pageSize.width

  await setupFonts(doc)
  setupDoc(doc)

  const sealImg = await getSealImage(companySettings)

  // ── Centered logo header ──────────────────────────────────────────────────
  let currentY = 12
  const PAGE_CENTER = pageWidth / 2
  let logoWidth = 50
  let logoHeight = 25
  let logoImgElement: HTMLImageElement | null = null

  const logoDataUrl = (companySettings as any)?.logoDataUrl
  const logoUrl = companySettings?.logoUrl
  if (logoDataUrl || logoUrl) {
    try {
      const src = logoDataUrl ?? (await removeWhiteBackground(logoUrl as string))
      await new Promise<void>((resolve) => {
        const img = new Image()
        if (!logoDataUrl) img.crossOrigin = 'anonymous'
        img.src = src
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

  // ── Document title ────────────────────────────────────────────────────────
  doc.setFont('DejaVuSansCondensed', 'bold')
  doc.setFontSize(13)
  doc.setTextColor(...PRIMARY_COLOR)
  doc.text('CONTAINER ACCESS AUTHORIZATION DOCUMENT', PAGE_CENTER, currentY, {
    align: 'center',
  })
  currentY += 5

  // Thin green underline
  doc.setDrawColor(...PRIMARY_COLOR)
  doc.setLineWidth(0.6)
  doc.line(PAGE_MARGIN, currentY, pageWidth - PAGE_MARGIN, currentY)
  currentY += 8

  doc.setTextColor(0, 0, 0)

  // ── Request metadata table ────────────────────────────────────────────────
  const labelW = 35
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
        'Request Number',
        request.requestNumber,
        'Date Issued',
        toFormattedDate(request.requestedAt),
      ],
      [
        'Requestor Name',
        request.requestedByName,
        'Role',
        request.requestedByRole,
      ],
      [
        'Container Name',
        request.containerName,
        'Container Location',
        request.containerLocation,
      ],
      [
        'Access Date',
        request.accessDate,
        'Time Window',
        `${request.accessTimeFrom} – ${request.accessTimeTo}`,
      ],
      ...(request.jobCardRef
        ? [
            [
              'Job Card Ref',
              request.jobCardRef.jobNumber,
              'Client',
              request.jobCardRef.clientName,
            ],
            [
              'Client Location',
              request.jobCardRef.location || '',
              '',
              '',
            ],
          ]
        : []),
    ],
    margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
  })

  // @ts-ignore
  currentY = doc.lastAutoTable.finalY

  // Purpose of access — full-width row
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
      1: { cellWidth: 'auto' },
    },
    body: [['Purpose of Access', request.purposeOfAccess]],
    margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
  })

  // @ts-ignore
  currentY = doc.lastAutoTable.finalY + 8

  // ── Approval details (APPROVED only) ──────────────────────────────────────
  if (request.status === 'APPROVED') {
    drawGreenBar(doc, currentY)
    doc.setFont('DejaVuSansCondensed', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(255, 255, 255)
    doc.text('APPROVAL DETAILS', PAGE_MARGIN + 2, currentY + 5.5)
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
        0: { cellWidth: labelW, fontStyle: 'bold', fillColor: LABEL_FILL },
        1: { cellWidth: valueW },
        2: { cellWidth: labelW, fontStyle: 'bold', fillColor: LABEL_FILL },
        3: { cellWidth: valueW },
      },
      body: [
        [
          'Approved By',
          request.approvedByName || '—',
          'Approved On',
          toFormattedDate(request.approvedAt),
        ],
        ['Approval Notes', request.approvalNotes || 'None', '', ''],
      ],
      margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
    })

    // @ts-ignore
    currentY = doc.lastAutoTable.finalY + 8
  }

  // ── QR code for verification ──────────────────────────────────────────────
  let qrDataUrl: string | undefined
  if (request.verificationToken) {
    try {
      const origin = window.location.origin.replace(/\.+$/, '')
      qrDataUrl = await QRCode.toDataURL(
        `${origin}/verify/${request.verificationToken}`,
        {
          width: 256,
          margin: 1,
          color: { dark: '#1a1a1a', light: '#ffffff' },
        }
      )
    } catch {
      /* non-critical */
    }
  }

  // ── Footer with signature block ───────────────────────────────────────────
  const signerName =
    request.status === 'APPROVED'
      ? request.approvedByName ||
        companySettings?.managerName ||
        'Authorized Signatory'
      : companySettings?.managerName || 'Authorized Signatory'

  await drawFooter(doc, currentY, companySettings, financeSettings, signerName, {
    skipPaymentBox: true,
    skipTerms: true,
    signatureUrl: companySettings?.managerSignatureUrl,
    position: companySettings?.managerPosition || 'Manager',
    skipSeal: false,
    qrDataUrl,
    qrSize: 28,
    qrLabel: 'Scan to verify authorization',
  })

  // ── Watermark ─────────────────────────────────────────────────────────────
  if (sealImg) {
    drawWatermarkOnAllPages(doc, sealImg)
  }

  doc.save(`${request.requestNumber}.pdf`)
}