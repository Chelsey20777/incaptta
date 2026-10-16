import { NextRequest, NextResponse } from 'next/server'
import { verifyActiveUser } from '@/lib/session-service'
import { reviewQuoteRevision } from '@/lib/server/quote-acceptance'

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await verifyActiveUser(request.headers.get('authorization'))
    const { id } = await context.params
    const body = await request.json().catch(() => ({})) as {
      action?: 'SUBMIT' | 'APPROVE_TO_SEND' | 'REQUEST_CHANGES' | 'RECORD_SENT'
      reason?: string
      send?: { recipient?: string; channel?: string }
    }
    if (!body.action) {
      return NextResponse.json({ error: 'action is required' }, { status: 400 })
    }
    const result = await reviewQuoteRevision({
      quoteId: id,
      action: body.action,
      actor: {
        uid: actor.uid,
        name: actor.uid,
        roles: actor.roles,
      },
      reason: body.reason,
      send: body.send,
    })
    return NextResponse.json(result)
  } catch (error: unknown) {
    const err = error as Error & { status?: number }
    return NextResponse.json({ error: err.message || 'Quote review failed' }, { status: err.status || 400 })
  }
}
