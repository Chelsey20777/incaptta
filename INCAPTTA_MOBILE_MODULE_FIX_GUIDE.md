# InCaptta Mobile — Module Fix Guide

> **Scope:** Job Cards · Container Access Authorization · Finance (OpEx + Transfers) · HR  
> **Last Updated:** 2026-04-11  
> **Priority:** Complete modules in the order listed below.

---

## Table of Contents
1. [Job Cards](#1-job-cards)
2. [Container Access Authorization](#2-container-access-authorization-caa)
3. [Finance — OpEx & Transfers](#3-finance--opex--transfers)
4. [HR Module](#4-hr-module)
5. [Router Additions](#5-router-additions)
6. [Known Cross-Cutting Issues](#6-known-cross-cutting-issues)

---

## 1. Job Cards

### Files Affected
| File | Action |
|------|--------|
| `src/features/jobCards/pages/JobCardsList.vue` | Modify |
| `src/features/jobCards/pages/JobCardDetail.vue` | Modify |
| `src/features/jobCards/pages/CreateJobCard.vue` | Modify |
| `src/features/jobCards/pages/EditJobCard.vue` | **CREATE NEW** |
| `src/features/jobCards/store/jobCardsStore.ts` | Modify |

### 1.1 `JobCardsList.vue` — UX Polish
- [ ] Add loading skeleton while `jobCardsStore.loading === true`
- [ ] Add empty state message when `filteredJobCards.length === 0`
- [ ] Show **formatted date** (`createdAt`) on each list item
- [ ] Show customer name, job title, status badge, and priority badge per row
- [ ] Status segment filter should also apply when `searchQuery` is active (currently they conflict)

### 1.2 `JobCardDetail.vue` — Critical Fixes
- [ ] **Fix variable name conflict** — `isEditable` is both imported from `@/utils/approvalWorkflow` and declared as a `computed`. Rename the computed to `canEdit`:
  ```ts
  // REMOVE: import { isEditable, isPending } from '@/utils/approvalWorkflow'
  const canEdit = computed(() => jobCard.value?.status === 'DRAFT')
  ```
- [ ] **Add Submit for Approval button** — visible only when `jobCard.status === 'DRAFT'`:
  ```html
  <ion-button v-if="jobCard?.status === 'DRAFT'" expand="block" color="primary" @click="submitForApproval">
    Submit for Approval
  </ion-button>
  ```
  Wire to: `jobCardsStore.submitForApproval(jobCard.value.id, authStore.userId, authStore.userEmail)`

- [ ] **Add rejection reason dialog** — before calling `reject()`, show an `alertController` asking for a reason string. Pass it to `handleRejection(...)`.

- [ ] **Approval Timeline** — render `jobCard.approvalTimeline` as an `ion-list` with date, user, status, and optional comment:
  ```html
  <ion-item v-for="entry in jobCard.approvalTimeline" :key="entry.date">
    <ion-label>
      <h3>{{ entry.status }}</h3>
      <p>{{ entry.user }} · {{ formatDate(entry.date) }}</p>
      <p v-if="entry.comment">{{ entry.comment }}</p>
    </ion-label>
  </ion-item>
  ```

- [ ] **Financial Summary** — wrap values in `formatCurrency()`. Show profit/loss color on `finalNetRevenue`.

- [ ] **Edit button** — should only be visible when `canEdit` is true. Fix the `router.push` path to `/tabs/jobs/edit/${id}`.

### 1.3 `CreateJobCard.vue` — UX Improvements
- [ ] Add **description field per requisition item** (missing from current form)
- [ ] Add a **live financial preview** that recalculates totals as items are entered (call `computeFinancials()` reactively)
- [ ] Add `ion-loading` overlay during save

### 1.4 `EditJobCard.vue` — NEW FILE
> Create this as a copy of `CreateJobCard.vue` with these changes:
- [ ] On `onMounted`, fetch the existing job card by `route.params.id` and populate `formData`
- [ ] Save button calls `jobCardsStore.updateJobCard(id, data)` instead of `createJobCard`
- [ ] Title changes to "Edit Job Card"

### 1.5 `jobCardsStore.ts` — Add Missing Action
- [ ] Add `submitForApproval(id, userId, userEmail)` action:
  ```ts
  const submitForApproval = async (id: string, userId: string, userEmail: string) => {
    const docRef = doc(db, 'jobCards', id)
    await updateDoc(docRef, {
      status: 'SUBMITTED',
      updatedAt: serverTimestamp(),
      approvalTimeline: arrayUnion({
        user: userEmail, role: 'SUBMITTER',
        status: 'Submitted for Approval',
        date: new Date().toISOString()
      })
    })
  }
  ```
- [ ] Fix `updateJobCard` — `getDoc` is called but not imported. Add `getDoc` to the firebase imports at the top.

---

## 2. Container Access Authorization (CAA)

### Files Affected
| File | Action |
|------|--------|
| `src/features/containerAccess/pages/CAADetail.vue` | **REBUILD** (currently a stub) |
| `src/features/containerAccess/pages/CAAList.vue` | Minor modify |
| `src/features/containerAccess/store/containerAccessStore.ts` | Modify |

### 2.1 `containerAccessStore.ts` — Critical Fixes
- [ ] **Wrong collection name** — currently queries `containerAccess`. Firestore rules protect `containerAccessRequests`. Change all collection references:
  ```ts
  // FROM
  collection(db, 'containerAccess')
  // TO
  collection(db, 'containerAccessRequests')
  ```
- [ ] Add **CAA number generation** using `systemCounters/containerAccess`:
  ```ts
  const generateCAANumber = async () => {
    const year = new Date().getFullYear()
    const counterRef = doc(db, 'systemCounters', 'containerAccess')
    const seq = await runTransaction(db, async (tx) => {
      const snap = await tx.get(counterRef)
      const n = snap.exists() && snap.data().currentYear === year
        ? (snap.data().sequence || 0) + 1 : 1
      tx.set(counterRef, { currentYear: year, sequence: n, updatedAt: serverTimestamp() })
      return n
    })
    return `CAA-${year}-${String(seq).padStart(4, '0')}`
  }
  ```
- [ ] Add `approveCAA(id, userEmail, comment?)` action:
  ```ts
  const approveCAA = async (id: string, userEmail: string, comment?: string) => {
    await updateDoc(doc(db, 'containerAccessRequests', id), {
      status: 'APPROVED',
      approvedBy: userEmail,
      approvedAt: serverTimestamp(),
      approvalComment: comment || '',
      updatedAt: serverTimestamp()
    })
  }
  ```
- [ ] Add `rejectCAA(id, userEmail, reason)` action (same pattern, status → `'REJECTED'`)

### 2.2 `CAADetail.vue` — REBUILD
Replace the "Coming Soon" stub with a full detail view:
- [ ] Show all fields: CAA Number, Department, Container ID, Location, Date, Time Window, Purpose
- [ ] Show current status with color badge
- [ ] Show approval/rejection metadata if status is `APPROVED` or `REJECTED`
- [ ] Show **Approve** and **Reject** buttons if:
  - Current user has role `MANAGER` or `ADMIN` or `SUPER_ADMIN`
  - Status is `SUBMITTED` or `PENDING`
- [ ] Reject button opens an `alertController` to capture rejection reason

### 2.3 `CAAList.vue` — Minor Fix
- [ ] Add loading skeleton and empty state
- [ ] Add segment filter: All / Pending / Approved

---

## 3. Finance — OpEx & Transfers

### Files Affected
| File | Action |
|------|--------|
| `src/features/operationalExpenses/pages/OpexDetail.vue` | Modify |
| `src/features/operationalExpenses/pages/CreateOpex.vue` | Minor polish |
| `src/features/fundTransfers/pages/TransferDetail.vue` | Modify |
| `src/features/fundTransfers/pages/LedgerView.vue` | Modify |

### 3.1 `OpexDetail.vue` — Add Approval Actions
- [ ] Show all expense fields: number, title, category, amount, date, description, submitted by
- [ ] Show current status badge
- [ ] Add **Approve / Reject** buttons visible only to Finance roles (`ACCOUNTANT`, `MANAGER`, `ADMIN`, `SUPER_ADMIN`):
  ```ts
  const canApprove = computed(() =>
    authStore.hasAnyRole(['ACCOUNTANT', 'MANAGER', 'ADMIN', 'SUPER_ADMIN'] as any)
    && expense.value?.status === 'SUBMITTED'
  )
  ```
- [ ] Wire Approve to `opexStore.approveExpense(id, userEmail)` (add this to the store)
- [ ] Wire Reject to `opexStore.rejectExpense(id, userEmail, reason)` with an alert dialog

### 3.2 `TransferDetail.vue` — Complete the View
- [ ] Show all fields: transfer number, date, from account, to account, amount, reference, notes, status
- [ ] Format amount with `formatCurrency()`
- [ ] Show who created it and when

### 3.3 `LedgerView.vue` — Running Balance
- [ ] Group transactions by account
- [ ] Show debit/credit columns with running balance
- [ ] Color debits red, credits green

---

## 4. HR Module

### Files Affected
| File | Action |
|------|--------|
| `src/features/hr/pages/EmployeeProfile.vue` | **REBUILD** (stub) |
| `src/features/hr/pages/CreateEmployee.vue` | **REBUILD** (stub) |
| `src/features/hr/pages/ClockInOut.vue` | Modify |
| `src/features/hr/pages/Attendance.vue` | Modify |
| `src/features/hr/pages/PayrollList.vue` | Modify |
| `src/features/hr/pages/PayslipDetail.vue` | **REBUILD** (stub) |
| `src/features/hr/store/hrStore.ts` | Add actions |

### 4.1 `CreateEmployee.vue` — REBUILD
Full form with:
- [ ] First Name, Last Name, Employee Number (auto-generate or manual)
- [ ] Position, Department (select from `departments` collection)
- [ ] Employment Type (FULL_TIME, PART_TIME, CONTRACT)
- [ ] Contract Start Date, Contract End Date (optional)
- [ ] Basic Salary
- [ ] Status (defaults to ACTIVE)
- [ ] Save calls `hrStore.createEmployee(formData)`

### 4.2 `EmployeeProfile.vue` — REBUILD
- [ ] Display all employee fields from above
- [ ] Show attendance summary (days clocked in this month)
- [ ] Show payroll history (last 3 payslips)
- [ ] Edit button (for MANAGER/ADMIN) to enable inline editing

### 4.3 `ClockInOut.vue` — Fix with Real Logic
- [ ] On mount, check if the current user's employee record has an open attendance session today
- [ ] Show **Clock In** button if not clocked in, **Clock Out** if they are
- [ ] Display elapsed time since clock-in
- [ ] Show today's summary: clock-in time, duration, status

### 4.4 `PayrollList.vue` — Full List
- [ ] Fetch from `payroll` collection filtered by current user's employee ID (for non-admin) or all (for MANAGER/ADMIN)
- [ ] Show: month/year, gross pay, net pay, status, date generated
- [ ] Each row navigates to `PayslipDetail`

### 4.5 `PayslipDetail.vue` — REBUILD
- [ ] Full payslip display matching the desktop version:
  - Employee name, ID, period
  - Earnings: Basic Salary, Allowances, Commissions
  - Deductions: Tax, Pension, other
  - Net Pay (large, prominent)
- [ ] Optional: Print/Export button (show a toast "Export coming soon" for now)

### 4.6 `hrStore.ts` — Add Missing Actions
- [ ] Add `createEmployee(data)` action that writes to `employees` collection
- [ ] Add `updateEmployee(id, data)` action
- [ ] Add `fetchPayslipById(id)` action

---

## 5. Router Additions

Add these routes to `src/router/index.ts` inside the `/tabs` children array:

```ts
// Job Cards — Edit
{
  path: 'jobs/edit/:id',
  component: () => import('@/features/jobCards/pages/EditJobCard.vue')
},
```

> **Note:** All other routes (CAA, OpEx, Transfers, HR) already exist in the router. No new routes needed for those modules.

---

## 6. Known Cross-Cutting Issues

| Issue | Fix |
|-------|-----|
| `getDoc` not imported in `jobCardsStore.ts` | Add `getDoc` to the `firebase/firestore` import line |
| CAA collection name mismatch (`containerAccess` vs `containerAccessRequests`) | Fix in `containerAccessStore.ts` |
| `isEditable` import conflict in `JobCardDetail.vue` | Remove import, rename computed to `canEdit` |
| Tabs navigation bug (3rd tab non-interactive) | ✅ Mitigated — programmatic `useIonRouter` navigation added for Inventory tab |
| `@ionic/vue-router` import removed | ✅ Fixed — reverted to `@ionic/vue-router` in `router/index.ts` |
| App initialization order | ✅ Fixed — `router` now registered before `IonicVue` in `main.ts` |

---

## Implementation Order

```
1. Fix jobCardsStore.ts (getDoc import, submitForApproval)
2. Fix JobCardDetail.vue (canEdit, Submit button, rejection dialog, timeline)
3. Create EditJobCard.vue
4. Polish JobCardsList.vue (empty state, loading)
5. Fix containerAccessStore.ts (collection name, generate number, approve/reject)
6. Rebuild CAADetail.vue
7. Build OpexDetail.vue approval actions
8. Complete TransferDetail.vue and LedgerView.vue
9. Rebuild CreateEmployee.vue
10. Rebuild EmployeeProfile.vue
11. Fix ClockInOut.vue
12. Fix PayrollList.vue and rebuild PayslipDetail.vue
13. Add router entry for EditJobCard
14. Full end-to-end test run
```
