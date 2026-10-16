import { NextRequest, NextResponse } from 'next/server'
import { verifyActiveUser } from '@/lib/session-service'
import { canApprovePmoReceipt, canPmoCheckReceipt, decideInventoryReceipt, fulfilmentActorName } from '@/lib/server/job-inventory-fulfilment'

export async function POST(request: NextRequest) {
  try {
    const actor = await verifyActiveUser(request.headers.get('authorization'))
    if (!canApprovePmoReceipt(actor.roles) && !canPmoCheckReceipt(actor.roles)) {
      return NextResponse.json({ error: 'PMO, a manager, or an admin must approve this receipt' }, { status: 403 })
    }
    const body = await request.json()
    const result = await decideInventoryReceipt({
      requestId: body.requestId,
      decision: body.decision,
      actor: { uid: actor.uid, name: await fulfilmentActorName(actor.uid), roles: actor.roles },
    })
    return NextResponse.json(result)
  } catch (error: unknown) {
    const err = error as Error & { status?: number }
    return NextResponse.json({ error: err.message || 'Receipt decision failed' }, { status: err.status || 400 })
  }
}
