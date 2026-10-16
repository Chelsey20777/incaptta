import { NextRequest, NextResponse } from 'next/server'
import {
  requireAdmin,
  revokeAllUserSessions,
  verifyActiveUser,
} from '@/lib/session-service'

export async function POST(
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

    const result = await revokeAllUserSessions(userId)
    return NextResponse.json({ message: 'All sessions revoked.', ...result })
  } catch (err: unknown) {
    const e = err as { message?: string; status?: number }
    console.error('[sessions/revoke]', e?.message || err)
    return NextResponse.json(
      { message: e?.message || 'Internal Server Error' },
      { status: e?.status || 500 }
    )
  }
}
