import type { FirestoreDocument } from '@/types'

export interface Employee extends FirestoreDocument {
  employeeNumber: string
  fullName: string
  firstName?: string
  lastName?: string
  nationalId?: string
  email?: string
  phone?: string
  department: string
  jobTitle: string
  position?: string
  contractType?: 'Full-Time' | 'Part-Time' | 'Contract'
  employmentType?: 'FULL_TIME' | 'PART_TIME' | 'CONTRACT'
  contractStartDate?: Date
  contractEndDate?: Date
  hireDate?: Date
  salary: number
  basicSalary?: number
  status: 'Active' | 'On Leave' | 'Probation' | 'Terminated' | 'ACTIVE' | 'INACTIVE'
  address?: string
  emergencyContact?: string
  emergencyPhone?: string
}

export interface Attendance extends FirestoreDocument {
  employeeId: string
  employeeName: string
  date: Date
  clockInTime?: Date
  clockOutTime?: Date
  hoursWorked?: number
  location?: string
  notes?: string
  status?: 'IN' | 'OUT'
}

export interface Payslip extends FirestoreDocument {
  payslipNumber: string
  employeeId: string
  employeeName: string
  payPeriodStart: Date
  payPeriodEnd: Date
  period?: string
  basicSalary: number
  commission?: number
  overtimePay?: number
  bonuses?: number
  allowances?: number
  grossPay?: number
  tax?: number
  socialSecurity?: number
  pension?: number
  otherDeductions?: number
  totalDeductions?: number
  deductions?: number
  netPay: number
  status: 'DRAFT' | 'PROCESSED' | 'PAID'
  generatedAt?: Date
}
