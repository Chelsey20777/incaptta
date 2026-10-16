import { NextResponse } from 'next/server'
import { verifySessionToken } from '@/lib/auth-mongo'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get('authorization')
    const cookieHeader = request.headers.get('cookie') || ''

    let token: string | null = null
    if (authHeader?.startsWith('Bearer ')) {
      token = authHeader.substring(7).trim()
    } else {
      const match = cookieHeader.match(/(?:^|;\s*)__session=([^;]+)/)
      if (match) {
        token = decodeURIComponent(match[1])
      }
    }

    if (!token) {
      return NextResponse.json({ authenticated: false, user: null }, { status: 401 })
    }

    const payload = await verifySessionToken(token)
    if (!payload || !payload.isActive) {
      return NextResponse.json({ authenticated: false, user: null }, { status: 401 })
    }

    return NextResponse.json({
      authenticated: true,
      user: {
        uid: payload.uid,
        email: payload.email,
        name: payload.name,
        roles: payload.roles,
        isActive: payload.isActive,
        company: payload.company,
        modules: payload.modules,
        employeeId: payload.employeeId,
        position: payload.position,
        signatureUrl: payload.signatureUrl,
      },
    })
  } catch (error: any) {
    console.error('[API /api/auth/me] Error:', error)
    return NextResponse.json({ authenticated: false, error: error?.message }, { status: 500 })
  }
}
