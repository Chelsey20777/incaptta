import type { Timestamp } from 'firebase/firestore'

export type LeadStatus = 'new' | 'contacted' | 'quoted' | 'won' | 'lost'

export interface BOQItem {
  unit: string
  qty: number
  description: string
  unitPrice: number
  total: number
  category: 'material' | 'labour' | 'transport'
}

export interface Lead {
  id: string
  fullName: string
  phone: string
  email: string | null
  farmLocation: string
  structureSize: string
  structureArea: number
  estimatedMaterialCost: number
  boqSnapshot: BOQItem[]
  additionalNotes: string | null
  referralSource: string
  status: LeadStatus
  assignedTo: string | null
  internalNotes: string | null
  createdAt: Timestamp
  updatedAt: Timestamp | null
  source: string
}

export interface LeadStatusConfig {
  label: string
  color: string
  bgColor: string
}

export const LEAD_STATUS_CONFIG: Record<LeadStatus, LeadStatusConfig> = {
  new:       { label: 'New',       color: '#1B5E20', bgColor: '#EAF3DE' },
  contacted: { label: 'Contacted', color: '#854F0B', bgColor: '#FAEEDA' },
  quoted:    { label: 'Quoted',    color: '#185FA5', bgColor: '#E6F1FB' },
  won:       { label: 'Won',       color: '#0F6E56', bgColor: '#E1F5EE' },
  lost:      { label: 'Lost',      color: '#6B7280', bgColor: '#F1EFE8' },
}

export interface LeadStats {
  total: number
  byStatus: Record<LeadStatus, number>
  totalEstimatedValue: number
  conversionRate: number
}

export interface LeadFilters {
  status?: LeadStatus | 'all'
  dateFrom?: Date
  dateTo?: Date
  search?: string
}
