import { NextRequest, NextResponse } from 'next/server'
import {
  getClientIpFromHeaders,
  heartbeatSession,
  verifyActiveUser,
} from '@/lib/session-service'

export async function POST(req: NextRequest) {
  try {
    const user = await verifyActiveUser(req.headers.get('authorization'))
    const body = await req.json().catch(() => ({}))
    const sessionId = body?.sessionId
    if (!sessionId) {
      return NextResponse.json({ message: 'sessionId is required' }, { status: 400 })
    }

    const result = await heartbeatSession({
      uid: user.uid,
      sessionId: String(sessionId),
      userAgent:
        typeof body?.userAgent === 'string'
          ? body.userAgent
          : req.headers.get('user-agent') || '',
      ip: getClientIpFromHeaders(req.headers),
      app: typeof body?.app === 'string' ? body.app : 'incaptta-mbdi-next',
    })

    return NextResponse.json(result)
  } catch (err: unknown) {
    const e = err as { message?: string; status?: number }
    console.error('[sessions/heartbeat]', e?.message || err)
    return NextResponse.json(
      { message: e?.message || 'Internal Server Error' },
      { status: e?.status || 500 }
    )
  }
}
