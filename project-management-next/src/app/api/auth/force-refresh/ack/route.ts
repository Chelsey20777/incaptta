import { NextRequest, NextResponse } from 'next/server'
import { acknowledgeForceRefresh, verifyActiveUser } from '@/lib/session-service'

export async function POST(req: NextRequest) {
  try {
    const user = await verifyActiveUser(req.headers.get('authorization'))
    const body = await req.json().catch(() => null)
    const signal = body?.signal
    if (typeof signal !== 'number' || !Number.isFinite(signal)) {
      return NextResponse.json({ message: 'A valid refresh signal is required.' }, { status: 400 })
    }

    const acknowledged = await acknowledgeForceRefresh(user.uid, signal)
    return NextResponse.json({ acknowledged })
  } catch (err: unknown) {
    const error = err as { message?: string; status?: number }
    return NextResponse.json(
      { message: error?.message || 'Unable to acknowledge the refresh signal.' },
      { status: error?.status || 500 },
    )
  }
}
