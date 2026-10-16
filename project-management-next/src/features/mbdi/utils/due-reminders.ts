import { FieldValue } from 'firebase-admin/firestore'
import type { Firestore } from 'firebase-admin/firestore'
import { MBDI_APPROVER_ROLES, type MbdiStatus } from '@/features/mbdi/types'

export const DUE_REMINDER_WINDOWS = [7, 3, 1] as const
export type DueReminderDays = (typeof DUE_REMINDER_WINDOWS)[number]

const ELIGIBLE_STATUSES = new Set<MbdiStatus>([
  'APPROVED',
  'COMPLETION_CLAIMED',
  'COMPLETED',
  'PERFORMANCE_CLAIMED',
])

const NOTIFY_COLLECTION = 'mbdiNotifications'
const BATCH_LIMIT = 450
const SYSTEM_ACTOR = { uid: 'system', name: 'MBDI Reminders' }

export interface DueReminderRunResult {
  today: string
  checked: number
  sent: number
  skipped: number
  details: Array<{
    initiativeId: string
    mbdiNo?: string
    daysUntil: number
    recipientCount: number
  }>
}

/** Calendar date yyyy-MM-dd in Africa/Harare. */
export function todayInHarare(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Harare',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

/** Whole calendar days from today (yyyy-MM-dd) until endDate (yyyy-MM-dd). */
export function daysUntilEnd(endDate: string, today: string): number | null {
  const end = parseYmd(endDate)
  const start = parseYmd(today)
  if (!end || !start) return null
  return Math.round((end - start) / 86_400_000)
}

function parseYmd(value: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((value || '').trim())
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  if (!y || !mo || !d) return null
  return Date.UTC(y, mo - 1, d)
}

function reminderKey(days: number): string {
  return `due-${days}`
}

function titleForDays(days: DueReminderDays, label: string): string {
  if (days === 1) return `MBDI due tomorrow: ${label}`
  return `MBDI due in ${days} days: ${label}`
}

async function resolveOwnerNotifyIdsAdmin(
  db: Firestore,
  ownerId?: string | null,
  ownerEmail?: string | null
): Promise<string[]> {
  const ids = new Set<string>()
  if (ownerId) ids.add(ownerId)

  if (ownerId) {
    try {
      const byEmp = await db.collection('users').where('employeeId', '==', ownerId).get()
      for (const d of byEmp.docs) ids.add(d.id)
    } catch (err) {
      console.error('[mbdi due-reminders] owner by employeeId', err)
    }
  }

  const email = (ownerEmail || '').trim()
  if (email) {
    try {
      const exact = await db.collection('users').where('email', '==', email).get()
      if (!exact.empty) {
        ids.add(exact.docs[0]!.id)
      } else {
        const all = await db.collection('users').get()
        const normalized = email.toLowerCase()
        const match = all.docs.find(
          (d) => String(d.data().email || '').trim().toLowerCase() === normalized
        )
        if (match) ids.add(match.id)
      }
    } catch (err) {
      console.error('[mbdi due-reminders] owner by email', err)
    }
  }

  return [...ids]
}

async function listApproverUserIdsAdmin(db: Firestore): Promise<string[]> {
  const snap = await db.collection('users').get()
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

async function fanOutNotifications(
  db: Firestore,
  userIds: string[],
  payload: {
    type: string
    title: string
    body: string
    initiativeId: string
    mbdiNo?: string | null
  }
): Promise<void> {
  const unique = [...new Set(userIds.filter(Boolean))]
  if (unique.length === 0) return

  const link = `/mbdi/${payload.initiativeId}`
  const base = {
    ...payload,
    link,
    read: false,
    createdAt: FieldValue.serverTimestamp(),
    actorUid: SYSTEM_ACTOR.uid,
    actorName: SYSTEM_ACTOR.name,
  }

  for (let i = 0; i < unique.length; i += BATCH_LIMIT) {
    const chunk = unique.slice(i, i + BATCH_LIMIT)
    const batch = db.batch()
    for (const userId of chunk) {
      const ref = db.collection(NOTIFY_COLLECTION).doc()
      batch.set(ref, { ...base, userId })
    }
    await batch.commit()
  }
}

/**
 * Scan active MBDI initiatives and send due-soon Rocket notifications for 7/3/1-day windows.
 */
export async function runMbdiDueReminders(db: Firestore, now = new Date()): Promise<DueReminderRunResult> {
  const today = todayInHarare(now)
  const snap = await db.collection('mbdiInitiatives').get()
  const approverIds = await listApproverUserIdsAdmin(db)

  let sent = 0
  let skipped = 0
  const details: DueReminderRunResult['details'] = []

  for (const d of snap.docs) {
    const data = d.data()
    const status = data.status as MbdiStatus
    const endDate = String(data.endDate || '').trim()

    if (!ELIGIBLE_STATUSES.has(status) || !endDate) {
      skipped++
      continue
    }

    const daysUntil = daysUntilEnd(endDate, today)
    if (daysUntil == null || !(DUE_REMINDER_WINDOWS as readonly number[]).includes(daysUntil)) {
      skipped++
      continue
    }

    const days = daysUntil as DueReminderDays
    const key = reminderKey(days)
    const already: string[] = Array.isArray(data.dueRemindersSent) ? data.dueRemindersSent : []
    if (already.includes(key)) {
      skipped++
      continue
    }

    const ownerIds = await resolveOwnerNotifyIdsAdmin(db, data.ownerId, data.ownerEmail)
    const recipients = [...new Set([...ownerIds, ...approverIds])]
    if (recipients.length === 0) {
      skipped++
      continue
    }

    const label = data.mbdiNo || data.title || d.id
    const title = titleForDays(days, label)
    const body = `${data.ownerName || 'Owner'}'s initiative ends on ${endDate}`

    await fanOutNotifications(db, recipients, {
      type: 'MBDI_DUE_SOON',
      title,
      body,
      initiativeId: d.id,
      mbdiNo: data.mbdiNo || null,
    })

    await d.ref.update({
      dueRemindersSent: FieldValue.arrayUnion(key),
      updatedAt: FieldValue.serverTimestamp(),
    })

    sent++
    details.push({
      initiativeId: d.id,
      mbdiNo: data.mbdiNo,
      daysUntil: days,
      recipientCount: recipients.length,
    })
  }

  return {
    today,
    checked: snap.size,
    sent,
    skipped,
    details,
  }
}
