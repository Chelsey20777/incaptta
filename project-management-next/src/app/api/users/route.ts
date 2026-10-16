import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, verifyActiveUser } from '@/lib/session-service'
import {
  assertAssignableRoles,
  mapAuthError,
  UserAdminError,
  UserAdminOperationError,
} from '@/lib/server/user-admin'
import { createAuthProfile } from '@/lib/server/user-admin-store'

function errorResponse(err: unknown, reference: string) {
  if (err instanceof UserAdminError) {
    return NextResponse.json({ error: err.message, message: err.message }, { status: err.status })
  }
  if (err instanceof UserAdminOperationError) {
    const message = `${err.message} Check the staging server log (reference ${reference}).`
    return NextResponse.json({ error: message, message, reference }, { status: 500 })
  }
  const tagged = err as { message?: string; status?: number }
  if (tagged.status) {
    const message = tagged.message || 'Request failed'
    return NextResponse.json({ error: message, message }, { status: tagged.status })
  }
  const mapped = mapAuthError(err as { code?: string; message?: string; errorInfo?: { code?: string } })
  return NextResponse.json(
    { error: mapped.message, message: mapped.message, reference },
    { status: mapped.status },
  )
}

export async function POST(req: NextRequest) {
  const reference = crypto.randomUUID()
  try {
    const actor = await verifyActiveUser(req.headers.get('authorization'))
    requireAdmin(actor.roles)

    const body = await req.json().catch(() => null)
    const email = typeof body?.email === 'string' ? body.email.trim() : ''
    const name = typeof body?.name === 'string' ? body.name.trim() : ''
    if (!email || !name) {
      throw new UserAdminError('Email and Name are required.', 400)
    }

    const password = typeof body?.password === 'string' && body.password.length > 0
      ? body.password
      : undefined
    if (password && password.length < 6) {
      throw new UserAdminError('The password must be at least 6 characters long.', 400)
    }

    const roles = assertAssignableRoles(body?.roles, actor.roles)
    const isActive = body?.isActive !== false
    const employeeId = typeof body?.employeeId === 'string' ? body.employeeId : null

    const created = await createAuthProfile({
      email,
      password,
      name,
      roles,
      isActive,
      employeeId,
    })
    return NextResponse.json(created, { status: 201 })
  } catch (err) {
    if (err instanceof UserAdminOperationError) {
      console.error('[api/users] create failed', {
        reference,
        operation: err.operation,
        code: err.code,
      })
    } else {
      const tagged = err as { code?: unknown; status?: unknown }
      console.error('[api/users] create failed', {
        reference,
        code: typeof tagged?.code === 'string' ? tagged.code : undefined,
        status: typeof tagged?.status === 'number' ? tagged.status : undefined,
      })
    }
    return errorResponse(err, reference)
  }
}
