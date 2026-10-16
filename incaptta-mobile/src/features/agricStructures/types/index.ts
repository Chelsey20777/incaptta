export interface FowlrunCalculation {
  birds: number
  size: 'SMALL' | 'MEDIUM' | 'LARGE'
  dimensions: {
    length: number
    width: number
    height: number
  }
  materials: MaterialItem[]
  laborCost: number
  materialCost: number
  totalCost: number
  sellingPrice: number
  profitMargin: number
}

export interface MaterialItem {
  description: string
  quantity: number
  unit: string
  unitCost: number
  totalCost: number
}

export interface SizePreset {
  size: string
  label: string
  birds: number
  length: number
  width: number
  height: number
}
