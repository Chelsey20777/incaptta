import ExcelJS from 'exceljs'
import {
  toFormattedDate,
  type CompanySettingsLike,
  removeWhiteBackground,
} from '@/features/jobCards/utils/pdfBranding'

const ORANGE = 'F97316'
const GREEN = '79C21B'

const statusLabel = (s: string) => {
  if (s === 'APPROVED' || s === 'PAYMENT_PROCESSED') return 'Posted'
  if (s === 'APPROVED_ACCOUNTANT') return 'Awaiting Mgr'
  return s || 'Pending'
}

async function getImageBase64(url: string): Promise<{ base64: string; extension: string } | null> {
  try {
    const dataUrl = await removeWhiteBackground(url)
    const [meta, base64] = dataUrl.split(',')
    const extension = meta?.split('/')[1]?.split(';')[0] || 'png'
    return { base64: base64 || '', extension }
  } catch {
    return null
  }
}

export const generateOpexReportExcel = async (
  expenses: any[],
  dateRange: { from: string; to: string } | null,
  companySettings?: CompanySettingsLike,
  generatedBy?: string
) => {
  const workbook = new ExcelJS.Workbook()
  const worksheet = workbook.addWorksheet('OPEX Report')

  worksheet.columns = [
    { header: '#', key: 'index', width: 6 },
    { header: 'Date', key: 'date', width: 14 },
    { header: 'Category', key: 'category', width: 18 },
    { header: 'Description / Beneficiary', key: 'description', width: 40 },
    { header: 'Dept', key: 'dept', width: 18 },
    { header: 'Method', key: 'method', width: 14 },
    { header: 'Status', key: 'status', width: 16 },
    { header: 'Amount', key: 'amount', width: 14 },
    { header: 'Requester', key: 'requester', width: 22 },
  ]

  let currentRow = 1
  const logoUrl = companySettings?.logoUrl
  if (logoUrl) {
    const logo = await getImageBase64(logoUrl)
    if (logo) {
      const imageId = workbook.addImage({
        base64: logo.base64,
        extension: logo.extension as 'png' | 'jpeg' | 'gif',
      })
      worksheet.addImage(imageId, {
        tl: { col: 1.5, row: 0.5 },
        ext: { width: 180, height: 90 },
      })
      currentRow = 7
    }
  }

  if (companySettings?.companyName) {
    worksheet.getCell(`D${currentRow}`).value = companySettings.companyName.toUpperCase()
    worksheet.getCell(`D${currentRow}`).font = { bold: true, size: 14, color: { argb: ORANGE } }
    currentRow += 2
  }

  worksheet.getCell(`A${currentRow}`).value = 'OPERATIONAL EXPENSES REPORT'
  worksheet.getCell(`A${currentRow}`).font = { bold: true, size: 16, color: { argb: ORANGE } }
  const rangeText =
    dateRange?.from && dateRange?.to ? `${dateRange.from} to ${dateRange.to}` : 'All Time'
  worksheet.getCell(`A${currentRow + 1}`).value = `Period: ${rangeText}`
  worksheet.getCell(`A${currentRow + 2}`).value =
    `Generated: ${new Date().toLocaleDateString()} | By: ${generatedBy || 'System'}`
  currentRow += 4

  const totalAll = expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0)
  worksheet.getCell(`A${currentRow}`).value = 'SUMMARY'
  worksheet.getCell(`A${currentRow}`).font = { bold: true, color: { argb: ORANGE } }
  worksheet.getCell(`A${currentRow + 1}`).value = 'Total Expenses'
  worksheet.getCell(`B${currentRow + 1}`).value = expenses.length
  worksheet.getCell(`A${currentRow + 2}`).value = 'Total Amount'
  worksheet.getCell(`B${currentRow + 2}`).value = totalAll
  worksheet.getCell(`B${currentRow + 2}`).numFmt = '"$"#,##0.00'
  worksheet.getCell(`B${currentRow + 2}`).font = { bold: true, color: { argb: GREEN } }
  currentRow += 4

  const headerRow = worksheet.getRow(currentRow)
  headerRow.values = [
    '#',
    'Date',
    'Category',
    'Description / Beneficiary',
    'Dept',
    'Method',
    'Status',
    'Amount',
    'Requester',
  ]
  headerRow.font = { bold: true, color: { argb: 'FFFFFF' } }
  headerRow.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ORANGE } }
  })
  currentRow += 1

  expenses.forEach((exp, i) => {
    const row = worksheet.getRow(currentRow + i)
    row.values = [
      i + 1,
      toFormattedDate(exp.createdAt || new Date()),
      (exp.category || '—').toUpperCase(),
      exp.title || exp.description || '—',
      exp.department || '—',
      (exp.paymentMethod || '—').toUpperCase(),
      statusLabel(exp.status || ''),
      Number(exp.amount) || 0,
      exp.createdByName || exp.requesterName || '—',
    ]
    row.getCell(8).numFmt = '"$"#,##0.00'
    row.getCell(8).font = { bold: true }
  })

  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const fromStr = dateRange?.from?.replace(/\//g, '-') || 'all'
  const toStr = dateRange?.to?.replace(/\//g, '-') || 'time'
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = `OPEX_Report_${fromStr}_to_${toStr}.xlsx`
  link.click()
  URL.revokeObjectURL(link.href)
}
