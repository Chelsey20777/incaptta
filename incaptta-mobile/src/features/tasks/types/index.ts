import type { FirestoreDocument, ApprovalStatus } from '@/types'

export interface Task extends FirestoreDocument {
  // Task workflow status
  status: 'TODO' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED'
  
  // Approval workflow properties (optional)
  approvalStatus?: ApprovalStatus
  submittedAt?: Date
  submittedBy?: string
  reviewedAt?: Date
  reviewedBy?: string
  approvedAt?: Date
  approvedBy?: string
  rejectionReason?: string
  
  title: string
  description: string
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'
  assignedTo: string
  assignedToName?: string
  dueDate?: Date
  completedAt?: Date
  department: string
  tags?: string[]
}

export interface TaskFormData {
  title: string
  description: string
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'
  assignedTo: string
  dueDate?: string
  department: string
  tags?: string[]
}
