import type { FirestoreDocument, ApprovalStatus } from '@/types'

export interface ContainerAccessAuthorization extends FirestoreDocument {
  caaNumber: string
  requestedBy: string
  requestedByName: string
  department: string
  containerId: string
  containerLocation: string
  date: Date
  startTime: string
  endTime: string
  purpose: string
  approvalStatus?: ApprovalStatus
  submittedAt?: Date
  submittedBy?: string
  reviewedAt?: Date
  reviewedBy?: string
  approvedAt?: Date
  approvedBy?: string
  rejectionReason?: string
  status: 'DRAFT' | 'SUBMITTED' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'COMPLETED' | 'CANCELLED'
}
