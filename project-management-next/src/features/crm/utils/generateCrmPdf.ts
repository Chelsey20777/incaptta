import jsPDF from 'jspdf'
import { formatCurrency } from '@/features/inventory/utils/pricing'
import {
  setupFonts,
  setupDoc,
  drawHeader,
  drawGreenBar,
  drawJobCardInfoRow,
  renderBrandedItemsTable,
  drawTotalsRight,
  drawFooter,
  drawWatermarkOnAllPages,
  getSealImage,
  toFormattedDate,
  type CompanySettingsLike,
  type FinanceSettingsLike,
} from '@/features/jobCards/utils/pdfBranding'
import type { FirestoreQuote } from '../types'
import { resolvePersonDisplayName } from '@/lib/person-name'
import { calculateQuoteCommercials, lineExtendedAmounts, sectionExtendedTotal } from '@/lib/crm/quotation-commercial'

type CrmPdfDocument = FirestoreQuote & {
  invoiceNumber?: string
  quoteRef?: string
  dueDate?: string | { toDate?: () => Date }
  vatAmount?: number
  vatRate?: number
  signatureUrl?: string
  position?: string
  createdBy?: string
  createdByName?: string
  discountType?: string
  discountValue?: number
  discountAmount?: number
}

function formatDocDate(value: unknown): string {
  if (!value) return ''
  if (value && typeof (value as { toDate?: () => Date }).toDate === 'function') {
    return toFormattedDate(value)
  }
  return toFormattedDate(value)
}

function buildBillToLine2(data: CrmPdfDocument): string {
  const parts = [
    data.customerEmail || '',
    data.dimensionsOfStructure ? `Structure: ${data.dimensionsOfStructure}` : '',
  ].filter(Boolean)
  return parts.join(' · ')
}

export async function generateCrmPdf(
  data: CrmPdfDocument,
  type: 'QUOTATION' | 'INVOICE' = 'QUOTATION',
  settings?: CompanySettingsLike,
  financeSettings?: FinanceSettingsLike,
  creatorName?: string,
  jobCategories: { id: string; name?: string }[] = [],
): Promise<void> {
  if (!data) return

  const doc = new jsPDF()
  await setupFonts(doc)
  setupDoc(doc)

  const headerBottomY = await drawHeader(doc, settings)
  const greenBarY = headerBottomY + 8
  drawGreenBar(doc, greenBarY)

  const referenceNo =
    type === 'INVOICE'
      ? data.invoiceNumber || `INV-${(data.id || '').substring(0, 8).toUpperCase()}`
      : data.quoteNumber || data.quoteRef || (data.id || '').substring(0, 8)

  const adviceText =
    financeSettings?.termsAdvised || settings?.invoiceAdviceText || ''

  const dueDate =
    formatDocDate(data.dueDate) || formatDocDate(data.validUntil)

  let currentY = drawJobCardInfoRow(
    doc,
    {
      leftTitle: 'BILL ADDRESSED TO',
      leftLine1: data.customerName || 'Unknown Client',
      leftLine2: buildBillToLine2(data),
      docTitle: type,
      docNumber: `#${referenceNo}`,
      dateIssued:
        data.createdAt?.toDate?.()
          ? toFormattedDate(data.createdAt.toDate())
          : toFormattedDate(new Date()),
      adviceText,
      dueDate,
      generatedBy: resolvePersonDisplayName(creatorName, data.createdByName),
    },
    greenBarY + 14,
  )

  const otherServices: CrmPdfDocument['otherServices'] = Array.isArray(data.otherServices)
    ? data.otherServices
    : []
  const body: string[][] = []

  if (Array.isArray(data.requisitionSections) && data.requisitionSections.length > 0) {
    data.requisitionSections.forEach((section) => {
      const sectionTotal = sectionExtendedTotal(section)
      const cat = jobCategories.find((c) => c.id === section.jobCategoryId)
      const catName = (
        cat?.name ||
        (section as { categoryName?: string }).categoryName ||
        section.jobCategoryId ||
        'Service'
      ).toUpperCase()
      const qtyVal = Math.max(1, Number(section.qty) || 1)
      const unitVal = String(section.unit || '').trim()
      const unitPriceVal = sectionTotal / qtyVal
      body.push([
        catName,
        section.description ||
          (section.items || [])
            .map((it) => it.itemName || it.description)
            .filter(Boolean)
            .join(', '),
        String(qtyVal),
        unitVal,
        formatCurrency(unitPriceVal),
        formatCurrency(sectionTotal),
      ])
    })
  } else {
    const items = Array.isArray(data.items) ? data.items : []
    items.forEach((item) => {
      body.push([
        item.description || 'No Name',
        item.description || '',
        String(item.qty || 1),
        '',
        formatCurrency(lineExtendedAmounts({
          qtyRequired: 1,
          irdSellingPrice: item.price,
          markupPercent: item.markupPercent,
        }).totalPrice),
        formatCurrency(lineExtendedAmounts(item).totalPrice),
      ])
    })
  }

  otherServices.forEach((service) => {
    body.push([
      service.description || 'Service',
      '',
      String(service.qty || 1),
      '',
      formatCurrency(service.price || 0),
      formatCurrency(service.total || 0),
    ])
  })

  const head = ['Item Name', 'Description', 'Qty', 'Unit', 'Unit Price', 'Total Cost']
  currentY = renderBrandedItemsTable(doc, currentY, head, body, {
    0: { cellWidth: 32, halign: 'center', fontStyle: 'bold' },
    1: { cellWidth: 'auto', halign: 'left' },
    2: { cellWidth: 14, halign: 'center' },
    3: { cellWidth: 16, halign: 'center' },
    4: { cellWidth: 24, halign: 'right' },
    5: { cellWidth: 24, halign: 'right' },
  })

  const sectionMaterials = (data.requisitionSections || []).flatMap(section => section.items || [])
  const materials = sectionMaterials.length
    ? sectionMaterials
    : (Array.isArray(data.items) ? data.items : []).map(item => ({
        qtyRequired: item.qty,
        irdSellingPrice: item.price,
        markupPercent: item.markupPercent,
        costSnapshot: (item as { costSnapshot?: number }).costSnapshot,
      }))
  const storedSubtotal = Number(data.summary?.subtotal || 0)
  const storedVat = Number(data.vatAmount ?? data.summary?.vatAmount ?? 0)
  const vatEnabled = storedSubtotal > 0
    ? storedVat > 0
    : financeSettings?.vatEnabled !== false
  const calculated = (materials.length || otherServices.length)
    ? calculateQuoteCommercials({
        materials,
        services: otherServices,
        vatEnabled,
        vatRate: Number(data.vatRate ?? data.summary?.vatRate ?? financeSettings?.vatRate ?? 15),
        discountType: data.discountType || data.summary?.discountType,
        discountValue: data.discountValue ?? data.summary?.discountValue,
      })
    : null
  const grandTotal = calculated?.customerTotal || data.grandTotal || 0
  const vatAmount = calculated?.vatAmount ?? storedVat
  const vatRate = calculated?.vatRate ?? (data.vatRate ?? data.summary?.vatRate ?? 0)
  const subtotal = calculated?.subtotal ?? (data.summary?.subtotal ?? grandTotal - vatAmount)
  const discountAmount = calculated?.discountAmount ?? Number(data.summary?.discountAmount || data.discountAmount || 0)
  const discountType = calculated?.discountType || data.summary?.discountType || data.discountType

  currentY = drawTotalsRight(doc, currentY, {
    subtotal,
    discount: discountAmount,
    discountLabel: discountType === 'PERCENT' ? `Discount (${calculated?.discountValue ?? data.summary?.discountValue ?? 0}%)` : 'Discount',
    vat: vatAmount,
    vatRate,
    total: grandTotal,
  })

  const settingsAny = settings as CompanySettingsLike & {
    managerSignatureUrl?: string
    managerSignatureDataUrl?: string
    signatureUrl?: string
    managerName?: string
    managerPosition?: string
  }

  // Creator-first: document creator name/signature/position, then company manager fallback
  await drawFooter(
    doc,
    currentY,
    settings,
    financeSettings,
    creatorName || settingsAny?.managerName || 'Authorized Signatory',
    {
      signatureUrl:
        data.signatureUrl ||
        settingsAny?.managerSignatureDataUrl ||
        settingsAny?.managerSignatureUrl ||
        settingsAny?.signatureUrl,
      position: data.position || settingsAny?.managerPosition || 'Manager',
    },
  )

  const sealImg = await getSealImage(settings)
  if (sealImg) drawWatermarkOnAllPages(doc, sealImg)

  const fileName = `${type}_${referenceNo}.pdf`
  doc.save(fileName)
}
