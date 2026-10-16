import { NextRequest, NextResponse } from 'next/server'
import { verifyActiveUser } from '@/lib/session-service'
import { acceptApprovedQuote } from '@/lib/server/quote-acceptance'

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await verifyActiveUser(request.headers.get('authorization'))
    const { id } = await context.params
    const body = await request.json().catch(() => ({})) as {
      acceptedBy?: string
      acceptedAt?: string
      evidence?: string
    }
    const result = await acceptApprovedQuote({
      quoteId: id,
      actor: { uid: actor.uid, name: actor.uid, roles: actor.roles },
      acceptance: {
        acceptedBy: body.acceptedBy || '',
        acceptedAt: body.acceptedAt,
        evidence: body.evidence,
      },
    })
    return NextResponse.json(result)
  } catch (error: unknown) {
    const err = error as Error & { status?: number }
    return NextResponse.json({ error: err.message || 'Quote acceptance failed' }, { status: err.status || 400 })
  }
}
