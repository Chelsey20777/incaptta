import { NextRequest, NextResponse } from 'next/server'
import { verifyActiveUser } from '@/lib/session-service'
import { canSubmitWarehouseReceipt, fulfilmentActorName, receiveInventoryItem } from '@/lib/server/job-inventory-fulfilment'

export async function POST(request: NextRequest) {
  try {
    const actor = await verifyActiveUser(request.headers.get('authorization'))
    if (!canSubmitWarehouseReceipt(actor.roles)) {
      return NextResponse.json({ error: 'Technical staff enter incoming stock' }, { status: 403 })
    }
    const body = await request.json()
    const result = await receiveInventoryItem({
      inventoryItemId: body.inventoryItemId,
      quantity: body.quantity,
      reference: body.reference,
      note: body.note,
      requestId: body.requestId,
      actor: { uid: actor.uid, name: await fulfilmentActorName(actor.uid) },
    })
    return NextResponse.json(result)
  } catch (error: unknown) {
    const err = error as Error & { status?: number }
    return NextResponse.json({ error: err.message || 'Stock receipt failed' }, { status: err.status || 400 })
  }
}
