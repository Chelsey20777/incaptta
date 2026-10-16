import { NextRequest, NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebase-admin'
import { verifyActiveUser } from '@/lib/session-service'

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await verifyActiveUser(request.headers.get('authorization'))
    if (!actor.roles.some((role) => ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'SALES', 'ACCOUNTANT', 'TECHNICAL'].includes(role))) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }
    const { id } = await context.params
    const snapshot = await adminDb.collection('invoicePayments').where('customerId', '==', id).get()
    const payments = snapshot.docs.map((doc) => {
      const data = doc.data()
      return {
        id: doc.id,
        invoiceId: String(data.invoiceId || ''),
        amount: Number(data.amount || 0),
        method: String(data.method || ''),
        reference: String(data.reference || ''),
        date: String(data.date || ''),
        createdAt: data.createdAt?.toDate?.()?.toISOString() || '',
      }
    })
    return NextResponse.json({ payments })
  } catch (error) {
    const err = error as Error & { status?: number }
    return NextResponse.json({ error: err.message || 'Unable to load statement payments' }, { status: err.status || 500 })
  }
}
