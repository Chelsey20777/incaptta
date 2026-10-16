import { NextRequest, NextResponse } from 'next/server'
import { verifyActiveUser } from '@/lib/session-service'
import { canReadWarehouseReceipts, listReceivableInventory } from '@/lib/server/job-inventory-fulfilment'

export async function GET(request: NextRequest) {
  try {
    const actor = await verifyActiveUser(request.headers.get('authorization'))
    if (!canReadWarehouseReceipts(actor.roles)) {
      return NextResponse.json({ error: 'PMO or technical access is required' }, { status: 403 })
    }
    const items = await listReceivableInventory()
    return NextResponse.json({ items })
  } catch (error: unknown) {
    const err = error as Error & { status?: number }
    return NextResponse.json({ error: err.message || 'Could not load inventory' }, { status: err.status || 400 })
  }
}
