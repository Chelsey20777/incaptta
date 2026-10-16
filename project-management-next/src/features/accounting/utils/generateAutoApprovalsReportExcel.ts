import ExcelJS from 'exceljs'
import { type CompanySettingsLike, removeWhiteBackground } from '@/features/jobCards/utils/pdfBranding'
import { autoApprovalRuleLabel } from '@/lib/job-card-expense-approval'

const ORANGE = 'F97316'
const GREEN = '79C21B'

function approvedByLabel(item: any): string {
  const raw = item.accountantApprovedBy
  if (typeof raw === 'object' && raw) {
    return raw.displayName || raw.name || raw.email || '—'
  }
  return raw || '—'
}

function categoryLabel(e: any): string {
  if (e.category === 'job-card-expense') return 'Ad-hoc'
  return String(e.category || e.title || 'Opex').replace(/-/g, ' ')
}

function formatWhen(e: any): string {
  const d =
    e.accountantApprovedAt?.toDate?.() ||
    e.createdAt?.toDate?.() ||
    (e.createdAt ? new Date(e.createdAt) : new Date())
  return d.toLocaleString()
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

export const generateAutoApprovalsReportExcel = async (
  expenses: any[],
  activeTab: string,
  searchQuery: string,
  companySettings?: CompanySettingsLike,
  generatedBy?: string
) => {
  const workbook = new ExcelJS.Workbook()
  const worksheet = workbook.addWorksheet('Auto Approvals Audit')

  worksheet.columns = [
    { header: '#', key: 'index', width: 6 },
    { header: 'Date & Time', key: 'when', width: 22 },
    { header: 'Type', key: 'type', width: 16 },
    { header: 'Description', key: 'description', width: 40 },
    { header: 'Approved By', key: 'approvedBy', width: 24 },
    { header: 'Amount', key: 'amount', width: 14 },
    { header: 'Rule', key: 'rule', width: 12 },
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

  worksheet.getCell(`A${currentRow}`).value = 'AUTO-APPROVALS AUDIT TRAIL REPORT'
  worksheet.getCell(`A${currentRow}`).font = { bold: true, size: 16, color: { argb: ORANGE } }
  worksheet.getCell(`A${currentRow + 1}`).value = `View Group: ${activeTab.toUpperCase()}`
  if (searchQuery) worksheet.getCell(`A${currentRow + 2}`).value = `Search: ${searchQuery}`
  worksheet.getCell(`A${currentRow + 3}`).value =
    `Generated: ${new Date().toLocaleString()} | By: ${generatedBy || 'System'}`
  currentRow += 5

  const totalValue = expenses.reduce((s, e) => s + Math.abs(Number(e.amount || 0)), 0)
  worksheet.getCell(`A${currentRow}`).value = 'SUMMARY'
  worksheet.getCell(`A${currentRow}`).font = { bold: true, color: { argb: ORANGE } }
  worksheet.getCell(`A${currentRow + 1}`).value = 'Total Auto-Approved'
  worksheet.getCell(`B${currentRow + 1}`).value = expenses.length
  worksheet.getCell(`A${currentRow + 2}`).value = 'Total Bypassed Value'
  worksheet.getCell(`B${currentRow + 2}`).value = totalValue
  worksheet.getCell(`B${currentRow + 2}`).numFmt = '"$"#,##0.00'
  worksheet.getCell(`B${currentRow + 2}`).font = { bold: true, color: { argb: GREEN } }
  currentRow += 4

  const headerRow = worksheet.getRow(currentRow)
  headerRow.values = ['#', 'Date & Time', 'Type', 'Description', 'Approved By', 'Amount', 'Rule']
  headerRow.font = { bold: true, color: { argb: 'FFFFFF' } }
  headerRow.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ORANGE } }
  })
  currentRow += 1

  expenses.forEach((item, i) => {
    const row = worksheet.getRow(currentRow + i)
    row.values = [
      i + 1,
      formatWhen(item),
      categoryLabel(item),
      item.description || item.title || '—',
      approvedByLabel(item),
      Math.abs(Number(item.amount || 0)),
      autoApprovalRuleLabel(item),
    ]
    row.getCell(6).numFmt = '"$"#,##0.00'
    row.getCell(6).font = { bold: true }
  })

  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = `AutoApprovals_Audit_${new Date().toISOString().slice(0, 10)}.xlsx`
  link.click()
  URL.revokeObjectURL(link.href)
}
