import { FieldValue, type DocumentSnapshot } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase-admin'
import {
  acceptanceDocumentIds,
  canSendQuote,
  catalogueCostOf,
  prepareQuoteAcceptanceCommercial,
  sectionsNeedCommercialStamp,
  stampRequisitionSections,
} from '@/lib/crm/quotation-commercial'
import {
  billingHoldReason,
  draftInvoiceIssuable,
  initialBillableAmount,
  resolveBillingTerms,
} from '@/lib/crm/billing-terms'
import { mapLeadToCustomerInput, normalizeCustomerProfile } from '@/lib/customer-profile'

const MANAGER_ROLES = new Set(['MANAGER', 'DIRECTOR', 'ADMIN', 'SUPER_ADMIN'])

/** Customer-facing commercial fields the invoice PDF needs (no internal costing). */
function invoiceCommercialSnapshot(
  quote: Record<string, any>,
  prepared: ReturnType<typeof prepareQuoteAcceptanceCommercial>,
) {
  return {
    requisitionSections: prepared.sections,
    items: prepared.items,
    otherServices: Array.isArray(quote.otherServices) ? quote.otherServices : [],
    summary: prepared.summary,
    grandTotal: prepared.grandTotal,
    dimensionsOfStructure: quote.dimensionsOfStructure || '',
    notes: quote.notes || '',
  }
}

function isDraftJobNumber(value: unknown) {
  return /^JC-DRAFT-/i.test(String(value || '').trim())
}

const CRM_INVOICE_START = 2000

function isDraftInvoiceNumber(value: unknown) {
  return /^INV-DRAFT-/i.test(String(value || '').trim())
}

/** Same sequence as client generateInvoiceNumber: INV-2000 via systemCounters/crmInvoices. */
function allocateProductionInvoiceNumber(counterSnap: DocumentSnapshot) {
  let seq = CRM_INVOICE_START
  if (counterSnap.exists) {
    const current = Number(counterSnap.data()?.sequence)
    seq = (Number.isFinite(current) ? current : CRM_INVOICE_START - 1) + 1
  }
  if (seq < CRM_INVOICE_START) seq = CRM_INVOICE_START
  return {
    invoiceNumber: `INV-${seq}`,
    counter: { sequence: seq, prefix: 'INV' },
  }
}

/** Same sequence as client generateJobNumber: JC-YYYY-0001 via systemCounters/jobCards. */
function allocateProductionJobNumber(counterSnap: DocumentSnapshot) {
  const currentYear = new Date().getFullYear()
  let seq = 1
  if (counterSnap.exists) {
    const data = counterSnap.data() || {}
    if (Number(data.currentYear) === currentYear) seq = Number(data.sequence || 0) + 1
  }
  return {
    jobNumber: `JC-${currentYear}-${String(seq).padStart(4, '0')}`,
    counter: { currentYear, sequence: seq },
  }
}

function invoiceMissingCommercialLines(invoice: Record<string, any> | undefined) {
  if (!invoice) return true
  const hasSections = Array.isArray(invoice.requisitionSections) && invoice.requisitionSections.length > 0
  const hasItems = Array.isArray(invoice.items) && invoice.items.length > 0
  const hasServices = Array.isArray(invoice.otherServices) && invoice.otherServices.length > 0
  return !hasSections && !hasItems && !hasServices
}

export function isManagerRole(roles: string[]) {
  return roles.some(role => MANAGER_ROLES.has(role))
}

export async function reviewQuoteRevision(params: {
  quoteId: string
  action: 'SUBMIT' | 'APPROVE_TO_SEND' | 'REQUEST_CHANGES' | 'RECORD_SENT'
  actor: { uid: string; name: string; roles: string[] }
  reason?: string
  send?: { recipient?: string; channel?: string }
}) {
  const quoteRef = adminDb.collection('crmQuotes').doc(params.quoteId)
  return adminDb.runTransaction(async tx => {
    const snap = await tx.get(quoteRef)
    if (!snap.exists) throw Object.assign(new Error('Quotation not found'), { status: 404 })
    const quote = snap.data() || {}
    const now = FieldValue.serverTimestamp()
    const event = {
      action: params.action,
      actor: { uid: params.actor.uid, name: params.actor.name },
      reason: params.reason || null,
      at: new Date().toISOString(),
    }

    if (params.action === 'SUBMIT') {
      tx.update(quoteRef, {
        reviewStatus: 'PENDING_MANAGER',
        status: quote.status === 'ACCEPTED' ? quote.status : 'DRAFT',
        reviewHistory: [...(Array.isArray(quote.reviewHistory) ? quote.reviewHistory : []), event],
        updatedAt: now,
      })
      return { reviewStatus: 'PENDING_MANAGER', status: 'DRAFT' }
    }

    if (params.action === 'APPROVE_TO_SEND') {
      if (!isManagerRole(params.actor.roles)) {
        throw Object.assign(new Error('Manager approval is required before a quotation can be sent'), { status: 403 })
      }
      tx.update(quoteRef, {
        reviewStatus: 'APPROVED_TO_SEND',
        approvedToSendBy: params.actor,
        approvedToSendAt: now,
        reviewHistory: [...(Array.isArray(quote.reviewHistory) ? quote.reviewHistory : []), event],
        updatedAt: now,
      })
      return { reviewStatus: 'APPROVED_TO_SEND', status: quote.status || 'DRAFT' }
    }

    if (params.action === 'REQUEST_CHANGES') {
      if (!isManagerRole(params.actor.roles)) {
        throw Object.assign(new Error('Only a manager can return a quotation for changes'), { status: 403 })
      }
      if (!String(params.reason || '').trim()) {
        throw Object.assign(new Error('A reason is required when returning changes'), { status: 400 })
      }
      tx.update(quoteRef, {
        reviewStatus: 'CHANGES_REQUIRED',
        reviewHistory: [...(Array.isArray(quote.reviewHistory) ? quote.reviewHistory : []), event],
        updatedAt: now,
      })
      return { reviewStatus: 'CHANGES_REQUIRED', status: quote.status || 'DRAFT' }
    }

    if (!canSendQuote(String(quote.reviewStatus || ''))) {
      throw Object.assign(new Error('Quotation must be manager-approved before it is recorded as sent'), { status: 409 })
    }
    const leadRef = quote.leadId ? adminDb.collection('leads').doc(String(quote.leadId)) : null
    const leadSnap = leadRef ? await tx.get(leadRef) : null
    tx.update(quoteRef, {
      status: 'SENT',
      sentAt: now,
      sentTo: params.send || {},
      reviewHistory: [...(Array.isArray(quote.reviewHistory) ? quote.reviewHistory : []), event],
      updatedAt: now,
    })
    if (leadRef && leadSnap?.exists && leadSnap.data()?.stage !== 'Won' && leadSnap.data()?.stage !== 'Lost') {
      tx.update(leadRef, { stage: 'Proposal', updatedAt: now })
    }
    return { reviewStatus: quote.reviewStatus, status: 'SENT' }
  })
}

export async function acceptApprovedQuote(params: {
  quoteId: string
  actor: { uid: string; name: string; roles: string[] }
  acceptance: { acceptedBy: string; acceptedAt?: string; evidence?: string }
}) {
  if (!String(params.acceptance.acceptedBy || '').trim()) {
    throw Object.assign(new Error('Acceptance must record the accepting person'), { status: 400 })
  }

  const quoteRef = adminDb.collection('crmQuotes').doc(params.quoteId)
  const { jobCardId: deterministicJobId, invoiceId } = acceptanceDocumentIds(params.quoteId)
  const invoiceRef = adminDb.collection('crmInvoices').doc(invoiceId)

  return adminDb.runTransaction(async tx => {
    const quoteSnap = await tx.get(quoteRef)
    if (!quoteSnap.exists) throw Object.assign(new Error('Quotation not found'), { status: 404 })
    const quote = quoteSnap.data() || {}

    // Reuse a job already linked on the quote (legacy Create Job Card path); otherwise use deterministic id.
    const preferredJobId = String(quote.linkedJobCardId || '').trim() || deterministicJobId
    const jobRef = adminDb.collection('jobCards').doc(preferredJobId)
    const jobCardId = preferredJobId

    const [jobSnap, invoiceSnap] = await Promise.all([tx.get(jobRef), tx.get(invoiceRef)])
    const leadRef = quote.leadId ? adminDb.collection('leads').doc(String(quote.leadId)) : null
    const leadSnap = leadRef ? await tx.get(leadRef) : null
    const lead = leadSnap?.exists ? (leadSnap.data() || {}) : null
    const linkedCustomerId = String(quote.customerId || lead?.customerId || '').trim()
    const existingCustomerRef = linkedCustomerId ? adminDb.collection('customers').doc(linkedCustomerId) : null
    const customerSnap = existingCustomerRef ? await tx.get(existingCustomerRef) : null
    const newCustomerRef = (!linkedCustomerId || !customerSnap?.exists) && leadRef && leadSnap?.exists
      ? adminDb.collection('customers').doc()
      : null
    if (quote.status === 'REJECTED') {
      throw Object.assign(new Error('A rejected quotation cannot be accepted'), { status: 409 })
    }
    if (!canSendQuote(String(quote.reviewStatus || '')) && quote.status !== 'SENT' && quote.status !== 'ACCEPTED') {
      throw Object.assign(new Error('Only an approved quotation revision can be accepted'), { status: 409 })
    }

    const counterRef = adminDb.collection('systemCounters').doc('jobCards')
    const invoiceCounterRef = adminDb.collection('systemCounters').doc('crmInvoices')
    const [counterSnap, invoiceCounterSnap] = await Promise.all([
      tx.get(counterRef),
      tx.get(invoiceCounterRef),
    ])

    const costById: Record<string, number> = {}
    const catalogueIds = new Set<string>()
    const sectionSources = [
      ...(Array.isArray(quote.requisitionSections) ? quote.requisitionSections : []),
      ...(jobSnap.exists && Array.isArray(jobSnap.data()?.requisitionSections) ? jobSnap.data()?.requisitionSections : []),
    ]
    for (const section of sectionSources) {
      for (const item of section?.items || []) {
        if ((Number(item?.costSnapshot) || 0) <= 0 && item?.inventoryItemId) {
          catalogueIds.add(String(item.inventoryItemId))
        }
      }
    }
    for (const itemId of catalogueIds) {
      const inventorySnap = await tx.get(adminDb.collection('inventoryItems').doc(itemId))
      if (inventorySnap.exists) costById[itemId] = catalogueCostOf(inventorySnap.data())
    }
    const prepared = prepareQuoteAcceptanceCommercial(quote, costById)

    const now = FieldValue.serverTimestamp()
    let customerId = customerSnap?.exists ? linkedCustomerId : ''
    let customerName = String(customerSnap?.data()?.name || quote.customerName || '')
    let customerEmail = String(customerSnap?.data()?.email || quote.customerEmail || '')

    if (newCustomerRef && lead) {
      const profile = normalizeCustomerProfile(mapLeadToCustomerInput(lead, {
        name: quote.customerName,
        email: quote.customerEmail,
      }), true)
      customerId = newCustomerRef.id
      customerName = profile.name
      customerEmail = profile.email
      tx.create(newCustomerRef, {
        ...profile,
        sourceLeadId: String(quote.leadId),
        createdAt: now,
        updatedAt: now,
      })
    } else if (existingCustomerRef && customerSnap?.exists) {
      tx.update(existingCustomerRef, {
        sourceLeadId: quote.leadId || customerSnap.data()?.sourceLeadId || null,
        becameCustomerAt: customerSnap.data()?.becameCustomerAt || now,
        updatedAt: now,
      })
    }

    const alreadyAccepted = quote.status === 'ACCEPTED' && jobSnap.exists && invoiceSnap.exists
    const existingJobNumber = String(jobSnap.data()?.generalInfo?.jobNumber || '').trim()
    const needsJobNumber = !jobSnap.exists || !existingJobNumber || isDraftJobNumber(existingJobNumber)
    let jobNumber = existingJobNumber
    if (needsJobNumber) {
      const allocated = allocateProductionJobNumber(counterSnap)
      jobNumber = allocated.jobNumber
      tx.set(counterRef, { ...allocated.counter, lastUpdatedAt: now })
    }
    const existingInvoiceNumber = String(invoiceSnap.data()?.invoiceNumber || '').trim()
    const needsInvoiceNumber =
      !invoiceSnap.exists || !existingInvoiceNumber || isDraftInvoiceNumber(existingInvoiceNumber)
    let invoiceNumber = existingInvoiceNumber
    if (needsInvoiceNumber) {
      const allocated = allocateProductionInvoiceNumber(invoiceCounterSnap)
      invoiceNumber = allocated.invoiceNumber
      tx.set(invoiceCounterRef, { ...allocated.counter, lastUpdatedAt: now }, { merge: true })
    }

    if (!jobSnap.exists) {
      tx.create(jobRef, {
        status: 'DRAFT',
        sourceQuoteId: params.quoteId,
        createdFromQuoteAcceptance: true,
        generalInfo: {
          jobCardTitle: `Delivery from ${quote.quoteNumber || params.quoteId}`,
          projectDescription: quote.notes || '',
          dimensionsOfStructure: quote.dimensionsOfStructure || '',
          recipientName: customerName || quote.customerName || '',
          linkedCrmId: invoiceId,
          linkedCrmType: 'INVOICE',
          linkedCrmNumber: invoiceNumber,
          linkedCrmTotal: prepared.grandTotal,
          enquiryId: quote.leadId || null,
          customerId: customerId || null,
          acceptedQuoteRevisionId: params.quoteId,
          jobNumber,
        },
        requisitionSections: prepared.sections,
        requisitionItems: prepared.items,
        otherServices: quote.otherServices || [],
        internalEstimate: quote.internalCosting || null,
        paymentConditions: 'Pending finance billing arrangement',
        createdAt: now,
        updatedAt: now,
      })
    } else {
      // Heal legacy jobs that still point at the quote instead of the invoice.
      const gi = jobSnap.data()?.generalInfo || {}
      const needsInvoiceLink =
        gi.linkedCrmType === 'QUOTE' ||
        gi.linkedCrmId === params.quoteId ||
        !gi.linkedCrmId ||
        gi.linkedCrmType !== 'INVOICE'
      const replaceJobNumber = !String(gi.jobNumber || '').trim() || isDraftJobNumber(gi.jobNumber)
      const linkedNumberStale = String(gi.linkedCrmNumber || '').trim() !== invoiceNumber
      const existingSections = Array.isArray(jobSnap.data()?.requisitionSections)
        ? jobSnap.data()?.requisitionSections
        : []
      const healLines = !existingSections.length || sectionsNeedCommercialStamp(existingSections, costById)
      const healedSections = existingSections.length
        ? stampRequisitionSections(existingSections, costById)
        : prepared.sections
      if (needsInvoiceLink || replaceJobNumber || linkedNumberStale || healLines) {
        tx.update(jobRef, {
          ...(healLines
            ? {
                requisitionSections: healedSections,
                requisitionItems: healedSections.flatMap((section: any, sectionIndex: number) =>
                  (section.items || []).map((item: any, itemIndex: number) => ({
                    ...item,
                    id: item.id || `quote_line_${params.quoteId}_${sectionIndex}_${itemIndex}`,
                    jobCategoryId: section.jobCategoryId || item.jobCategoryId || '',
                  })),
                ),
              }
            : {}),
          ...(needsInvoiceLink
            ? {
                'generalInfo.linkedCrmId': invoiceId,
                'generalInfo.linkedCrmType': 'INVOICE',
                'generalInfo.linkedCrmTotal': Number(gi.linkedCrmTotal || prepared.grandTotal || 0),
                'generalInfo.recipientName':
                  customerName || quote.customerName || gi.recipientName || '',
                'generalInfo.customerId': customerId || gi.customerId || null,
              }
            : {}),
          ...(needsInvoiceLink || linkedNumberStale
            ? { 'generalInfo.linkedCrmNumber': invoiceNumber }
            : {}),
          ...(replaceJobNumber
            ? { 'generalInfo.jobNumber': jobNumber }
            : {}),
          updatedAt: now,
        })
      }
    }

    if (!invoiceSnap.exists) {
      const terms = resolveBillingTerms(quote.billingTerms)
      const amount = initialBillableAmount(prepared.grandTotal, terms)
      const issuable = draftInvoiceIssuable(terms)
      const commercial = invoiceCommercialSnapshot(quote, prepared)
      tx.create(invoiceRef, {
        invoiceNumber,
        customerId: customerId || null,
        customerName: customerName || quote.customerName || '',
        customerEmail: customerEmail || quote.customerEmail || '',
        amount,
        amountPaid: 0,
        balance: amount,
        status: 'DRAFT',
        dueDate: null,
        issuable,
        billingTerms: terms,
        billingHoldReason: issuable
          ? 'Draft invoice. Finance issues it separately from sending and from job approval.'
          : billingHoldReason(terms),
        quoteId: params.quoteId,
        quoteNumber: quote.quoteNumber || null,
        jobCardId,
        ...commercial,
        notes: commercial.notes || `Draft billing stub from accepted quote ${quote.quoteNumber || params.quoteId}`,
        createdAt: now,
        updatedAt: now,
      })
    } else {
      const invoiceData = invoiceSnap.data() || {}
      const draftInvoice = String(invoiceData.status || 'DRAFT') === 'DRAFT'
      const commercial = invoiceMissingCommercialLines(invoiceData) || draftInvoice
        ? invoiceCommercialSnapshot(quote, prepared)
        : null
      const missingCustomer = Boolean(customerId && !invoiceData.customerId)
      if (commercial || needsInvoiceNumber || missingCustomer) {
        tx.update(invoiceRef, {
          ...(commercial
            ? {
                ...commercial,
                notes: commercial.notes || invoiceData.notes || null,
                jobCardId: invoiceData.jobCardId || jobCardId,
                quoteId: params.quoteId,
                quoteNumber: quote.quoteNumber || invoiceData.quoteNumber || null,
                ...(draftInvoice
                  ? (() => {
                      const amount = initialBillableAmount(prepared.grandTotal, resolveBillingTerms(invoiceData.billingTerms || quote.billingTerms))
                      const paid = Number(invoiceData.amountPaid || 0)
                      return { amount, balance: Math.max(0, Number((amount - paid).toFixed(2))) }
                    })()
                  : {}),
              }
            : {}),
          ...(needsInvoiceNumber ? { invoiceNumber } : {}),
          ...(missingCustomer
            ? {
                customerId,
                customerName: customerName || invoiceSnap.data()?.customerName || '',
                customerEmail: customerEmail || invoiceSnap.data()?.customerEmail || '',
              }
            : {}),
          updatedAt: now,
        })
      }
    }

    tx.update(quoteRef, {
      status: 'ACCEPTED',
      acceptedBy: params.acceptance.acceptedBy,
      acceptedAt: params.acceptance.acceptedAt || new Date().toISOString(),
      acceptanceEvidence: params.acceptance.evidence || null,
      acceptedRevisionId: params.quoteId,
      linkedJobCardId: jobCardId,
      linkedInvoiceId: invoiceId,
      requisitionSections: prepared.sections,
      items: prepared.items,
      summary: prepared.summary,
      grandTotal: prepared.grandTotal,
      ...(customerId ? { customerId, customerName, customerEmail } : {}),
      updatedAt: now,
    })

    if (leadRef && leadSnap?.exists) {
      tx.update(leadRef, {
        stage: 'Won',
        linkedJobCardId: jobCardId,
        ...(customerId ? { customerId, identityStatus: 'CUSTOMER' } : {}),
        updatedAt: now,
      })
    }

    return {
      idempotent: alreadyAccepted,
      jobCardId,
      invoiceId,
      jobNumber,
      invoiceNumber,
      status: 'ACCEPTED',
      invoiceCreated: !invoiceSnap.exists,
    }
  })
}
