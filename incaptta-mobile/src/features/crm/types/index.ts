import type { FirestoreDocument } from '@/types'

export interface Customer extends FirestoreDocument {
  customerNumber: string
  name: string
  company?: string
  email?: string
  phone?: string
  address?: string
  city?: string
  country?: string
  creditLimit?: number
  currentBalance?: number
  status: 'ACTIVE' | 'INACTIVE' | 'BLACKLISTED'
  notes?: string
}

export interface Quotation extends FirestoreDocument {
  quotationNumber: string
  customerId: string
  customerName: string
  date: Date
  validUntil: Date
  items: QuotationItem[]
  subtotal: number
  tax: number
  total: number
  status: 'DRAFT' | 'SENT' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED'
  notes?: string
}

export interface Invoice extends FirestoreDocument {
  invoiceNumber: string
  customerId: string
  customerName: string
  quotationId?: string
  date: Date
  dueDate: Date
  items: InvoiceItem[]
  subtotal: number
  tax: number
  total: number
  paidAmount: number
  status: 'DRAFT' | 'SENT' | 'PAID' | 'OVERDUE' | 'CANCELLED'
  notes?: string
}

export interface QuotationItem {
  description: string
  quantity: number
  unitPrice: number
  total: number
}

export interface InvoiceItem {
  description: string
  quantity: number
  unitPrice: number
  total: number
}
