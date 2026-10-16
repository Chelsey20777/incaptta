# IncapttaPro — Client Credit Accounts
**Version:** 1.0  
**Date:** March 2026  
**Project:** IncapttaPro (Incaptta Client)  
**Author:** Techcess Technology  
**Status:** Ready for Development

---

## Table of Contents

1. [Overview](#overview)
2. [Business Rules](#business-rules)
3. [Financial Model](#financial-model)
4. [System Architecture](#system-architecture)
5. [Firestore Collections](#firestore-collections)
6. [Feature Specifications](#feature-specifications)
7. [Integration Points](#integration-points)
8. [Phase Build Plan](#phase-build-plan)
9. [End-to-End Test](#end-to-end-test)

---

## Overview

The Client Credit Account system allows Incaptta to accept client deposits upfront and hold them as credit against that client's account. When a job card invoice is processed, available credit is automatically applied first — reducing what the client owes. The remaining balance (if any) is then collected via normal payment methods.

### What This Solves

- Clients can make advance deposits before work begins
- Deposits are held as a virtual credit balance per client
- Credit auto-applies to invoices — no manual tracking
- Full audit trail of every deposit and application
- Real company accounts (Bank/EcoCash/Cash) are credited on deposit

---

## Business Rules

These rules are fixed and enforced at the transaction level:

| Rule | Behaviour |
|---|---|
| **Balance floor** | Credit balance can NEVER go below $0.00 — hard block |
| **No overdraft** | Cannot apply more credit than the client has deposited |
| **Single method** | One deposit = one payment method (Bank, EcoCash, or Cash) |
| **Non-refundable** | Credit cannot be refunded back to the client |
| **Auto-apply** | Full credit balance applied automatically before collecting remainder |
| **Atomic writes** | All balance updates use Firestore `runTransaction` — no race conditions |

---

## Financial Model

### What Happens on Deposit

```
Client pays $500 deposit via Bank
        ↓
TWO simultaneous writes (inside runTransaction):

  1. clientCreditAccounts/{clientId}
       balance: 0 → 500            ← virtual liability
       totalDeposited: 0 → 500

  2. clientCreditTransactions/{newId}
       type: 'DEPOSIT'
       amount: 500
       paymentMethod: 'BANK'
       balanceBefore: 0
       balanceAfter: 500

  3. Finance module (jobPayments / income collection)
       Records $500 income against BANK account
       Company BANK balance increases by $500
```

### What Happens on Invoice Payment

```
Job card invoice total: $85.68
Client credit balance:  $100.00
        ↓
applyCredit() runs automatically:
  creditApplied = min(100.00, 85.68) = $85.68
  remainingDue  = 85.68 - 85.68      = $0.00
        ↓
TWO simultaneous writes (inside runTransaction):

  1. clientCreditAccounts/{clientId}
       balance: 100.00 → 14.32
       totalApplied: 0 → 85.68

  2. clientCreditTransactions/{newId}
       type: 'APPLIED'
       amount: 85.68
       balanceBefore: 100.00
       balanceAfter: 14.32
       jobCardId: linked
       jobCardNumber: JC-2026-0200

Invoice: PAID (fully covered by credit)
Remaining to collect from client: $0.00
```

### Partial Credit Scenario

```
Job card invoice total: $500.00
Client credit balance:  $100.00
        ↓
creditApplied = min(100.00, 500.00) = $100.00
remainingDue  = 500.00 - 100.00     = $400.00
        ↓
Client pays $400.00 via normal payment method
Invoice: PAID
```

---

## System Architecture

### Where It Lives in the UI

The credit feature integrates into the **existing Customer Account Statement page** at `/crm/customers/{id}` — no new top-level page needed.

```
/crm/customers/{id}  ← EXISTING PAGE
│
├── Tiles Row (existing + new)
│     Total Invoiced    Total Paid    Outstanding
│     + Credit Balance ← NEW (green, shows $X.XX)
│                         + Add Deposit button
│
└── Tabs (existing + new)
      Account Statement   Job Cards   CRM Invoices
      + Credit Account ← NEW
            Stats: Total Deposited | Total Applied | Balance
            Transaction table: DEPOSIT / APPLIED history
```

### Data Flow

```
AddDepositSheet (new component)
        ↓
crmStore.recordDeposit()         ← credits virtual account
        +
financeStore.recordIncome()      ← credits real account
        ↓
clientCreditAccounts (Firestore)
clientCreditTransactions (Firestore)
jobPayments (existing Firestore collection)
        ↓
Customer page Credit Account tab ← shows history
        ↓
Job card payment modal
        ↓
crmStore.applyCredit()           ← auto-applies on payment
        ↓
Invoice marked PAID (or partially paid)
```

---

## Firestore Collections

### `clientCreditAccounts/{clientId}`

One document per client. Document ID = clientId for fast lookup.

```typescript
{
  clientId: string
  clientName: string           // denormalized
  balance: number              // current balance — NEVER < 0
  currency: 'USD' | 'ZWL' | 'ZAR'
  totalDeposited: number       // lifetime deposits
  totalApplied: number         // lifetime applied to invoices
  createdAt: Timestamp         // serverTimestamp()
  updatedAt: Timestamp         // serverTimestamp()
}
```

### `clientCreditTransactions/{id}`

Immutable ledger — every balance change is recorded here.

```typescript
{
  clientId: string
  clientName: string           // denormalized
  type: 'DEPOSIT' | 'APPLIED' | 'ADJUSTMENT'
  amount: number               // always positive
  balanceBefore: number        // balance before this transaction
  balanceAfter: number         // balance after this transaction
  paymentMethod?: 'BANK' | 'ECOCASH' | 'CASH'  // DEPOSIT only
  jobCardId?: string           // APPLIED only
  jobCardNumber?: string       // denormalized — APPLIED only
  invoiceAmount?: number       // original invoice total — APPLIED only
  reference: string            // receipt/transaction ref number
  notes: string
  createdBy: string            // uid
  createdByName: string        // denormalized
  createdAt: Timestamp         // serverTimestamp()
}
```

### Key Design Decisions

| Decision | Choice | Reason |
|---|---|---|
| Document ID = clientId | Yes for `clientCreditAccounts` | Fast `getDoc` without query |
| `runTransaction` for all writes | Mandatory | Prevents race conditions on balance |
| Immutable ledger | Yes — no updates to transaction docs | Full audit trail |
| `Math.min()` in applyCredit | Enforces hard $0 floor | Never goes negative |
| Separate from `jobPayments` | Yes | Different purpose — liability vs income |

---

## Feature Specifications

### Credit Balance Tile (Customer Page)

- Displays current credit balance in green when > 0
- Shows $0.00 in muted color when empty
- "**+ Add Deposit**" button — visible to ACCOUNTANT | ADMIN | SUPER_ADMIN only
- Updates reactively after deposit is recorded

### AddDepositSheet Component

Slide-over Sheet (opens from right, customer page stays visible).

**Fields:**
- Amount * (number, min $0.01, large display)
- Payment Method * (Bank | EcoCash | Cash)
- Reference * (receipt/transaction number)
- Currency (USD | ZWL | ZAR, default USD)
- Notes (optional)

**Balance Preview** (reactive):
```
Current balance:   $100.00
Deposit amount:  +  $50.00
────────────────────────────
New balance:       $150.00
```

**On Submit:**
1. Validates all required fields
2. Calls `crmStore.recordDeposit()` — credits virtual account
3. Calls `financeStore.recordIncome()` — credits real account
4. Both calls are required — one without the other is wrong
5. Toast success with new balance confirmation

**Role gate:** ACCOUNTANT | ADMIN | SUPER_ADMIN

### Credit Account Tab (Customer Page)

**Stats row:**
```
Total Deposited: $X,XXX.XX    Total Applied: $X,XXX.XX    Balance: $X,XXX.XX
```

**Transaction table columns:**

| Column | Detail |
|---|---|
| Date | Formatted (date-fns) |
| Type | Badge: DEPOSIT=green, APPLIED=blue, ADJUSTMENT=amber |
| Amount | DEPOSIT: green "+$X.XX" / APPLIED: red "−$X.XX" |
| Balance | Running balance after each transaction |
| Reference | Monospace, small |
| Details | APPLIED: link to job card / DEPOSIT: payment method badge |
| Notes | Muted, small |

### Credit Applied Panel (Job Card Payment Modal)

Shown automatically when client has available credit:

```
┌─────────────────────────────────────────────┐
│ 💳 Credit Available                         │
│ Client credit balance         $100.00       │
│ Will be applied automatically  −$85.68      │
│ ─────────────────────────────────────────── │
│ Remaining to collect            $0.00       │
└─────────────────────────────────────────────┘
```

- Panel hidden when no credit available
- Updates reactively as invoice total changes
- No user action needed — credit auto-applies on confirm

### Auto-Apply Logic (Job Card Payment)

```typescript
// Runs BEFORE recording payment
const result = await crmStore.applyCredit({
  clientId,
  jobCardId,
  invoiceAmount: totalDue
})

// result.creditApplied = amount deducted from credit
// result.remainingDue  = what client still owes in cash

if (result.remainingDue === 0) {
  // Invoice fully paid by credit — mark paid, no cash collected
} else {
  // Collect result.remainingDue via normal payment method
}
```

---

## Integration Points

### Finance Module

| Integration | How |
|---|---|
| Deposit records income | `financeStore.recordIncome()` — same as jobPayments |
| Account balance credited | BANK/ECOCASH/CASH balance increases on deposit |
| No double-counting | Credit account is liability — not income until applied |
| Applied credit | No finance entry on application — already recorded on deposit |

### CRM Module

| Integration | How |
|---|---|
| Client lookup | Uses existing customer/client records |
| Account page | Credit tab added to existing `/crm/customers/{id}` |
| No new routes | Everything lives on existing customer page |

### Job Card Module

| Integration | How |
|---|---|
| Payment modal | Credit panel added to existing payment flow |
| Auto-apply | `applyCredit()` called before `recordPayment()` |
| Invoice marked paid | Existing logic unchanged — just amount changes |
| Credit transaction | Links back to job card via `jobCardId` |

---

## Roles & Access Control

| Action | SUPER_ADMIN | ADMIN | ACCOUNTANT | MANAGER | SALES |
|---|---|---|---|---|---|
| View credit balance | ✓ | ✓ | ✓ | ✓ | — |
| Record deposit | ✓ | ✓ | ✓ | — | — |
| Apply credit to invoice | ✓ | ✓ | ✓ | — | — |
| View transaction history | ✓ | ✓ | ✓ | ✓ | — |
| Manual adjustment | ✓ | ✓ | — | — | — |

---

## Phase Build Plan

| Phase | What Gets Built | Key Files |
|---|---|---|
| **CA-1** | Types + Store | CRM types file, CRM store |
| **CA-2** | AddDepositSheet component | `src/features/crm/components/AddDepositSheet.vue` |
| **CA-3** | Credit tile + Credit Account tab on customer page | Customer detail view |
| **CA-4** | Auto-apply credit in job card payment flow | Job card payment modal/handler |

### Fire Order

```
CA-1 → confirm types compile, store functions exist,
       runTransaction used for all balance writes,
       applyCredit() uses Math.min — hard block at $0

CA-2 → confirm deposit sheet opens,
       recordDeposit() credits virtual account,
       financeStore credits real account,
       BOTH calls fire — not just one,
       balance preview reactive

CA-3 → confirm credit tile on customer page,
       Credit Account tab shows transaction history,
       green "+$X.XX" for deposits,
       red "−$X.XX" for applied,
       running balance column correct

CA-4 → end-to-end test (see below)
```

---

## End-to-End Test

Run this sequence after all 4 phases are built:

```
Step 1 — Record deposit
  Customer: Africa University Pan Feeders
  Amount: $100.00
  Method: Bank
  Reference: TXN-001

  Expected:
  → clientCreditAccounts/{id}.balance = 100.00
  → clientCreditTransactions: DEPOSIT entry
  → Finance BANK balance increased by $100.00
  → Credit tile on customer page shows $100.00 (green)

Step 2 — Open job card for Africa University
  Invoice total: $85.68

  Expected in payment modal:
  → Credit panel shows:
    Credit available:      $100.00
    Will be applied:        −$85.68
    Remaining to collect:    $0.00

Step 3 — Confirm payment

  Expected:
  → clientCreditAccounts/{id}.balance = $14.32
  → clientCreditTransactions: APPLIED entry
      amount: 85.68
      balanceBefore: 100.00
      balanceAfter: 14.32
      jobCardId: linked
  → Invoice: PAID
  → Company BANK balance: unchanged (credit covered it)
  → Credit tab on customer page shows both transactions

Step 4 — Open another job card (invoice $200.00)

  Expected in payment modal:
  → Credit panel shows:
    Credit available:       $14.32
    Will be applied:        −$14.32
    Remaining to collect:  $185.68
  → After payment: client pays $185.68 via cash/bank
  → Credit balance: $0.00
  → Cannot go below $0.00
```

---

## TypeScript Types Reference

```typescript
type CreditTransactionType = 'DEPOSIT' | 'APPLIED' | 'ADJUSTMENT'

type CreditPaymentMethod = 'BANK' | 'ECOCASH' | 'CASH'

interface ClientCreditAccount {
  id: string
  clientId: string
  clientName: string
  balance: number              // NEVER < 0
  currency: 'USD' | 'ZWL' | 'ZAR'
  totalDeposited: number
  totalApplied: number
  createdAt: any               // Firestore Timestamp
  updatedAt: any               // Firestore Timestamp
}

interface ClientCreditTransaction {
  id: string
  clientId: string
  clientName: string
  type: CreditTransactionType
  amount: number               // always positive
  balanceBefore: number
  balanceAfter: number
  paymentMethod?: CreditPaymentMethod   // DEPOSIT only
  jobCardId?: string | null             // APPLIED only
  jobCardNumber?: string | null         // APPLIED only
  invoiceAmount?: number                // APPLIED only
  reference: string
  notes: string
  createdBy: string
  createdByName: string
  createdAt: any               // Firestore Timestamp
}
```

---

*Document maintained by Techcess Technology. Update after each completed phase.*
