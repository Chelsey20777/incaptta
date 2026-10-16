import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { PAGE_MARGIN, setupDoc, setupFonts, type CompanySettingsLike } from '@/features/jobCards/utils/pdfBranding'
import type { SubcontractorJob, SubcontractorJobPayment } from '@/features/subcontractors/types'
import type { GeneratedDownload } from '@/lib/browser-download'

const ORANGE: [number, number, number] = [255, 137, 3]
const DARK: [number, number, number] = [30, 30, 30]

function dateText(value: unknown): string {
  if (!value) return '—'
  if (typeof value === 'object' && value && 'toDate' in value) {
    return (value as { toDate: () => Date }).toDate().toLocaleDateString('en-GB')
  }
  const date = value instanceof Date ? value : new Date(String(value))
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('en-GB')
}

function money(value: unknown): string {
  return `$${Number(value || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function actorName(value: unknown): string {
  if (!value) return '—'
  if (typeof value === 'string') return value
  if (typeof value === 'object' && value && 'displayName' in value) {
    return String((value as { displayName?: unknown }).displayName || '—')
  }
  return '—'
}

export async function generateScnContractPdf(
  job: SubcontractorJob,
  payments: SubcontractorJobPayment[],
  companySettings?: CompanySettingsLike
): Promise<GeneratedDownload> {
  const doc = new jsPDF()
  await setupFonts(doc)
  setupDoc(doc)
  const width = doc.internal.pageSize.width
  const companyName = companySettings?.companyName || 'Incaptta'
  const approved = payments.filter((payment) => payment.approvalStatus === 'APPROVED_MANAGER')
  const approvedTotal = approved.reduce((sum, payment) => sum + Number(payment.amount || 0), 0)
  const pendingTotal = payments
    .filter((payment) => payment.approvalStatus === 'PENDING' || payment.approvalStatus === 'APPROVED_ACCOUNTANT')
    .reduce((sum, payment) => sum + Number(payment.amount || 0), 0)
  const contractValue = Number(job.contractValue || 0)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.setTextColor(...ORANGE)
  doc.text('SUBCONTRACT CONTRACT', width / 2, 18, { align: 'center' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...DARK)
  doc.text(companyName, width / 2, 24, { align: 'center' })
  doc.setDrawColor(...ORANGE)
  doc.line(PAGE_MARGIN, 29, width - PAGE_MARGIN, 29)

  autoTable(doc, {
    startY: 35,
    body: [
      ['Contract', job.contractNumber || '—', 'Status', job.status || '—'],
      ['Subcontractor', job.subcontractorName || '—', 'Created', dateText(job.createdAt)],
      ['Linked Job Card', job.jobCardNumber || 'Not linked', 'Completed', dateText(job.completedAt)],
      ['Scope', job.description || '—', 'Contract Value', money(contractValue)],
      ['Approved Payments', money(approvedTotal), 'Remaining', money(Math.max(0, contractValue - approvedTotal))],
      ['Pending Payments', money(pendingTotal), 'Documents', String(job.attachmentUrls?.length || 0)],
    ],
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 2, textColor: DARK },
    columnStyles: { 0: { fontStyle: 'bold' }, 2: { fontStyle: 'bold' } },
    margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
  })

  const rows = [...payments]
    .sort((a, b) => dateText(a.createdAt).localeCompare(dateText(b.createdAt)))
    .map((payment) => [
      dateText(payment.createdAt),
      payment.description || 'Payment',
      String(payment.paymentMethod || '—').toUpperCase(),
      payment.paymentRef || '—',
      money(payment.amount),
      payment.approvalStatus || 'PENDING',
      actorName(payment.accountantApprovedBy),
      actorName(payment.managerApprovedBy || payment.approvedBy),
    ])

  autoTable(doc, {
    startY: (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY
      ? (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8
      : 80,
    head: [['Date', 'Description', 'Account', 'Reference', 'Amount', 'Status', 'Accountant', 'Manager']],
    body: rows.length ? rows : [['—', 'No payments recorded', '—', '—', '—', '—', '—', '—']],
    styles: { fontSize: 7, cellPadding: 1.5, textColor: DARK },
    headStyles: { fillColor: ORANGE, textColor: 255, fontStyle: 'bold' },
    columnStyles: { 4: { halign: 'right', fontStyle: 'bold' } },
    margin: { left: PAGE_MARGIN, right: PAGE_MARGIN, bottom: 18 },
  })

  const pages = doc.getNumberOfPages()
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page)
    doc.setFontSize(7)
    doc.setTextColor(100)
    doc.text(
      `Generated ${new Date().toLocaleString('en-GB')} · Page ${page} of ${pages}`,
      width / 2,
      doc.internal.pageSize.height - 9,
      { align: 'center' }
    )
  }

  return {
    blob: doc.output('blob'),
    filename: `${job.contractNumber || 'SCN'}-${(job.subcontractorName || 'Subcontractor').replace(/[^A-Za-z0-9_-]+/g, '-')}.pdf`,
  }
}
