/**
 * Shared requisition types used across procurement and job card features.
 * Consolidates duplicate RequisitionSection / RequisitionItem definitions
 * that were previously scattered across feature-specific type files.
 */

export interface RequisitionItem {
  id: string;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  totalPrice: number;
  notes?: string;
  /** Inventory item link if this requisition line maps to a stocked item */
  inventoryItemId?: string;
  inventoryItemName?: string;
}

export type RequisitionStatus =
  | 'DRAFT'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'REJECTED'
  | 'FULFILLED'
  | 'CANCELLED';

export type RequisitionPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export interface RequisitionSection {
  id: string;
  title: string;
  items: RequisitionItem[];
  sectionTotal: number;
  notes?: string;
}

export interface RequisitionBase {
  id: string;
  requisitionNumber?: string;
  jobCardId?: string;
  requestedBy: string;
  requestedByName?: string;
  department: string;
  status: RequisitionStatus;
  priority: RequisitionPriority;
  sections: RequisitionSection[];
  grandTotal: number;
  notes?: string;
  createdAt?: unknown; // Firestore Timestamp
  updatedAt?: unknown;
  approvedBy?: string;
  approvedAt?: unknown;
}

/** Utility helper to compute section total from items */
export function computeSectionTotal(items: RequisitionItem[]): number {
  return items.reduce((sum, item) => sum + (item.totalPrice || item.quantity * item.unitPrice), 0);
}

/** Utility helper to compute grand total from sections */
export function computeGrandTotal(sections: RequisitionSection[]): number {
  return sections.reduce((sum, section) => sum + section.sectionTotal, 0);
}