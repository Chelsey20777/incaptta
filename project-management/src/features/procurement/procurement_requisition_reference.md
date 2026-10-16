# Procurement Reference: Project Material Requisitions

This document outlines the goals, architecture, and data flow of the Procurement module as it pertains to **Project Materials** (materials required for specific Job Cards).

## 1. Core Objectives
The primary goal of the Project Material Procurement flow is to seamlessly bridge the gap between Project Management (Job Cards) and Procurement (Purchasing). 
When a project requires materials that are currently out of stock or needing special order, the system must handle the request without losing the context of *why* the material is being bought.

Specifically, we are trying to achieve:
* **Automated Deficit Identification:** Instantly notify users when a Job Card requires more stock than is currently on hand.
* **Contextual PR Creation:** Allow users to raise a Purchase Requisition (PR) directly from the Job Card, automatically porting over item details, quantities, and project identifiers.
* **Bi-directional Linkage:** Ensure the Job Card knows about the PR (to show status updates), and the PR knows about the Job Card (for cost allocation and accounting).
* **Automated Fulfillment:** Once the procurement cycle finishes and goods are received (GRN), automatically update inventory so the project can proceed to issue the materials.

## 2. Architecture & Data Flow

The workflow is split into five distinct phases:

### Phase A: Identification (Job Card)
1. A user adds an item to a Job Card's `requisitionItems` array.
2. The system dynamically checks the `inventoryItems` collection (`onHand` value).
3. If `qtyRequired > onHand`, the system identifies a deficit and renders the **Raise PR** action (via `RaisePRPanel.vue`).

### Phase B: Requisition Creation (Procurement)
1. The user initiates the "Raise PR" flow. The system calculates `qtyToOrder = Math.max(0, qtyRequired - onHand)`.
2. A new document is created in `procurementRequisitions`.
3. **Key Data Mapping:**
   * `procurementType` is strictly set to `PROJECT_MATERIAL`.
   * `jobCardId` and `jobCardTitle` are populated.
   * The line item array is populated with the specific inventory item, preserving the `inventoryItemId` and `sku`.
4. **Linkage:** The new PR's ID is saved back to the Job Card item as `linkedPrId`.

### Phase C: Procurement Lifecycle (Procurement)
The Requisition follows the standard procurement lifecycle without needing manual project-manager intervention:
1. **DRAFT:** PR is being built.
2. **SUBMITTED:** Sent to management for approval.
3. **APPROVED:** Cleared for purchase.
4. **PO CREATED:** A Purchase Order is generated (`linkedPoId` is saved to the PR, and can be read by the Job Card).

### Phase D: Visibility (Job Card)
Because the Job Card item has a `linkedPrId`, the Job Card UI replaces the "Raise PR" button with a `LinkedPRStatusCard`. 
This card reads the PR/PO status in real-time, allowing Project Managers to see if their materials are "Ordered", "In Transit", or "Delayed" without leaving their project context.

### Phase E: Receiving & Stock Update (Inventory)
1. The supplier delivers the goods, and a Goods Receipt Note (GRN) is created and `CONFIRMED`.
2. The GRN confirmation triggers an inventory update (`inventoryItems` -> `onHand` increases).
3. **The Loop Closes:** The Job Card's real-time listener sees the inventory increase. The deficit disappears, and the Job Card item can now be "Approved" by a manager, which actively deducts the stock and issues it to the project.

## 3. Handling "Ad-Hoc" and "New" Items
The system also handles items that don't yet exist in the main `inventoryItems` database:
* **NEW_PENDING:** The user needs a completely new item. The system creates a placeholder inventory item (`status: PENDING_GRN`) when the PR is submitted. Once the GRN is confirmed, the item becomes active and its stock is updated.
* **ADHOC:** The user needs a one-off purchase that shouldn't clog up the inventory database (e.g., a specialized rental fee or obscure consummable). It bypasses standard inventory tracking but still allocates cost to the Job Card.

## 4. Key Data Models Referenced

### `JobCard` (Project Management)
* `requisitionItems`: Array of items needed for the job.
* `linkedPrId`, `linkedPoId`: Fields on the line item to track procurement status.

### `ProcurementRequisition` (Procurement)
* `procurementType`: Set to `PROJECT_MATERIAL`.
* `jobCardId`: Links back to the parent project.
* `items`: Contains `inventoryItemId` to ensure the exact matching item is ordered.

### `GoodsReceiptNote` (Procurement/Inventory)
* `status: CONFIRMED` triggers the inventory `onHand` increment, solving the original deficit identified in Phase A.
