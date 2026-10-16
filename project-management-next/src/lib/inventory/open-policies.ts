export interface StorePolicies {
  actingStorekeeperUid?: string
  reservationExpiryHours?: number
  allowNegativeStock?: boolean
  adjustmentApproverRole?: 'ADMIN' | 'MANAGER'
}

export const DEFAULT_STORE_POLICIES: Required<Omit<StorePolicies, 'actingStorekeeperUid'>> = {
  reservationExpiryHours: 72,
  allowNegativeStock: false,
  adjustmentApproverRole: 'ADMIN',
}

export function reservationExpired(reservedAt?: string, now = Date.now(), expiryHours = DEFAULT_STORE_POLICIES.reservationExpiryHours) {
  if (!reservedAt) return false
  return now - Date.parse(reservedAt) > expiryHours * 60 * 60 * 1000
}

export function usableOnHand(input: { onHand?: number; damagedQty?: number }) {
  return Math.max(0, Number(input.onHand || 0) - Number(input.damagedQty || 0))
}

export function convertQuantity(qty: number, fromUnit: string, toUnit: string, conversions: Record<string, number> = {}) {
  if (!fromUnit || !toUnit || fromUnit.toLowerCase() === toUnit.toLowerCase()) return qty
  const key = `${fromUnit.toLowerCase()}->${toUnit.toLowerCase()}`
  const factor = conversions[key]
  if (!Number.isFinite(factor)) throw new Error(`No unit conversion from ${fromUnit} to ${toUnit}`)
  return qty * factor
}

export function canSelfApproveAdjustment(requesterUid: string, approverUid: string) {
  return requesterUid !== approverUid
}

export function costStatus(input: {
  budget?: number
  committed?: number
  actual?: number
  paid?: number
}) {
  return {
    budget: Number(input.budget || 0),
    committed: Number(input.committed || 0),
    actual: Number(input.actual || 0),
    paid: Number(input.paid || 0),
    remainingBudget: Number(input.budget || 0) - Number(input.actual || 0),
    unpaid: Number(input.actual || 0) - Number(input.paid || 0),
  }
}
