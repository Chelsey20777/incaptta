import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, verifyActiveUser } from '@/lib/session-service'
import {
  assertRoleUpdate,
  mapAuthError,
  UserAdminError,
} from '@/lib/server/user-admin'
import { adminDb } from '@/lib/firebase-admin'
import { deleteAuthProfile, updateAuthProfile } from '@/lib/server/user-admin-store'

function errorResponse(err: unknown) {
  if (err instanceof UserAdminError) {
    return NextResponse.json({ error: err.message, message: err.message }, { status: err.status })
  }
  const tagged = err as { message?: string; status?: number }
  if (tagged.status) {
    const message = tagged.message || 'Request failed'
    return NextResponse.json({ error: message, message }, { status: tagged.status })
  }
  const mapped = mapAuthError(err as { code?: string; message?: string; errorInfo?: { code?: string } })
  return NextResponse.json(
    { error: mapped.message, message: mapped.message },
    { status: mapped.status },
  )
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await verifyActiveUser(req.headers.get('authorization'))
    requireAdmin(actor.roles)

    const { id } = await context.params
    if (!id) throw new UserAdminError('User ID is required.', 400)

    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      throw new UserAdminError('Request body is required.', 400)
    }

    const patch: {
      name?: string
      roles?: string[]
      isActive?: boolean
      employeeId?: string | null
    } = {}

    if ('name' in body) {
      if (typeof body.name !== 'string' || !body.name.trim()) {
        throw new UserAdminError('Name is required.', 400)
      }
      patch.name = body.name.trim()
    }
    if ('isActive' in body) {
      if (typeof body.isActive !== 'boolean') {
        throw new UserAdminError('isActive must be true or false.', 400)
      }
      patch.isActive = body.isActive
    }
    if ('roles' in body) {
      const current = await adminDb.collection('users').doc(id).get()
      const previousRoles = (current.data()?.roles as string[]) || []
      patch.roles = assertRoleUpdate(body.roles, actor.roles, previousRoles)
    }
    if ('employeeId' in body) {
      patch.employeeId = typeof body.employeeId === 'string' ? body.employeeId : null
    }

    if (!('name' in patch) && !('roles' in patch) && !('isActive' in patch) && !('employeeId' in patch)) {
      throw new UserAdminError('No profile changes were provided.', 400)
    }

    const updated = await updateAuthProfile(id, patch)
    return NextResponse.json(updated)
  } catch (err) {
    console.error('[api/users] update failed:', err)
    return errorResponse(err)
  }
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await verifyActiveUser(req.headers.get('authorization'))
    requireAdmin(actor.roles)

    const { id } = await context.params
    if (!id) throw new UserAdminError('User ID is required.', 400)

    await deleteAuthProfile(id)
    return NextResponse.json({ message: 'User deleted successfully.' })
  } catch (err) {
    console.error('[api/users] delete failed:', err)
    return errorResponse(err)
  }
}
