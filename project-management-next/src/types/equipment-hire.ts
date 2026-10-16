export interface EquipmentAsset {
  id: string
  name: string
  serialNumber: string
  category: 'Tractor' | 'Harvester' | 'Implement' | 'Other'
  currentEngineHours: number
  currentOdometer: number
  compatibilityTags: string[]
  status: 'Available' | 'On_Hire' | 'Maintenance' | 'Standby'
}

export interface HireContract {
  id: string
  customerId: string
  customerName: string
  assetId: string
  assetName: string
  status: 'Draft' | 'Active' | 'Pending_Return' | 'Closed'
  startDate: string
  endDate: string
  hireType: 'WET' | 'DRY'
  baseDailyRate: number
  includedDailyHours: number
  excessHourRate: number
  standbyRatePercentage: number
  standbyDays: string[]
  createdAt?: any
  updatedAt?: any
}

export interface InspectionLog {
  id: string
  contractId: string
  type: 'PRE_HIRE' | 'POST_HIRE'
  engineHoursRecorded: number
  fuelLevelPercentage: number
  biosecurityWashdownCertified: boolean
  damageNotes: string
  signedOffByUserId: string
  signedOffByUserName: string
  createdAt?: any
}

export interface InvoiceBreakdown {
  totalDays: number
  standbyDaysCount: number
  billableDaysCount: number
  baseTimeCost: number
  allowedHours: number
  actualHours: number
  excessHours: number
  excessCost: number
  totalInvoiceCost: number
}
