# Migration Status & Next Instructions: QA & Polish Phase

All primary core modules from the legacy Vue 3 codebases (`project-management` and `incaptta-manage`) have now been ported to Next.js 16 App Router (`project-management-next` and `incaptta-manage-next`).

---

## 🎯 Immediate Next Tasks for Agents: QA, Validation & Polish

Your objective is now to verify and refine the migrated applications. Focus on the following objectives:

### Task 1: UI/UX & Responsive Layout Audit across ERP (`project-management-next`)
1. **Mobile Responsiveness**:
   - Inspect high-density tables (e.g., in `/accounting/reports`, `/accounting/sales-reports`, `/hr`, `/job-cards`) to ensure horizontal scrolling (`overflow-x-auto`) works smoothly on narrower breakpoints.
2. **Tab Layout Verification**:
   - Ensure all `@base-ui/react` or `@/components/ui/tabs` elements render cleanly without flex/layout stacking bugs.

### Task 2: End-to-End Navigation & Route Linking Audit
1. **Cross-Linking**:
   - Verify that clicking cards on summary views (like `/crm/customers` or `/accounting`) routes correctly to dynamic detail routes (like `/crm/customers/[id]` or `/accounting/sales-reports`).
2. **Missing Sub-Routes Check**:
   - Test action buttons ("New", "Edit", "View Details") across CRM, Procurement, and Poultry modules to ensure no 404 routes exist.

### Task 3: Firebase Store & Real-time Listener Optimization
1. Verify that all Zustand stores properly call their cleanup/unsubscribe routines when unmounting components to prevent memory leaks or duplicate Firestore listeners.

---

## ✅ Completed Porting Milestones

### 1. Accounting Sub-Pages (`project-management-next`)
*   **Tax Computation (`/accounting/tax`)**: ITF12C calculation engine with add-backs, deductions, and QPD schedule.
*   **VAT Return Center (`/accounting/vat`)**: Output/Input VAT breakdown with return generation.
*   **Financial Reports (`/accounting/reports`)**: P&L, Balance Sheet, and inline financial metrics chart/table.
*   **Inventory Sales Report (`/accounting/sales-reports`)**: Filtered CSV export and backlog tracking.

### 2. ERP HR Module Upgrade (`project-management-next/src/app/hr`)
*   Fully integrated the 9-tab modular architecture (Overview, Roster, Leave, Payroll, Advances, Tasks, Performance, Recruitment, Salaries).

### 3. CRM Customer Details (`project-management-next/src/app/crm/customers/[id]`)
*   Migrated summary cards, account statement tabs, credit accounts, and deposit transactions.

---

> [!IMPORTANT]
> **READ-ONLY REMINDER**
> Continue treating legacy directories (`project-management/`, `incaptta-manage/`, `incaptta-web/`) strictly as read-only references. Do not modify legacy Vue files.
