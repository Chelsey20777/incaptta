export interface StaffRate {
  id: string
  employeeId: string
  jobRateAmount: number
  paymentMethod?: 'CASH' | 'ECOCASH' | 'BANK'
  approvalStatus?: 'PENDING' | 'APPROVED_ACCOUNTANT' | 'APPROVED_MANAGER' | 'REJECTED'
  isLockedAgainstPdf?: boolean
  isAdjustment?: boolean
  adjustmentDate?: any
  createdAt?: any
}
