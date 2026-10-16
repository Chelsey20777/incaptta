import { FieldValue } from 'firebase-admin/firestore'
import { adminAuth, adminDb } from '@/lib/firebase-admin'
import { UserAdminError, UserAdminOperationError } from '@/lib/server/user-admin'

const users = () => adminDb.collection('users')
const employees = () => adminDb.collection('employees')

export async function findEmployeeIdByEmail(email: string): Promise<string | null> {
  const normalized = email.trim().toLowerCase()
  if (!normalized) return null
  const snap = await employees().get()
  const match = snap.docs.find(
    (doc) => String(doc.data().email || '').trim().toLowerCase() === normalized,
  )
  return match?.id || null
}

export async function syncEmployeeUserLink(
  userId: string,
  prevEmployeeId: string | null,
  nextEmployeeId: string | null,
) {
  if (prevEmployeeId && prevEmployeeId !== nextEmployeeId) {
    const prevRef = employees().doc(prevEmployeeId)
    const prevSnap = await prevRef.get()
    if (prevSnap.exists && prevSnap.data()?.userId === userId) {
      await prevRef.update({
        userId: null,
        updatedAt: FieldValue.serverTimestamp(),
      })
    }
  }

  if (!nextEmployeeId) return
  const nextRef = employees().doc(nextEmployeeId)
  const nextSnap = await nextRef.get()
  if (!nextSnap.exists) return

  const priorUser = (nextSnap.data()?.userId as string | undefined) || null
  if (priorUser && priorUser !== userId) {
    await users().doc(priorUser).update({
      employeeId: null,
      updatedAt: FieldValue.serverTimestamp(),
    })
  }
  await nextRef.update({
    userId,
    updatedAt: FieldValue.serverTimestamp(),
  })
}

async function createUserProfileWithEmployeeLink(
  uid: string,
  profile: Record<string, unknown>,
  employeeId: string | null,
): Promise<string | null> {
  const userRef = users().doc(uid)
  return adminDb.runTransaction(async (transaction) => {
    if (!employeeId) {
      transaction.create(userRef, { ...profile, employeeId: null })
      return null
    }

    const employeeRef = employees().doc(employeeId)
    const employeeSnap = await transaction.get(employeeRef)
    if (!employeeSnap.exists) {
      transaction.create(userRef, { ...profile, employeeId: null })
      return null
    }

    const previousUserId = employeeSnap.data()?.userId as string | undefined
    const previousUserRef = previousUserId && previousUserId !== uid
      ? users().doc(previousUserId)
      : null
    const previousUserSnap = previousUserRef
      ? await transaction.get(previousUserRef)
      : null

    transaction.create(userRef, { ...profile, employeeId })
    transaction.update(employeeRef, {
      userId: uid,
      updatedAt: FieldValue.serverTimestamp(),
    })

    // Older employee links can point at deleted or stale user profiles.
    // Only update an existing profile that still points to this employee.
    if (previousUserRef && previousUserSnap?.exists && previousUserSnap.data()?.employeeId === employeeId) {
      transaction.update(previousUserRef, {
        employeeId: null,
        updatedAt: FieldValue.serverTimestamp(),
      })
    }

    return employeeId
  })
}

export async function createAuthProfile(input: {
  email: string
  password?: string
  name: string
  roles: string[]
  isActive: boolean
  employeeId?: string | null
}) {
  let uid: string | null = null
  let operation = 'Auth account creation'
  try {
    const record = await adminAuth.createUser({
      email: input.email,
      displayName: input.name,
      disabled: !input.isActive,
      ...(input.password ? { password: input.password } : {}),
    })
    uid = record.uid

    operation = 'Auth claims setup'
    await adminAuth.setCustomUserClaims(uid, {
      roles: input.roles,
      isActive: input.isActive,
    })

    let linkedEmployeeId =
      typeof input.employeeId === 'string' && input.employeeId.trim()
        ? input.employeeId.trim()
        : null
    if (!linkedEmployeeId) {
      operation = 'employee lookup'
      linkedEmployeeId = await findEmployeeIdByEmail(input.email)
    }

    operation = 'Firestore profile and employee link creation'
    const profile = {
      email: input.email,
      name: input.name,
      roles: input.roles,
      isActive: input.isActive,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }
    linkedEmployeeId = await createUserProfileWithEmployeeLink(uid, profile, linkedEmployeeId)

    return {
      uid,
      email: input.email,
      name: input.name,
      roles: input.roles,
      isActive: input.isActive,
      employeeId: linkedEmployeeId,
    }
  } catch (err) {
    if (uid) {
      try {
        await adminAuth.deleteUser(uid)
      } catch {
        // The Auth user is removed when the profile write fails.
      }
      try {
        await users().doc(uid).delete()
      } catch {
        // Drop a partial profile so a retry can create the account again.
      }
    }
    throw new UserAdminOperationError(operation, err)
  }
}

export async function updateAuthProfile(
  uid: string,
  patch: {
    name?: string
    roles?: string[]
    isActive?: boolean
    employeeId?: string | null
  },
) {
  const ref = users().doc(uid)
  const snap = await ref.get()
  if (!snap.exists) {
    throw new UserAdminError('User not found', 404)
  }
  const current = snap.data() || {}
  const previousEmployeeId = (current.employeeId as string | null | undefined) || null
  const updates: Record<string, unknown> = {
    updatedAt: FieldValue.serverTimestamp(),
  }

  if (typeof patch.name === 'string') {
    updates.name = patch.name
    await adminAuth.updateUser(uid, { displayName: patch.name })
  }

  const rolesChanged = Array.isArray(patch.roles)
  const activeChanged = typeof patch.isActive === 'boolean'
  const nextRoles = rolesChanged ? patch.roles! : ((current.roles as string[]) || [])
  const nextActive = activeChanged ? patch.isActive! : current.isActive !== false

  if (rolesChanged) updates.roles = nextRoles
  if (activeChanged) updates.isActive = nextActive

  let nextEmployeeId = previousEmployeeId
  if ('employeeId' in patch) {
    nextEmployeeId = patch.employeeId?.trim() || null
    updates.employeeId = nextEmployeeId
  }

  await ref.update(updates)

  if (rolesChanged || activeChanged) {
    await adminAuth.setCustomUserClaims(uid, {
      roles: nextRoles,
      isActive: nextActive,
    })
    await adminAuth.updateUser(uid, { disabled: !nextActive })
    await adminAuth.revokeRefreshTokens(uid)
    await adminDb.collection('userStatus').doc(uid).set(
      { forceRefresh: Date.now() },
      { merge: true },
    )
  }

  if ('employeeId' in patch) {
    await syncEmployeeUserLink(uid, previousEmployeeId, nextEmployeeId)
  }

  return {
    uid,
    email: current.email || null,
    name: (updates.name as string | undefined) ?? current.name ?? null,
    roles: nextRoles,
    isActive: nextActive,
    employeeId: nextEmployeeId,
  }
}

export async function deleteAuthProfile(uid: string) {
  const ref = users().doc(uid)
  const snap = await ref.get()
  const employeeId = (snap.data()?.employeeId as string | null | undefined) || null

  try {
    await adminAuth.deleteUser(uid)
  } catch (err) {
    const code = (err as { code?: string; message?: string }).code || ''
    const message = (err as { message?: string }).message || ''
    const missing = code.includes('user-not-found') || message.toLowerCase().includes('no user record')
    if (!missing) throw err
  }

  if (snap.exists) await ref.delete()
  if (employeeId) {
    await syncEmployeeUserLink(uid, employeeId, null)
  }
}
