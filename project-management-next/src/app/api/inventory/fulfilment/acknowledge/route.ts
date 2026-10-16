import { NextRequest, NextResponse } from 'next/server'
import { verifyActiveUser } from '@/lib/session-service'
import { adminDb } from '@/lib/firebase-admin'
import { acknowledgeJobInventoryDispatch, canFulfilStock } from '@/lib/server/job-inventory-fulfilment'

export async function POST(request: NextRequest) {
  try {
    const actor = await verifyActiveUser(request.headers.get('authorization'))
    if (!canFulfilStock(actor.roles)) {
      return NextResponse.json({ error: 'PMO or manager access is required' }, { status: 403 })
    }
    const body = await request.json().catch(() => ({})) as {
      jobCardId?: string
      lineId?: string
      sessionId?: string
      note?: string
    }
    if (!body.jobCardId) {
      return NextResponse.json({ error: 'jobCardId is required' }, { status: 400 })
    }
    let name = actor.uid
    try {
      const profile = await adminDb.collection('users').doc(actor.uid).get()
      const stored = profile.data()?.name
      if (typeof stored === 'string' && stored.trim()) name = stored.trim()
    } catch {
      // The acknowledgement still records the uid when the profile cannot be read.
    }
    const result = await acknowledgeJobInventoryDispatch({
      jobCardId: body.jobCardId,
      lineId: body.lineId,
      sessionId: body.sessionId,
      note: body.note,
      actor: { uid: actor.uid, name },
    })
    return NextResponse.json(result)
  } catch (error: unknown) {
    const err = error as Error & { status?: number }
    return NextResponse.json({ error: err.message || 'Acknowledgement failed' }, { status: err.status || 400 })
  }
}
