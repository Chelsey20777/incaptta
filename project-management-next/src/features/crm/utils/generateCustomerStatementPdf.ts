import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { setupDoc, setupFonts, PAGE_MARGIN, type CompanySettingsLike } from '@/features/jobCards/utils/pdfBranding'
import type { GeneratedDownload } from '@/lib/browser-download'

export interface CustomerStatementRow {
  date: string
  ref: string
  description: string
  invoiced: number
  paid: number
  balance: number
}

const money = (value: number) => `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export async function generateCustomerStatementPdf(
  customer: { id: string; name?: string; email?: string; phone?: string; address?: string },
  rows: CustomerStatementRow[],
  companySettings?: CompanySettingsLike,
): Promise<GeneratedDownload> {
  const doc = new jsPDF()
  await setupFonts(doc)
  setupDoc(doc)
  const companyName = companySettings?.companyName || 'Incaptta'
  const generatedAt = new Date()
  const width = doc.internal.pageSize.width

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.text(companyName, PAGE_MARGIN, 20)
  doc.setFontSize(13)
  doc.text('CUSTOMER ACCOUNT STATEMENT', PAGE_MARGIN, 30)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.text(`Generated: ${generatedAt.toLocaleString('en-GB')}`, PAGE_MARGIN, 37)
  doc.setDrawColor(255, 137, 3)
  doc.line(PAGE_MARGIN, 42, width - PAGE_MARGIN, 42)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.text(customer.name || 'Customer', PAGE_MARGIN, 51)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  let y = 57
  for (const detail of [customer.address, customer.email, customer.phone].filter(Boolean)) {
    doc.text(String(detail), PAGE_MARGIN, y)
    y += 5
  }

  autoTable(doc, {
    startY: y + 5,
    head: [['Date', 'Reference', 'Description', 'Invoiced', 'Paid', 'Balance']],
    body: rows.map((row) => [
      row.date, row.ref, row.description,
      row.invoiced ? money(row.invoiced) : '—',
      row.paid ? money(row.paid) : '—',
      money(row.balance),
    ]),
    foot: [[
      'TOTAL', '', '',
      money(rows.reduce((sum, row) => sum + row.invoiced, 0)),
      money(rows.reduce((sum, row) => sum + row.paid, 0)),
      money(rows.at(-1)?.balance || 0),
    ]],
    theme: 'striped',
    headStyles: { fillColor: [255, 137, 3], textColor: [255, 255, 255] },
    footStyles: { fillColor: [245, 245, 245], textColor: [30, 30, 30], fontStyle: 'bold' },
    styles: { fontSize: 8, cellPadding: 2.5 },
    columnStyles: { 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' } },
    margin: { left: PAGE_MARGIN, right: PAGE_MARGIN, bottom: 20 },
  })

  for (let page = 1; page <= doc.getNumberOfPages(); page++) {
    doc.setPage(page)
    doc.setFontSize(8)
    doc.setTextColor(100, 100, 100)
    doc.text(`${companyName} · Page ${page} of ${doc.getNumberOfPages()}`, width - PAGE_MARGIN, doc.internal.pageSize.height - 10, { align: 'right' })
  }

  const safeName = (customer.name || '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 60) || customer.id
  return { blob: doc.output('blob'), filename: `${safeName}-statement-${generatedAt.toISOString().slice(0, 10)}.pdf` }
}
