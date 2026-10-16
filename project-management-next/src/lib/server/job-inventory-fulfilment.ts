import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase-admin'
import {
  applyDispatch,
  applyRelease,
  applyReserve,
  approvedQuantity,
  canReserve,
  fulfilmentLineId,
  fulfilmentQueueItem,
  nextFulfilmentState,
  outstandingReservation,
  planFulfilmentSession,
} from '@/lib/inventory/fulfilment'
import { reservationExpired } from '@/lib/inventory/open-policies'
import {
  cloneJobRows,
  inventoryLineMatches,
  listInventoryLines,
  updateMatchingLine,
  type InventoryJobCardRecord,
  type InventoryLineRecord,
} from './job-inventory-posting-core'
import { sendEmailAction } from '@/actions/email'
import {
  reportAcknowledgementEmail,
  reportPostedReceiptEmail,
  reportReceiptEmail,
  type AcknowledgementEmailInput,
  type PostedReceiptEmailInput,
  type ReceiptEmailInput,
} from './pmo-acknowledgement-email'
import { buildPmoReceiptEntryPdf } from './pmo-receipt-entry-pdf'

const STORE_ROLES = new Set(['STOREKEEPER', 'MANAGER', 'DIRECTOR', 'ADMIN', 'SUPER_ADMIN'])
const MANAGER_ROLES = new Set(['MANAGER', 'DIRECTOR', 'ADMIN', 'SUPER_ADMIN'])

export function canFulfilStock(roles: string[]) {
  return roles.some(role => STORE_ROLES.has(role))
}

export function canReserveStock(roles: string[]) {
  return roles.some(role => MANAGER_ROLES.has(role))
}

export function canApprovePmoReceipt(roles: string[]) {
  return roles.some(role => MANAGER_ROLES.has(role))
}

export function canReadWarehouseReceipts(roles: string[]) {
  return canFulfilStock(roles) || roles.includes('TECHNICAL')
}

export function canSubmitWarehouseReceipt(roles: string[]) {
  return roles.includes('TECHNICAL') || roles.includes('SUPER_ADMIN')
}

export function canPmoCheckReceipt(roles: string[]) {
  return roles.includes('STOREKEEPER')
}

export async function fulfilmentActorName(uid: string) {
  try {
    const profile = await adminDb.collection('users').doc(uid).get()
    const stored = profile.data()?.name
    if (typeof stored === 'string' && stored.trim()) return stored.trim()
  } catch {
    // The issue is still recorded under the uid when the profile cannot be read.
  }
  return uid
}

async function deliverReceiptEmail(notice: ReceiptEmailInput) {
  try {
    const delivery = await reportReceiptEmail(notice, message => sendEmailAction(message))
    if (!delivery.sent) console.error('[pmo-receipt-email]', delivery.error)
    return delivery.sent
  } catch (err) {
    console.error('[pmo-receipt-email]', err)
    return false
  }
}

async function deliverPostedReceiptEmail(notice: PostedReceiptEmailInput) {
  try {
    const pdf = await buildPmoReceiptEntryPdf(notice)
    const delivery = await reportPostedReceiptEmail({ ...notice, attachment: pdf }, message => sendEmailAction(message))
    if (!delivery.sent) console.error('[pmo-receipt-posted-email]', delivery.error)
    return delivery.sent
  } catch (err) {
    console.error('[pmo-receipt-posted-email]', err)
    return false
  }
}

async function deliverIssueEmail(notice: AcknowledgementEmailInput) {
  try {
    const delivery = await reportAcknowledgementEmail(notice, message => sendEmailAction(message))
    if (!delivery.sent) console.error('[pmo-issue-email]', delivery.error)
    return delivery.sent
  } catch (err) {
    console.error('[pmo-issue-email]', err)
    return false
  }
}

function reservedBalance(data?: { onHand?: number; inStock?: number; reserved?: number; damagedQty?: number }) {
  return {
    onHand: Number(data?.onHand ?? data?.inStock ?? 0),
    reserved: Number(data?.reserved ?? 0),
    damagedQty: Number(data?.damagedQty ?? 0),
  }
}

export async function reserveJobInventoryLine(params: {
  jobCardId: string
  lineId: string
  actor: { uid: string; name: string }
}) {
  const { jobCardId, lineId, actor } = params
  const ledgerId = `JOB_CARD_RESERVE_${jobCardId}_${lineId}`.replace(/[^A-Za-z0-9_-]/g, '_')
  return adminDb.runTransaction(async tx => {
    const jobRef = adminDb.collection('jobCards').doc(jobCardId)
    const ledgerRef = adminDb.collection('stockLedger').doc(ledgerId)
    const [jobSnap, ledgerSnap] = await Promise.all([tx.get(jobRef), tx.get(ledgerRef)])
    if (!jobSnap.exists) throw new Error('Job Card not found')
    const job = jobSnap.data() as InventoryJobCardRecord
    const rows = cloneJobRows(job)
    const line = [...rows.sections.flatMap(section => section.items), ...rows.flat].find(item => inventoryLineMatches(item, lineId))
    if (!line) throw new Error('Inventory line not found')
    if (!line.inventoryItemId) throw new Error('Inventory line is not linked to stock')
    if (ledgerSnap.exists) {
      tx.update(jobRef, {
        ...updateMatchingLine(rows, lineId, item => ({
          ...item,
          approvalStatus: 'APPROVED_MANAGER',
          fulfilmentState: item.fulfilmentState || 'RESERVED',
          reservedQty: Number(item.reservedQty ?? item.qtyRequired ?? 0),
          postingError: null,
        })),
        updatedAt: FieldValue.serverTimestamp(),
      })
      return { ledgerId, fulfilmentState: 'RESERVED', idempotent: true }
    }
    if (!canReserve(line)) {
      throw new Error('Accountant approval is required before stock can be reserved')
    }
    const quantity = Number(line.qtyRequired ?? line.quantity ?? line.qty)
    if (!(quantity > 0) || !Number.isFinite(quantity)) throw new Error('Inventory quantity must be a finite quantity greater than zero')
    const inventoryRef = adminDb.collection('inventoryItems').doc(String(line.inventoryItemId))
    const inventorySnap = await tx.get(inventoryRef)
    if (!inventorySnap.exists) throw new Error('Inventory item not found')
    const next = applyReserve(reservedBalance(inventorySnap.data()), quantity)
    const now = FieldValue.serverTimestamp()
    tx.update(inventoryRef, { reserved: next.reserved, updatedAt: now })
    tx.create(ledgerRef, {
      inventoryItemId: line.inventoryItemId,
      movementType: 'RESERVE',
      qtyDelta: 0,
      reservedDelta: quantity,
      qtyBefore: next.onHand,
      qtyAfter: next.onHand,
      reservedBefore: next.reserved - quantity,
      reservedAfter: next.reserved,
      sourceType: 'JOB_CARD_RESERVE',
      sourceId: jobCardId,
      sourceLineId: lineId,
      referenceNo: job.generalInfo?.jobNumber || jobCardId,
      reason: 'Manager-approved reservation',
      postedBy: actor,
      createdAt: now,
    })
    tx.update(jobRef, {
      ...updateMatchingLine(rows, lineId, item => ({
        ...item,
        approvalStatus: 'APPROVED_MANAGER',
        approvedAt: new Date().toISOString(),
        approvedBy: actor.name,
        fulfilmentState: 'RESERVED',
        reservedQty: quantity,
        reservedAt: new Date().toISOString(),
        issuedQty: Number(item.issuedQty || 0),
        postingError: null,
      })),
      updatedAt: now,
    })
    return { ledgerId, fulfilmentState: 'RESERVED', idempotent: false }
  })
}

export async function dispatchJobInventoryLine(params: {
  jobCardId: string
  lineId: string
  quantity: number
  actor: { uid: string; name: string }
  recipient?: string
  damagedQty?: number
}) {
  const quantity = Number(params.quantity)
  if (!(quantity > 0) || !Number.isFinite(quantity)) throw new Error('Dispatch quantity must be a finite quantity greater than zero')
  const dispatchId = `${Date.now()}_${params.actor.uid}`.replace(/[^A-Za-z0-9_-]/g, '_')
  const ledgerId = `JOB_CARD_DISPATCH_${params.jobCardId}_${params.lineId}_${dispatchId}`.replace(/[^A-Za-z0-9_-]/g, '_')

  const result = await adminDb.runTransaction(async tx => {
    const jobRef = adminDb.collection('jobCards').doc(params.jobCardId)
    const jobSnap = await tx.get(jobRef)
    if (!jobSnap.exists) throw new Error('Job Card not found')
    const job = jobSnap.data() as InventoryJobCardRecord
    const rows = cloneJobRows(job)
    const line = [...rows.sections.flatMap(section => section.items), ...rows.flat].find(item => inventoryLineMatches(item, params.lineId))
    if (!line) throw new Error('Inventory line not found')
    if (!line.inventoryItemId) throw new Error('Inventory line is not linked to stock')
    if (line.approvalStatus !== 'APPROVED_MANAGER' && line.fulfilmentState !== 'RESERVED' && line.fulfilmentState !== 'PARTIAL') {
      throw new Error('Only reserved, manager-approved materials can be dispatched')
    }
    if (line.fulfilmentState === 'ISSUED') {
      throw new Error('This line has already been issued and cannot be released again')
    }
    const approved = approvedQuantity(line)
    const alreadyIssued = Number(line.issuedQty || 0)
    if (approved > 0 && alreadyIssued >= approved) {
      throw new Error('Required quantity has already been released')
    }
    const inventoryRef = adminDb.collection('inventoryItems').doc(String(line.inventoryItemId))
    const inventorySnap = await tx.get(inventoryRef)
    if (!inventorySnap.exists) throw new Error('Inventory item not found')
    const next = applyDispatch(reservedBalance(inventorySnap.data()), {
      ...line,
      reservedQty: Number(line.reservedQty || 0),
      issuedQty: Number(line.issuedQty || 0),
    }, quantity)
    const issuedQty = Number(line.issuedQty || 0) + quantity
    const fulfilmentState = nextFulfilmentState(line, issuedQty)
    const now = FieldValue.serverTimestamp()
    const damagedQty = Number(inventorySnap.data()?.damagedQty || 0) + Number(params.damagedQty || 0)
    tx.update(inventoryRef, { onHand: next.onHand, reserved: next.reserved, damagedQty, updatedAt: now })
    tx.create(adminDb.collection('stockLedger').doc(ledgerId), {
      inventoryItemId: line.inventoryItemId,
      movementType: 'DISPATCH',
      qtyDelta: -quantity,
      reservedDelta: -quantity,
      qtyBefore: next.onHand + quantity,
      qtyAfter: next.onHand,
      sourceType: 'JOB_CARD_DISPATCH',
      sourceId: params.jobCardId,
      sourceLineId: params.lineId,
      dispatchId,
      recipient: params.recipient || null,
      referenceNo: job.generalInfo?.jobNumber || params.jobCardId,
      reason: 'PMO physical issue',
      postedBy: params.actor,
      createdAt: now,
    })
    tx.update(jobRef, {
      ...updateMatchingLine(rows, params.lineId, item => ({
        ...item,
        fulfilmentState,
        issuedQty,
        reservedQty: Number(item.reservedQty || 0),
        inventoryDeducted: fulfilmentState === 'ISSUED',
        lastDispatchId: dispatchId,
        damagedQty: Number(item.damagedQty || 0) + Number(params.damagedQty || 0),
      })),
      updatedAt: now,
    })
    const info = job.generalInfo as { jobNumber?: string; recipientName?: string } | undefined
    const notice: AcknowledgementEmailInput = {
      jobNumber: String(info?.jobNumber || params.jobCardId),
      recipient: String(params.recipient || info?.recipientName || ''),
      issuedBy: params.actor.name,
      issuedAt: new Date().toISOString(),
      lines: [{
        name: String(line.itemName || line.description || 'Inventory item'),
        sku: String((line as { sku?: string }).sku || ''),
        quantity,
      }],
    }
    return { ledgerId, dispatchId, fulfilmentState, issuedQty, idempotent: false, notice }
  })
  const emailSent = await deliverIssueEmail(result.notice)
  return { ledgerId: result.ledgerId, dispatchId: result.dispatchId, fulfilmentState: result.fulfilmentState, issuedQty: result.issuedQty, idempotent: false, emailSent }
}

function applyLinePatches(
  rows: ReturnType<typeof cloneJobRows>,
  patches: Array<{ lineId: string; patch: (item: InventoryLineRecord) => InventoryLineRecord }>,
) {
  return patches.reduce((next, { lineId, patch }) => {
    const updated = updateMatchingLine(next, lineId, patch)
    return {
      sections: updated.requisitionSections,
      flat: updated.requisitionItems,
      returns: updated.inventoryReturns,
    }
  }, rows)
}

export async function dispatchJobInventorySession(params: {
  jobCardId: string
  actor: { uid: string; name: string }
  recipient?: string
  lines?: Array<{ lineId: string; quantity?: number; damagedQty?: number }>
}) {
  const sessionId = `${Date.now()}_${params.actor.uid}`.replace(/[^A-Za-z0-9_-]/g, '_')
  const result = await adminDb.runTransaction(async tx => {
    const jobRef = adminDb.collection('jobCards').doc(params.jobCardId)
    const jobSnap = await tx.get(jobRef)
    if (!jobSnap.exists) throw new Error('Job Card not found')
    const job = jobSnap.data() as InventoryJobCardRecord
    const rows = cloneJobRows(job)
    const issueLines = listInventoryLines(job, 'ISSUE') as InventoryLineRecord[]
    const overrides = Object.fromEntries((params.lines || []).map(line => [line.lineId, {
      quantity: line.quantity,
      damagedQty: line.damagedQty,
    }]))
    const planned = planFulfilmentSession(issueLines, Object.keys(overrides).length ? overrides : undefined)
    const targets = planned.map(plan => {
      const line = issueLines.find(item => inventoryLineMatches(item, plan.lineId) || fulfilmentLineId(item) === plan.lineId)
      if (!line) throw new Error(`Inventory line not found: ${plan.lineId}`)
      if (!line.inventoryItemId) throw new Error(`${line.itemName || 'Inventory line'} is not linked to stock`)
      if (line.approvalStatus !== 'APPROVED_MANAGER' && line.fulfilmentState !== 'RESERVED' && line.fulfilmentState !== 'PARTIAL') {
        throw new Error('Only reserved, manager-approved materials can be dispatched')
      }
      return { plan, line }
    })

    const inventoryIds = [...new Set(targets.map(target => String(target.line.inventoryItemId)))]
    const balances = new Map<string, { onHand: number; reserved: number; damagedQty: number }>()
    for (const inventoryId of inventoryIds) {
      const snap = await tx.get(adminDb.collection('inventoryItems').doc(inventoryId))
      if (!snap.exists) throw new Error('Inventory item not found')
      balances.set(inventoryId, reservedBalance(snap.data()))
    }

    const now = FieldValue.serverTimestamp()
    const issuedLines: Array<{
      lineId: string
      itemName: string
      sku: string
      releasedQty: number
      issuedQty: number
      damagedQty: number
      fulfilmentState: string
    }> = []
    const patches: Array<{ lineId: string; patch: (item: InventoryLineRecord) => InventoryLineRecord }> = []

    for (const { plan, line } of targets) {
      const inventoryId = String(line.inventoryItemId)
      const balance = balances.get(inventoryId)!
      const next = applyDispatch(balance, {
        ...line,
        reservedQty: Number(line.reservedQty || 0),
        issuedQty: Number(line.issuedQty || 0),
      }, plan.quantity)
      const issuedQty = Number(line.issuedQty || 0) + plan.quantity
      const fulfilmentState = nextFulfilmentState(line, issuedQty)
      const damagedQty = Number(line.damagedQty || 0) + Number(plan.damagedQty || 0)
      balances.set(inventoryId, {
        onHand: next.onHand,
        reserved: next.reserved,
        damagedQty: Number(balance.damagedQty || 0) + Number(plan.damagedQty || 0),
      })
      const ledgerId = `JOB_CARD_DISPATCH_${params.jobCardId}_${plan.lineId}_${sessionId}`.replace(/[^A-Za-z0-9_-]/g, '_')
      tx.create(adminDb.collection('stockLedger').doc(ledgerId), {
        inventoryItemId: line.inventoryItemId,
        movementType: 'DISPATCH',
        qtyDelta: -plan.quantity,
        reservedDelta: -plan.quantity,
        qtyBefore: next.onHand + plan.quantity,
        qtyAfter: next.onHand,
        sourceType: 'JOB_CARD_DISPATCH',
        sourceId: params.jobCardId,
        sourceLineId: plan.lineId,
        dispatchId: sessionId,
        sessionId,
        recipient: params.recipient || null,
        referenceNo: job.generalInfo?.jobNumber || params.jobCardId,
        reason: 'PMO physical issue',
        postedBy: params.actor,
        createdAt: now,
      })
      issuedLines.push({
        lineId: plan.lineId,
        itemName: String(line.itemName || plan.itemName),
        sku: String((line as { sku?: string }).sku || ''),
        releasedQty: plan.quantity,
        issuedQty,
        damagedQty,
        fulfilmentState,
      })
      patches.push({
        lineId: plan.lineId,
        patch: item => ({
          ...item,
          fulfilmentState,
          issuedQty,
          reservedQty: Number(item.reservedQty || 0),
          inventoryDeducted: fulfilmentState === 'ISSUED',
          lastDispatchId: sessionId,
          lastSessionId: sessionId,
          damagedQty,
        }),
      })
    }

    for (const inventoryId of inventoryIds) {
      const next = balances.get(inventoryId)!
      tx.update(adminDb.collection('inventoryItems').doc(inventoryId), {
        onHand: next.onHand,
        reserved: next.reserved,
        damagedQty: next.damagedQty,
        updatedAt: now,
      })
    }

    const updatedRows = applyLinePatches(rows, patches)
    tx.update(jobRef, {
      requisitionSections: updatedRows.sections,
      requisitionItems: updatedRows.flat,
      lastFulfilmentSessionId: sessionId,
      updatedAt: now,
    })

    const info = job.generalInfo as { jobNumber?: string; recipientName?: string } | undefined
    const notice: AcknowledgementEmailInput = {
      jobNumber: String(info?.jobNumber || params.jobCardId),
      recipient: String(params.recipient || info?.recipientName || ''),
      issuedBy: params.actor.name,
      issuedAt: new Date().toISOString(),
      lines: issuedLines.map(line => ({
        name: line.itemName,
        sku: line.sku,
        quantity: line.releasedQty,
      })),
    }
    return {
      sessionId,
      dispatchId: sessionId,
      lines: issuedLines,
      idempotent: false,
      notice,
    }
  })
  const emailSent = await deliverIssueEmail(result.notice)
  return {
    sessionId: result.sessionId,
    dispatchId: result.dispatchId,
    lines: result.lines,
    idempotent: false,
    emailSent,
  }
}

export async function releaseJobInventoryReservation(params: {
  jobCardId: string
  lineId: string
  actor: { uid: string; name: string }
}) {
  return adminDb.runTransaction(async tx => {
    const jobRef = adminDb.collection('jobCards').doc(params.jobCardId)
    const jobSnap = await tx.get(jobRef)
    if (!jobSnap.exists) throw new Error('Job Card not found')
    const job = jobSnap.data() as InventoryJobCardRecord
    const rows = cloneJobRows(job)
    const line = [...rows.sections.flatMap(section => section.items), ...rows.flat].find(item => inventoryLineMatches(item, params.lineId))
    if (!line?.inventoryItemId) throw new Error('Inventory line not found')
    const remaining = outstandingReservation({
      reservedQty: Number(line.reservedQty || 0),
      issuedQty: Number(line.issuedQty || 0),
    })
    if (remaining <= 0) return { released: 0, idempotent: true }
    const inventoryRef = adminDb.collection('inventoryItems').doc(String(line.inventoryItemId))
    const inventorySnap = await tx.get(inventoryRef)
    if (!inventorySnap.exists) throw new Error('Inventory item not found')
    const next = applyRelease(reservedBalance(inventorySnap.data()), {
      reservedQty: Number(line.reservedQty || 0),
      issuedQty: Number(line.issuedQty || 0),
    })
    const now = FieldValue.serverTimestamp()
    tx.update(inventoryRef, { reserved: next.reserved, updatedAt: now })
    tx.update(jobRef, {
      ...updateMatchingLine(rows, params.lineId, item => ({
        ...item,
        reservedQty: Number(item.issuedQty || 0),
        fulfilmentState: Number(item.issuedQty || 0) > 0 ? 'ISSUED' : 'RELEASED',
      })),
      updatedAt: now,
    })
    return { released: remaining, idempotent: false }
  })
}

function sessionLineIds(lines: InventoryLineRecord[], sessionId?: string) {
  const issued = lines.filter(line => Number(line.issuedQty || 0) > 0)
  if (sessionId) {
    return issued.filter(line => String((line as { lastSessionId?: string; lastDispatchId?: string }).lastSessionId
      || (line as { lastDispatchId?: string }).lastDispatchId || '') === sessionId)
  }
  const latest = issued
    .map(line => String((line as { lastSessionId?: string; lastDispatchId?: string }).lastSessionId
      || (line as { lastDispatchId?: string }).lastDispatchId || ''))
    .find(Boolean)
  return latest
    ? issued.filter(line => String((line as { lastSessionId?: string; lastDispatchId?: string }).lastSessionId
      || (line as { lastDispatchId?: string }).lastDispatchId || '') === latest)
    : issued
}

export async function acknowledgeJobInventoryDispatch(params: {
  jobCardId: string
  lineId?: string
  sessionId?: string
  actor: { uid: string; name: string }
  note?: string
}) {
  const result = await adminDb.runTransaction(async tx => {
    const jobRef = adminDb.collection('jobCards').doc(params.jobCardId)
    const jobSnap = await tx.get(jobRef)
    if (!jobSnap.exists) throw new Error('Job Card not found')
    const job = jobSnap.data() as InventoryJobCardRecord
    const rows = cloneJobRows(job)
    const issueLines = listInventoryLines(job, 'ISSUE') as InventoryLineRecord[]
    const targets = params.lineId
      ? issueLines.filter(line => inventoryLineMatches(line, params.lineId!))
      : sessionLineIds(issueLines, params.sessionId || (job as { lastFulfilmentSessionId?: string }).lastFulfilmentSessionId)
    const pending = targets.filter(line => Number(line.issuedQty || 0) > 0 && !(line as { acknowledgedAt?: string }).acknowledgedAt)
    if (pending.length === 0) {
      throw new Error('Acknowledge tracks custody after dispatch. It does not deduct stock.')
    }
    const now = FieldValue.serverTimestamp()
    const acknowledgedAt = new Date().toISOString()
    const updatedRows = applyLinePatches(rows, pending.map(line => ({
      lineId: fulfilmentLineId(line),
      patch: item => ({
        ...item,
        acknowledgedAt,
        acknowledgedBy: params.actor,
        acknowledgementNote: params.note || null,
      }),
    })))
    tx.update(jobRef, {
      requisitionSections: updatedRows.sections,
      requisitionItems: updatedRows.flat,
      acknowledgement: FieldValue.arrayUnion({
        sessionId: params.sessionId || (job as { lastFulfilmentSessionId?: string }).lastFulfilmentSessionId || null,
        lineIds: pending.map(line => fulfilmentLineId(line)),
        actor: params.actor,
        note: params.note || null,
        at: acknowledgedAt,
      }),
      updatedAt: now,
    })
    return { acknowledged: true, deducted: false, lineIds: pending.map(line => fulfilmentLineId(line)) }
  })

  return { acknowledged: true, deducted: false, lineIds: result.lineIds }
}

export async function markAcknowledgementPdfGenerated(params: {
  jobCardId: string
  lineId?: string
  sessionId?: string
  actor: { uid: string; name: string }
}) {
  return adminDb.runTransaction(async tx => {
    const jobRef = adminDb.collection('jobCards').doc(params.jobCardId)
    const jobSnap = await tx.get(jobRef)
    if (!jobSnap.exists) throw new Error('Job Card not found')
    const job = jobSnap.data() as InventoryJobCardRecord
    const rows = cloneJobRows(job)
    const issueLines = listInventoryLines(job, 'ISSUE') as InventoryLineRecord[]
    const targets = params.lineId
      ? issueLines.filter(line => inventoryLineMatches(line, params.lineId!))
      : sessionLineIds(issueLines, params.sessionId || (job as { lastFulfilmentSessionId?: string }).lastFulfilmentSessionId)
    const pending = targets.filter(line => Number(line.issuedQty || 0) > 0 && (line as { acknowledgedAt?: string }).acknowledgedAt)
    if (pending.length === 0) {
      throw new Error('Acknowledge the release before recording the PDF')
    }
    const already = pending.every(line => (line as { acknowledgementPdfGeneratedAt?: string }).acknowledgementPdfGeneratedAt)
    if (already) return { recorded: true, idempotent: true, lineIds: pending.map(line => fulfilmentLineId(line)) }
    const generatedAt = new Date().toISOString()
    const updatedRows = applyLinePatches(rows, pending.map(line => ({
      lineId: fulfilmentLineId(line),
      patch: item => ({
        ...item,
        acknowledgementPdfGeneratedAt: (item as { acknowledgementPdfGeneratedAt?: string }).acknowledgementPdfGeneratedAt || generatedAt,
      }),
    })))
    tx.update(jobRef, {
      requisitionSections: updatedRows.sections,
      requisitionItems: updatedRows.flat,
      updatedAt: FieldValue.serverTimestamp(),
    })
    return { recorded: true, idempotent: false, lineIds: pending.map(line => fulfilmentLineId(line)) }
  })
}

export async function listFulfilmentQueue(expiryHours = 72) {
  const snap = await adminDb.collection('jobCards').get()
  const items: ReturnType<typeof fulfilmentQueueItem>[] = []
  for (const docSnap of snap.docs) {
    const job = { id: docSnap.id, ...docSnap.data() } as InventoryJobCardRecord & { id: string; status?: string }
    for (const line of listInventoryLines(job, 'ISSUE') as InventoryLineRecord[]) {
      const reserved = Number(line.reservedQty || 0)
      const issued = Number(line.issuedQty || 0)
      const acknowledgedAt = (line as { acknowledgedAt?: string }).acknowledgedAt
      const acknowledgementPdfGeneratedAt = (line as { acknowledgementPdfGeneratedAt?: string }).acknowledgementPdfGeneratedAt
      if (acknowledgedAt && acknowledgementPdfGeneratedAt) continue
      if (reserved > issued || line.fulfilmentState === 'RESERVED' || line.fulfilmentState === 'PARTIAL' || issued > 0) {
        items.push(fulfilmentQueueItem(job, {
          ...line,
          reservedAt: (line as { reservedAt?: string }).reservedAt,
          acknowledgedAt,
          acknowledgedBy: (line as { acknowledgedBy?: { name?: string } }).acknowledgedBy,
          lastDispatchId: (line as { lastDispatchId?: string }).lastDispatchId,
          lastSessionId: (line as { lastSessionId?: string }).lastSessionId || (line as { lastDispatchId?: string }).lastDispatchId,
          acknowledgementPdfGeneratedAt,
          damagedQty: Number((line as { damagedQty?: number }).damagedQty || 0),
        }, {
          expired: reservationExpired((line as { reservedAt?: string }).reservedAt, Date.now(), expiryHours),
          damagedQty: Number((line as { damagedQty?: number }).damagedQty || 0),
        }))
      }
    }
  }
  return items
}

export async function listReceivableInventory() {
  const snap = await adminDb.collection('inventoryItems').limit(1000).get()
  return snap.docs
    .map(docSnap => {
      const data = docSnap.data()
      return {
        id: docSnap.id,
        sku: String(data.sku || ''),
        name: String(data.name || 'Unnamed item'),
        uom: String(data.uom || ''),
        onHand: Number(data.onHand ?? data.inStock ?? 0),
        isActive: data.isActive !== false,
      }
    })
    .filter(item => item.isActive)
    .sort((a, b) => a.name.localeCompare(b.name))
}

function receiptId(requestId: string) {
  const id = String(requestId || '').replace(/[^A-Za-z0-9_-]/g, '_')
  if (!id) throw new Error('A receipt request id is required')
  return id
}

export async function listInventoryReceipts() {
  const snap = await adminDb.collection('inventoryReceipts').limit(100).get()
  return snap.docs
    .map(docSnap => {
      const data = docSnap.data() || {}
      return { id: docSnap.id, ...data, requestedAt: String(data.requestedAt || '') }
    })
    .sort((a, b) => a.requestedAt < b.requestedAt ? 1 : a.requestedAt > b.requestedAt ? -1 : 0)
}

export async function receiveInventoryItem(input: {
  inventoryItemId: string
  quantity: number
  reference: string
  note: string
  requestId: string
  actor: { uid: string; name: string }
}) {
  const inventoryItemId = String(input.inventoryItemId || '').trim()
  const quantity = Number(input.quantity)
  const reference = String(input.reference || '').trim()
  const note = String(input.note || '').trim()
  const requestId = receiptId(input.requestId)
  if (!inventoryItemId || !Number.isFinite(quantity) || quantity <= 0) throw new Error('Choose an item and a quantity greater than zero')
  if (!reference) throw new Error('A delivery reference is required')
  const itemSnap = await adminDb.collection('inventoryItems').doc(inventoryItemId).get()
  if (!itemSnap.exists) throw new Error('Inventory item not found')
  if (itemSnap.data()?.isActive === false) throw new Error('This item is inactive')
  const receiptRef = adminDb.collection('inventoryReceipts').doc(requestId)
  const existing = await receiptRef.get()
  if (existing.exists) return { id: requestId, status: existing.data()?.status || 'PENDING', idempotent: true, emailed: false }
  const item = itemSnap.data() || {}
  const requestedAt = new Date().toISOString()
  const itemName = String(item.name || 'Unnamed item')
  const sku = String(item.sku || '')
  const uom = String(item.uom || '')
  await receiptRef.create({
    inventoryItemId,
    itemName,
    sku,
    uom,
    quantity,
    reference,
    note,
    status: 'PENDING_PMO',
    requestedBy: input.actor,
    requestedAt,
  })
  const emailed = await deliverReceiptEmail({
    itemName,
    sku,
    quantity,
    uom,
    reference,
    note,
    submittedBy: input.actor.name,
    submittedAt: requestedAt,
  })
  return { id: requestId, status: 'PENDING_PMO', idempotent: false, emailed }
}

export async function decideInventoryReceipt(input: {
  requestId: string
  decision: 'APPROVE' | 'REJECT'
  actor: { uid: string; name: string; roles: string[] }
}) {
  const requestId = receiptId(input.requestId)
  if (input.decision !== 'APPROVE' && input.decision !== 'REJECT') throw new Error('Choose approve or reject')
  const ledgerId = (inventoryItemId: string) => `PMO_RECEIPT_${inventoryItemId}_${requestId}`
  const result = await adminDb.runTransaction(async transaction => {
    const receiptRef = adminDb.collection('inventoryReceipts').doc(requestId)
    const receiptSnap = await transaction.get(receiptRef)
    if (!receiptSnap.exists) throw new Error('Receipt not found')
    const receipt = receiptSnap.data() || {}
    const inventoryItemId = String(receipt.inventoryItemId || '')
    const quantity = Number(receipt.quantity)
    const status = receipt.status === 'PENDING' ? 'PENDING_FINAL' : String(receipt.status || '')
    if (status === 'REJECTED') {
      if (input.decision === 'REJECT') return { id: requestId, status: 'REJECTED', idempotent: true }
      throw new Error('This receipt was rejected')
    }
    if (status === 'PENDING_PMO') {
      if (!canPmoCheckReceipt(input.actor.roles)) throw new Error('PMO must approve this entry before stock can change')
      if (receipt.requestedBy?.uid && receipt.requestedBy.uid === input.actor.uid) throw new Error('PMO cannot approve a receipt they submitted')
      if (input.decision === 'REJECT') {
        transaction.update(receiptRef, { status: 'REJECTED', pmoDecidedBy: input.actor, pmoDecidedAt: new Date().toISOString() })
        return { id: requestId, status: 'REJECTED', idempotent: false }
      }
      transaction.update(receiptRef, { status: 'PENDING_FINAL', pmoDecidedBy: input.actor, pmoDecidedAt: new Date().toISOString() })
      return { id: requestId, status: 'PENDING_FINAL', idempotent: false }
    }
    if (status === 'APPROVED') {
      if (input.decision === 'APPROVE') return { id: requestId, status: 'APPROVED', idempotent: true }
      throw new Error('This receipt is already in stock')
    }
    if (status !== 'PENDING_FINAL') throw new Error('This receipt is not waiting for approval')
    if (!canApprovePmoReceipt(input.actor.roles)) throw new Error('A manager or admin must give the final approval')
    const itemRef = adminDb.collection('inventoryItems').doc(inventoryItemId)
    const ledgerRef = adminDb.collection('stockLedger').doc(ledgerId(inventoryItemId))
    const [itemSnap, ledgerSnap] = await Promise.all([transaction.get(itemRef), transaction.get(ledgerRef)])
    if (receipt.status === 'APPROVED' || ledgerSnap.exists) {
      if (input.decision === 'APPROVE') return { id: requestId, status: 'APPROVED', ledgerId: ledgerRef.id, idempotent: true, qtyAfter: Number(ledgerSnap.data()?.qtyAfter ?? itemSnap.data()?.onHand ?? 0) }
      throw new Error('This receipt is already in stock')
    }
    if (input.decision === 'REJECT') {
      transaction.update(receiptRef, {
        status: 'REJECTED',
        decidedBy: input.actor,
        decidedAt: new Date().toISOString(),
      })
      return { id: requestId, status: 'REJECTED', idempotent: false }
    }
    if (!itemSnap.exists) throw new Error('Inventory item not found')
    if (!Number.isFinite(quantity) || quantity <= 0) throw new Error('Receipt quantity is invalid')
    const qtyBefore = Number(itemSnap.data()?.onHand ?? itemSnap.data()?.inStock ?? 0)
    const qtyAfter = qtyBefore + quantity
    const approvedAt = new Date().toISOString()
    const now = FieldValue.serverTimestamp()
    transaction.update(itemRef, { onHand: qtyAfter, updatedAt: now, updatedBy: input.actor })
    transaction.create(ledgerRef, {
      inventoryItemId,
      movementType: 'RECEIPT',
      qtyDelta: quantity,
      qtyBefore,
      qtyAfter,
      sourceType: 'PMO_RECEIPT',
      sourceId: requestId,
      sourceLineId: requestId,
      referenceNo: String(receipt.reference || ''),
      reason: String(receipt.note || 'PMO warehouse receipt'),
      postedBy: input.actor,
      requestedByUid: receipt.requestedBy?.uid || input.actor.uid,
      createdAt: now,
    })
    transaction.update(receiptRef, {
      status: 'APPROVED',
      ledgerId: ledgerRef.id,
      decidedBy: input.actor,
      decidedAt: approvedAt,
    })
    const notice: PostedReceiptEmailInput = {
      itemName: String(receipt.itemName || ''),
      sku: String(receipt.sku || ''),
      uom: String(receipt.uom || ''),
      quantity,
      reference: String(receipt.reference || ''),
      note: String(receipt.note || ''),
      submittedBy: String(receipt.requestedBy?.name || ''),
      pmoApprovedBy: String(receipt.pmoDecidedBy?.name || ''),
      approvedBy: input.actor.name,
      approvedAt,
      qtyBefore,
      qtyAfter,
    }
    return { id: requestId, status: 'APPROVED' as const, ledgerId: ledgerRef.id, idempotent: false, qtyBefore, qtyAfter, qtyDelta: quantity, notice }
  })
  if (result.status === 'APPROVED' && result.idempotent === false && 'notice' in result && result.notice) {
    const emailed = await deliverPostedReceiptEmail(result.notice)
    const { notice: _postedNotice, ...posted } = result
    return { ...posted, emailed }
  }
  return result
}
