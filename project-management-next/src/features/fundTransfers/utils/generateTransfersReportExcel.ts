import ExcelJS from 'exceljs'
import {
  toFormattedDate,
  type CompanySettingsLike,
  removeWhiteBackground,
} from '@/features/jobCards/utils/pdfBranding'

const ORANGE = 'F97316'
const GREEN = '79C21B'

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

export const generateTransfersReportExcel = async (
  transfers: any[],
  companySettings?: CompanySettingsLike,
  generatedBy?: string
) => {
  const workbook = new ExcelJS.Workbook()
  const worksheet = workbook.addWorksheet('Transfers Report')

  worksheet.columns = [
    { header: '#', key: 'index', width: 6 },
    { header: 'Date', key: 'date', width: 14 },
    { header: 'From', key: 'from', width: 14 },
    { header: 'To', key: 'to', width: 14 },
    { header: 'Amount', key: 'amount', width: 14 },
    { header: 'Status', key: 'status', width: 20 },
    { header: 'Reference', key: 'reference', width: 18 },
    { header: 'Description', key: 'description', width: 36 },
    { header: 'Initiated By', key: 'initiatedBy', width: 22 },
  ]

  let currentRow = 1
  if (companySettings?.logoUrl) {
    const logo = await getImageBase64(companySettings.logoUrl)
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

  worksheet.getCell(`A${currentRow}`).value = 'FUND TRANSFERS REPORT'
  worksheet.getCell(`A${currentRow}`).font = { bold: true, size: 16, color: { argb: ORANGE } }
  worksheet.getCell(`A${currentRow + 1}`).value =
    `Generated: ${new Date().toLocaleDateString()} | By: ${generatedBy || 'System'}`
  currentRow += 3

  const total = transfers.reduce((s, t) => s + (Number(t.amount) || 0), 0)
  worksheet.getCell(`A${currentRow}`).value = 'SUMMARY'
  worksheet.getCell(`A${currentRow}`).font = { bold: true, color: { argb: ORANGE } }
  worksheet.getCell(`A${currentRow + 1}`).value = 'Total Transfers'
  worksheet.getCell(`B${currentRow + 1}`).value = transfers.length
  worksheet.getCell(`A${currentRow + 2}`).value = 'Total Amount'
  worksheet.getCell(`B${currentRow + 2}`).value = total
  worksheet.getCell(`B${currentRow + 2}`).numFmt = '"$"#,##0.00'
  worksheet.getCell(`B${currentRow + 2}`).font = { bold: true, color: { argb: GREEN } }
  currentRow += 4

  const headerRow = worksheet.getRow(currentRow)
  headerRow.values = ['#', 'Date', 'From', 'To', 'Amount', 'Status', 'Reference', 'Description', 'Initiated By']
  headerRow.font = { bold: true, color: { argb: 'FFFFFF' } }
  headerRow.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ORANGE } }
  })
  currentRow += 1

  transfers.forEach((t, i) => {
    const row = worksheet.getRow(currentRow + i)
    row.values = [
      i + 1,
      t.date || toFormattedDate(t.createdAt || new Date()),
      t.fromAccount || '—',
      t.toAccount || '—',
      Number(t.amount) || 0,
      t.status || 'PENDING_ACCOUNTANT',
      t.reference || '—',
      t.description || '—',
      t.initiatedByName || t.createdByName || t.initiatedByEmail || '—',
    ]
    row.getCell(5).numFmt = '"$"#,##0.00'
    row.getCell(5).font = { bold: true }
  })

  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = `Transfers_Report_${new Date().toISOString().slice(0, 10)}.xlsx`
  link.click()
  URL.revokeObjectURL(link.href)
}
