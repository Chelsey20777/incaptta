import { NextResponse } from 'next/server'
import { findUserByEmail, comparePassword, createSessionToken } from '@/lib/auth-mongo'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { email, password } = body

    if (!email || typeof email !== 'string' || !password || typeof password !== 'string') {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      )
    }

    const user = await findUserByEmail(email)
    if (!user) {
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      )
    }

    if (!user.isActive) {
      return NextResponse.json(
        { error: 'This account has been deactivated. Please contact an administrator.' },
        { status: 403 }
      )
    }

    const isMatch = await comparePassword(password, user.passwordHash)
    if (!isMatch) {
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      )
    }

    const token = await createSessionToken(user)

    const response = NextResponse.json({
      success: true,
      token,
      user: {
        uid: user._id,
        email: user.email,
        name: user.name,
        roles: user.roles,
        isActive: user.isActive,
        company: user.company,
        modules: user.modules,
        employeeId: user.employeeId,
        position: user.position,
        signatureUrl: user.signatureUrl,
      },
    })

    // Set secure __session cookie for Next.js middleware and browser requests
    response.cookies.set('__session', token, {
      httpOnly: false, // Accessible to client for headers if needed
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60, // 7 days
    })

    return response
  } catch (error: any) {
    console.error('[API /api/auth/login] Error:', error)
    return NextResponse.json(
      { error: error?.message || 'Authentication failed' },
      { status: 500 }
    )
  }
}
