import { NextRequest, NextResponse } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase-admin'
import { verifyActiveUser } from '@/lib/session-service'
import { invoiceOutstanding } from '@/lib/server/customer-credit'
import {
  ensureClientCreditAccountInTransaction,
  readClientCreditAccount,
} from '@/lib/server/client-credit-account'
import { normalizeInvoicePaymentMethod } from '@/lib/account-keys'

const JOB_PAYMENT_METHOD: Record<string, string> = {
  CASH: 'cash',
  BANK: 'bank',
  ECOCASH: 'ecocash',
  RESERVE: 'reserve',
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await verifyActiveUser(request.headers.get('authorization'))
    const { id } = await context.params
    const body = await request.json()
    const amount = Number(body.amount)
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: 'Payment amount must be greater than zero' }, { status: 400 })
    }

    const method = normalizeInvoicePaymentMethod(body.method || 'CASH')
    if (!method) {
      return NextResponse.json(
        { error: 'Payment method must be CASH, BANK, ECOCASH, or RESERVE' },
        { status: 400 },
      )
    }

    const result = await adminDb.runTransaction(async (tx) => {
      const invoiceRef = adminDb.collection('crmInvoices').doc(id)
      const invoiceSnap = await tx.get(invoiceRef)
      if (!invoiceSnap.exists) throw Object.assign(new Error('Invoice not found'), { status: 404 })
      const invoice = invoiceSnap.data() || {}
      const outstanding = invoiceOutstanding(invoice)
      if (amount > outstanding) {
        throw Object.assign(
          new Error(`Payment exceeds the outstanding balance of $${outstanding.toFixed(2)}; record excess as a customer deposit`),
          { status: 400 },
        )
      }

      const customerId = String(invoice.customerId || '').trim()
      const jobCardId = String(invoice.jobCardId || '').trim()
      const invoiceNumber = String(invoice.invoiceNumber || id)
      const customerName = String(invoice.customerName || '').trim()

      // All reads before any writes
      const [creditSnap, jobSnap] = await Promise.all([
        customerId ? readClientCreditAccount(tx, customerId) : Promise.resolve(null),
        jobCardId ? tx.get(adminDb.collection('jobCards').doc(jobCardId)) : Promise.resolve(null),
      ])

      const amountPaid = Number((Number(invoice.amountPaid || 0) + amount).toFixed(2))
      const balance = Number((outstanding - amount).toFixed(2))
      const paymentRef = adminDb.collection('invoicePayments').doc()
      const now = FieldValue.serverTimestamp()
      const reference = String(body.reference || '').trim()
      const date = String(body.date || '').trim()

      tx.create(paymentRef, {
        invoiceId: id,
        invoiceNumber,
        customerId: customerId || null,
        jobCardId: jobCardId || null,
        amount,
        method,
        reference,
        date,
        createdBy: actor.uid,
        createdAt: now,
      })

      tx.update(invoiceRef, {
        amountPaid,
        balance,
        status: balance <= 0 ? 'PAID' : invoice.status,
        updatedAt: now,
      })

      if (jobCardId) {
        tx.create(adminDb.collection('jobPayments').doc(), {
          jobCardId,
          amount,
          paymentMethod: JOB_PAYMENT_METHOD[method],
          description: `Invoice ${invoiceNumber}${reference ? ` — ${reference}` : ''}`,
          reference,
          invoiceId: id,
          invoiceNumber,
          invoicePaymentId: paymentRef.id,
          source: 'INVOICE',
          recordedBy: actor.uid,
          createdAt: now,
          updatedAt: now,
        })

        if (jobSnap?.exists) {
          const currentTotal = Number(jobSnap.data()?.totalPaid || 0)
          tx.update(adminDb.collection('jobCards').doc(jobCardId), {
            totalPaid: Number((currentTotal + amount).toFixed(2)),
            updatedAt: now,
          })
        }
      }

      if (method === 'RESERVE') {
        tx.set(adminDb.collection('reserveAccountTransactions').doc(`inv-${paymentRef.id}`), {
          type: 'FUNDING',
          source: 'INVOICE_PAYMENT',
          amount,
          currency: 'USD',
          description: `Invoice payment ${invoiceNumber}`,
          reference,
          referenceId: paymentRef.id,
          invoiceId: id,
          invoiceNumber,
          customerId: customerId || null,
          createdAt: now,
        })
      }

      if (customerId && creditSnap) {
        ensureClientCreditAccountInTransaction(
          tx,
          { clientId: customerId, clientName: customerName, currency: 'USD' },
          creditSnap,
        )
      }

      return { paymentId: paymentRef.id, amountPaid, balance, method }
    })
    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    const err = error as Error & { status?: number }
    return NextResponse.json({ error: err.message || 'Payment failed' }, { status: err.status || 500 })
  }
}
