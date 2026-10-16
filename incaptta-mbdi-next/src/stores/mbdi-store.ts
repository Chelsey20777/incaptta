'use client'

import { create } from 'zustand'
import { db } from '@/lib/firebase'
import {
  collection,
  query,
  onSnapshot,
  doc,
  updateDoc,
  serverTimestamp,
  orderBy,
  runTransaction,
  Unsubscribe,
} from 'firebase/firestore'
import type {
  MbdiInitiative,
  MbdiClaim,
  MbdiTier,
  MbdiPayment,
  MbdiClaimStage,
  MbdiTask,
} from '@/features/mbdi/types'
import { taskProgress } from '@/features/mbdi/types'
import { postMbdiPaymentToPayroll } from '@/features/mbdi/utils/payroll-posting'
import {
  listApproverUserIds,
  notifyMbdiSafe,
  resolveOwnerNotifyIds,
} from '@/features/mbdi/utils/notify'

export interface SubmitClaimData {
  stage: MbdiClaimStage
  summary: string
  evidenceUrls: string[]
  costsIncurred: number
  resultsAchieved: string
  recommendation: string
}

interface Actor {
  uid: string
  name: string
}

function buildTasksFromTitles(titles: string[] | undefined, creator: Actor): MbdiTask[] {
  const now = new Date().toISOString()
  return (titles || [])
    .map((t) => t.trim())
    .filter(Boolean)
    .map((title) => ({
      id: crypto.randomUUID(),
      title,
      status: 'PENDING' as const,
      createdAt: now,
      createdByUid: creator.uid,
      createdByName: creator.name,
    }))
}

function allTasksVerified(tasks?: MbdiTask[]): boolean {
  return !!tasks && tasks.length > 0 && tasks.every((t) => t.status === 'VERIFIED')
}

/** Firestore rejects `undefined` — write only known task fields with defined values. */
function serializeTask(t: MbdiTask): Record<string, string> {
  const out: Record<string, string> = {
    id: t.id,
    title: t.title,
    status: t.status,
    createdAt: t.createdAt,
    createdByUid: t.createdByUid,
    createdByName: t.createdByName,
  }
  if (t.markedDoneAt) out.markedDoneAt = t.markedDoneAt
  if (t.verifiedAt) out.verifiedAt = t.verifiedAt
  if (t.verifiedByUid) out.verifiedByUid = t.verifiedByUid
  if (t.verifiedByName) out.verifiedByName = t.verifiedByName
  if (t.reviewNote) out.reviewNote = t.reviewNote
  return out
}

function serializeTasks(tasks: MbdiTask[]): Record<string, string>[] {
  return tasks.map(serializeTask)
}

interface MbdiState {
  initiatives: MbdiInitiative[]
  loading: boolean
  error: string | null

  fetchInitiatives: () => void
  cleanup: () => void

  generateMbdiNo: () => Promise<string>
  approveProposal: (
    initiativeId: string,
    approval: { tier: MbdiTier; rewardAmount: number },
    approver: Actor
  ) => Promise<string>
  rejectProposal: (initiativeId: string, rejector: Actor, reason: string) => Promise<void>

  addTask: (initiative: MbdiInitiative, title: string, creator: Actor) => Promise<void>
  removeTask: (initiative: MbdiInitiative, taskId: string) => Promise<void>
  seedTasksFromIndicators: (initiative: MbdiInitiative, actor: Actor) => Promise<void>
  setTaskDone: (initiative: MbdiInitiative, taskId: string, done: boolean) => Promise<void>
  verifyTask: (
    initiative: MbdiInitiative,
    taskId: string,
    approve: boolean,
    reviewer: Actor,
    note?: string
  ) => Promise<void>

  submitClaim: (initiative: MbdiInitiative, data: SubmitClaimData) => Promise<void>
  approveClaim: (
    initiative: MbdiInitiative,
    claimId: string,
    reviewer: Actor,
    opts?: { benefitGenerated?: string; reviewNote?: string }
  ) => Promise<MbdiPayment>
  returnClaim: (
    initiative: MbdiInitiative,
    claimId: string,
    reviewer: Actor,
    note: string
  ) => Promise<void>
}

let initiativesUnsubscribe: Unsubscribe | null = null

export const useMbdiStore = create<MbdiState>((set, get) => ({
  initiatives: [],
  loading: false,
  error: null,

  fetchInitiatives: () => {
    set({ loading: true })
    const q = query(collection(db, 'mbdiInitiatives'), orderBy('createdAt', 'desc'))
    initiativesUnsubscribe?.()
    initiativesUnsubscribe = onSnapshot(
      q,
      (snapshot) => {
        set({
          initiatives: snapshot.docs.map(
            (d) => ({ id: d.id, ...d.data() } as MbdiInitiative)
          ),
          loading: false,
        })
      },
      (err) => {
        set({ error: err.message, loading: false })
      }
    )
  },

  cleanup: () => {
    initiativesUnsubscribe?.()
    initiativesUnsubscribe = null
  },

  generateMbdiNo: async (): Promise<string> => {
    const currentYear = new Date().getFullYear()
    const counterRef = doc(db, 'systemCounters', 'mbdiInitiatives')

    const seq = await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(counterRef)
      let next = 1
      if (snap.exists()) {
        const data = snap.data()
        next = data.currentYear === currentYear ? (data.sequence || 0) + 1 : 1
      }
      transaction.set(counterRef, {
        currentYear,
        sequence: next,
        lastUpdatedAt: serverTimestamp(),
      })
      return next
    })

    return `MBDI-${currentYear}-${String(seq).padStart(3, '0')}`
  },

  approveProposal: async (initiativeId, approval, approver) => {
    const mbdiNo = await get().generateMbdiNo()
    const initiative = get().initiatives.find((i) => i.id === initiativeId)
    const existingTasks = initiative?.tasks || []
    const seeded =
      existingTasks.length > 0
        ? existingTasks
        : buildTasksFromTitles(initiative?.successIndicators, approver)

    await updateDoc(doc(db, 'mbdiInitiatives', initiativeId), {
      mbdiNo,
      tier: approval.tier,
      rewardAmount: approval.rewardAmount,
      status: 'APPROVED',
      tasks: serializeTasks(seeded),
      approvedByUid: approver.uid,
      approvedByName: approver.name,
      approvedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })

    if (initiative?.ownerId || initiative?.ownerEmail) {
      void resolveOwnerNotifyIds(initiative.ownerId, initiative.ownerEmail).then((ids) =>
        notifyMbdiSafe({
          userIds: ids,
          type: 'PROPOSAL_APPROVED',
          title: 'MBDI proposal approved',
          body: `${approver.name} approved your initiative as ${mbdiNo}: “${initiative.title}”.`,
          initiativeId,
          mbdiNo,
          actor: approver,
        })
      )
    }

    return mbdiNo
  },

  rejectProposal: async (initiativeId, rejector, reason) => {
    const initiative = get().initiatives.find((i) => i.id === initiativeId)
    await updateDoc(doc(db, 'mbdiInitiatives', initiativeId), {
      status: 'REJECTED',
      rejectedByUid: rejector.uid,
      rejectedByName: rejector.name,
      rejectedAt: serverTimestamp(),
      rejectionReason: reason,
      updatedAt: serverTimestamp(),
    })

    if (initiative?.ownerId || initiative?.ownerEmail) {
      void resolveOwnerNotifyIds(initiative.ownerId, initiative.ownerEmail).then((ids) =>
        notifyMbdiSafe({
          userIds: ids,
          type: 'PROPOSAL_REJECTED',
          title: 'MBDI proposal rejected',
          body: `${rejector.name} rejected “${initiative.title}”: ${reason}`,
          initiativeId,
          mbdiNo: initiative.mbdiNo,
          actor: rejector,
        })
      )
    }
  },

  addTask: async (initiative, title, creator) => {
    const trimmed = title.trim()
    if (!trimmed) throw new Error('Indicator text is required.')
    if (['COMPLETED', 'PERFORMANCE_CLAIMED', 'VALUE_CONFIRMED', 'REJECTED'].includes(initiative.status)) {
      throw new Error('Cannot add success indicators after Stage 2 payment or rejection.')
    }
    const task: MbdiTask = {
      id: crypto.randomUUID(),
      title: trimmed,
      status: 'PENDING',
      createdAt: new Date().toISOString(),
      createdByUid: creator.uid,
      createdByName: creator.name,
    }
    await updateDoc(doc(db, 'mbdiInitiatives', initiative.id), {
      tasks: serializeTasks([...(initiative.tasks || []), task]),
      successIndicators: [...(initiative.successIndicators || []), trimmed],
      updatedAt: serverTimestamp(),
    })
  },

  removeTask: async (initiative, taskId) => {
    const task = (initiative.tasks || []).find((t) => t.id === taskId)
    if (!task) throw new Error('Indicator not found.')
    if (task.status === 'VERIFIED') {
      throw new Error('Verified indicators cannot be removed.')
    }
    if (['COMPLETED', 'PERFORMANCE_CLAIMED', 'VALUE_CONFIRMED'].includes(initiative.status)) {
      throw new Error('Cannot remove success indicators after Stage 2 payment.')
    }
    const indicators = [...(initiative.successIndicators || [])]
    const idx = indicators.findIndex((s) => s === task.title)
    if (idx !== -1) indicators.splice(idx, 1)
    await updateDoc(doc(db, 'mbdiInitiatives', initiative.id), {
      tasks: serializeTasks((initiative.tasks || []).filter((t) => t.id !== taskId)),
      successIndicators: indicators,
      updatedAt: serverTimestamp(),
    })
  },

  seedTasksFromIndicators: async (initiative, actor) => {
    if ((initiative.tasks || []).length > 0) return
    const tasks = buildTasksFromTitles(initiative.successIndicators, actor)
    if (tasks.length === 0) throw new Error('This initiative has no success indicators to load.')
    await updateDoc(doc(db, 'mbdiInitiatives', initiative.id), {
      tasks: serializeTasks(tasks),
      updatedAt: serverTimestamp(),
    })
  },

  setTaskDone: async (initiative, taskId, done) => {
    if (
      ['COMPLETED', 'PERFORMANCE_CLAIMED', 'VALUE_CONFIRMED', 'REJECTED', 'PENDING_APPROVAL'].includes(
        initiative.status
      )
    ) {
      throw new Error('Indicators can only be ticked while the initiative is in progress.')
    }
    const tasks = initiative.tasks || []
    const task = tasks.find((t) => t.id === taskId)
    if (!task) throw new Error('Indicator not found.')
    if (task.status === 'VERIFIED') throw new Error('This indicator is already verified by management.')

    const updated = tasks.map((t) => {
      if (t.id !== taskId) return t
      if (done) {
        return {
          id: t.id,
          title: t.title,
          status: 'DONE' as const,
          createdAt: t.createdAt,
          createdByUid: t.createdByUid,
          createdByName: t.createdByName,
          markedDoneAt: new Date().toISOString(),
          reviewNote: '',
        }
      }
      return {
        id: t.id,
        title: t.title,
        status: 'PENDING' as const,
        createdAt: t.createdAt,
        createdByUid: t.createdByUid,
        createdByName: t.createdByName,
        reviewNote: '',
      }
    })

    await updateDoc(doc(db, 'mbdiInitiatives', initiative.id), {
      tasks: serializeTasks(updated),
      updatedAt: serverTimestamp(),
    })

    if (done) {
      const actor = { uid: initiative.ownerId, name: initiative.ownerName }
      const label = initiative.mbdiNo || initiative.title
      void listApproverUserIds().then((ids) =>
        notifyMbdiSafe({
          userIds: ids,
          type: 'INDICATOR_DONE',
          title: 'MBDI indicator ready for review',
          body: `${initiative.ownerName} marked “${task.title}” done on ${label}.`,
          initiativeId: initiative.id,
          mbdiNo: initiative.mbdiNo,
          actor,
        })
      )
    }
  },

  verifyTask: async (initiative, taskId, approve, reviewer, note) => {
    if (['COMPLETED', 'PERFORMANCE_CLAIMED', 'VALUE_CONFIRMED', 'REJECTED'].includes(initiative.status)) {
      throw new Error('Indicators can only be verified while the initiative is in progress.')
    }
    const tasks = initiative.tasks || []
    const task = tasks.find((t) => t.id === taskId)
    if (!task) throw new Error('Indicator not found.')
    if (approve && task.status !== 'DONE') {
      throw new Error('Owner must tick the indicator before you can verify it.')
    }
    if (!approve && task.status !== 'DONE' && task.status !== 'VERIFIED') {
      throw new Error('Only done or verified indicators can be returned or unverified.')
    }

    const wasVerified = task.status === 'VERIFIED'
    const updated = tasks.map((t) => {
      if (t.id !== taskId) return t
      if (approve) {
        return {
          id: t.id,
          title: t.title,
          status: 'VERIFIED' as const,
          createdAt: t.createdAt,
          createdByUid: t.createdByUid,
          createdByName: t.createdByName,
          markedDoneAt: t.markedDoneAt || new Date().toISOString(),
          verifiedAt: new Date().toISOString(),
          verifiedByUid: reviewer.uid,
          verifiedByName: reviewer.name,
          reviewNote: note || '',
        }
      }
      if (wasVerified) {
        return {
          id: t.id,
          title: t.title,
          status: 'DONE' as const,
          createdAt: t.createdAt,
          createdByUid: t.createdByUid,
          createdByName: t.createdByName,
          markedDoneAt: t.markedDoneAt || new Date().toISOString(),
          reviewNote: note || 'Verification withdrawn — awaiting re-verification.',
        }
      }
      return {
        id: t.id,
        title: t.title,
        status: 'PENDING' as const,
        createdAt: t.createdAt,
        createdByUid: t.createdByUid,
        createdByName: t.createdByName,
        reviewNote: note || 'Returned — please rework and mark done again.',
      }
    })

    await updateDoc(doc(db, 'mbdiInitiatives', initiative.id), {
      tasks: serializeTasks(updated),
      updatedAt: serverTimestamp(),
    })

    const label = initiative.mbdiNo || initiative.title
    if (initiative.ownerId || initiative.ownerEmail) {
      const unverified = !approve && wasVerified
      void resolveOwnerNotifyIds(initiative.ownerId, initiative.ownerEmail).then((ids) =>
        notifyMbdiSafe({
          userIds: ids,
          type: approve ? 'INDICATOR_VERIFIED' : 'INDICATOR_RETURNED',
          title: approve
            ? 'MBDI indicator verified'
            : unverified
              ? 'MBDI indicator unverified'
              : 'MBDI indicator returned',
          body: approve
            ? `${reviewer.name} verified “${task.title}” on ${label}.`
            : unverified
              ? `${reviewer.name} withdrew verification of “${task.title}” on ${label}.${note ? ` ${note}` : ''}`
              : `${reviewer.name} returned “${task.title}” on ${label}.${note ? ` ${note}` : ''}`,
          initiativeId: initiative.id,
          mbdiNo: initiative.mbdiNo,
          actor: reviewer,
        })
      )
    }

    if (approve && allTasksVerified(updated)) {
      void listApproverUserIds().then((ids) =>
        notifyMbdiSafe({
          userIds: ids,
          type: 'ALL_INDICATORS_VERIFIED',
          title: 'MBDI ready for Stage 2 claim',
          body: `All success indicators verified on ${label} — owner can submit the completion claim.`,
          initiativeId: initiative.id,
          mbdiNo: initiative.mbdiNo,
          actor: reviewer,
        })
      )
    }
  },

  submitClaim: async (initiative, data) => {
    if (data.stage === 'COMPLETION') {
      const tasks = initiative.tasks || []
      if (tasks.length === 0) {
        throw new Error('The Stage 1 success indicators must be verified before a completion claim.')
      }
      if (!allTasksVerified(tasks)) {
        throw new Error(
          `All success indicators must be manager-verified first (${taskProgress(tasks)}% verified).`
        )
      }
    }

    const claim: MbdiClaim = {
      id: crypto.randomUUID(),
      ...data,
      status: 'PENDING',
      submittedAt: new Date().toISOString(),
    }
    await updateDoc(doc(db, 'mbdiInitiatives', initiative.id), {
      claims: [...(initiative.claims || []), claim],
      status: data.stage === 'COMPLETION' ? 'COMPLETION_CLAIMED' : 'PERFORMANCE_CLAIMED',
      updatedAt: serverTimestamp(),
    })

    const stageLabel = data.stage === 'COMPLETION' ? 'Stage 2 completion' : 'Stage 3 performance'
    const actor = { uid: initiative.ownerId, name: initiative.ownerName }
    void listApproverUserIds().then((ids) =>
      notifyMbdiSafe({
        userIds: ids,
        type: 'CLAIM_SUBMITTED',
        title: `MBDI ${stageLabel} claim`,
        body: `${initiative.ownerName} submitted a ${stageLabel} claim on ${initiative.mbdiNo || initiative.title}.`,
        initiativeId: initiative.id,
        mbdiNo: initiative.mbdiNo,
        actor,
      })
    )
  },

  approveClaim: async (initiative, claimId, reviewer, opts) => {
    const claim = (initiative.claims || []).find((c) => c.id === claimId)
    if (!claim) throw new Error('Claim not found on this initiative.')
    if (claim.status !== 'PENDING') throw new Error('This claim has already been reviewed.')
    if (!initiative.mbdiNo || !initiative.rewardAmount) {
      throw new Error('Initiative has no approved reward — approve the proposal first.')
    }

    const isCompletion = claim.stage === 'COMPLETION'
    const halfReward = Math.round((initiative.rewardAmount / 2) * 100) / 100

    const payment = await postMbdiPaymentToPayroll({
      initiativeId: initiative.id,
      mbdiNo: initiative.mbdiNo,
      stage: isCompletion ? 'STAGE2' : 'STAGE3',
      amount: halfReward,
      ownerEmail: initiative.ownerEmail,
      ownerName: initiative.ownerName,
      postedByUid: reviewer.uid,
      postedByName: reviewer.name,
    })

    const updatedClaims = (initiative.claims || []).map((c) =>
      c.id === claimId
        ? {
            ...c,
            status: 'APPROVED' as const,
            reviewedByUid: reviewer.uid,
            reviewedByName: reviewer.name,
            reviewedAt: new Date().toISOString(),
            reviewNote: opts?.reviewNote || '',
          }
        : c
    )

    const update: Record<string, unknown> = {
      claims: updatedClaims,
      status: isCompletion ? 'COMPLETED' : 'VALUE_CONFIRMED',
      completionPercent: isCompletion ? 50 : 100,
      updatedAt: serverTimestamp(),
    }
    if (isCompletion) {
      update.stage2Payment = payment
    } else {
      update.stage3Payment = payment
      if (opts?.benefitGenerated) update.benefitGenerated = opts.benefitGenerated
    }

    await updateDoc(doc(db, 'mbdiInitiatives', initiative.id), update)

    if (initiative.ownerId || initiative.ownerEmail) {
      const stageLabel = isCompletion ? 'Stage 2 (50%)' : 'Stage 3 (100%)'
      void resolveOwnerNotifyIds(initiative.ownerId, initiative.ownerEmail).then((ids) =>
        notifyMbdiSafe({
          userIds: ids,
          type: 'CLAIM_APPROVED',
          title: `MBDI ${stageLabel} payment approved`,
          body: `${reviewer.name} approved your claim on ${initiative.mbdiNo} — US$${halfReward.toLocaleString()} posted to payroll.`,
          initiativeId: initiative.id,
          mbdiNo: initiative.mbdiNo,
          actor: reviewer,
        })
      )
    }

    return payment
  },

  returnClaim: async (initiative, claimId, reviewer, note) => {
    const claim = (initiative.claims || []).find((c) => c.id === claimId)
    if (!claim) throw new Error('Claim not found on this initiative.')

    const updatedClaims = (initiative.claims || []).map((c) =>
      c.id === claimId
        ? {
            ...c,
            status: 'RETURNED' as const,
            reviewedByUid: reviewer.uid,
            reviewedByName: reviewer.name,
            reviewedAt: new Date().toISOString(),
            reviewNote: note,
          }
        : c
    )

    await updateDoc(doc(db, 'mbdiInitiatives', initiative.id), {
      claims: updatedClaims,
      status: claim.stage === 'COMPLETION' ? 'APPROVED' : 'COMPLETED',
      updatedAt: serverTimestamp(),
    })

    if (initiative.ownerId || initiative.ownerEmail) {
      void resolveOwnerNotifyIds(initiative.ownerId, initiative.ownerEmail).then((ids) =>
        notifyMbdiSafe({
          userIds: ids,
          type: 'CLAIM_RETURNED',
          title: 'MBDI claim returned',
          body: `${reviewer.name} returned your claim on ${initiative.mbdiNo || initiative.title}: ${note}`,
          initiativeId: initiative.id,
          mbdiNo: initiative.mbdiNo,
          actor: reviewer,
        })
      )
    }
  },
}))
