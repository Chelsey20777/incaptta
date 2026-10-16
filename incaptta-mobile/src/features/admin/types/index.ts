import type { FirestoreDocument } from '@/types'

export interface BomTemplate extends FirestoreDocument {
  templateNumber: string
  name: string
  category: string
  description?: string
  items: BomItem[]
  totalCost: number
  isActive: boolean
}

export interface BomItem {
  description: string
  quantity: number
  unit: string
  unitCost: number
  totalCost: number
}
