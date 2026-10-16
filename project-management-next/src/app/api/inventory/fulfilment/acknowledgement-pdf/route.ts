import { NextRequest, NextResponse } from 'next/server'
import { verifyActiveUser } from '@/lib/session-service'
import { canFulfilStock, markAcknowledgementPdfGenerated } from '@/lib/server/job-inventory-fulfilment'

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
    }
    if (!body.jobCardId) {
      return NextResponse.json({ error: 'jobCardId is required' }, { status: 400 })
    }
    const result = await markAcknowledgementPdfGenerated({
      jobCardId: body.jobCardId,
      lineId: body.lineId,
      sessionId: body.sessionId,
      actor: { uid: actor.uid, name: actor.uid },
    })
    return NextResponse.json(result)
  } catch (error: unknown) {
    const err = error as Error & { status?: number }
    return NextResponse.json({ error: err.message || 'Could not record acknowledgement PDF' }, { status: err.status || 400 })
  }
}
