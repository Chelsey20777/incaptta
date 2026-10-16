import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function POST() {
  const response = NextResponse.json({ success: true, message: 'Signed out successfully' })
  response.cookies.set('__session', '', {
    path: '/',
    expires: new Date(0),
    sameSite: 'lax',
  })
  return response
}
