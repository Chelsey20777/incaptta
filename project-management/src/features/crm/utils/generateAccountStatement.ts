import jsPDF from 'jspdf'
import {
  setupFonts,
  setupDoc,
  drawHeader,
  drawGreenBar,
  renderBrandedItemsTable,
  drawFooter,
  drawWatermarkOnAllPages,
  getSealImage,
  PAGE_MARGIN,
  PRIMARY_COLOR,
  SECONDARY_TEXT_COLOR,
  hexToRgb,
  type CompanySettingsLike,
  type FinanceSettingsLike,
} from '@/features/jobCards/utils/pdfBranding'

function fmt(n: number) {
  return `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmtDate(val: any): string {
  if (!val) return 'N/A'
  if (val?.toDate) return val.toDate().toLocaleDateString('en-US')
  if (typeof val === 'string') return new Date(val).toLocaleDateString('en-US')
  if (val instanceof Date) return val.toLocaleDateString('en-US')
  return String(val)
}

function sortKey(val: any): number {
  if (!val) return 0
  if (val?.toDate) return val.toDate().getTime()
  if (typeof val === 'string') return new Date(val).getTime()
  if (val instanceof Date) return val.getTime()
  return 0
}

export async function generateAccountStatement(
  customer: { name: string; email?: string; phone?: string; address?: string },
  crmInvoices: any[],
  jobCards: any[],
  jobPayments: any[],
  appSettings: any,
  creditTransactions: any[] = [],
): Promise<void> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  await setupFonts(doc)
  setupDoc(doc)

  const pageWidth = doc.internal.pageSize.width
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })

  // ── Header ─────────────────────────────────────────────────────────────────
  let y = await drawHeader(doc, appSettings as CompanySettingsLike)
  drawGreenBar(doc, y + 2)
  y += 10 // bar height (8) + 2 offset

  // ── Document title ──────────────────────────────────────────────────────────
  y += 6
  doc.setFont('DejaVuSansCondensed', 'bold')
  doc.setFontSize(14)
  doc.setTextColor(...SECONDARY_TEXT_COLOR)
  doc.text('ACCOUNT STATEMENT', PAGE_MARGIN, y)

  doc.setFont('DejaVuSansCondensed', 'normal')
  doc.setFontSize(9)
  doc.text(`As at: ${today}`, pageWidth - PAGE_MARGIN, y, { align: 'right' })

  // ── Customer block ──────────────────────────────────────────────────────────
  y += 8
  const blockX = PAGE_MARGIN
  const blockW = 90

  doc.setDrawColor(200, 200, 200)
  doc.setFillColor(255, 255, 255)
  doc.roundedRect(blockX, y, blockW, 28, 2, 2, 'FD')

  doc.setFont('DejaVuSansCondensed', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(...PRIMARY_COLOR)
  doc.text('BILL TO', blockX + 4, y + 6)

  doc.setFont('DejaVuSansCondensed', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(...SECONDARY_TEXT_COLOR)
  doc.text(customer.name, blockX + 4, y + 13)

  doc.setFont('DejaVuSansCondensed', 'normal')
  doc.setFontSize(8)
  const contactLines = [
    customer.address,
    customer.email,
    customer.phone,
  ].filter(Boolean) as string[]
  contactLines.forEach((line, i) => {
    doc.text(line, blockX + 4, y + 18 + i * 4)
  })

  // ── Summary strip ───────────────────────────────────────────────────────────
  // Build transaction data first so we can compute totals
  interface TxRow {
    date: string
    sortTs: number
    ref: string
    description: string
    invoiced: number
    paid: number
    isDeposit?: boolean
  }

  const rows: TxRow[] = []

  // CRM invoices
  for (const inv of crmInvoices) {
    const invDate = fmtDate(inv.createdAt)
    const invRef  = `INV-${String(inv.id).substring(0, 8).toUpperCase()}`
    const invAmt  = Number(inv.grandTotal || 0)
    rows.push({
      date: invDate,
      sortTs: sortKey(inv.createdAt),
      ref: invRef,
      description: `CRM Invoice${inv.items?.length ? ` (${inv.items.length} item${inv.items.length > 1 ? 's' : ''})` : ''}`,
      invoiced: invAmt,
      paid: 0,
    })
    for (const p of (inv.payments || [])) {
      rows.push({
        date: fmtDate(p.date),
        sortTs: sortKey(p.date),
        ref: invRef,
        description: `  Payment received${p.reference ? ` — ${p.reference}` : ''} (${p.method || ''})`,
        invoiced: 0,
        paid: Number(p.amount || 0),
      })
    }
  }

  // Job card invoices
  const paymentsByJobCard = new Map<string, any[]>()
  for (const p of jobPayments) {
    const jid = String(p.jobCardId || '')
    if (!paymentsByJobCard.has(jid)) paymentsByJobCard.set(jid, [])
    paymentsByJobCard.get(jid)!.push(p)
  }

  const APPROVED_STATUSES = ['APPROVED_MANAGER', 'COMPLETED']
  for (const jc of jobCards) {
    if (!APPROVED_STATUSES.includes(jc.status || '')) continue
    const jcRef    = jc.generalInfo?.jobNumber || String(jc.id).substring(0, 8).toUpperCase()
    const jcDate   = jc.generalInfo?.dateIssued || jc.createdAt
    const jcAmt    = Number(jc.lockedTotalInvoiceValue || jc.totals?.grandTotal || jc.summary?.grandTotal || 0)
    rows.push({
      date: fmtDate(jcDate),
      sortTs: sortKey(jcDate),
      ref: jcRef,
      description: `Job Card Invoice${jc.generalInfo?.jobTitle ? ` — ${jc.generalInfo.jobTitle}` : ''}`,
      invoiced: jcAmt,
      paid: 0,
    })
    for (const p of (paymentsByJobCard.get(jc.id) || [])) {
      rows.push({
        date: fmtDate(p.createdAt),
        sortTs: sortKey(p.createdAt),
        ref: jcRef,
        description: `  Payment received${p.description ? ` — ${p.description}` : ''} (${p.paymentMethod || ''})`,
        invoiced: 0,
        paid: Number(p.amount || 0),
      })
    }
  }

  // Credit deposits
  for (const dep of creditTransactions) {
    if (dep.type !== 'DEPOSIT') continue
    rows.push({
      date: fmtDate(dep.createdAt),
      sortTs: sortKey(dep.createdAt),
      ref: `DEP-${String(dep.id).substring(0, 8).toUpperCase()}`,
      description: `  Cash Deposit${dep.paymentMethod ? ` (${dep.paymentMethod})` : ''}${dep.reference ? ` — ${dep.reference}` : ''}`,
      invoiced: 0,
      paid: Number(dep.amount || 0),
      isDeposit: true,
    })
  }

  // Sort by date ascending
  rows.sort((a, b) => a.sortTs - b.sortTs)

  const totalInvoiced = rows.reduce((s, r) => s + r.invoiced, 0)
  const totalPaid     = rows.reduce((s, r) => s + r.paid, 0)
  const outstanding   = totalInvoiced - totalPaid

  // Draw summary strip (right of customer block)
  const stripX = blockX + blockW + 8
  const stripW = pageWidth - PAGE_MARGIN - stripX
  const cellW  = stripW / 3
  const stripH = 28
  const stripY = y

  const summaryItems = [
    { label: 'TOTAL INVOICED', value: fmt(totalInvoiced), color: PRIMARY_COLOR },
    { label: 'TOTAL PAID',     value: fmt(totalPaid),     color: [34, 197, 94] as [number,number,number] },
    { label: 'OUTSTANDING',    value: fmt(outstanding),   color: outstanding > 0 ? [239, 68, 68] as [number,number,number] : PRIMARY_COLOR },
  ]

  summaryItems.forEach((item, i) => {
    const cx = stripX + i * cellW
    doc.setFillColor(255, 255, 255)
    doc.setDrawColor(200, 200, 200)
    doc.roundedRect(cx, stripY, cellW - 2, stripH, 2, 2, 'FD')

    doc.setFont('DejaVuSansCondensed', 'bold')
    doc.setFontSize(7)
    doc.setTextColor(...item.color)
    doc.text(item.label, cx + (cellW - 2) / 2, stripY + 8, { align: 'center' })

    doc.setFont('DejaVuSansCondensed', 'bold')
    doc.setFontSize(11)
    doc.setTextColor(...SECONDARY_TEXT_COLOR)
    doc.text(item.value, cx + (cellW - 2) / 2, stripY + 20, { align: 'center' })
  })

  y += stripH + 6
  drawGreenBar(doc, y)
  y += 12 // bar height (8) + 4 padding

  // ── Transactions table ──────────────────────────────────────────────────────
  const head = ['Date', 'Reference', 'Description', 'Invoiced', 'Paid', 'Running Balance']

  let runningBalance = 0
  const DEPOSIT_FILL: [number, number, number] = [219, 234, 254] // blue-100
  const body = rows.map(r => {
    runningBalance += r.invoiced - r.paid
    const isPayment = r.paid > 0 && !r.isDeposit
    const isDeposit = !!r.isDeposit
    return [
      r.date,
      r.ref,
      r.description,
      r.invoiced > 0 ? fmt(r.invoiced) : '',
      r.paid > 0     ? fmt(r.paid)     : '',
      fmt(runningBalance),
    ].map((cell, colIdx) => ({
      content: cell,
      styles: {
        fontStyle: isPayment || isDeposit ? 'normal' : 'bold',
        fillColor: isDeposit ? DEPOSIT_FILL : undefined,
        textColor: colIdx === 5
          ? (runningBalance > 0 ? [200, 50, 50] : [34, 139, 34])
          : isDeposit ? [37, 99, 235]   // blue-600 for deposit rows
          : SECONDARY_TEXT_COLOR,
        halign: colIdx >= 3 ? 'right' : 'left',
      } as any,
    }))
  })

  if (body.length === 0) {
    body.push([
      { content: '-', styles: {} },
      { content: '-', styles: {} },
      { content: 'No transactions on record', styles: { fontStyle: 'italic' } },
      { content: '-', styles: { halign: 'right' } },
      { content: '-', styles: { halign: 'right' } },
      { content: fmt(0), styles: { halign: 'right' } },
    ])
  }

  y = renderBrandedItemsTable(doc, y, head, body, {
    0: { cellWidth: 20 },
    1: { cellWidth: 28 },
    2: { cellWidth: 'auto' },
    3: { cellWidth: 24, halign: 'right' },
    4: { cellWidth: 24, halign: 'right' },
    5: { cellWidth: 28, halign: 'right' },
  })

  // ── Footer ──────────────────────────────────────────────────────────────────
  const sealImg = await getSealImage(appSettings)
  await drawFooter(
    doc, y + 4,
    appSettings as CompanySettingsLike,
    appSettings as FinanceSettingsLike,
    appSettings?.managerName || '',
    {
      skipPaymentBox: false,
      skipTerms: true,
      skipSeal: !sealImg,
      signatureUrl: appSettings?.managerSignatureDataUrl || appSettings?.managerSignatureUrl,
    }
  )

  if (sealImg) drawWatermarkOnAllPages(doc, sealImg)

  const safeName = customer.name.replace(/[^a-zA-Z0-9]/g, '_')
  const dateStr  = new Date().toISOString().split('T')[0]
  doc.save(`Statement_${safeName}_${dateStr}.pdf`)
}
