export type FulfilmentAction = 'RESERVE' | 'DISPATCH' | 'RELEASE' | 'ACKNOWLEDGE'

const availableStock = (balance: { onHand: number; reserved: number }) =>
  Number(balance.onHand || 0) - Number(balance.reserved || 0)

export interface FulfilmentLine {
  id?: string
  inventoryItemId?: string
  itemName?: string
  qtyRequired?: number | string
  reservedQty?: number
  issuedQty?: number
  fulfilmentState?: string
  approvalStatus?: string
  postingState?: string
  inventoryDeducted?: boolean
}

export interface StockBalance {
  onHand: number
  reserved: number
  damagedQty?: number
}

const usableOnHand = (balance: StockBalance) =>
  Math.max(0, Number(balance.onHand || 0) - Number(balance.damagedQty || 0))

export function approvedQuantity(line: FulfilmentLine) {
  return Number(line.qtyRequired || 0)
}

export function outstandingReservation(line: FulfilmentLine) {
  return Math.max(0, Number(line.reservedQty || 0) - Number(line.issuedQty || 0))
}

export function remainingRequired(line: FulfilmentLine) {
  const approved = approvedQuantity(line)
  const issued = Number(line.issuedQty || 0)
  if (approved > 0) return Math.max(0, approved - issued)
  return outstandingReservation(line)
}

export function remainingToIssue(line: FulfilmentLine) {
  return Math.min(outstandingReservation(line), remainingRequired(line))
}

export interface FulfilmentSessionLine {
  lineId: string
  itemName: string
  quantity: number
  remaining: number
  damagedQty: number
}

export function fulfilmentLineId(line: FulfilmentLine) {
  return String(line.id || line.inventoryItemId || '')
}

export function planFulfilmentSession(
  lines: FulfilmentLine[],
  overrides?: Record<string, { quantity?: number; damagedQty?: number }>,
): FulfilmentSessionLine[] {
  const planned: FulfilmentSessionLine[] = []
  for (const line of lines || []) {
    const lineId = fulfilmentLineId(line)
    const remaining = remainingToIssue(line)
    if (!lineId || remaining <= 0) continue
    const override = overrides?.[lineId]
    const requested = override?.quantity == null ? remaining : Number(override.quantity)
    if (!(requested > 0) || !Number.isFinite(requested)) continue
    if (requested > remaining) {
      throw new Error(`Dispatch exceeds remaining required quantity. Remaining: ${remaining}, requested: ${requested}`)
    }
    planned.push({
      lineId,
      itemName: line.itemName || 'Inventory item',
      quantity: requested,
      remaining,
      damagedQty: Number(override?.damagedQty || 0),
    })
  }
  if (planned.length === 0) {
    throw new Error('No remaining reserved items to release in this session')
  }
  return planned
}

export function canReserve(line: FulfilmentLine) {
  return line.approvalStatus === 'APPROVED_ACCOUNTANT'
    && line.fulfilmentState !== 'RESERVED'
    && line.fulfilmentState !== 'ISSUED'
    && !line.inventoryDeducted
    && line.postingState !== 'POSTED'
}

export function applyReserve(balance: StockBalance, quantity: number) {
  if (!(quantity > 0)) throw new Error('Reserve quantity must be greater than zero')
  const available = usableOnHand(balance) - Number(balance.reserved || 0)
  if (quantity > available) {
    throw new Error(`Insufficient available stock. Available: ${available}, requested: ${quantity}`)
  }
  return {
    onHand: balance.onHand,
    reserved: balance.reserved + quantity,
    available: available - quantity,
  }
}

export function applyDispatch(balance: StockBalance, line: FulfilmentLine, quantity: number) {
  if (!(quantity > 0)) throw new Error('Dispatch quantity must be greater than zero')
  if (line.fulfilmentState === 'ISSUED') {
    throw new Error('This line has already been issued and cannot be released again')
  }
  const approved = approvedQuantity(line)
  const issued = Number(line.issuedQty || 0)
  if (approved > 0 && issued >= approved) {
    throw new Error('Required quantity has already been released')
  }
  const remaining = remainingRequired(line)
  if (quantity > remaining) {
    throw new Error(`Dispatch exceeds remaining required quantity. Remaining: ${remaining}, requested: ${quantity}`)
  }
  const reservedLeft = outstandingReservation(line)
  if (quantity > reservedLeft) {
    throw new Error(`Dispatch exceeds reservation. Reserved: ${reservedLeft}, requested: ${quantity}`)
  }
  if (quantity > usableOnHand(balance)) {
    throw new Error(`Insufficient usable stock. On hand: ${balance.onHand}, damaged: ${balance.damagedQty || 0}, requested: ${quantity}`)
  }
  return {
    onHand: balance.onHand - quantity,
    reserved: balance.reserved - quantity,
    available: availableStock(balance) - 0,
  }
}

export function applyRelease(balance: StockBalance, line: FulfilmentLine) {
  const remaining = outstandingReservation(line)
  return {
    onHand: balance.onHand,
    reserved: Math.max(0, balance.reserved - remaining),
    released: remaining,
    available: availableStock(balance) + remaining,
  }
}

export function nextFulfilmentState(line: FulfilmentLine, issuedQty: number) {
  const approved = approvedQuantity(line)
  if (issuedQty <= 0) return outstandingReservation({ ...line, issuedQty }) > 0 ? 'RESERVED' : 'RELEASED'
  return issuedQty >= approved ? 'ISSUED' : 'PARTIAL'
}

export function fulfilmentQueueItem(job: {
  id: string
  generalInfo?: { jobNumber?: string; recipientName?: string; projectLocation?: string }
  status?: string
}, line: FulfilmentLine & {
  reservedAt?: string
  acknowledgedAt?: string
  acknowledgedBy?: { uid?: string; name?: string } | string
  lastDispatchId?: string
  lastSessionId?: string
  acknowledgementPdfGeneratedAt?: string | null
  damagedQty?: number
}, extras?: {
  expired?: boolean
  damagedQty?: number
}) {
  const acknowledgedBy = typeof line.acknowledgedBy === 'string'
    ? line.acknowledgedBy
    : line.acknowledgedBy?.name || null
  return {
    jobCardId: job.id,
    jobNumber: String(job.generalInfo?.jobNumber || '').trim(),
    destination: job.generalInfo?.projectLocation || '',
    recipient: job.generalInfo?.recipientName || '',
    jobStatus: job.status || '',
    lineId: line.id || '',
    itemName: line.itemName || 'Inventory item',
    inventoryItemId: line.inventoryItemId || '',
    approvedQty: approvedQuantity(line),
    reservedQty: Number(line.reservedQty || 0),
    issuedQty: Number(line.issuedQty || 0),
    outstandingQty: outstandingReservation(line),
    remainingQty: remainingToIssue(line),
    fulfilmentState: line.fulfilmentState || 'RESERVED',
    reservedAt: line.reservedAt || null,
    acknowledgedAt: line.acknowledgedAt || null,
    acknowledgedBy,
    lastDispatchId: line.lastDispatchId || null,
    lastSessionId: line.lastSessionId || line.lastDispatchId || null,
    acknowledgementPdfGeneratedAt: line.acknowledgementPdfGeneratedAt || null,
    expired: Boolean(extras?.expired),
    damagedQty: Number(extras?.damagedQty ?? line.damagedQty ?? 0),
  }
}
