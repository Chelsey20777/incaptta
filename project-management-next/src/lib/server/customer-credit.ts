import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase-admin'
import { assertCustomerCanReceiveInvoice } from '@/lib/customer-profile'

export const NON_EXPOSURE_STATUSES = new Set(['DRAFT', 'CANCELLED'])

export type CreditOverride = {
  overrideCreditLimit?: boolean
  overrideReason?: string
}

export type CreditActor = {
  uid: string
  roles: string[]
}

export function invoiceOutstanding(data: Record<string, unknown>): number {
  const total = Number(data.amount ?? data.grandTotal ?? 0)
  const paid = Number(data.amountPaid ?? 0)
  return Math.max(0, Number((total - paid).toFixed(2)))
}

export function invoiceUsesCredit(data: Record<string, unknown>): boolean {
  return !NON_EXPOSURE_STATUSES.has(String(data.status || 'DRAFT').toUpperCase())
}

export async function nextInvoiceNumber(): Promise<string> {
  const counterRef = adminDb.collection('systemCounters').doc('crmInvoices')
  const sequence = await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(counterRef)
    const current = Number(snap.data()?.sequence)
    const next = Math.max(2000, (Number.isFinite(current) ? current : 1999) + 1)
    tx.set(counterRef, { sequence: next, prefix: 'INV', lastUpdatedAt: FieldValue.serverTimestamp() }, { merge: true })
    return next
  })
  return `INV-${sequence}`
}

export async function saveInvoiceWithCreditControl(params: {
  invoiceId?: string
  input: Record<string, unknown>
  actor: CreditActor
  override?: CreditOverride
}) {
  const invoiceRef = params.invoiceId
    ? adminDb.collection('crmInvoices').doc(params.invoiceId)
    : adminDb.collection('crmInvoices').doc()
  const generatedInvoiceNumber = !params.invoiceId && !params.input.invoiceNumber
    ? await nextInvoiceNumber()
    : null

  return adminDb.runTransaction(async (tx) => {
    const existingSnap = params.invoiceId ? await tx.get(invoiceRef) : null
    if (params.invoiceId && !existingSnap?.exists) {
      throw Object.assign(new Error('Invoice not found'), { status: 404 })
    }

    const existing: Record<string, unknown> = existingSnap?.data() || {}
    const input: Record<string, unknown> = { ...params.input }
    delete input.creditControl
    delete input.createdAt
    delete input.updatedAt
    delete input.balance
    delete input.amountPaid
    const merged: Record<string, unknown> = {
      ...existing,
      ...input,
      amountPaid: params.invoiceId ? Number(existing.amountPaid || 0) : 0,
    }
    const status = String(merged.status || 'DRAFT').toUpperCase()
    const customerId = String(merged.customerId || '').trim()
    const amount = Number(merged.amount ?? merged.grandTotal ?? 0)
    const amountPaid = Number(merged.amountPaid ?? 0)

    if (!Number.isFinite(amount) || amount < 0 || !Number.isFinite(amountPaid) || amountPaid < 0) {
      throw Object.assign(new Error('Invoice amount and amount paid must be non-negative numbers'), { status: 400 })
    }
    if (amountPaid > amount) {
      throw Object.assign(new Error('Amount paid cannot exceed the invoice total; record excess as a customer deposit'), { status: 400 })
    }
    if (status === 'PAID' && invoiceOutstanding({ amount, amountPaid }) > 0) {
      throw Object.assign(new Error('An invoice can only be marked PAID after its outstanding balance reaches zero'), { status: 400 })
    }
    if (!NON_EXPOSURE_STATUSES.has(status) && !customerId) {
      throw Object.assign(new Error('An issued invoice must be linked to a customer'), { status: 400 })
    }

    let creditControl: Record<string, unknown> | null = null
    if (customerId) {
      const customerRef = adminDb.collection('customers').doc(customerId)
      const customerSnap = await tx.get(customerRef)
      if (!customerSnap.exists) {
        throw Object.assign(new Error('Customer not found'), { status: 404 })
      }
      const customer = customerSnap.data() || {}
      if (!NON_EXPOSURE_STATUSES.has(status) && (
        !existingSnap ||
        NON_EXPOSURE_STATUSES.has(String(existing.status || 'DRAFT').toUpperCase()) ||
        customerId !== String(existing.customerId || '')
      )) {
        assertCustomerCanReceiveInvoice(customer.status)
      }
      merged.customerName = customer.name || customer.company || merged.customerName || ''
      merged.customerEmail = customer.email || merged.customerEmail || ''

      if (!NON_EXPOSURE_STATUSES.has(status)) {
        const invoiceQuery = adminDb.collection('crmInvoices').where('customerId', '==', customerId)
        const invoiceSnap = await tx.get(invoiceQuery)
        const exposureBefore = Number(invoiceSnap.docs.reduce((sum, docSnap) => {
          if (docSnap.id === invoiceRef.id) return sum
          const data = docSnap.data()
          return invoiceUsesCredit(data) ? sum + invoiceOutstanding(data) : sum
        }, 0).toFixed(2))
        const projectedOutstanding = Number((exposureBefore + invoiceOutstanding(merged)).toFixed(2))
        const creditLimit = Math.max(0, Number(customer.creditLimit || 0))
        const overLimitAmount = creditLimit > 0
          ? Math.max(0, Number((projectedOutstanding - creditLimit).toFixed(2)))
          : 0
        const isAdmin = params.actor.roles.some((role) => role === 'ADMIN' || role === 'SUPER_ADMIN')
        const overrideReason = String(params.override?.overrideReason || '').trim()

        if (overLimitAmount > 0) {
          if (!params.override?.overrideCreditLimit) {
            throw Object.assign(
              new Error(`Credit limit exceeded by $${overLimitAmount.toFixed(2)}`),
              { status: 409, code: 'CREDIT_LIMIT_EXCEEDED', details: { creditLimit, exposureBefore, projectedOutstanding, overLimitAmount } },
            )
          }
          if (!isAdmin) {
            throw Object.assign(new Error('Only an administrator can override a credit limit'), { status: 403 })
          }
          if (overrideReason.length < 5) {
            throw Object.assign(new Error('A credit override reason of at least 5 characters is required'), { status: 400 })
          }
        }

        creditControl = {
          creditLimit,
          exposureBefore,
          projectedOutstanding,
          overLimitAmount,
          decision: overLimitAmount > 0 ? 'OVERRIDDEN' : creditLimit > 0 ? 'APPROVED' : 'NOT_CONFIGURED',
          checkedAt: FieldValue.serverTimestamp(),
          checkedBy: { uid: params.actor.uid },
          ...(overLimitAmount > 0 ? { overrideReason, overriddenBy: { uid: params.actor.uid } } : {}),
        }
      }
    }

    const now = FieldValue.serverTimestamp()
    const payload: Record<string, unknown> = {
      ...input,
      customerId: customerId || null,
      customerName: merged.customerName || '',
      customerEmail: merged.customerEmail || '',
      amount,
      amountPaid,
      balance: invoiceOutstanding({ amount, amountPaid }),
      status,
      updatedAt: now,
      ...(creditControl ? { creditControl } : {}),
    }
    if (!existingSnap) payload.createdAt = now
    if (!payload.invoiceNumber && generatedInvoiceNumber) payload.invoiceNumber = generatedInvoiceNumber

    if (existingSnap) tx.set(invoiceRef, payload, { merge: true })
    else tx.create(invoiceRef, payload)
    return { id: invoiceRef.id, invoiceNumber: payload.invoiceNumber, creditControl }
  })
}
