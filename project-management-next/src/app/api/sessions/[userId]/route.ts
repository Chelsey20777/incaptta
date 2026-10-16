import { NextRequest, NextResponse } from 'next/server'
import {
  listUserSessions,
  requireAdmin,
  verifyActiveUser,
} from '@/lib/session-service'

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ userId: string }> }
) {
  try {
    const user = await verifyActiveUser(req.headers.get('authorization'))
    requireAdmin(user.roles)

    const { userId } = await context.params
    if (!userId) {
      return NextResponse.json({ message: 'User ID is required.' }, { status: 400 })
    }

    const sessions = await listUserSessions(userId)
    return NextResponse.json({ sessions })
  } catch (err: unknown) {
    const e = err as { message?: string; status?: number }
    console.error('[sessions/list]', e?.message || err)
    return NextResponse.json(
      { message: e?.message || 'Internal Server Error' },
      { status: e?.status || 500 }
    )
  }
}
