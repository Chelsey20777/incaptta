export const DEFAULT_STOCK_LOCATION_ID = 'default'
export const DEFAULT_STOCK_LOCATION_NAME = 'Main store'

export interface StockLocationBalance {
  locationId: string
  onHand: number
  reserved: number
}

export function availableStock(balance: Pick<StockLocationBalance, 'onHand' | 'reserved'>) {
  return Number(balance.onHand || 0) - Number(balance.reserved || 0)
}

export function openingSnapshotForDefaultLocation(onHand: number) {
  return {
    locationId: DEFAULT_STOCK_LOCATION_ID,
    locationName: DEFAULT_STOCK_LOCATION_NAME,
    onHand: Number(onHand) || 0,
    reserved: 0,
    available: Number(onHand) || 0,
    provenance: 'opening-snapshot',
  }
}
