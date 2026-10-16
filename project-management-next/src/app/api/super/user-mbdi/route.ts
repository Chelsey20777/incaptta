import { NextRequest, NextResponse } from 'next/server'
import { adminAuth, adminDb } from '@/lib/firebase-admin'

/**
 * POST /api/super/user-mbdi
 * Admin+: set users/{uid}.modules.mbdi (per-user MBDI access grant).
 * Local Next route (not rewritten to Cloud Functions).
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized: No token provided' }, { status: 401 })
    }

    const token = authHeader.split(' ')[1]
    const decoded = await adminAuth.verifyIdToken(token, true)
    const roles: string[] = Array.isArray(decoded.roles)
      ? decoded.roles
      : typeof decoded.roles === 'string'
        ? [decoded.roles]
        : []

    if (decoded.isActive !== true) {
      return NextResponse.json({ error: 'Forbidden: User account is inactive' }, { status: 403 })
    }

    const canManage =
      roles.includes('SUPER_ADMIN') || roles.includes('ADMIN')
    if (!canManage) {
      return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 })
    }

    const body = await req.json()
    const userId = typeof body.userId === 'string' ? body.userId.trim() : ''
    const mbdi = body.mbdi === true

    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 })
    }

    const ref = adminDb.collection('users').doc(userId)
    const snap = await ref.get()
    if (!snap.exists) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const currentModules = (snap.data()?.modules as Record<string, unknown> | undefined) || {}
    await ref.set(
      {
        modules: { ...currentModules, mbdi },
        updatedAt: new Date(),
      },
      { merge: true }
    )

    return NextResponse.json({ success: true, userId, modules: { mbdi } })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal Server Error'
    console.error('[API/Super/UserMbdi] error:', err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
