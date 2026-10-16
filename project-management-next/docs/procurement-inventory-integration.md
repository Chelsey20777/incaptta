# Procurement ↔ Inventory Integration Audit

**Project:** `project-management-next`  
**Date:** 2026-07-18  
**Status:** Audit only — implementation deferred  
**Goal:** Make “purchase new stock → add to Inventory Master” a seamless, auditable path.

---

## 1. Executive summary

The procurement data model already anticipates a **procure-to-stock** flow (`EXISTING` / `NEW_PENDING` / `ADHOC` line statuses, GRN fulfillment hooks). In practice the Next.js UI always creates **ADHOC** lines, and GRN confirmation bumps `onHand` **without** going through `inventoryStore.adjustStock`, so there is no reliable `stockLedger` trail.

**Recommendation:** Implement **Option A** first (wire PR lines to inventory + GRN → `adjustStock`), then optionally replenishment and full AP later. The Vue app (`project-management`) already has the reference pattern to port.

---

## 2. Current architecture

### 2.1 Designed flow

```text
PR (Requisition) → Approve → PO → Send → GRN (Receive)
                                              ├─ EXISTING / NEW_PENDING → inventoryItems.onHand
                                              ├─ ADHOC + jobCardId → job card expenses
                                              └─ → Supplier Invoice → (payment / OPEX — not wired)
```

### 2.2 Key collections

| Collection | Purpose |
|------------|---------|
| `suppliers` | Vendors |
| `procurementRequisitions` | Purchase requisitions (`PR-YYYY-####`) |
| `procurementPurchaseOrders` | Purchase orders (`PO-YYYY-####`) |
| `procurementGrns` | Goods receipt notes (`GRN-YYYY-####`) |
| `procurementSupplierInvoices` | Supplier invoices |
| `inventoryItems` | Inventory master (qty = `onHand`) |
| `stockLedger` | Stock movements (written by `adjustStock`, **not** by current GRN path) |
| `inventoryCategories` | Categories |
| `operationalExpenses` | Intended AP / COGS link (`operationalExpenseId` on invoice — unused) |
| `systemCounters` | `prNumbers`, `poNumbers`, `grnNumbers` |

### 2.3 Key code locations

| Area | Path |
|------|------|
| Procurement store / GRN fulfillment | `src/stores/procurement-store.ts` (`processGrnFulfillment`) |
| Inventory store / stock API | `src/stores/inventory-store.ts` (`createItem`, `adjustStock`, `getMovements`) |
| Procurement types | `src/features/procurement/types/index.ts`, `procurement.ts` |
| New PR UI (forces ADHOC) | `src/app/procurement/requisitions/new/page.tsx` |
| GRN UI | `src/app/procurement/grns/` |
| Inventory UI | `src/app/inventory/page.tsx` |
| Vue reference (correct GRN → stock) | `project-management/src/features/procurement/store/procurementStore.ts` |
| Vue inventory picker | `project-management/src/features/procurement/components/InventoryItemPicker.vue` |
| Vue NEW_PENDING placeholders | `project-management/src/features/procurement/pages/NewRequisitionView.vue` |

### 2.4 Line item stock modes (already in types)

| `inventoryItemStatus` | Intent |
|-----------------------|--------|
| `EXISTING` | Link to known SKU → receive into stock |
| `NEW_PENDING` | Placeholder SKU created at PR (`PENDING_GRN`, `onHand: 0`) → activate + stock on GRN |
| `ADHOC` | Non-stock / service / direct job-card material → **no** inventory update |

### 2.5 Inventory master model (relevant fields)

From `InventoryItem` in `inventory-store.ts`:

- Identity: `id`, `sku`, `name`, `uom`
- Qty: `onHand`
- Costing: `purchasePrice`, `freightDuty`, `totalCost`, `markupPercent`, `sellingPrice`
- Org: `categoryId`, `categoryName`, `location`, `reorderLevel`
- Procurement extras (used in Vue / cleanup, lightly typed in Next): `status` (`PENDING_GRN` \| `ACTIVE`), `createdViaProcurement`, `originPrId`

### 2.6 How stock is supposed to move

| Direction | Method | Ledger | Notes |
|-----------|--------|--------|-------|
| Stock in | `adjustStock({ type: 'ADD', ... })` | `stockLedger` ADJUST (+) | Use for GRN receipts |
| Stock out | `adjustStock({ type: 'REMOVE', ... })` | ADJUST (−) + optional COGS OPEX | Job cards / write-offs |
| Stock take | `adjustStock({ type: 'SET', ... })` | ADJUST (delta) | CSV / count |

**Do not** use `REMOVE` for goods receipt (that can post COGS). Receipts are **ADD** only.

---

## 3. Audit findings (gaps)

### 3.1 Critical — stock never linked from PR UI

`requisitions/new/page.tsx` hardcodes every line:

```ts
inventoryItemId: null
sku: null
isAdHoc: true
inventoryItemStatus: 'ADHOC'
newItemData: null
```

No inventory picker, no “create new SKU” path. GRN therefore almost never hits EXISTING / NEW_PENDING branches.

### 3.2 Critical — GRN bypasses inventory master API

`processGrnFulfillment` updates `onHand` via raw Firestore transactions. It does **not**:

- Call `useInventoryStore.getState().adjustStock(...)`
- Write `stockLedger`
- Update `purchasePrice` / valuation from received unit cost
- Advance PO status to `PARTIALLY_FULFILLED` / `COMPLETE`

Vue already posts receipts correctly:

```ts
await inventoryApi.adjustStock(item.inventoryItemId, {
  type: 'ADD',
  qty: item.qtyReceived,
  reason: `Received via GRN: ${grnData.grnNumber}`,
  reference: grnId,
  unitCost: item.unitCostPrice,
})
```

### 3.3 Process / product gaps

| Gap | Detail |
|-----|--------|
| Discoverability | `/procurement` is route-guarded but **missing from sidebar** |
| PR lifecycle | `SUBMITTED` exists; little/no clear DRAFT → SUBMITTED UX; PO can be created without strict approval gate in places |
| PO fulfillment | `ACKNOWLEDGED`, `PARTIALLY_FULFILLED`, `COMPLETE` defined but unused |
| Partial receipts | No remaining-qty tracking across multiple GRNs |
| Invoice | Weak match (often PO total vs invoice); GRN not linked; `PAYMENT_PROCESSED` / OPEX AP not implemented |
| Job-card bridge | Cleanup expects `linkedPrId`; limited path from job-card requisitions → procurement PRs |

### 3.4 What already works (keep)

- Full document pipeline: PR → PO → GRN → Invoice collections + counters
- Supplier CRUD
- Types for `NewItemData`, GRN `inventoryPostingStatus`, line stock modes
- Fulfillment branches for EXISTING / NEW_PENDING / ADHOC (logic present; UI doesn’t feed it)
- Inventory `adjustStock` + COGS on REMOVE (reuse for receipts as ADD)

---

## 4. Integration possibilities

### Option A — Close the loop (recommended first)

Port Vue’s pattern into Next with minimal architecture change.

**Scope**

1. **PR line types:** Stock (EXISTING) · New SKU (NEW_PENDING) · Ad-hoc  
2. **Inventory picker** on PR (and carry IDs through PO → GRN)  
3. **Create placeholder** `inventoryItems` on NEW_PENDING save (`status: 'PENDING_GRN'`, `onHand: 0`, link `inventoryItemId`)  
4. **GRN confirm:** `adjustStock({ type: 'ADD', qty, reason, reference, unitCost })`  
5. Activate NEW_PENDING → `ACTIVE` / `isActive: true` before or with stock-in  
6. Optionally update `purchasePrice` / weighted average from GRN unit cost  
7. Add **Procurement** to sidebar / nav  

**Outcome:** Purchase → receive → stock appears in Inventory Master with ledger audit.

**Effort:** Medium · **Risk:** Low · **Depends on:** Existing types + Vue reference

---

### Option B — Receive-first warehouse shortcut

Warehouse maps PO lines to SKUs at GRN time (or free receipt), then confirms into stock.

**When useful:** Buyers skip detailed PR linking; warehouse finishes mapping.

**Effort:** Medium · Best as complement to A, not a replacement.

---

### Option C — Inventory-driven replenishment

From Inventory Master (reorder level / low stock): **Raise PR** prefilled with EXISTING lines → normal PO → GRN → stock-in.

**Effort:** Medium · Builds on A · High value for recurring consumables.

---

### Option D — Full procure-to-pay

After stock-in:

- True 3-way match (PO × GRN × Invoice qty/amount)
- Create `operationalExpenses` AP entry (`operationalExpenseId`)
- Payment → `PAYMENT_PROCESSED` + ledger

**Effort:** Larger · Needed for accounting completeness, not for stock visibility alone.

---

## 5. Target seamless UX

1. Create PR → choose line type: **Stock (existing)** / **New SKU** / **Ad-hoc**  
2. Approve → Create PO → Mark sent  
3. Create GRN → enter qty received (support partial)  
4. Confirm GRN → `onHand` ↑ + `stockLedger` entry + PO fulfillment status  
5. (Later) Invoice match → pay  

Inventory Master remains the **single source of truth** for quantity.

---

## 6. Implementation backlog (when ready)

### Phase 1 — Seamless stock-in (Option A)

- [ ] Add Procurement to sidebar / module nav  
- [ ] PR line UI: EXISTING picker (SKU, name, UOM, on-hand)  
- [ ] PR line UI: NEW_PENDING + inline new-item form → create `PENDING_GRN` inventory doc  
- [ ] Keep ADHOC for services / non-stock / job-card-only  
- [ ] Propagate `inventoryItemId` / `inventoryItemStatus` PR → PO → GRN  
- [ ] Replace raw `onHand++` in `processGrnFulfillment` with `adjustStock(ADD)`  
- [ ] Write clear GRN reason/reference on ledger movements  
- [ ] On receive, optionally sync `purchasePrice` / `totalCost`  
- [ ] Harden PR DRAFT → SUBMITTED → APPROVED before PO create  

### Phase 2 — Fulfillment quality

- [ ] Track qty ordered vs qty received remaining on PO lines  
- [ ] Set PO `PARTIALLY_FULFILLED` / `COMPLETE` from GRNs  
- [ ] Multi-GRN against one PO  
- [ ] Dispute / variance UX already partially present — connect to stock holds if needed  

### Phase 3 — Replenishment (Option C)

- [ ] Reorder-level alerts on Inventory  
- [ ] “Raise PR” action prefilled from low-stock items  

### Phase 4 — AP (Option D)

- [ ] Link invoice to GRN + PO (3-way)  
- [ ] Create OPEX / AP on approve  
- [ ] Payment status → ledger  

---

## 7. Technical notes for implementers

### 7.1 Preferred GRN stock-in snippet

```ts
await useInventoryStore.getState().adjustStock(item.inventoryItemId, {
  type: 'ADD',
  qty: item.qtyReceived,
  reason: `Received via GRN: ${grnData.grnNumber}`,
  reference: grnId, // or grnNumber
  unitCost: item.unitCostPrice,
})
```

### 7.2 NEW_PENDING placeholder (at PR save)

Create inventory doc roughly as:

- `sku`, `name`, `uom`, pricing from `newItemData`
- `onHand: 0`
- `status: 'PENDING_GRN'`, `isActive: false` (or inactive until GRN)
- `createdViaProcurement: true`, `originPrId`
- Store returned id on PR line as `inventoryItemId` + `inventoryItemStatus: 'NEW_PENDING'`

### 7.3 Safety

- Idempotent GRN posting (`inventoryPostingStatus`) — avoid double stock-in on retries  
- Never post COGS on receipt  
- Validate `qtyReceived > 0` and SKU exists before ADD  
- Cleanup: deleting DRAFT PR should remove unused `PENDING_GRN` placeholders (partially exists)

### 7.4 Analytics caveat

`stockLedger` writers currently use `movementType: 'ADJUST'` even for issues/returns. Receipts via `adjustStock(ADD)` will match that. If analytics filter `ISSUE`/`RETURN` only, they under-count — consider aligning movement types in a separate cleanup.

---

## 8. Effort snapshot

| Piece | Effort | Impact |
|-------|--------|--------|
| Inventory picker + NEW_PENDING on PR | Medium | Unlocks stock linking |
| GRN → `adjustStock(ADD)` + ledger | Small | Correct audit trail |
| Sidebar + PR submit/approve gates | Small | Discoverability / process |
| Partial receipt / PO COMPLETE | Medium | Multi-delivery POs |
| Invoice → OPEX payment | Larger | Full AP |

---

## 9. Decision

| Decision | Choice |
|----------|--------|
| First implementation | **Option A** — close PR→GRN→Inventory loop |
| Source of truth for qty | **Inventory Master** (`inventoryItems` + `stockLedger`) |
| Reference implementation | Vue `project-management` procurement + inventory APIs |
| Out of scope for first pass | Full 3-way AP payment (Phase 4) |

---

## 10. Related docs / follow-ups

- Align movement types (`ISSUE` / `RETURN` / `RECEIPT` vs `ADJUST`) if reporting depends on them  
- Consider Agric / Poultry inventory silos separately — this audit covers the main `inventoryItems` warehouse only  
- After Phase 1, smoke-test: create PR (EXISTING + NEW_PENDING) → PO → GRN confirm → verify on-hand + ledger row + inventory UI  

---

*End of audit. Implement when scheduled; do not treat this file as live product behavior until Phase 1 is shipped.*
