import { FieldValue } from 'firebase-admin/firestore'
import type { DocumentSnapshot, QuerySnapshot } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase-admin'
import { acceptanceDocumentIds } from '@/lib/crm/quotation-commercial'
import {
  isCrmStaff,
  mapLeadToCustomerInput,
  normalizeCustomerProfile,
  sensitiveCustomerChanges,
} from '@/lib/customer-profile'
import {
  ensureClientCreditAccountInTransaction,
  readClientCreditAccount,
} from '@/lib/server/client-credit-account'

export function requireCrmStaff(roles: string[]): void {
  if (!isCrmStaff(roles)) {
    throw Object.assign(new Error('CRM access required'), { status: 403 })
  }
}

export async function createCustomer(input: Record<string, unknown>, actorUid: string) {
  const profile = normalizeCustomerProfile(input, true)
  const ref = adminDb.collection('customers').doc()
  await adminDb.runTransaction(async (tx) => {
    const creditSnap = await readClientCreditAccount(tx, ref.id)
    const now = FieldValue.serverTimestamp()
    tx.create(ref, { ...profile, createdAt: now, updatedAt: now })
    tx.create(adminDb.collection('customerAuditLogs').doc(), {
      customerId: ref.id, action: 'CREATE', actorUid,
      changes: {
        status: { before: null, after: profile.status },
        creditLimit: { before: null, after: profile.creditLimit },
      },
      createdAt: now,
    })
    ensureClientCreditAccountInTransaction(
      tx,
      { clientId: ref.id, clientName: profile.name, currency: 'USD' },
      creditSnap,
    )
  })
  return { id: ref.id }
}

export async function updateCustomer(id: string, input: Record<string, unknown>, actorUid: string) {
  const ref = adminDb.collection('customers').doc(id)
  await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    if (!snap.exists) throw Object.assign(new Error('Customer not found'), { status: 404 })
    const before = snap.data() || {}
    const profile = normalizeCustomerProfile({ ...before, ...input }, false)
    const changes = sensitiveCustomerChanges(before, profile)
    tx.update(ref, { ...profile, updatedAt: FieldValue.serverTimestamp() })
    if (Object.keys(changes).length) {
      tx.create(adminDb.collection('customerAuditLogs').doc(), {
        customerId: id, action: 'UPDATE', actorUid, changes,
        createdAt: FieldValue.serverTimestamp(),
      })
    }
  })
  return { id }
}

export async function deleteUnlinkedCustomer(id: string) {
  const ref = adminDb.collection('customers').doc(id)
  await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    if (!snap.exists) throw Object.assign(new Error('Customer not found'), { status: 404 })
    const name = String(snap.data()?.name || '').trim()
    const linkedQueries = [
      adminDb.collection('crmInvoices').where('customerId', '==', id),
      adminDb.collection('crmQuotes').where('customerId', '==', id),
      adminDb.collection('jobCards').where('generalInfo.customerId', '==', id),
      adminDb.collection('hireContracts').where('customerId', '==', id),
      adminDb.collection('clientCreditTransactions').where('clientId', '==', id),
      ...(name ? [
        adminDb.collection('crmInvoices').where('customerName', '==', name),
        adminDb.collection('crmQuotes').where('customerName', '==', name),
        adminDb.collection('jobCards').where('generalInfo.recipientName', '==', name),
        adminDb.collection('hireContracts').where('customerName', '==', name),
      ] : []),
    ]
    const [account, ...links] = await Promise.all([
      tx.get(adminDb.collection('clientCreditAccounts').doc(id)),
      ...linkedQueries.map((query) => tx.get(query.limit(1))),
    ])
    if (account.exists || links.some((result) => !result.empty)) {
      throw Object.assign(new Error('Customer has linked records. Mark the customer INACTIVE instead.'), { status: 409 })
    }
    tx.delete(ref)
  })
  return { id }
}

function fail(message: string, status: number): never {
  throw Object.assign(new Error(message), { status })
}

export async function convertLeadToCustomer(params: {
  leadId: string
  actorUid: string
  existingCustomerId?: string
  profile?: Record<string, unknown>
}) {
  const leadId = String(params.leadId || '').trim()
  if (!leadId) fail('Lead is required', 400)

  const existingCustomerId = String(params.existingCustomerId || '').trim()
  const leadRef = adminDb.collection('leads').doc(leadId)
  const extras = params.profile || {}

  return adminDb.runTransaction(async (tx) => {
    const leadSnap = await tx.get(leadRef)
    if (!leadSnap.exists) fail('Enquiry not found', 404)
    const lead = leadSnap.data() || {}
    const alreadyId = String(lead.customerId || '').trim()
    const alreadyRef = alreadyId ? adminDb.collection('customers').doc(alreadyId) : null
    const existingRef = existingCustomerId ? adminDb.collection('customers').doc(existingCustomerId) : null
    const [alreadySnap, existingSnap] = await Promise.all([
      alreadyRef ? tx.get(alreadyRef) : Promise.resolve(null),
      existingRef ? tx.get(existingRef) : Promise.resolve(null),
    ])

    const quotesSnap = await tx.get(adminDb.collection('crmQuotes').where('leadId', '==', leadId))
    const invoiceReads: Array<Promise<DocumentSnapshot | QuerySnapshot>> = []
    for (const quoteDoc of quotesSnap.docs) {
      invoiceReads.push(tx.get(adminDb.collection('crmInvoices').where('quoteId', '==', quoteDoc.id)))
      invoiceReads.push(tx.get(adminDb.collection('crmInvoices').doc(acceptanceDocumentIds(quoteDoc.id).invoiceId)))
    }
    const invoiceSnaps = await Promise.all(invoiceReads)

    if (alreadySnap?.exists) {
      const creditSnap = await readClientCreditAccount(tx, alreadyId)
      ensureClientCreditAccountInTransaction(
        tx,
        {
          clientId: alreadyId,
          clientName: String(alreadySnap.data()?.name || ''),
          currency: 'USD',
        },
        creditSnap,
      )
      return { id: alreadyId, linked: true, alreadyConverted: true }
    }

    const now = FieldValue.serverTimestamp()
    let customerId = existingCustomerId
    let created = false
    let customerName = ''
    let customerEmail = ''

    // Pre-read credit account for whichever customer id we will use
    let creditTargetId = existingCustomerId
    if (!existingCustomerId) {
      creditTargetId = adminDb.collection('customers').doc().id
    }
    const creditSnap = creditTargetId
      ? await readClientCreditAccount(tx, creditTargetId)
      : null

    if (existingCustomerId) {
      if (!existingSnap?.exists) fail('Customer not found', 404)
      const existing = existingSnap.data() || {}
      customerName = String(existing.name || '')
      customerEmail = String(existing.email || '')
      tx.update(existingRef!, {
        sourceLeadId: leadId,
        updatedAt: now,
      })
      ensureClientCreditAccountInTransaction(
        tx,
        { clientId: existingCustomerId, clientName: customerName, currency: 'USD' },
        creditSnap,
      )
    } else {
      const profile = normalizeCustomerProfile(mapLeadToCustomerInput(lead, extras), true)
      const customerRef = adminDb.collection('customers').doc(creditTargetId)
      customerId = customerRef.id
      created = true
      customerName = profile.name
      customerEmail = profile.email
      tx.create(customerRef, {
        ...profile,
        sourceLeadId: leadId,
        createdAt: now,
        updatedAt: now,
      })
      tx.create(adminDb.collection('customerAuditLogs').doc(), {
        customerId,
        action: 'CREATE',
        actorUid: params.actorUid,
        changes: {
          status: { before: null, after: profile.status },
          creditLimit: { before: null, after: profile.creditLimit },
        },
        createdAt: now,
      })
      ensureClientCreditAccountInTransaction(
        tx,
        { clientId: customerId, clientName: customerName, currency: 'USD' },
        creditSnap,
      )
    }

    tx.update(leadRef, {
      customerId,
      identityStatus: 'CUSTOMER',
      updatedAt: now,
    })

    const seen = new Set<string>()
    const patchRecord = (snap: DocumentSnapshot, draftInvoiceOnly = false) => {
      if (!snap.exists || seen.has(`${snap.ref.path}`)) return
      seen.add(snap.ref.path)
      const data = snap.data() || {}
      const linkedId = String(data.customerId || '').trim()
      if (linkedId && linkedId !== customerId) return
      if (draftInvoiceOnly && String(data.status || '').toUpperCase() !== 'DRAFT') return
      tx.update(snap.ref, {
        customerId,
        customerName: customerName || data.customerName || '',
        customerEmail: customerEmail || data.customerEmail || '',
        updatedAt: now,
      })
    }

    for (const quoteDoc of quotesSnap.docs) patchRecord(quoteDoc, false)
    for (const invoiceSnap of invoiceSnaps) {
      if ('docs' in invoiceSnap) {
        for (const doc of invoiceSnap.docs) patchRecord(doc, true)
      } else {
        patchRecord(invoiceSnap, true)
      }
    }

    return { id: customerId, linked: !created, alreadyConverted: false, created }
  })
}
