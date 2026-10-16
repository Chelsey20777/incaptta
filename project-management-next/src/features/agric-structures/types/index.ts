export interface AgricRates {
  brickUnitCost: number
  cementUnitCost: number
  includeLabour: boolean
  includeTransport: boolean
  lastUpdatedAt?: any
  updatedAt?: any
}

export type FormulaVariable = 'area' | 'perimeter' | 'wallArea' | 'scale' | 'bays'

export interface TemplateItem {
  id: string
  description: string
  unit: string
  category: 'material' | 'labour' | 'transport'
  multiplier: number
  variable: FormulaVariable
  baseUnitPrice?: number
}

export interface StructureSize {
  label: string
  length: number
  width: number
}

export interface BOQLineItem {
  id: string
  description: string
  unit: string
  qty: number
  unitPrice: number
  total: number
  category: 'material' | 'labour' | 'transport'
}

export interface FowlrunCalculation {
  size: StructureSize
  area: number
  perimeter: number
  wallArea: number
  scale: number
  bays: number
  birdCapacityMin: number
  birdCapacityMax: number
  items: BOQLineItem[]
  materialsTotal: number
  labourTotal: number
  transportTotal: number
  grandTotal: number
}

export interface AgricJobCard {
  id: string
  status: 'DRAFT' | 'APPROVED' | 'PAID' | 'COMPLETED' | 'CANCELLED'
  jobNumber: string
  clientName: string
  siteLocation: string
  totalAmount: number
  paidAmount: number
  balance: number
  generalInfo: {
    jobTitle: string
    projectLocation: string
    jobNumber: string
    totalAmount: number
    recipientName: string
    dimensionsOfStructure: string
    currency: string
  }
  fowlrunMeta: {
    size: { label: string; length: number; width: number }
    area: number
    perimeter: number
    wallArea: number
    scale: number
    bays: number
    birdCapacityMin: number
    birdCapacityMax: number
    materialsTotal: number
    labourTotal: number
    transportTotal: number
    linkedCalculationId?: string | null
  }
  requisitionItems: RequisitionItem[]
  requisitionSections: RequisitionSection[]
  linkedSystemJobCardId?: string
  linkedSystemJobCardNumber?: string
  createdBy: { uid: string; email: string; name: string }
  createdAt: any
  updatedAt: any
}

export interface RequisitionSection {
  id: string
  description: string
  qty: number
  items: RequisitionItem[]
}

export interface RequisitionItem {
  id: string
  description: string
  itemName: string
  qty: number
  uom: string
  irdSellingPrice: number
  rowGrandTot: number
  category: 'material' | 'labour' | 'transport'
}

export interface AgricInventoryItem {
  id: string
  sku: string
  name: string
  onHand: number
  uom: string
  purchasePrice: number
  freightDuty: number
  totalCost: number
  markupPercent: number
  sellingPrice: number
  categoryId: string
  categoryName: string
  location: string
  notes: string
  createdAt?: any
  updatedAt?: any
}

export interface AgricPayment {
  id: string
  jobCardId: string
  jobCardNumber: string
  clientName: string
  amount: number
  paymentMethod: 'CASH' | 'BANK' | 'ECOCASH'
  description: string
  source: 'agric-structure'
  createdAt: any
}

export interface AgricStockMovement {
  id: string
  inventoryItemId: string
  movementType: 'ADJUST'
  qty: number
  reason: string
  reference: string
  unitCost: number
  totalCost: number
  postedAt: any
  postedByUid: string
}