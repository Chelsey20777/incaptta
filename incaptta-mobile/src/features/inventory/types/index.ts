import type { FirestoreDocument, ApprovalStatus } from '@/types'

export interface InventoryItem extends FirestoreDocument {
  itemCode: string
  itemName: string
  description?: string
  category: string
  unit: string
  purchasePrice: number
  freightDuty: number
  totalCost: number
  sellingPrice: number
  twidMarkupPercent: number
  currentStock: number
  minimumStock: number
  location?: string
  supplier?: string
  isActive: boolean
  lastStockUpdate?: Date
}

export interface StockAdjustment extends FirestoreDocument {
  inventoryItemId: string
  adjustmentType: 'INCREASE' | 'DECREASE'
  quantity: number
  reason: string
  previousStock: number
  newStock: number
  approvalStatus?: ApprovalStatus
  approvedBy?: string
  approvedAt?: Date
}

export interface InventoryFormData {
  itemCode: string
  itemName: string
  description?: string
  category: string
  unit: string
  purchasePrice: number
  freightDuty: number
  sellingPrice: number
  twidMarkupPercent: number
  currentStock: number
  minimumStock: number
  location?: string
  supplier?: string
}
