'use client'

import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore'
import { auth, db } from '@/lib/firebase'

export function normalizeEmail(email?: string | null): string {
  return (email || '').trim().toLowerCase()
}

export function emailsMatch(a?: string | null, b?: string | null): boolean {
  const na = normalizeEmail(a)
  const nb = normalizeEmail(b)
  return !!na && na === nb
}

type EmailDoc = { id: string; email?: string | null }

export function findUserIdByEmail(
  users: EmailDoc[],
  email?: string | null
): string | null {
  const normalized = normalizeEmail(email)
  if (!normalized) return null
  const match = users.find((u) => normalizeEmail(u.email) === normalized)
  return match?.id || null
}

export function findEmployeeIdByEmail(
  employees: EmailDoc[],
  email?: string | null
): string | null {
  const normalized = normalizeEmail(email)
  if (!normalized) return null
  const match = employees.find((e) => normalizeEmail(e.email) === normalized)
  return match?.id || null
}

async function getAuthHeader(): Promise<HeadersInit> {
  const token = await auth.currentUser?.getIdToken()
  if (!token) throw new Error('Not authenticated')
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  }
}

/** Patch Firestore users/{uid}.employeeId via Admin API (client writes to users are forbidden). */
export async function patchUserEmployeeId(
  userId: string,
  employeeId: string | null
): Promise<void> {
  const headers = await getAuthHeader()
  const res = await fetch(`/api/users/${userId}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ employeeId }),
  })
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}))
    throw new Error(
      errData.message || errData.error || `Failed to update user link (${res.status})`
    )
  }
}

async function setEmployeeUserId(
  employeeId: string,
  userId: string | null
): Promise<void> {
  await updateDoc(doc(db, 'employees', employeeId), {
    userId,
    updatedAt: serverTimestamp(),
  })
}

/**
 * Clear any prior partners so the relationship stays 1:1, then set both sides.
 */
export async function linkPair(opts: {
  userId: string
  employeeId: string
}): Promise<void> {
  const { userId, employeeId } = opts

  const [userSnap, empSnap] = await Promise.all([
    getDoc(doc(db, 'users', userId)),
    getDoc(doc(db, 'employees', employeeId)),
  ])

  const prevEmployeeId = (userSnap.data()?.employeeId as string | null | undefined) || null
  const prevUserId = (empSnap.data()?.userId as string | null | undefined) || null

  // Clear previous partners of either side (except the pair we are forming).
  if (prevEmployeeId && prevEmployeeId !== employeeId) {
    await setEmployeeUserId(prevEmployeeId, null)
  }
  if (prevUserId && prevUserId !== userId) {
    await patchUserEmployeeId(prevUserId, null)
  }

  // Also clear any other employee that still points at this userId.
  const otherEmps = await getDocs(
    query(collection(db, 'employees'), where('userId', '==', userId))
  )
  for (const d of otherEmps.docs) {
    if (d.id !== employeeId) {
      await setEmployeeUserId(d.id, null)
    }
  }

  await setEmployeeUserId(employeeId, userId)
  await patchUserEmployeeId(userId, employeeId)
}

/**
 * Clear both ends when either id is known.
 */
export async function unlinkPair(opts: {
  userId?: string | null
  employeeId?: string | null
}): Promise<void> {
  let userId = opts.userId || null
  let employeeId = opts.employeeId || null

  if (employeeId && !userId) {
    const empSnap = await getDoc(doc(db, 'employees', employeeId))
    userId = (empSnap.data()?.userId as string | null | undefined) || null
  }
  if (userId && !employeeId) {
    const userSnap = await getDoc(doc(db, 'users', userId))
    employeeId = (userSnap.data()?.employeeId as string | null | undefined) || null
  }

  if (employeeId) {
    await setEmployeeUserId(employeeId, null)
  }
  if (userId) {
    await patchUserEmployeeId(userId, null)
  }
}

/**
 * If an email peer exists on the other side, link them.
 * Does not invent missing users or employees. Skips if already linked to this peer.
 */
export async function autoLinkByEmail(opts: {
  email?: string | null
  userId?: string | null
  employeeId?: string | null
}): Promise<{ linked: boolean; userId?: string; employeeId?: string }> {
  const email = normalizeEmail(opts.email)
  if (!email) return { linked: false }

  let userId = opts.userId || null
  let employeeId = opts.employeeId || null

  if (!userId) {
    const snap = await getDocs(collection(db, 'users'))
    const match = snap.docs.find(
      (d) => normalizeEmail(d.data().email) === email
    )
    userId = match?.id || null
  }

  if (!employeeId) {
    const snap = await getDocs(collection(db, 'employees'))
    const match = snap.docs.find(
      (d) => normalizeEmail(d.data().email) === email
    )
    employeeId = match?.id || null
  }

  if (!userId || !employeeId) return { linked: false }

  const [userSnap, empSnap] = await Promise.all([
    getDoc(doc(db, 'users', userId)),
    getDoc(doc(db, 'employees', employeeId)),
  ])

  const currentEmpOnUser = userSnap.data()?.employeeId || null
  const currentUserOnEmp = empSnap.data()?.userId || null

  if (currentEmpOnUser === employeeId && currentUserOnEmp === userId) {
    return { linked: true, userId, employeeId }
  }

  await linkPair({ userId, employeeId })
  return { linked: true, userId, employeeId }
}

export type BackfillResult = {
  linked: number
  skippedAlreadyLinked: number
  skippedConflicts: number
}

/** One-pass: link all unmatched user/employee pairs that share an email. */
export async function backfillLinksByEmail(
  users: Array<{ id: string; email?: string; employeeId?: string | null }>,
  employees: Array<{ id: string; email?: string; userId?: string | null }>
): Promise<BackfillResult> {
  const result: BackfillResult = {
    linked: 0,
    skippedAlreadyLinked: 0,
    skippedConflicts: 0,
  }

  const empByEmail = new Map<string, { id: string; userId?: string | null }>()
  for (const emp of employees) {
    const key = normalizeEmail(emp.email)
    if (!key) continue
    // First wins; duplicates are conflicts
    if (!empByEmail.has(key)) {
      empByEmail.set(key, { id: emp.id, userId: emp.userId })
    }
  }

  const claimedEmployeeIds = new Set(
    users.map((u) => u.employeeId).filter(Boolean) as string[]
  )

  for (const user of users) {
    const key = normalizeEmail(user.email)
    if (!key) continue
    const emp = empByEmail.get(key)
    if (!emp) continue

    if (user.employeeId === emp.id && emp.userId === user.id) {
      result.skippedAlreadyLinked++
      continue
    }

    // Conflict: user already linked elsewhere, or employee linked to another user,
    // or another user already claimed this employee.
    if (
      (user.employeeId && user.employeeId !== emp.id) ||
      (emp.userId && emp.userId !== user.id) ||
      (claimedEmployeeIds.has(emp.id) && user.employeeId !== emp.id)
    ) {
      result.skippedConflicts++
      continue
    }

    await linkPair({ userId: user.id, employeeId: emp.id })
    claimedEmployeeIds.add(emp.id)
    result.linked++
  }

  return result
}
