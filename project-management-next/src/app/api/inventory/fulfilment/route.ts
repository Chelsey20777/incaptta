import { NextRequest, NextResponse } from 'next/server'
import { verifyActiveUser } from '@/lib/session-service'
import { canFulfilStock, listFulfilmentQueue } from '@/lib/server/job-inventory-fulfilment'

export async function GET(request: NextRequest) {
  try {
    const actor = await verifyActiveUser(request.headers.get('authorization'))
    if (!canFulfilStock(actor.roles)) {
      return NextResponse.json({ error: 'PMO or manager access is required' }, { status: 403 })
    }
    const items = await listFulfilmentQueue()
    return NextResponse.json({ items })
  } catch (error: unknown) {
    const err = error as Error & { status?: number }
    return NextResponse.json({ error: err.message || 'Fulfilment queue failed' }, { status: err.status || 400 })
  }
}
