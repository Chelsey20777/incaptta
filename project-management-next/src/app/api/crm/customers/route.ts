import { NextRequest, NextResponse } from 'next/server'
import { verifyActiveUser } from '@/lib/session-service'
import { createCustomer, requireCrmStaff } from '@/lib/server/customer-profile'

export async function POST(request: NextRequest) {
  try {
    const actor = await verifyActiveUser(request.headers.get('authorization'))
    requireCrmStaff(actor.roles)
    const result = await createCustomer(await request.json(), actor.uid)
    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    const err = error as Error & { status?: number; code?: string }
    return NextResponse.json({ error: err.message || 'Customer creation failed' }, {
      status: err.status || (err instanceof SyntaxError ? 400 : err.code?.startsWith('auth/') ? 401 : 500),
    })
  }
}
