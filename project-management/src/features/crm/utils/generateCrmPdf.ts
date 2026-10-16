import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { formatCurrency } from '@/features/inventory/utils/pricing'
import {
    setupFonts,
    setupDoc,
    drawHeader,
    drawGreenBar,
    drawJobCardInfoRow,
    renderBrandedItemsTable,
    drawTotalsRight,
    drawFooter, // Added
    drawWatermarkOnAllPages,
    getSealImage,
    SECONDARY_TEXT_COLOR, // Added
    type CompanySettingsLike,
    type FinanceSettingsLike // Added
} from '@/features/jobCards/utils/pdfBranding'

export async function generateCrmPdf(
    data: any,
    type: 'QUOTATION' | 'INVOICE',
    settings?: CompanySettingsLike,
    financeSettings?: FinanceSettingsLike,
    creatorName?: string,
    jobCategories: any[] = []
) {
    if (!data) return

    const doc = new jsPDF()
    await setupFonts(doc)
    setupDoc(doc)

    // 1. Branded Header
    const headerBottomY = await drawHeader(doc, settings)
    const greenBarY = headerBottomY + 8
    drawGreenBar(doc, greenBarY)

    // 2. Meta Information Row
    const referenceNo = type === 'INVOICE'
        ? `INV-${data.id.substring(0, 8).toUpperCase()}`
        : (data.quoteRef || data.id.substring(0, 8))

    const adviceText = financeSettings?.termsAdvised || settings?.invoiceAdviceText || "";

    let currentY = drawJobCardInfoRow(doc, {
        leftTitle: "BILL ADDRESSED TO",
        leftLine1: data.customerName || 'Unknown Client',
        leftLine2: data.customerEmail || "",
        docTitle: type,
        docNumber: `#${referenceNo}`,
        dateIssued: data.createdAt?.toDate?.()?.toLocaleDateString() || new Date().toLocaleDateString(),
        adviceText: adviceText,
        dueDate: data.dueDate?.toDate?.()?.toLocaleDateString() || data.dueDate || ""
    }, greenBarY + 14)

    // 3. Line Items Table
    const otherServices: any[] = Array.isArray(data.otherServices) ? data.otherServices : []
    const body: any[][] = []

    if (Array.isArray(data.requisitionSections) && data.requisitionSections.length > 0) {
        // Sectioned structure (Like Job Card)
        data.requisitionSections.forEach((section: any) => {
            const sectionTotal = (section.items || []).reduce((sum: number, i: any) => {
                const qty = i.qtyRequired || i.qty || 0
                const price = i.irdSellingPrice || i.price || 0
                const markup = i.markupPercent || 0
                const itemTotal = i.rowGrandTot || i.total || (qty * price * (1 + (markup / 100)))
                return sum + itemTotal
            }, 0)
            const cat = jobCategories.find(c => c.id === section.jobCategoryId)
            const catName = (cat?.name || section.categoryName || section.jobCategoryId || 'Service').toUpperCase()
            const qtyVal = Math.max(1, Number(section.qty) || 1)
            const unitVal = section.unit || ''
            const unitPriceVal = sectionTotal / qtyVal
            const qtyStr = unitVal ? `${qtyVal} ${unitVal}` : `${qtyVal}`
            body.push([
                catName,
                section.description || (section.items || []).map((it: any) => it.itemName || it.description).join(', '),
                qtyStr,
                formatCurrency(unitPriceVal),
                formatCurrency(sectionTotal)
            ])
        })
    } else {
        // Legacy flat structure
        const items: any[] = Array.isArray(data.items) ? data.items : []
        items.forEach((item: any) => {
            body.push([
                item.itemName || item.description || 'No Name',
                item.description || '',
                item.qty || 1,
                formatCurrency((item.price || 0) * (1 + (item.markupPercent || 0) / 100)),
                formatCurrency(item.total || 0)
            ])
        })
    }

    // Add other services
    otherServices.forEach((service: any) => {
        body.push([
            service.description || 'Service',
            '',
            service.qty || 1,
            formatCurrency(service.price || 0),
            formatCurrency(service.total || 0)
        ])
    })

    const head = ['Item Name', 'Description', 'Qty', 'Unit Price', 'Total Cost']

    currentY = renderBrandedItemsTable(doc, currentY, head, body)

    // 4. Summary Section
    const grandTotal = data.grandTotal || 0
    const vatAmount = data.vatAmount || 0
    const vatRate = data.vatRate || 0
    const subtotal = data.summary?.subtotal || (grandTotal - vatAmount)

    currentY = drawTotalsRight(doc, currentY, { 
        subtotal, 
        vat: vatAmount, 
        vatRate: vatRate,
        total: grandTotal 
    })

    // 5. Footer & Watermark
    // Call shared drawFooter
    await drawFooter(doc, currentY, settings, financeSettings, creatorName, {
        signatureUrl: data.signatureUrl || settings?.signatureUrl,
        position: data.position || "Manager"
    })

    // Draw watermark at the very end to ensure all pages (including those added by footer) are covered
    const sealImg = await getSealImage(settings)
    if (sealImg) drawWatermarkOnAllPages(doc, sealImg)

    // 6. Output File
    const fileName = `${type}_${referenceNo}.pdf`
    doc.save(fileName)
}
