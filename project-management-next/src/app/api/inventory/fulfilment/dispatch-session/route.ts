import { NextRequest, NextResponse } from 'next/server'
import { verifyActiveUser } from '@/lib/session-service'
import { canFulfilStock, dispatchJobInventorySession, fulfilmentActorName } from '@/lib/server/job-inventory-fulfilment'

export async function POST(request: NextRequest) {
  try {
    const actor = await verifyActiveUser(request.headers.get('authorization'))
    if (!canFulfilStock(actor.roles)) {
      return NextResponse.json({ error: 'PMO or manager access is required' }, { status: 403 })
    }
    const body = await request.json().catch(() => ({})) as {
      jobCardId?: string
      recipient?: string
      lines?: Array<{ lineId: string; quantity?: number; damagedQty?: number }>
    }
    if (!body.jobCardId) {
      return NextResponse.json({ error: 'jobCardId is required' }, { status: 400 })
    }
    const result = await dispatchJobInventorySession({
      jobCardId: body.jobCardId,
      recipient: body.recipient,
      lines: body.lines,
      actor: { uid: actor.uid, name: await fulfilmentActorName(actor.uid) },
    })
    return NextResponse.json(result)
  } catch (error: unknown) {
    const err = error as Error & { status?: number }
    return NextResponse.json({ error: err.message || 'Dispatch failed' }, { status: err.status || 400 })
  }
}
