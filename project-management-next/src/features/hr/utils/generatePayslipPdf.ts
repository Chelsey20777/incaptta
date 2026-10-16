import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type { Payroll, Employee } from '@/stores/hr-types'
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

const PRIMARY_COLOR: [number, number, number] = [118, 185, 0]
const DARK_NAVY: [number, number, number] = [26, 31, 54]
const SECONDARY_TEXT_COLOR: [number, number, number] = [38, 38, 38]
const WHITE: [number, number, number] = [255, 255, 255]

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

async function drawCenteredHeader(
  doc: jsPDF,
  companySettings: CompanySettingsLike,
  month: string,
  year: number
): Promise<number> {
  const pageWidth = doc.internal.pageSize.width
  const PAGE_CENTER = pageWidth / 2
  let currentY = 12

  let logoHeight = 25
  let logoWidth = 50
  let logoImgElement: HTMLImageElement | null = null

  const logoDataUrl = (companySettings as any)?.logoDataUrl
  const logoUrl = companySettings?.logoUrl

  if (logoDataUrl || logoUrl) {
    try {
      const transparentLogo = logoDataUrl
        ? logoDataUrl
        : await removeWhiteBackground(logoUrl as string)
      await new Promise<void>((resolve) => {
        const img = new Image()
        if (!logoDataUrl) img.crossOrigin = 'anonymous'
        img.src = transparentLogo
        img.onload = () => {
          logoImgElement = img
          const aspect = img.width / img.height
          logoHeight = logoWidth / aspect
          resolve()
        }
        img.onerror = () => resolve()
      })
    } catch (e) {
      console.warn('Logo load fail', e)
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
      currentY += logoHeight + 5
    } catch (err) {
      console.error('jsPDF error adding logo:', err)
      currentY += 20
    }
  } else {
    currentY += 20
  }

  doc.setFont('DejaVuSansCondensed', 'bold')
  doc.setFontSize(22)
  doc.setTextColor(...PRIMARY_COLOR)
  doc.text('EMPLOYEE PAYSLIP', PAGE_CENTER, currentY, { align: 'center' })

  currentY += 8
  doc.setFontSize(12)
  doc.setTextColor(...SECONDARY_TEXT_COLOR)
  doc.text(`${month.toUpperCase()} ${year}`, PAGE_CENTER, currentY, { align: 'center' })

  currentY += 6
  doc.setFontSize(10)
  doc.setFont('DejaVuSansCondensed', 'normal')
  doc.text(`Generated: ${toFormattedDate(new Date())}`, PAGE_CENTER, currentY, {
    align: 'center',
  })

  currentY += 8
  doc.setDrawColor(...PRIMARY_COLOR)
  doc.setLineWidth(0.5)
  doc.line(PAGE_MARGIN, currentY, pageWidth - PAGE_MARGIN, currentY)

  return currentY + 10
}

function drawInfoSection(
  doc: jsPDF,
  payroll: Payroll,
  employee: Employee | null,
  startY: number
): number {
  autoTable(doc, {
    startY,
    body: [
      [
        'Employee Name',
        payroll.employeeName || 'N/A',
        'Employee ID',
        employee?.id || payroll.employeeId || 'N/A',
      ],
      [
        'Department',
        employee?.department || 'N/A',
        'Designation',
        employee?.jobTitle || employee?.position || 'N/A',
      ],
      [
        'National ID',
        employee?.nationalId || payroll.nationalId || 'N/A',
        'Pay Period',
        `${MONTH_NAMES[(payroll.month || 1) - 1]} ${payroll.year}`,
      ],
      [
        'Pay Date',
        toFormattedDate(new Date()),
        'Status',
        (payroll.status || 'Unpaid').toUpperCase(),
      ],
    ],
    theme: 'grid',
    styles: {
      font: 'DejaVuSansCondensed',
      fontSize: 8,
      cellPadding: 3,
      lineColor: [240, 240, 240],
      lineWidth: 0.1,
    },
    columnStyles: {
      0: { cellWidth: 35, fontStyle: 'bold', fillColor: [245, 245, 245] },
      1: { cellWidth: 60 },
      2: { cellWidth: 35, fontStyle: 'bold', fillColor: [245, 245, 245] },
      3: { cellWidth: 'auto' },
    },
    margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
  })

  return doc.lastAutoTable.finalY + 8
}

const payrollCurrencyPrefix = (payroll: Payroll) => payroll.schemaVersion === 2 ? `${payroll.currency || 'USD'} ` : '$'

function drawPayDetails(
  doc: jsPDF,
  payroll: Payroll,
  startY: number,
  postings: any[] = []
): number {
  const pageWidth = doc.internal.pageSize.width
  const gap = 8
  const tableWidth = (pageWidth - PAGE_MARGIN * 2 - gap) / 2

  const jobEarnings = Number(payroll.jobCardEarnings || 0)
  const totalAllowances = Number(payroll.allowances || 0)
  // allowances often already includes jobCardEarnings (posting path) — avoid double-count
  const otherAllowances = Math.max(0, totalAllowances - jobEarnings)

  const earningsBody: any[][] = [
    ['Basic Salary', `${payrollCurrencyPrefix(payroll)}${(payroll.basicSalary || 0).toFixed(2)}`],
  ]
  if (otherAllowances > 0.005) {
    earningsBody.push(['Allowances', `${payrollCurrencyPrefix(payroll)}${otherAllowances.toFixed(2)}`])
  }
  if (jobEarnings > 0.005) {
    earningsBody.push(['Incentives/Job Cards', `${payrollCurrencyPrefix(payroll)}${jobEarnings.toFixed(2)}`])
    if (postings.length) {
      postings.forEach((p) => {
        earningsBody.push([
          {
            content: `  ↳ Job ${p.jobNumber || '—'}${p.jobCardName ? ` · ${p.jobCardName}` : ''}`,
            styles: {
              fontSize: 7,
              textColor: [100, 100, 100],
              fontStyle: 'italic',
              cellPadding: 1,
            },
          },
          {
            content: `${payrollCurrencyPrefix(payroll)}${(p.amount || 0).toFixed(2)}`,
            styles: {
              fontSize: 7,
              textColor: [100, 100, 100],
              fontStyle: 'italic',
              halign: 'right',
              cellPadding: 1,
            },
          },
        ])
      })
    } else if (payroll.jobCardReferences?.length) {
      earningsBody.push([
        {
          content: `Jobs: ${payroll.jobCardReferences.join(', ')}`,
          colSpan: 2,
          styles: {
            fontSize: 7,
            textColor: [120, 120, 120],
            fontStyle: 'italic',
            cellPadding: 2,
          },
        },
      ])
    }
  }

  // Match stored payroll: netPay = basic + allowances - deductions
  const gross = (payroll.basicSalary || 0) + totalAllowances
  earningsBody.push([
    { content: 'Gross Earnings', styles: { fontStyle: 'bold' } },
    { content: `${payrollCurrencyPrefix(payroll)}${gross.toFixed(2)}`, styles: { fontStyle: 'bold' } },
  ])

  autoTable(doc, {
    head: [['Earnings', 'Amount (USD)']],
    body: earningsBody,
    startY,
    theme: 'grid',
    styles: { font: 'DejaVuSansCondensed', fontSize: 8, cellPadding: 3 },
    headStyles: { fillColor: PRIMARY_COLOR, textColor: WHITE },
    columnStyles: { 1: { halign: 'right' } },
    margin: { left: PAGE_MARGIN, right: PAGE_MARGIN + tableWidth + gap },
    tableWidth,
  })
  const earningsY = doc.lastAutoTable.finalY

  const deductionsBody: any[][] = []
  if (payroll.paye) deductionsBody.push(['P.A.Y.E', `${payrollCurrencyPrefix(payroll)}${payroll.paye.toFixed(2)}`])
  if (payroll.nssa) deductionsBody.push(['NSSA', `${payrollCurrencyPrefix(payroll)}${payroll.nssa.toFixed(2)}`])
  if (payroll.aidsLevy) deductionsBody.push(['AIDS Levy', `${payrollCurrencyPrefix(payroll)}${payroll.aidsLevy.toFixed(2)}`])
  if (payroll.schemaVersion !== 2 && payroll.zimdef) deductionsBody.push(['ZIMDEF', `${payrollCurrencyPrefix(payroll)}${payroll.zimdef.toFixed(2)}`])
  if (payroll.schemaVersion !== 2 && payroll.wcif) deductionsBody.push(['WCIF', `${payrollCurrencyPrefix(payroll)}${payroll.wcif.toFixed(2)}`])
  if (payroll.advanceDeduction) {
    const remaining = (payroll.advanceRecoveryDetails || []).reduce((sum, item) => sum + Number(item.balanceAfter || 0), 0)
    deductionsBody.push([`Salary Advance${payroll.advanceRecoveryDetails?.length ? ` (remaining ${payrollCurrencyPrefix(payroll)}${remaining.toFixed(2)})` : ''}`, `${payrollCurrencyPrefix(payroll)}${payroll.advanceDeduction.toFixed(2)}`])
  }
  if (payroll.damagesDeduction) {
    deductionsBody.push(['Damages', `${payrollCurrencyPrefix(payroll)}${payroll.damagesDeduction.toFixed(2)}`])
  }
  if (payroll.uniformDeduction) {
    deductionsBody.push(['Uniform', `${payrollCurrencyPrefix(payroll)}${payroll.uniformDeduction.toFixed(2)}`])
  }
  if (deductionsBody.length === 0) deductionsBody.push(['No Deductions', `${payrollCurrencyPrefix(payroll)}0.00`])

  deductionsBody.push([
    { content: 'Total Deductions', styles: { fontStyle: 'bold' } },
    {
      content: `${payrollCurrencyPrefix(payroll)}${(payroll.deductions || 0).toFixed(2)}`,
      styles: { fontStyle: 'bold' },
    },
  ])

  autoTable(doc, {
    head: [['Deductions', 'Amount (USD)']],
    body: deductionsBody,
    startY,
    theme: 'grid',
    styles: { font: 'DejaVuSansCondensed', fontSize: 8, cellPadding: 3 },
    headStyles: { fillColor: [180, 0, 0], textColor: WHITE },
    columnStyles: { 1: { halign: 'right' } },
    margin: { left: PAGE_MARGIN + tableWidth + gap, right: PAGE_MARGIN },
    tableWidth,
  })
  const deductionsY = doc.lastAutoTable.finalY

  return Math.max(earningsY, deductionsY) + 10
}

function drawNetPay(doc: jsPDF, payroll: Payroll, startY: number): number {
  const pageWidth = doc.internal.pageSize.width
  const boxWidth = 80
  const x = pageWidth - PAGE_MARGIN - boxWidth

  doc.setFillColor(...DARK_NAVY)
  doc.rect(x, startY, boxWidth, 12, 'F')

  doc.setFont('DejaVuSansCondensed', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(...WHITE)
  doc.text('NET TAKE HOME', x + 5, startY + 8)

  doc.setFontSize(12)
  doc.text(
    `${payrollCurrencyPrefix(payroll)}${(payroll.netPay || 0).toFixed(2)}`,
    pageWidth - PAGE_MARGIN - 5,
    startY + 8,
    { align: 'right' }
  )

  return startY + 20
}

async function drawSignatureAndSeal(
  doc: jsPDF,
  companySettings: CompanySettingsLike,
  startY: number
): Promise<number> {
  const pageWidth = doc.internal.pageSize.width
  const currentY = startY

  doc.setFont('DejaVuSansCondensed', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...SECONDARY_TEXT_COLOR)
  doc.text('__________________________', PAGE_MARGIN + 10, currentY)
  doc.text('Employee Signature', PAGE_MARGIN + 10, currentY + 5)

  const rightX = pageWidth - PAGE_MARGIN - 60
  doc.text('__________________________', rightX, currentY)
  doc.text('Authorized Signatory', rightX, currentY + 5)

  const sealImg = await getSealImage(companySettings)
  if (sealImg) {
    try {
      doc.addImage(sealImg, 'PNG', rightX + 5, currentY - 25, 40, 40)
    } catch (err) {
      console.error('Error adding seal to payslip:', err)
    }
  }

  return currentY + 20
}

/** Load job-card payroll postings for a payslip earnings breakdown. */
export async function loadPayrollPostingsForPayslip(payroll: Payroll): Promise<any[]> {
  try {
    let docsSnap: Awaited<ReturnType<typeof getDocs>> | null = null
    if (payroll.id) {
      const q1 = query(
        collection(db, 'jobCardPayrollPostings'),
        where('payrollId', '==', payroll.id)
      )
      docsSnap = await getDocs(q1)
    }
    if (!docsSnap || docsSnap.empty) {
      const q2 = query(
        collection(db, 'jobCardPayrollPostings'),
        where('employeeId', '==', payroll.employeeId),
        where('month', '==', payroll.month),
        where('year', '==', payroll.year)
      )
      docsSnap = await getDocs(q2)
    }

    const rawPostings: any[] = docsSnap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as Record<string, any>),
    }))

    return Promise.all(
      rawPostings.map(async (posting: any) => {
        let jobCardName = 'Untitled Job'
        try {
          if (posting.jobCardId) {
            const jobDoc = await getDoc(doc(db, 'jobCards', posting.jobCardId))
            if (jobDoc.exists()) {
              jobCardName = jobDoc.data()?.generalInfo?.jobTitle || jobCardName
            }
          } else if (posting.jobNumber) {
            const qJob = query(
              collection(db, 'jobCards'),
              where('generalInfo.jobNumber', '==', posting.jobNumber)
            )
            const jobSnap = await getDocs(qJob)
            if (!jobSnap.empty) {
              jobCardName =
                jobSnap.docs[0]?.data()?.generalInfo?.jobTitle || jobCardName
            }
          }
        } catch (err) {
          console.error('Error fetching job card title:', err)
        }
        return { ...posting, jobCardName }
      })
    )
  } catch (e) {
    console.error('Failed to load postings breakdown for PDF download:', e)
    return []
  }
}

/**
 * Generate and download an employee payslip PDF.
 * `verificationToken` is reserved for future QR/verification branding (matches Vue API).
 */
export async function downloadPayslipPDF(
  payroll: Payroll,
  employee: Employee | null,
  _verificationToken: string,
  companySettings: CompanySettingsLike,
  postings: any[] = []
): Promise<void> {
  const docPdf = new jsPDF()
  await setupFonts(docPdf)
  setupDoc(docPdf)

  const monthName = MONTH_NAMES[(payroll.month || 1) - 1] || 'Unknown'
  const year = payroll.year || new Date().getFullYear()

  let currentY = await drawCenteredHeader(docPdf, companySettings, monthName, year)
  currentY = drawInfoSection(docPdf, payroll, employee, currentY)
  currentY = drawPayDetails(docPdf, payroll, currentY, postings)
  currentY = drawNetPay(docPdf, payroll, currentY)
  if (payroll.schemaVersion === 2) {
    if (currentY > 230) { docPdf.addPage(); currentY = 25 }
    const currency = payroll.currency || 'USD'
    docPdf.setFontSize(9)
    docPdf.setTextColor(40, 40, 40)
    const settlementLines = [
      `Currency: ${currency} | Salary due: ${payroll.dueDate || 'Not set'}`,
      `Paid to date: ${currency} ${Number(payroll.paidAmount || 0).toFixed(2)}`,
      `Outstanding: ${currency} ${Number(payroll.outstanding ?? payroll.netPay).toFixed(2)}`,
      `Employer contributions (not employee deductions): ${currency} ${Number(payroll.employerCost || 0).toFixed(2)}`,
      'This payslip records earnings. It is not proof of payment.',
    ]
    for (const line of settlementLines) { currentY += 6; docPdf.text(line, PAGE_MARGIN, currentY) }
  }
  await drawSignatureAndSeal(docPdf, companySettings, currentY + 10)

  const sealImg = await getSealImage(companySettings)
  if (sealImg) {
    drawWatermarkOnAllPages(docPdf, sealImg)
  }

  const safeName = (payroll.employeeName || 'employee').replace(/\s+/g, '_')
  docPdf.save(`payslip-${safeName}_${monthName}_${payroll.year}.pdf`)
}
