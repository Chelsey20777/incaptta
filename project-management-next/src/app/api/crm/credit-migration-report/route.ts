import { NextRequest, NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebase-admin'
import { requireAdmin, verifyActiveUser } from '@/lib/session-service'
import { invoiceOutstanding, invoiceUsesCredit } from '@/lib/server/customer-credit'

export async function GET(request: NextRequest) {
  try {
    const actor = await verifyActiveUser(request.headers.get('authorization'))
    requireAdmin(actor.roles)
    const [customersSnap, invoicesSnap] = await Promise.all([
      adminDb.collection('customers').get(),
      adminDb.collection('crmInvoices').get(),
    ])

    const exposureByCustomer = new Map<string, number>()
    invoicesSnap.docs.forEach((docSnap) => {
      const invoice = docSnap.data()
      const customerId = String(invoice.customerId || '')
      if (!customerId || !invoiceUsesCredit(invoice)) return
      exposureByCustomer.set(
        customerId,
        Number(((exposureByCustomer.get(customerId) || 0) + invoiceOutstanding(invoice)).toFixed(2)),
      )
    })

    const records = customersSnap.docs
      .map((docSnap) => {
        const customer = docSnap.data()
        const legacyCurrentBalance = Number(customer.currentBalance || 0)
        const invoiceOutstandingBalance = exposureByCustomer.get(docSnap.id) || 0
        return {
          customerId: docSnap.id,
          customerName: customer.name || customer.company || '',
          legacyCurrentBalance,
          invoiceOutstanding: invoiceOutstandingBalance,
          difference: Number((legacyCurrentBalance - invoiceOutstandingBalance).toFixed(2)),
        }
      })
      .filter((record) => record.legacyCurrentBalance !== 0)
      .sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference))

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      environment: process.env.DEPLOYMENT_ENV || 'unknown',
      count: records.length,
      records,
    })
  } catch (error) {
    const err = error as Error & { status?: number }
    return NextResponse.json({ error: err.message || 'Failed to build migration report' }, { status: err.status || 500 })
  }
}
