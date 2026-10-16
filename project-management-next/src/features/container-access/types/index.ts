import type { Timestamp } from 'firebase/firestore'

export type CAAStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED'

export type CAALogAction =
  | 'REQUEST_SUBMITTED'
  | 'APPROVED'
  | 'REJECTED'
  | 'CANCELLED'
  | 'CONTAINER_ACCESSED'

export interface JobCardRef {
  id: string
  jobNumber: string
  clientName: string
  location: string
}

export interface ContainerAccessRequest {
  id: string
  requestNumber: string           // CAA-YYYY-NNNN
  jobCardRef?: JobCardRef
  containerName: string
  containerLocation: string
  purposeOfAccess: string
  accessDate: string              // yyyy-MM-dd
  accessTimeFrom: string          // HH:mm
  accessTimeTo: string            // HH:mm

  requestedByUid: string
  requestedByName: string
  requestedByRole: string
  requestedByEmail: string
  requestedAt: Timestamp

  status: CAAStatus

  // Approval
  approvedByUid?: string
  approvedByName?: string
  approvedAt?: Timestamp
  approvalNotes?: string

  // Rejection
  rejectedByUid?: string
  rejectedByName?: string
  rejectedAt?: Timestamp
  rejectionReason?: string

  // Cancellation
  cancelledByUid?: string
  cancelledAt?: Timestamp

  pdfGenerated: boolean
  verificationToken?: string

  createdAt: Timestamp
  updatedAt: Timestamp
}

export interface ContainerAccessLog {
  id: string
  requestId: string
  requestNumber: string
  containerName: string
  loggedByUid: string
  loggedByName: string
  loggedByRole: string
  loggedAt: Timestamp
  action: CAALogAction
  notes?: string
  createdAt: Timestamp
}