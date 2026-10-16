import { Timestamp } from 'firebase/firestore'

export type UserRole = 'SUPER_ADMIN' | 'ADMIN' | 'STOREKEEPER' | 'ACCOUNTANT' | 'MANAGER' | 'SALES' | 'TECHNICAL'

export interface InventoryItem {
    id: string
    sku: string
    name: string
    uom: string
    onHand: number
    isActive: boolean
    categoryId?: string
    categoryName?: string
    description?: string
    purchasePrice: number
    freightDuty: number
    totalCost: number
    markupPercent: number
    sellingPrice: number
    location?: string
    notes?: string
    updatedAt?: Timestamp
    updatedBy?: { uid: string; email: string }
    createdAt?: Timestamp
    createdBy?: { uid: string; email: string }
    reorderLevel?: number
}

export type MovementType = 'ISSUE' | 'RETURN' | 'ADJUST'

export interface StockLedgerEntry {
    id: string
    inventoryItemId: string
    jobCardId?: string
    movementType: MovementType
    qty: number // negative for outflow, positive for inflow
    unitCost?: number
    totalCost?: number
    postedAt: Timestamp
    postedByUid: string
    reference?: string
}

export interface InventoryFilter {
    search?: string
    isActive?: boolean
    lowStockOnly?: boolean
    uom?: string
    sortBy?: 'name' | 'onHand' | 'updatedAt'
    sortOrder?: 'asc' | 'desc'
}
