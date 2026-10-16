export interface EnquiryActivity {
  id: string
  type: 'interaction' | 'next-action' | 'reschedule' | 'handover' | 'reassign' | 'stage' | 'closure'
  authorUid: string
  authorName: string
  at: string
  channel?: string
  summary: string
  outcome?: string
  previousDueAt?: string
  nextDueAt?: string
}

export interface PendingHandover {
  requestedBy: { uid: string; name: string }
  requestedTo: { uid: string; name: string }
  reason: string
  requestedAt: string
}

export function isOpenEnquiry(stage?: string) {
  return stage !== 'Won' && stage !== 'Lost'
}

export function enquiryIsOverdue(dueAt?: string, now = Date.now()) {
  if (!dueAt) return false
  const due = Date.parse(dueAt)
  return Number.isFinite(due) && due < now
}

export function enquiryIsDueToday(dueAt?: string, now = new Date()) {
  if (!dueAt) return false
  const due = new Date(dueAt)
  if (Number.isNaN(due.getTime())) return false
  return due.toDateString() === now.toDateString()
}

export function classifyFollowUps<T extends { nextActionDueAt?: string; stage?: string; owner?: { uid?: string } }>(
  leads: T[],
  viewerUid?: string
) {
  const open = leads.filter(lead => isOpenEnquiry(lead.stage))
  const mine = viewerUid ? open.filter(lead => lead.owner?.uid === viewerUid) : open
  return {
    dueToday: mine.filter(lead => enquiryIsDueToday(lead.nextActionDueAt)),
    overdue: mine.filter(lead => enquiryIsOverdue(lead.nextActionDueAt)),
    teamDueToday: open.filter(lead => enquiryIsDueToday(lead.nextActionDueAt)),
    teamOverdue: open.filter(lead => enquiryIsOverdue(lead.nextActionDueAt)),
  }
}

export function validateReopenClosed(input: { allow?: boolean; reason?: string; stage?: string }) {
  if (input.stage !== 'Won' && input.stage !== 'Lost') return 'Only a closed enquiry can be reopened'
  if (!input.allow) return 'Reopening closed enquiries is disabled in settings'
  if (!String(input.reason || '').trim()) return 'A reopen reason is required'
  return null
}

export function validateNextActionReplacement(input: {
  completing?: boolean
  closing?: boolean
  nextActionSummary?: string
  nextActionDueAt?: string
  lostReason?: string
  won?: boolean
}) {
  if (input.closing || input.won) {
    if (input.closing && !String(input.lostReason || '').trim() && !input.won) {
      return 'A closure outcome is required'
    }
    return null
  }
  if (!String(input.nextActionSummary || '').trim() || !String(input.nextActionDueAt || '').trim()) {
    return 'Completing the current action requires another action or a recorded closure'
  }
  return null
}

export function validateHandover(input: { toUid?: string; reason?: string }) {
  if (!String(input.toUid || '').trim()) return 'Select the new owner'
  if (!String(input.reason || '').trim()) return 'A handover reason is required'
  return null
}
