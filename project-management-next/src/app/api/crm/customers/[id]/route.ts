import { NextRequest, NextResponse } from 'next/server'
import { verifyActiveUser } from '@/lib/session-service'
import { deleteUnlinkedCustomer, requireCrmStaff, updateCustomer } from '@/lib/server/customer-profile'

type Context = { params: Promise<{ id: string }> }

function errorResponse(error: unknown) {
  const err = error as Error & { status?: number; code?: string }
  return NextResponse.json({ error: err.message || 'Customer request failed' }, {
    status: err.status || (err instanceof SyntaxError ? 400 : err.code?.startsWith('auth/') ? 401 : 500),
  })
}

export async function PATCH(request: NextRequest, context: Context) {
  try {
    const actor = await verifyActiveUser(request.headers.get('authorization'))
    requireCrmStaff(actor.roles)
    const { id } = await context.params
    return NextResponse.json(await updateCustomer(id, await request.json(), actor.uid))
  } catch (error) {
    return errorResponse(error)
  }
}

export async function DELETE(request: NextRequest, context: Context) {
  try {
    const actor = await verifyActiveUser(request.headers.get('authorization'))
    requireCrmStaff(actor.roles)
    const { id } = await context.params
    return NextResponse.json(await deleteUnlinkedCustomer(id))
  } catch (error) {
    return errorResponse(error)
  }
}
