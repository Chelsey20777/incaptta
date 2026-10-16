import { NextRequest, NextResponse } from 'next/server'
import { verifyActiveUser } from '@/lib/session-service'
import { canFulfilStock, canReserveStock, releaseJobInventoryReservation } from '@/lib/server/job-inventory-fulfilment'

export async function POST(request: NextRequest) {
  try {
    const actor = await verifyActiveUser(request.headers.get('authorization'))
    if (!canFulfilStock(actor.roles)) {
      return NextResponse.json({ error: 'PMO or manager access is required' }, { status: 403 })
    }
    if (actor.roles.includes('STOREKEEPER') && !canReserveStock(actor.roles)) {
      return NextResponse.json({ error: 'PMO cannot cancel a reservation' }, { status: 403 })
    }
    const body = await request.json().catch(() => ({})) as { jobCardId?: string; lineId?: string }
    if (!body.jobCardId || !body.lineId) {
      return NextResponse.json({ error: 'jobCardId and lineId are required' }, { status: 400 })
    }
    const result = await releaseJobInventoryReservation({
      jobCardId: body.jobCardId,
      lineId: body.lineId,
      actor: { uid: actor.uid, name: actor.uid },
    })
    return NextResponse.json(result)
  } catch (error: unknown) {
    const err = error as Error & { status?: number }
    return NextResponse.json({ error: err.message || 'Release failed' }, { status: err.status || 400 })
  }
}
