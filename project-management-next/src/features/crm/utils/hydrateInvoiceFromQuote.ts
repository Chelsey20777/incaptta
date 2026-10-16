import { db } from '@/lib/firebase'
import { doc, getDoc } from 'firebase/firestore'
import { prepareQuoteAcceptanceCommercial } from '@/lib/crm/quotation-commercial'

function withExtendedCommercials(document: any) {
  const hasLines = (Array.isArray(document?.requisitionSections) && document.requisitionSections.length > 0)
    || (Array.isArray(document?.items) && document.items.length > 0)
  if (!hasLines) return document
  const prepared = prepareQuoteAcceptanceCommercial(document)
  return {
    ...document,
    requisitionSections: prepared.sections,
    items: prepared.items,
    summary: { ...(document.summary || {}), ...prepared.summary },
    grandTotal: prepared.grandTotal,
  }
}

function invoiceHasCommercialLines(invoice: any) {
  const hasSections = Array.isArray(invoice?.requisitionSections) && invoice.requisitionSections.length > 0
  const hasItems = Array.isArray(invoice?.items) && invoice.items.length > 0
  const hasServices = Array.isArray(invoice?.otherServices) && invoice.otherServices.length > 0
  return hasSections || hasItems || hasServices
}

/** Fill missing commercial lines from the source quote when the invoice stub is sparse. */
export async function hydrateInvoiceFromQuote(invoice: any) {
  if (!invoice?.quoteId || invoiceHasCommercialLines(invoice)) return withExtendedCommercials(invoice)
  const snap = await getDoc(doc(db, 'crmQuotes', String(invoice.quoteId)))
  if (!snap.exists()) return withExtendedCommercials(invoice)
  const quote = snap.data() || {}
  return withExtendedCommercials({
    ...invoice,
    requisitionSections: invoice.requisitionSections?.length
      ? invoice.requisitionSections
      : quote.requisitionSections || [],
    items: invoice.items?.length ? invoice.items : quote.items || [],
    otherServices: invoice.otherServices?.length ? invoice.otherServices : quote.otherServices || [],
    summary: invoice.summary || quote.summary || null,
    grandTotal: invoice.grandTotal || quote.grandTotal || invoice.amount || 0,
    dimensionsOfStructure: invoice.dimensionsOfStructure || quote.dimensionsOfStructure || '',
    notes: invoice.notes || quote.notes || '',
  })
}
