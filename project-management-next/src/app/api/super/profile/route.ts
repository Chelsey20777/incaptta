import { NextRequest, NextResponse } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { adminAuth, adminDb } from '@/lib/firebase-admin'

/**
 * POST /api/super/profile
 * Authenticated user updates their own signatureUrl / position on users/{uid}.
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

    if (decoded.isActive !== true) {
      return NextResponse.json({ error: 'Forbidden: User account is inactive' }, { status: 403 })
    }

    const body = await req.json()
    const updates: Record<string, unknown> = {
      updatedAt: FieldValue.serverTimestamp(),
    }

    if ('signatureUrl' in body) {
      if (body.signatureUrl === null || body.signatureUrl === '') {
        updates.signatureUrl = FieldValue.delete()
      } else if (typeof body.signatureUrl === 'string') {
        updates.signatureUrl = body.signatureUrl.trim()
      } else {
        return NextResponse.json({ error: 'signatureUrl must be a string or null' }, { status: 400 })
      }
    }

    if ('position' in body) {
      if (body.position === null || body.position === '') {
        updates.position = FieldValue.delete()
      } else if (typeof body.position === 'string') {
        updates.position = body.position.trim().slice(0, 120)
      } else {
        return NextResponse.json({ error: 'position must be a string or null' }, { status: 400 })
      }
    }

    if (!('signatureUrl' in updates) && !('position' in updates)) {
      return NextResponse.json(
        { error: 'Provide signatureUrl and/or position to update' },
        { status: 400 }
      )
    }

    const ref = adminDb.collection('users').doc(decoded.uid)
    const snap = await ref.get()
    if (!snap.exists) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    await ref.set(updates, { merge: true })

    const after = (await ref.get()).data() || {}
    return NextResponse.json({
      success: true,
      signatureUrl: after.signatureUrl ?? null,
      position: after.position ?? null,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal Server Error'
    console.error('[API/Super/Profile] error:', err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
