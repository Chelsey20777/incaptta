export type InventoryMovementType = 'ISSUE' | 'RETURN'

export interface InventoryPostingActor {
  uid: string
  name: string
}

export interface InventoryLineRecord {
  [key: string]: unknown
  id?: string
  itemName?: string
  description?: string
  approvalStatus?: string
  inventoryItemId?: string
  sourceLineId?: string
  issuedLineId?: string
  requisitionItemId?: string
  qtyReturned?: number | string
  qtyRequired?: number | string
  quantity?: number | string
  qty?: number | string
  uom?: string
  postingState?: string
  inventoryDeducted?: boolean
  inventoryReturned?: boolean
}

export interface InventorySectionRecord {
  [key: string]: unknown
  items?: InventoryLineRecord[]
}

export interface InventoryJobCardRecord {
  requisitionSections?: InventorySectionRecord[]
  requisitionItems?: InventoryLineRecord[]
  inventoryReturns?: InventoryLineRecord[]
  generalInfo?: { jobNumber?: string }
}

export interface StockLedgerRecord {
  inventoryItemId?: string
  movementType?: InventoryMovementType | string
  qtyDelta?: number
  qtyBefore?: number
  qtyAfter?: number
  sourceType?: string
  sourceId?: string
  sourceLineId?: string
}

export interface InventoryPostingActorInput {
  jobCardId: string
  lineId: string
  movementType: InventoryMovementType
  actor: InventoryPostingActor
}

export interface InventoryBalance {
  onHand?: number
  inStock?: number
  uom?: string
}

export interface InventoryPostingTransaction {
  getJob(jobCardId: string): Promise<InventoryJobCardRecord | null>
  getLedger(ledgerId: string): Promise<StockLedgerRecord | null>
  getInventory(itemId: string): Promise<InventoryBalance | null>
  updateInventory(itemId: string, onHand: number): void
  createLedger(ledgerId: string, record: Record<string, unknown>): void
  updateJob(jobCardId: string, data: Record<string, unknown>): void
}

export interface InventoryPostingResult {
  ledgerId: string
  postingState: 'POSTED'
  idempotent: boolean
}

export const cloneJobRows = (job: InventoryJobCardRecord) => ({
  sections: (job.requisitionSections || []).map(section => ({
    ...section,
    items: (section.items || []).map(item => ({ ...item })),
  })),
  flat: (job.requisitionItems || []).map(item => ({ ...item })),
  returns: (job.inventoryReturns || []).map(item => ({ ...item })),
})

export function inventoryLineMatches(item: InventoryLineRecord | undefined, lineId: string) {
  if (!item || !lineId) return false
  return item.id === lineId || (!item.id && item.inventoryItemId === lineId)
}

export const updateMatchingLine = (
  rows: ReturnType<typeof cloneJobRows>,
  lineId: string,
  patch: (item: InventoryLineRecord) => InventoryLineRecord
) => ({
  requisitionSections: rows.sections.map(section => ({
    ...section,
    items: section.items.map(item => inventoryLineMatches(item, lineId) ? patch(item) : item),
  })),
  requisitionItems: rows.flat.map(item => inventoryLineMatches(item, lineId) ? patch(item) : item),
  inventoryReturns: rows.returns.map(item => inventoryLineMatches(item, lineId) ? patch(item) : item),
})

export function inventoryLedgerId(
  movementType: InventoryMovementType,
  jobCardId: string,
  lineId: string
) {
  const sourceType = movementType === 'ISSUE' ? 'JOB_CARD_ISSUE' : 'JOB_CARD_RETURN'
  return `${sourceType}_${jobCardId}_${lineId}`.replace(/[^A-Za-z0-9_-]/g, '_')
}

export function listInventoryLines(
  job: InventoryJobCardRecord,
  movementType: InventoryMovementType
): InventoryLineRecord[] {
  if (movementType === 'RETURN') return job.inventoryReturns || []
  const fromSections = (job.requisitionSections || []).flatMap(section => section.items || [])
  if (fromSections.length === 0) return job.requisitionItems || []
  const seen = new Set(fromSections.map(item => item.id).filter(Boolean))
  const extras = (job.requisitionItems || []).filter(item => item.id && !seen.has(item.id))
  return extras.length ? [...fromSections, ...extras] : fromSections
}

export function isEligibleForManagerStockPost(row: InventoryLineRecord) {
  return row.approvalStatus === 'APPROVED_ACCOUNTANT'
}

export function lineQuantity(line: InventoryLineRecord, movementType: InventoryMovementType) {
  return movementType === 'RETURN'
    ? line.qtyReturned
    : (line.qtyRequired ?? line.quantity ?? line.qty)
}

export function requirePositiveQuantity(value: unknown, label = 'Inventory quantity') {
  const quantity = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error(`${label} must be a finite quantity greater than zero`)
  }
  return quantity
}

const quantitiesMatch = (left: number, right: number) => Math.abs(left - right) < 1e-9

const sourceIssueLineId = (line: InventoryLineRecord) =>
  String(line.sourceLineId || line.issuedLineId || line.requisitionItemId || '')

const isPostedIssue = (line: InventoryLineRecord) =>
  line.postingState === 'POSTED' || line.inventoryDeducted === true || line.approvalStatus === 'APPROVED_MANAGER'

const isPostedReturn = (line: InventoryLineRecord) =>
  line.postingState === 'POSTED' || line.inventoryReturned === true || line.approvalStatus === 'APPROVED_MANAGER'

function issuedQuantityForReturn(job: InventoryJobCardRecord, line: InventoryLineRecord) {
  const issueLines = [
    ...(job.requisitionSections || []).flatMap(section => section.items || []),
    ...(job.requisitionItems || []),
  ]
  const linkedIssueId = sourceIssueLineId(line)
  const matching = linkedIssueId
    ? issueLines.filter(item => item.id === linkedIssueId)
    : issueLines.filter(item => item.inventoryItemId && item.inventoryItemId === line.inventoryItemId)
  return matching
    .filter(isPostedIssue)
    .reduce((sum, item) => {
      const qty = Number(item.qtyRequired ?? item.quantity ?? item.qty)
      return Number.isFinite(qty) && qty > 0 ? sum + qty : sum
    }, 0)
}

function priorReturnedQuantity(job: InventoryJobCardRecord, line: InventoryLineRecord, currentLineId: string) {
  const linkedIssueId = sourceIssueLineId(line)
  return (job.inventoryReturns || [])
    .filter(item => item.id && item.id !== currentLineId)
    .filter(item => linkedIssueId
      ? sourceIssueLineId(item) === linkedIssueId
      : item.inventoryItemId === line.inventoryItemId)
    .filter(isPostedReturn)
    .reduce((sum, item) => {
      const qty = Number(item.qtyReturned)
      return Number.isFinite(qty) && qty > 0 ? sum + qty : sum
    }, 0)
}

function assertLedgerMatchesLine(
  ledger: StockLedgerRecord,
  line: InventoryLineRecord,
  movementType: InventoryMovementType,
  quantity: number
) {
  const expectedDelta = movementType === 'ISSUE' ? -quantity : quantity
  const ledgerItemId = String(ledger.inventoryItemId || '')
  const lineItemId = String(line.inventoryItemId || '')
  if (
    ledgerItemId !== lineItemId
    || ledger.movementType !== movementType
    || !quantitiesMatch(Number(ledger.qtyDelta), expectedDelta)
  ) {
    throw new Error('Conflicting reuse of movement ID. Posted item or quantity does not match the existing ledger entry.')
  }
}

function assertUnitsCompatible(line: InventoryLineRecord, inventory: InventoryBalance) {
  const lineUnit = String(line.uom || '').trim().toLowerCase()
  const stockUnit = String(inventory.uom || '').trim().toLowerCase()
  if (lineUnit && stockUnit && lineUnit !== stockUnit) {
    throw new Error(`Inventory unit mismatch. Line uses ${line.uom}, stock uses ${inventory.uom}`)
  }
}

export async function postJobInventoryLineInTransaction(
  transaction: InventoryPostingTransaction,
  { jobCardId, lineId, movementType, actor }: InventoryPostingActorInput
): Promise<InventoryPostingResult> {
  const sourceType = movementType === 'ISSUE' ? 'JOB_CARD_ISSUE' : 'JOB_CARD_RETURN'
  const ledgerId = inventoryLedgerId(movementType, jobCardId, lineId)

  const [job, existingLedger] = await Promise.all([
    transaction.getJob(jobCardId),
    transaction.getLedger(ledgerId),
  ])
  if (!job) throw new Error('Job Card not found')

  const rows = cloneJobRows(job)
  const candidates = movementType === 'RETURN'
    ? rows.returns
    : [...rows.sections.flatMap(section => section.items), ...rows.flat]
  const line = candidates.find(item => inventoryLineMatches(item, lineId))
  if (!line) throw new Error('Inventory line not found')
  if (!line.inventoryItemId) throw new Error('Inventory line is not linked to stock')

  const quantity = requirePositiveQuantity(lineQuantity(line, movementType))

  if (existingLedger) {
    assertLedgerMatchesLine(existingLedger, line, movementType, quantity)
    const approvedAt = new Date().toISOString()
    transaction.updateJob(jobCardId, {
      ...updateMatchingLine(rows, lineId, item => ({
        ...item,
        approvalStatus: 'APPROVED_MANAGER',
        approvedAt,
        approvedBy: actor.name,
        postingState: 'POSTED',
        postingLedgerId: ledgerId,
        postingError: null,
        ...(movementType === 'ISSUE' ? { inventoryDeducted: true } : { inventoryReturned: true }),
      })),
    })
    return { ledgerId, postingState: 'POSTED', idempotent: true }
  }

  if (line.approvalStatus !== 'APPROVED_ACCOUNTANT') {
    throw new Error('Accountant approval is required before manager stock posting')
  }

  if (movementType === 'RETURN') {
    const issued = issuedQuantityForReturn(job, line)
    const alreadyReturned = priorReturnedQuantity(job, line, lineId)
    const outstanding = issued - alreadyReturned
    if (quantity > outstanding) {
      throw new Error(
        issued <= 0
          ? 'Return exceeds issued quantity. No posted issue exists for this item.'
          : `Return exceeds issued quantity. Returnable: ${outstanding}, requested: ${quantity}`
      )
    }
  }

  const inventory = await transaction.getInventory(line.inventoryItemId)
  if (!inventory) throw new Error('Inventory item not found')
  assertUnitsCompatible(line, inventory)

  const qtyBefore = Number(inventory.onHand ?? inventory.inStock ?? 0)
  if (!Number.isFinite(qtyBefore)) throw new Error('Inventory on-hand balance is invalid')
  const qtyDelta = movementType === 'ISSUE' ? -quantity : quantity
  const qtyAfter = qtyBefore + qtyDelta
  if (qtyAfter < 0) {
    throw new Error(`Insufficient stock. Available: ${qtyBefore}, requested: ${quantity}`)
  }

  const approvedAt = new Date().toISOString()
  transaction.updateInventory(line.inventoryItemId, qtyAfter)
  transaction.createLedger(ledgerId, {
    inventoryItemId: line.inventoryItemId,
    movementType,
    qtyDelta,
    qtyBefore,
    qtyAfter,
    sourceType,
    sourceId: jobCardId,
    sourceLineId: lineId,
    referenceNo: job.generalInfo?.jobNumber || jobCardId,
    reason: movementType === 'ISSUE'
      ? 'Manager-approved job-card issue'
      : 'Manager-approved job-card return',
    postedBy: actor,
  })
  transaction.updateJob(jobCardId, {
    ...updateMatchingLine(rows, lineId, item => ({
      ...item,
      approvalStatus: 'APPROVED_MANAGER',
      approvedAt,
      approvedBy: actor.name,
      postingState: 'POSTED',
      postingLedgerId: ledgerId,
      postingError: null,
      ...(movementType === 'ISSUE' ? { inventoryDeducted: true } : { inventoryReturned: true }),
    })),
  })

  return { ledgerId, postingState: 'POSTED', idempotent: false }
}
