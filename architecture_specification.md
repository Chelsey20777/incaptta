# InCaptta Mobile: Master Functional & Technical Specification

**Role**: Lead Architect (Antigravity) -> Third-Party Developer
**Objective**: Build a high-fidelity mobile mirror of the InCaptta Pro platform. Zero feature loss.

---

## 1. Project Vision
The goal is to provide InCaptta staff (Sales, Finance, Managers, Technical) with the full power of the desktop system in their pockets. The developer is responsible for building a **1:1 feature match** of the `project-management` desktop application, optimized for mobile interaction.

---

## 2. Functional Module Catalog (The "What")

The developer MUST implement the following modules, mapped to existing Firestore collections:

### 2.1 Core Operations
- **Job Cards**: Searchable list + Full Detail view + **Wizard for Creation**. Must support requisition items, site photos, and real-time profit tracking.
- **Tasks**: Priority-based tasking. Replicate `hr/tasks` with mobile-native swipe gestures and push notifications (if scoped).
- **Inventory**: Searchable stock list, detailed stock ledger, and a **Stock Adjustment** interface for storekeepers.

### 2.2 Finance & Ledger (High Priority)
- **Operational Expenses (OPEX)**: Creation form with category mapping, amount, and camera integration for receipt capture.
- **Fund Transfers**: A secure interface for moving funds between accounts (Bank, Cash, EcoCash, IRD).
- **Ledger**: A filtered, mobile-optimized view of all accounts and running balances.

### 2.3 CRM & Sales
- **Customers**: Full directory with click-to-call and address mapping.
- **Quotations/Invoices**: Interface to view and **Create** sales documents from the field.
- **Fowlrun Calculator**: Port the technical calculator from `agric-structures/fowlrun`.

### 2.4 HR & Employee Management
- **Directory**: Employee profiles and performance tracking.
- **Attendance**: A "Clock-in/Clock-out" utility for field staff.
- **Payroll**: Permission-based viewing of payslips and commission earnings.

### 2.5 Operations & Procurement
- **BOM Templates**: Browser for technical bill-of-materials.
- **Procurement Requisitions**: Form for requesting materials from the storekeeper.
- **Container Access**: Management of stock container logs.

---

## 3. Strict Workflow Architecture (The "How")

### 3.1 Approval Workflow (Non-Negotiable)
Every entry (Job Card, OpEx, Transfer, Requisition) MUST adhere to the following 2-step state machine:
1.  **Submission**: Initial entry by staff (Status: `SUBMITTED` or `PENDING_ACCOUNTANT`).
2.  **Review**: Accountant review phase.
3.  **Approval**: Manager final approval phase (Status: `APPROVED` or `COMPLETED`).
*Note: The UI must dynamically enable/disable fields based on these statuses.*

### 3.2 Financial Engine Mirror
Developers MUST implement a mobile-compatible version of the `financialEngine.ts` to ensure:
- `irdGrossRevenue`, `twidAmount`, and `targetJobNet` are calculated exactly as they are on Desktop.
- No discrepancy is allowed between mobile entry and desktop PDF generation.

---

## 4. Technical Constraints

- **Platform**: Ionic Framework (Vue 3) + Capacitor.
- **State Management**: Pinia (Store-per-module).
- **Backend**: Direct Firebase SDK (No middle-tier API required).
- **Navigation**: 5-Tab system (Dashboard, Jobs, Inventory, CRM, More). The "More" menu should house all modules listed in section 2 not present in the tabs.
- **Theming**: Strict adherence to the InCaptta Emerald (`#00A63E`) color palette.

---

## 5. Acceptance & Quality Gates

**Every module delivered will be vetted by the Architect against:**
1.  **Desktop Parity**: Does it do everything the desktop version does?
2.  **Security Rules**: Does it respect role-based permissions?
3.  **Code Integrity**: No hardcoded secrets, efficient Firestore listeners, clean TypeScript.
4.  **UI Fidelity**: Does it feel premium and brand-aligned?
