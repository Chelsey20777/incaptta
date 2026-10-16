import { NextRequest, NextResponse } from 'next/server'
import { verifyActiveUser } from '@/lib/session-service'
import { canFulfilStock, dispatchJobInventoryLine, fulfilmentActorName } from '@/lib/server/job-inventory-fulfilment'

export async function POST(request: NextRequest) {
  try {
    const actor = await verifyActiveUser(request.headers.get('authorization'))
    if (!canFulfilStock(actor.roles)) {
      return NextResponse.json({ error: 'PMO or manager access is required' }, { status: 403 })
    }
    const body = await request.json().catch(() => ({})) as {
      jobCardId?: string
      lineId?: string
      quantity?: number
      recipient?: string
      damagedQty?: number
    }
    if (!body.jobCardId || !body.lineId) {
      return NextResponse.json({ error: 'jobCardId and lineId are required' }, { status: 400 })
    }
    const result = await dispatchJobInventoryLine({
      jobCardId: body.jobCardId,
      lineId: body.lineId,
      quantity: Number(body.quantity),
      recipient: body.recipient,
      damagedQty: Number(body.damagedQty || 0),
      actor: { uid: actor.uid, name: await fulfilmentActorName(actor.uid) },
    })
    return NextResponse.json(result)
  } catch (error: unknown) {
    const err = error as Error & { status?: number }
    return NextResponse.json({ error: err.message || 'Dispatch failed' }, { status: err.status || 400 })
  }
}
