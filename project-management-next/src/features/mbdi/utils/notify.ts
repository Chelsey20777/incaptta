'use client'

import {
  collection,
  getDocs,
  query,
  where,
  writeBatch,
  doc,
  serverTimestamp,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { MBDI_APPROVER_ROLES } from '@/features/mbdi/types'

export type MbdiNotificationType =
  | 'NEW_INITIATIVE'
  | 'PROPOSAL_APPROVED'
  | 'PROPOSAL_REJECTED'
  | 'INDICATOR_DONE'
  | 'INDICATOR_VERIFIED'
  | 'INDICATOR_RETURNED'
  | 'ALL_INDICATORS_VERIFIED'
  | 'CLAIM_SUBMITTED'
  | 'CLAIM_APPROVED'
  | 'CLAIM_RETURNED'
  | 'INITIATIVE_DELETED'
  | 'MBDI_COMMENT'
  | 'MBDI_DUE_SOON'

export interface MbdiNotifyActor {
  uid: string
  name: string
}

export interface NotifyUsersInput {
  userIds: string[]
  type: MbdiNotificationType
  title: string
  body: string
  initiativeId: string
  mbdiNo?: string
  actor: MbdiNotifyActor
}

const COLLECTION = 'mbdiNotifications'
const BATCH_LIMIT = 450

/** All active app user document ids. */
export async function listAllUserIds(): Promise<string[]> {
  const snap = await getDocs(collection(db, 'users'))
  return snap.docs
    .filter((d) => d.data().isActive !== false)
    .map((d) => d.id)
}

/** Resolve an app user uid by email (case-insensitive). */
export async function resolveUserIdByEmail(email?: string | null): Promise<string | null> {
  const normalized = (email || '').trim().toLowerCase()
  if (!normalized) return null
  try {
    const snap = await getDocs(query(collection(db, 'users'), where('email', '==', email!.trim())))
    if (!snap.empty) return snap.docs[0]!.id
    const all = await getDocs(collection(db, 'users'))
    const match = all.docs.find(
      (d) => (d.data().email || '').trim().toLowerCase() === normalized
    )
    return match?.id || null
  } catch (err) {
    console.error('[mbdi resolveUserIdByEmail]', err)
    return null
  }
}

/**
 * Owner notification targets: prefer ownerId when it is a real app uid;
 * also resolve via users.employeeId / email so HR-only owners get notified once they have a login.
 */
export async function resolveOwnerNotifyIds(
  ownerId?: string | null,
  ownerEmail?: string | null
): Promise<string[]> {
  const ids = new Set<string>()
  if (ownerId) ids.add(ownerId)

  // Prefer users linked to this HR employee id (ownerId may still be an employee doc id)
  if (ownerId) {
    try {
      const byEmp = await getDocs(
        query(collection(db, 'users'), where('employeeId', '==', ownerId))
      )
      for (const d of byEmp.docs) ids.add(d.id)
    } catch (err) {
      console.error('[mbdi resolveOwnerNotifyIds employeeId]', err)
    }
  }

  const byEmail = await resolveUserIdByEmail(ownerEmail)
  if (byEmail) ids.add(byEmail)
  return [...ids]
}

/** Users whose roles include any MBDI approver role. */
export async function listApproverUserIds(): Promise<string[]> {
  const snap = await getDocs(collection(db, 'users'))
  const approverSet = new Set<string>(MBDI_APPROVER_ROLES)
  return snap.docs
    .filter((d) => {
      const data = d.data()
      if (data.isActive === false) return false
      const roles: string[] = Array.isArray(data.roles) ? data.roles : []
      return roles.some((r) => approverSet.has(r))
    })
    .map((d) => d.id)
}

/**
 * Fan-out in-app MBDI notifications. Never throws to callers — failures are logged only.
 */
export async function notifyUsers(input: NotifyUsersInput): Promise<void> {
  try {
    const unique = [...new Set(input.userIds.filter((id) => id && id !== input.actor.uid))]
    if (unique.length === 0) return

    const link = `/mbdi/${input.initiativeId}`
    const payload = {
      type: input.type,
      title: input.title,
      body: input.body,
      initiativeId: input.initiativeId,
      mbdiNo: input.mbdiNo || null,
      link,
      read: false,
      createdAt: serverTimestamp(),
      actorUid: input.actor.uid,
      actorName: input.actor.name,
    }

    for (let i = 0; i < unique.length; i += BATCH_LIMIT) {
      const chunk = unique.slice(i, i + BATCH_LIMIT)
      const batch = writeBatch(db)
      for (const userId of chunk) {
        const ref = doc(collection(db, COLLECTION))
        batch.set(ref, { ...payload, userId })
      }
      await batch.commit()
    }
  } catch (err) {
    console.error('[mbdi notifyUsers]', err)
  }
}

/** Mark all unread notifications for a user as read. */
export async function markAllMbdiNotificationsRead(userId: string): Promise<void> {
  const snap = await getDocs(
    query(collection(db, COLLECTION), where('userId', '==', userId), where('read', '==', false))
  )
  if (snap.empty) return

  const docs = snap.docs
  for (let i = 0; i < docs.length; i += BATCH_LIMIT) {
    const chunk = docs.slice(i, i + BATCH_LIMIT)
    const batch = writeBatch(db)
    for (const d of chunk) {
      batch.update(d.ref, { read: true })
    }
    await batch.commit()
  }
}

/** Mark unread notifications for a specific initiative as read. */
export async function markInitiativeMbdiNotificationsRead(
  userId: string,
  initiativeId: string
): Promise<void> {
  const snap = await getDocs(
    query(
      collection(db, COLLECTION),
      where('userId', '==', userId),
      where('initiativeId', '==', initiativeId),
      where('read', '==', false)
    )
  )
  if (snap.empty) return

  const batch = writeBatch(db)
  snap.docs.forEach((d) => batch.update(d.ref, { read: true }))
  await batch.commit()
}

/** Fire-and-forget wrapper used by the store. */
export function notifyMbdiSafe(input: NotifyUsersInput): void {
  void notifyUsers(input)
}
