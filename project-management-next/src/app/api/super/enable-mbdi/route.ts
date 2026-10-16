import { NextRequest, NextResponse } from 'next/server'
import { adminAuth } from '@/lib/firebase-admin'

/**
 * POST /api/super/enable-mbdi
 * Deprecated: MBDI is now granted per-user via users/{uid}.modules.mbdi
 * (approver roles bypass). Kept so older clients get a clear response.
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized: No token provided' }, { status: 401 })
    }

    const token = authHeader.split(' ')[1]
    const decoded = await adminAuth.verifyIdToken(token, true)
    const roles = decoded.roles || []
    if (decoded.isActive !== true) {
      return NextResponse.json({ error: 'Forbidden: User account is inactive' }, { status: 403 })
    }
    if (!roles.includes('SUPER_ADMIN')) {
      return NextResponse.json({ error: 'Forbidden: Super Admin access required' }, { status: 403 })
    }

    return NextResponse.json({
      success: true,
      deprecated: true,
      message:
        'MBDI is granted per user under Admin → Users (modules.mbdi). Approver roles bypass the grant. Role-matrix force-on is no longer used.',
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal Server Error'
    console.error('[API/Super/EnableMbdi] error:', err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
