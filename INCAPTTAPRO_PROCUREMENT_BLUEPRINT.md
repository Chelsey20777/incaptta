# IncapttaPro — Procurement Module Blueprint
**Version:** 1.0  
**Date:** March 2026  
**Project:** IncapttaPro (Incaptta Client)  
**Author:** Techcess Technology  
**Status:** Ready for Development

---

## Table of Contents

1. [Overview](#overview)
2. [Tech Stack](#tech-stack)
3. [Business Context](#business-context)
4. [System Architecture](#system-architecture)
5. [Procurement Types](#procurement-types)
6. [Pricing & Markup Model](#pricing--markup-model)
7. [Core Procurement Workflow](#core-procurement-workflow)
8. [Firestore Collections](#firestore-collections)
9. [Feature Specifications](#feature-specifications)
10. [Job Card Integration](#job-card-integration)
11. [Missing Inventory Item Handling (Path B)](#missing-inventory-item-handling-path-b)
12. [Payment Accounts](#payment-accounts)
13. [Roles & Access Control](#roles--access-control)
14. [Phase Build Plan](#phase-build-plan)
15. [Development Prompts Index](#development-prompts-index)

---

## Overview

The Procurement Module is a new core module for IncapttaPro that manages the full lifecycle of purchasing — from raising a Purchase Requisition (PR) through to supplier payment. It sits **upstream of inventory**, feeding stock replenishment, project material costing, asset acquisition, and service procurement.

### What This Module Solves

- No formal purchase approval workflow currently exists
- Stock replenishment is manual with no paper trail back to a supplier PO
- Job cards have no visibility into whether needed items are on order
- No markup capture on project materials procured per job
- No supplier master or payment terms tracking

---

## Tech Stack

| Layer | Technology | Version |
|---|---|---|
| Framework | Vue.js | 3.5.25 |
| Language | TypeScript | 5.9.3 |
| Build Tool | Vite | 7.3.1 |
| State Management | Pinia | 3.0.4 |
| Routing | Vue Router | 5.0.2 |
| UI Components | shadcn-vue | 2.4.3 |
| Styling | Tailwind CSS | 4.2.0 |
| Icons | Lucide Vue | 0.574.0 |
| Forms | vee-validate | 4.15.1 |
| Tables | @tanstack/vue-table | 8.21.3 |
| PDF | jsPDF + jspdf-autotable | 4.2.0 / 5.0.7 |
| Toasts | vue-sonner | 2.0.9 |
| Database | Firestore (direct SDK) | firebase 11.3.1 |
| Backend | Express.js on Firebase Functions | 5.2.1 |
| Auth | Firebase Auth + Custom Claims | — |

---

## Business Context

Incaptta operates across **4 procurement categories simultaneously**:

| Category | Example | Destination |
|---|---|---|
| **Project Materials** | Cement, steel, sheeting per job | Project cost ledger → job card |
| **Stock / Inventory** | Bulk goods for resale | Inventory (onHand++) |
| **Capital Assets (CAPEX)** | Machinery, equipment, vehicles | Asset register |
| **Services** | Subcontractors, transport, fuel contracts | OPEX expense |

Each category follows the same procurement **workflow** but posts to a different destination after GRN confirmation.

---

## System Architecture

### How Procurement Fits the Existing System

```
PROCUREMENT (new)
  Purchase Requisition (PR)
        ↓
  Purchase Order (PO)
        ↓
  Goods Receipt Note (GRN)
        ↓
  Invoice Matching (3-way: PR + PO + GRN)
        ↓
  Payment Authorization
        ↓
  ┌─────────────────────────────────────────┐
  │  Routing based on procurementType       │
  │                                         │
  │  PROJECT_MATERIAL → Job Card Costs      │
  │  INVENTORY        → inventoryItems++    │
  │  CAPEX            → Asset Register      │
  │  SERVICE          → OPEX Expense Log    │
  │  ADHOC            → Job Card Ad-hoc     │
  └─────────────────────────────────────────┘
        ↓
EXISTING MODULES (unchanged)
  inventoryItems (onHand updated via stockLedger ADD)
        ↓
  Job Cards (pull items, deduct stock on approval)
        ↓
  Approval Workflow → PDFs → Completion
```

### Direct SDK vs Express API

| Operation | Approach |
|---|---|
| Real-time PR/PO/GRN listeners | Firestore direct SDK (onSnapshot) |
| Supplier master CRUD | Firestore direct SDK |
| 3-way invoice matching logic | Express API (Firebase Functions) |
| Analytics / spend reports | Express API (Firebase Functions) |
| GRN → inventory auto-create | Express API (Firebase Functions) |

---

## Procurement Types

```typescript
type ProcurementType =
  | 'PROJECT_MATERIAL'  // site materials tied to a job card
  | 'INVENTORY'         // stock replenishment for resale
  | 'CAPEX'             // machinery, equipment, assets
  | 'SERVICE'           // subcontractor or service PO
  | 'ADHOC'             // one-off, no inventory record needed
```

This single field on every PR and PO determines:
- Whether a GRN is required (SERVICE may skip physical GRN)
- Where cost posts after approval
- Which approval tier is required (CAPEX requires ADMIN/SUPER_ADMIN)
- Whether inventory records are created on delivery

---

## Pricing & Markup Model

### Inventory Pricing Stack (existing — unchanged)

```
purchasePrice       ← what supplier charges per unit
+ freightDuty       ← shipping/duty per unit
= totalCost         ← auto-calculated, read-only

totalCost × (1 + markupPercent / 100) = sellingPrice (IRD)
```

### Job Card Pricing Stack (existing — unchanged)

```
IRD sellingPrice (snapshotted from inventory)
+ TWID markup %
+ IMP Cost %
= Final billable to client
```

### Procurement Line Item Pricing (new)

Each PR/PO line item captures:

```typescript
unitCostPrice    // from supplier quote
freightDuty      // shipping per unit
totalCost        // (unitCostPrice + freightDuty) × qty  [auto-calc]
markupPercent    // defaults from inventory item or project config
sellingPrice     // totalCost × (1 + markupPercent / 100)  [auto-calc]
marginAmount     // sellingPrice - totalCost  [auto-calc]
```

### Markup by Category (recommended defaults)

| Material Category | Suggested Markup |
|---|---|
| Bulk commodities (cement, sand) | 10–15% |
| Structural steel / ironmongery | 15–20% |
| Electrical / plumbing fittings | 20–30% |
| Specialised equipment | 25–35% |
| Imported / scarce materials | 30–50% |

### Project-Level Markup Config

```
/projects/{id}
  materialMarkupPercent: 20      // default for all PRs on this project
  markupOverrideAllowed: true    // can individual line items deviate?
```

### Full Pricing Chain (end to end)

```
Supplier Invoice (PO)
  → purchasePrice + freightDuty → totalCost
      → × markupPercent → IRD sellingPrice (Inventory)
          → + TWID markup % (Job Card)
              → + IMP Cost % (Job Card)
                  → Final billable to client
```

Every margin layer traces back to original supplier cost.

---

## Core Procurement Workflow

```
Purchase Requisition (PR)
  Status: DRAFT → SUBMITTED → APPROVED | REJECTED
        ↓ (on APPROVED)
Purchase Order (PO)
  Status: DRAFT → SENT → ACKNOWLEDGED → PARTIALLY_FULFILLED → COMPLETE
        ↓ (on delivery)
Goods Receipt Note (GRN)
  Status: PENDING → CONFIRMED | DISPUTED
        ↓ (on CONFIRMED)
Supplier Invoice
  3-way match: PR qty vs GRN qty vs Invoice amount
  Status: PENDING_MATCH → MATCHED | DISPUTED
        ↓ (on MATCHED)
Payment Authorization
  paymentAccount: ECOCASH | BANK | CASH | IRD
  Status: PENDING → PAID | PARTIAL
        ↓
Destination Posting (based on procurementType)
```

---

## Firestore Collections

### `/suppliers/{id}`

```typescript
{
  name: string
  contactPerson: string
  email: string
  phone: string
  address: string
  paymentTerms: 'COD' | 'NET30' | 'NET60' | 'NET90'
  categories: string[]
  status: 'ACTIVE' | 'INACTIVE'
  notes: string
  createdBy: string        // uid
  createdAt: Timestamp
  updatedAt: Timestamp
}
```

### `/procurement/requisitions/{id}`

```typescript
{
  prNumber: string         // PR-2026-0001
  title: string
  description: string
  procurementType: ProcurementType
  department: string       // AGF | SALES | TECHNICAL | ADMIN | OTHER
  jobCardId: string | null
  jobCardTitle: string | null
  supplierId: string | null
  supplierName: string | null
  items: ProcurementLineItem[]
  totalEstimatedCost: number
  status: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED'
  rejectionReason: string | null
  requestedBy: string      // uid
  requestedByName: string
  approvedBy: string | null
  approvedAt: Timestamp | null
  createdAt: Timestamp
  updatedAt: Timestamp
}
```

### `ProcurementLineItem` (embedded in requisitions and POs)

```typescript
{
  id: string               // uuid per line
  description: string
  uom: string              // PCS|KG|METER|LITER|BOX|PACK|SET|UNIT
  qty: number
  unitCostPrice: number
  freightDuty: number
  totalCost: number        // auto-calc
  markupPercent: number
  sellingPrice: number     // auto-calc
  marginAmount: number     // auto-calc
  inventoryItemId: string | null
  sku: string | null
  isAdHoc: boolean
  inventoryItemStatus: 'EXISTING' | 'NEW_PENDING' | 'ADHOC'
  notes: string
}
```

### `/procurement/purchase_orders/{id}`

```typescript
{
  poNumber: string         // PO-2026-0001
  prId: string             // source PR
  prNumber: string
  supplierId: string
  supplierName: string
  items: ProcurementLineItem[]
  totalOrderValue: number
  status: 'DRAFT' | 'SENT' | 'ACKNOWLEDGED' | 'PARTIALLY_FULFILLED' | 'COMPLETE'
  jobCardId: string | null
  department: string
  procurementType: ProcurementType
  expectedDeliveryDate: Timestamp | null
  deliveryAddress: string
  paymentTerms: string
  notes: string
  sentAt: Timestamp | null
  createdBy: string
  createdAt: Timestamp
  updatedAt: Timestamp
}
```

### `/procurement/grns/{id}`

```typescript
{
  grnNumber: string        // GRN-2026-0001
  poId: string
  poNumber: string
  supplierId: string
  supplierName: string
  items: GRNLineItem[]     // qty ordered vs qty received
  status: 'PENDING' | 'CONFIRMED' | 'DISPUTED'
  receivedBy: string       // uid
  receivedAt: Timestamp
  notes: string
  createdAt: Timestamp
}

// GRNLineItem
{
  lineItemId: string       // ref to PO line item id
  sku: string | null
  description: string
  qtyOrdered: number
  qtyReceived: number
  qtyVariance: number      // auto-calc: received - ordered
  inventoryItemStatus: 'EXISTING' | 'NEW_PENDING' | 'ADHOC'
  inventoryItemId: string | null
  notes: string
}
```

### `/procurement/supplier_invoices/{id}`

```typescript
{
  invoiceNumber: string    // supplier's invoice number
  poId: string
  grnId: string
  supplierId: string
  supplierName: string
  invoiceDate: Timestamp
  dueDate: Timestamp
  items: InvoiceLineItem[]
  subtotal: number
  tax: number
  totalAmount: number
  matchStatus: 'PENDING_MATCH' | 'MATCHED' | 'DISPUTED'
  matchVariance: number    // invoice total - PO total
  paymentAccount: 'ECOCASH' | 'BANK' | 'CASH' | 'IRD'
  paymentStatus: 'PENDING' | 'PARTIAL' | 'PAID'
  paidAmount: number
  paidAt: Timestamp | null
  paidBy: string | null
  createdBy: string
  createdAt: Timestamp
  updatedAt: Timestamp
}
```

### `/inventoryItems/{id}` — additions only (existing collection)

```typescript
{
  // ... all existing fields unchanged ...
  status: 'ACTIVE' | 'PENDING_GRN' | 'INACTIVE'   // NEW
  createdViaProcurement: boolean                    // NEW
  originPrId: string | null                         // NEW
}
```

### `jobCards/{id}.items[]` — additions only (existing collection)

```typescript
{
  // ... all existing fields unchanged ...
  linkedPrId: string | null       // NEW — set when PR raised from this row
  linkedPrStatus: string | null   // NEW — denormalized PR status
  linkedPoId: string | null       // NEW — set when PO created
  stockAtSnapshot: number         // NEW — onHand when item was added
}
```

---

## Feature Specifications

### Supplier Master (`/procurement/suppliers`)

- Table: name, contactPerson, phone, paymentTerms, categories (badges), status
- Add / Edit via side panel (Sheet component)
- Status toggle inline (ACTIVE / INACTIVE)
- Search by name or category
- Accessible to: SUPER_ADMIN | ADMIN | MANAGER | STOREKEEPER

### Purchase Requisitions (`/procurement/requisitions`)

- List with status filter tabs: All | Draft | Submitted | Approved | Rejected
- New PR form:
  - Section 1: title, description, procurementType, department, supplier (optional), notes
  - Section 2: dynamic line items table with auto-calculating pricing
  - Actions: Save as Draft / Submit for Approval
- Detail view: full PR info + approve / reject actions (role-gated)
- PR number format: `PR-{YYYY}-{0001}`

### Purchase Orders (`/procurement/purchase_orders`)

- Auto-generated from approved PR
- PO PDF generated via jsPDF (matches existing PDF conventions)
- Status tracking: SENT → ACKNOWLEDGED → PARTIALLY_FULFILLED → COMPLETE
- PO number format: `PO-{YYYY}-{0001}`

### Goods Receipt Notes (`/procurement/grns`)

- Confirm delivery against PO
- Per-line: qty ordered vs qty received (partial deliveries supported)
- Variance flagging: auto-highlight lines where received ≠ ordered
- On CONFIRMED: triggers destination posting based on procurementType
- GRN number format: `GRN-{YYYY}-{0001}`

### Invoice Matching

- 3-way match: PR quantity vs GRN quantity vs Invoice amount
- Auto-flag discrepancies
- Matched invoices routed to payment authorization queue
- Disputed invoices require resolution before payment

### Payment Authorization

- Select payment account: ECOCASH | BANK | CASH | IRD
- Partial payments supported
- Payment debits corresponding account in accounts ledger
- Full audit trail: paidBy, paidAt, amount

---

## Job Card Integration

### The "Raise PR from Job Card" Flow

```
Job Card item row shows stock warning (onHand < qty needed)
        ↓
Manager clicks "Raise PR" button on that row
        ↓
PR slide-over panel opens (pre-filled, job card stays visible)
        ↓
Pre-filled fields (locked): SKU, description, uom, 
  unitCostPrice, freightDuty, jobCardId, procurementType: PROJECT_MATERIAL
  qtyToOrder = max(0, qtyNeeded - onHand)  [auto-calc, editable]
        ↓
Manager selects supplier (optional), edits qtyToOrder, adds notes
        ↓
Submits PR → status: DRAFT
        ↓
Job card item row button changes to "PR Raised ✓" with link to PR
        ↓
Normal PR → PO → GRN flow
        ↓
GRN confirmed → stockLedger ADD → onHand increases
        ↓
Stock badge on job card row clears automatically (real-time listener)
```

### Stock Status Badges on Job Card Item Rows

```
onHand === 0           → red badge    "Out of Stock"       + "Raise PR" button
onHand < qtyNeeded     → amber badge  "Only {N} in stock"  + "Raise PR" button
onHand >= qtyNeeded    → green badge  "{N} available"      (no button)
```

Button visibility rules:
- Only visible when `onHand < qtyNeeded`
- Only clickable by: MANAGER | ADMIN | SUPER_ADMIN
- If `linkedPrId` exists: show "PR Raised ✓" link instead of button

### PR Slide-Over Panel

- Opens over job card (job card stays visible behind)
- Locked fields: SKU, description, jobCardId, procurementType
- Editable fields: qtyToOrder, supplierId, notes
- On success: toast "PR-{number} raised successfully", panel closes
- Job card remains active, button state updates reactively

---

## Missing Inventory Item Handling (Path B)

When a PR is raised for an item that **does not exist in inventory**, the system follows **Path B — Draft Inventory Item via PR**.

### Decision Flow

```
PR item search → no matching SKU found
        ↓
Two options presented:

[One-off expense]              [Register new item]
isAdHoc: true                  inventoryItemStatus: 'NEW_PENDING'
No SKU assigned                Full inventory fields captured
Posts to job card costs only   inventoryItems doc created with
No stockLedger entry           onHand: 0, status: 'PENDING_GRN'
                                        ↓
                               On GRN confirmation:
                               status → 'ACTIVE'
                               onHand = qtyReceived
                               stockLedger ADD entry written
```

### "Register New Item" Fields Captured at PR Stage

```
Item Name *        text
SKU *              text (auto-suggest or manual entry)
UOM *              select
Category *         select (from inventoryCategories)
Purchase Price *   number
Freight/Duty       number
Markup %  *        number
Reorder Level      number
Location           text
```

### GRN Confirmation Logic

```typescript
for (const item of grn.items) {
  if (item.inventoryItemStatus === 'EXISTING') {
    // increment onHand + write stockLedger ADD

  } else if (item.inventoryItemStatus === 'NEW_PENDING') {
    // create inventoryItems doc with status: 'ACTIVE'
    // set onHand = qtyReceived
    // write stockLedger ADD entry
    // update PR item.inventoryItemId with new doc id

  } else if (item.inventoryItemStatus === 'ADHOC') {
    // skip inventory entirely
    // post cost to jobCard.adHocExpenses with source: 'PROCUREMENT'
  }
}
```

### Inventory Status Field

```typescript
// Added to inventoryItems collection
status: 'ACTIVE' | 'PENDING_GRN' | 'INACTIVE'
```

- `PENDING_GRN` items are hidden from the main inventory grid by default
- Toggle to show them with a "Pending Delivery" badge
- Flip to `ACTIVE` automatically on GRN confirmation

---

## Payment Accounts

Incaptta holds funds across 4 accounts. Every supplier payment must specify which account is debited:

| Account | Code | Used For |
|---|---|---|
| EcoCash | `ECOCASH` | Local suppliers, small purchases, urgent buys |
| Bank | `BANK` | Large POs, formal suppliers, international |
| Cash on Hand | `CASH` | Site petty cash, emergency material buys |
| IRD Account | `IRD` | Revenue holding, large settlements |

Payment selection is made at the **invoice payment authorization** stage, not at PR or PO stage.

Each payment writes a debit entry to the accounts ledger referencing:
- `paymentAccount`
- `invoiceId`
- `poNumber`
- `supplierName`
- `amount`
- `paidBy` (uid)
- `paidAt`

---

## Roles & Access Control

| Action | SUPER_ADMIN | ADMIN | MANAGER | ACCOUNTANT | STOREKEEPER | SALES | TECHNICAL |
|---|---|---|---|---|---|---|---|
| View suppliers | ✓ | ✓ | ✓ | ✓ | ✓ | — | — |
| Add/edit suppliers | ✓ | ✓ | ✓ | — | — | — | — |
| Raise PR | ✓ | ✓ | ✓ | — | ✓ | — | — |
| Approve/reject PR | ✓ | ✓ | ✓ | — | — | — | — |
| Create PO | ✓ | ✓ | ✓ | — | — | — | — |
| Confirm GRN | ✓ | ✓ | ✓ | — | ✓ | — | — |
| Match invoice | ✓ | ✓ | — | ✓ | — | — | — |
| Authorize payment | ✓ | ✓ | — | ✓ | — | — | — |
| Raise PR from Job Card | ✓ | ✓ | ✓ | — | — | — | — |

### Firestore Security Rules Summary

```
/suppliers/{id}
  read:  authenticated users
  write: SUPER_ADMIN | ADMIN | MANAGER

/procurement/requisitions/{id}
  read:  authenticated users
  create: authenticated users (any role)
  update: SUPER_ADMIN | ADMIN | MANAGER
          OR (requestedBy == uid AND status == DRAFT)
  delete: SUPER_ADMIN only

/procurement/purchase_orders/{id}
  read:  authenticated users
  write: SUPER_ADMIN | ADMIN | MANAGER

/procurement/grns/{id}
  read:  authenticated users
  write: SUPER_ADMIN | ADMIN | MANAGER | STOREKEEPER

/procurement/supplier_invoices/{id}
  read:  SUPER_ADMIN | ADMIN | MANAGER | ACCOUNTANT
  write: SUPER_ADMIN | ADMIN | ACCOUNTANT
```

---

## Phase Build Plan

| Phase | Sub-Phase | What Gets Built | Files Touched |
|---|---|---|---|
| **1** | 1A | Types + Pinia store | `types/procurement.ts`, `stores/procurement.ts` |
| **1** | 1B | Supplier Sheet + Suppliers View | `SupplierSheet.vue`, `SuppliersView.vue` |
| **1** | 1C | New Requisition Form | `NewRequisitionView.vue` |
| **1** | 1D | Requisitions List + Detail + Routing + Sidebar | `RequisitionsView.vue`, `RequisitionDetailView.vue`, `router/index.ts`, sidebar |
| **2** | 2A | Inventory item search composable | `useInventorySearch.ts` |
| **2** | 2B | Item picker in PR form + stock badge component | `InventoryItemPicker.vue`, `StockBadge.vue` |
| **3** | 3A | Missing item detection + option modal | `MissingItemModal.vue` |
| **3** | 3B | New item inline form (Path B) | updates to `NewRequisitionView.vue` |
| **3** | 3C | Ad-hoc item flow | updates to PR line item handling |
| **4** | 4A | PR approval workflow (approve/reject actions) | updates to `RequisitionDetailView.vue` |
| **4** | 4B | Role-gated action buttons | updates to detail view |
| **5** | 5A | PO store + types | updates to `stores/procurement.ts` |
| **5** | 5B | PO creation from approved PR | `PurchaseOrderView.vue`, `NewPOView.vue` |
| **5** | 5C | PO PDF generation (jsPDF) | `composables/usePOPdf.ts` |
| **6** | 6A | GRN store + types | updates to `stores/procurement.ts` |
| **6** | 6B | GRN form + confirmation | `NewGRNView.vue`, `GRNDetailView.vue` |
| **6** | 6C | GRN → inventory posting (Express API) | Firebase Function: `onGRNConfirmed` |
| **7** | 7A | Stock badges on job card item rows | updates to job card item row component |
| **7** | 7B | Raise PR button + slide-over panel | `RaisePRPanel.vue`, updates to job card |
| **7** | 7C | linkedPrId tracking + real-time badge clear | updates to job card store |
| **8** | 8A | Payment account selection on invoice | updates to `SupplierInvoiceView.vue` |
| **8** | 8B | Accounts ledger debit on payment | Firebase Function: `onInvoicePaid` |

### Fire Order

```
Phase 1A → verify types compile and store initializes
Phase 1B → verify supplier CRUD works in Firestore
Phase 1C → verify PR saves to Firestore with correct structure
Phase 1D → verify routing, list, detail, sidebar all load
Phase 2A → verify inventory search composable returns correct items
Phase 2B → verify item picker auto-fills pricing, stock badge renders
Phase 3A → verify missing item modal appears on no-SKU search
Phase 3B → verify NEW_PENDING item created in Firestore on PR submit
Phase 3C → verify ADHOC item bypasses inventory entirely
Phase 4A → verify PR status transitions correctly in Firestore
Phase 4B → verify role-gated buttons render/hide correctly
Phase 5A → verify PO types extend correctly from PR types
Phase 5B → verify PO created from PR with correct data copy
Phase 5C → verify PO PDF renders with correct line items
Phase 6A → verify GRN types and store
Phase 6B → verify GRN form saves and updates PO status
Phase 6C → verify inventory onHand increments + stockLedger ADD written
Phase 7A → verify stock badges render correctly on job card rows
Phase 7B → verify Raise PR panel pre-fills correctly from job card context
Phase 7C → verify linkedPrId written to job card item + badge clears on restock
Phase 8A → verify payment account selection saves on invoice
Phase 8B → verify accounts ledger debit entry written on payment
```

---

## Development Prompts Index

All Cline/DeepSeek agent prompts are stored as separate files:

| File | Phase | Contents |
|---|---|---|
| `PROMPT_1A.md` | Phase 1A | Types + Pinia store |
| `PROMPT_1B.md` | Phase 1B | Supplier Sheet + Suppliers View |
| `PROMPT_1C.md` | Phase 1C | New Requisition Form |
| `PROMPT_1D.md` | Phase 1D | Requisitions List + Detail + Routing |
| `PROMPT_2A.md` | Phase 2A | Inventory item search composable |
| `PROMPT_2B.md` | Phase 2B | Item picker + stock badge |
| `PROMPT_3A.md` | Phase 3A | Missing item modal |
| `PROMPT_3B.md` | Phase 3B | New item inline form (Path B) |
| `PROMPT_3C.md` | Phase 3C | Ad-hoc item flow |
| `PROMPT_4A.md` | Phase 4A | PR approval workflow |
| `PROMPT_4B.md` | Phase 4B | Role-gated action buttons |
| `PROMPT_5A.md` | Phase 5A | PO store + types |
| `PROMPT_5B.md` | Phase 5B | PO creation from PR |
| `PROMPT_5C.md` | Phase 5C | PO PDF generation |
| `PROMPT_6A.md` | Phase 6A | GRN store + types |
| `PROMPT_6B.md` | Phase 6B | GRN form + confirmation |
| `PROMPT_6C.md` | Phase 6C | GRN → inventory posting |
| `PROMPT_7A.md` | Phase 7A | Job card stock badges |
| `PROMPT_7B.md` | Phase 7B | Raise PR button + slide-over |
| `PROMPT_7C.md` | Phase 7C | linkedPrId tracking |
| `PROMPT_8A.md` | Phase 8A | Payment account selection |
| `PROMPT_8B.md` | Phase 8B | Accounts ledger debit |

---

## Key Architectural Decisions

| Decision | Choice | Reason |
|---|---|---|
| Inventory creation trigger | Path B — via GRN confirmation | Doesn't block procurement flow waiting for inventory setup |
| PR → inventory link | `inventoryItemStatus` field per line | Single field routes all three scenarios cleanly |
| Job card integration | Slide-over panel, not new page | Keeps job card context visible during PR creation |
| Markup storage | Per line item + project default | Supports both project-level and per-item override |
| Payment account | Selected at invoice stage | PO stage too early — supplier may change account on delivery |
| Real-time stock badges | Firestore onSnapshot listener | Free — existing inventory listeners already in place |
| CAPEX vs inventory | Separate `procurementType` flag | Accounting treatment differs — assets depreciate, stock hits COGS |
| New item status | `PENDING_GRN` | Visible to procurement, hidden from inventory grid until confirmed |

---

*Document maintained by Techcess Technology. Update after each completed phase.*
