export interface StructureSize {
  label: string
  length: number
  width: number
}

export interface BOQLineItem {
  unit: string
  qty: number
  description: string
  unitPrice: number
  total: number
  category: 'material' | 'labour' | 'transport'
}

export interface FowlrunCalculation {
  size: StructureSize
  area: number
  perimeter: number
  bays: number
  birdCapacityMin: number
  birdCapacityMax: number
  items: BOQLineItem[]
  materialsTotal: number
  labourTotal: number
  transportTotal: number
  grandTotal: number
}

export interface CalculatorConfig {
  brickUnitCost: number
  cementUnitCost: number
  includeLabour: boolean
  includeTransport: boolean
}

export const PRESET_SIZES: StructureSize[] = [
  { label: '126x14m', length: 126, width: 14 },
  { label: '126x12m', length: 126, width: 12 },
  { label: '100x12m', length: 100, width: 12 },
  { label: '100x10m', length: 100, width: 10 },
  { label: '80x10m',  length: 80,  width: 10 },
  { label: '60x10m',  length: 60,  width: 10 },
  { label: '50x10m',  length: 50,  width: 10 },
  { label: '40x10m',  length: 40,  width: 10 },
  { label: '30x10m',  length: 30,  width: 10 },
  { label: '25x10m',  length: 25,  width: 10 },
  { label: '20x10m',  length: 20,  width: 10 },
  { label: '10x10m',  length: 10,  width: 10 },
]
