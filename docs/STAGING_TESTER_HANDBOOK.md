# Staging tester handbook: lead to item release

Prepared for UAT on **`incaptta-pro-staging`** (`codex/staging-isolation`).  
This describes **what the app does today**, not the older architecture discussion in `docs/PROJECT_MANAGEMENT_ARCHITECTURE_HANDOVER.md`.

Audience: Chelsey and other staging testers.  
Scope: enquiry → customer → quotation → invoice stub → job card → stock reservation → PMO release → acknowledgement PDF.

---

## 1. Confirm you are on staging

| Check | Expected |
| --- | --- |
| Firebase project | `incaptta-pro-staging` |
| Git branch that feeds this app | `codex/staging-isolation` |
| After login, open `/api/health` | `"environment": "staging"`, `"firebaseProjectId": "incaptta-pro-staging"`, `"allowRealEmail": false` |

Ask the project owner for **STAGING_BASE_URL** if you were not given a link. It is a GitHub staging environment variable, not production.

**Do not use production.** The production App Hosting URL looks like `https://incaptta-projects--incaptta-pro.europe-west4.hosted.app`. If `/api/health` shows `incaptta-pro` or `"environment": "production"`, stop.

Staging does **not** send real email and does **not** run scheduled jobs.

---

## 2. Who logs in as whom

After a role grant, **sign out and sign back in** so the new token is used.

| Account | Staging roles | Typical use |
| --- | --- | --- |
| `chelsey@vectraops.co.zw` | ADMIN, ACCOUNTANT, MANAGER | Full happy-path UAT |
| `faraimufambisi@gmail.com` | ADMIN, ACCOUNTANT, MANAGER | Same as Chelsey |
| `adonismuzataet@gmail.com` | SUPER_ADMIN, ACCOUNTANT, MANAGER | Owner / unblocker |

ADMIN can open the **PMO portal**. There is no dedicated Property Manager Officer (STOREKEEPER) login unless one is assigned later. For this UAT, the same admin account can approve the job and then release stock.

---

## 3. How the system is supposed to run

```text
Lead
  → Convert to customer (recommended)
  → Quotation (from the lead, with customerId)
  → Submit → Approve (manager) → Mark sent → Accept
       → Draft job card (deterministic id)
       → Draft invoice stub (INV-DRAFT-…, not issued)
  → Finance Issues, then Sends the invoice (separate from the job)
  → Job: Submit for Approval → accountant job approval → manager job approval
  → Inventory lines: accountant (ACCT OK) → manager (MGR OK = reserve)
  → PMO portal: one Release stock for the whole job session
  → Acknowledge → one sealed PDF for that session
```

Acceptance, internal approval, invoice issuance, payment, and physical issue are **different events**. Job approval does **not** create an invoice and does **not** deduct on-hand stock.

---

## 4. Stage-by-stage operating guide

### 4.1 Capture a lead

**Menu:** CRM → **Leads** (`/crm/leads`)

1. Create a lead with a real contact name, phone or email, and a next action.
2. Keep it out of Won/Lost until the quote is accepted.

**Pass:** the lead appears on the board and can be opened.

### 4.2 Convert the lead to a customer

On the lead card, click **Convert to customer**. Review the mapped name, email, phone, and address, then confirm.

This links the lead (`identityStatus` / `customerId`). It does **not** set customer `status` to `CUSTOMER`. Customer status is **ACTIVE / INACTIVE / BLACKLISTED**. Using `CUSTOMER` as a status can block invoice issue.

**Pass:** **View customer** appears on the lead; CRM → Customers shows an ACTIVE customer.

### 4.3 Create the quotation

On the same lead, convert to a quotation (or CRM → **Quotations**). Materials should come from inventory so later PMO release can deduct stock.

1. Add one or more inventory lines with quantities (`qtyRequired`).
2. Save the draft.

Do **not** treat this as accepted yet.

**Pass:** a DRAFT quote exists, tied to the lead and `customerId`.

### 4.4 Internal quote review, then customer Accept

On CRM → **Quotations**, the row actions are:

| Button | When it shows | What it does |
| --- | --- | --- |
| **Submit** | Draft / changes required | Sends the quote to manager review (`PENDING_MANAGER`) |
| **Approve** | Pending manager | Manager approves the revision to send (`APPROVED_TO_SEND`) |
| **Mark sent** | Approved, not yet sent | Records that the customer was sent the quote (`SENT`) |
| **Accept** | Approved to send, or already SENT | Records customer acceptance |

**Accept** prompts for the **accepting person** (required). That is the only click that creates the linked **draft job** and **draft invoice stub**.

**Pass:** quote status Accepted; a draft job and an `INV-DRAFT-…` invoice exist. Toast similar to: *Accepted. Draft job and non-issuable invoice stub created.*

### 4.5 Issue the invoice (finance)

**Menu:** CRM → **Invoices** (`/crm/invoices`)

Accept creates a **DRAFT** stub only. It is not sent to the customer and may be held until billing terms allow issue (for example a deposit invoice).

1. Open the draft (`INV-DRAFT-…` for this quote).
2. Click **Issue** (status becomes ISSUED; due date comes from billing terms).
3. Click **Send** only after Issue (marks sent; staging still does not email).

Job-card approval does **not** issue this invoice.

**Pass:** invoice is ISSUED (and SENT if you tested send). Status is not still DRAFT.

### 4.6 Submit and approve the job card

**Menu:** **Job Cards** (`/job-cards`) — open the draft created by Accept.

**Job header (status):**

1. **Submit for Approval** (Draft → Submitted / accountant review).
2. Accountant (or ADMIN) approves the **job** when the header approval button is shown.
3. Manager (or ADMIN) approves the **job**. Badge shows **Approved** (`APPROVED_MANAGER`). Ready to Start / Start Work are optional for this UAT slice.

**Inventory & Requisitions tab (lines):**

This is separate from the job badge. Each stock line needs:

1. Accountant tick or **Approve All** → **ACCT OK**.
2. Manager tick or **Approve All (Manager)** → **MGR OK**.

Manager line approval **reserves** quantity. On-hand does not fall yet. Availability on the grid is informational; a shortage warning does not replace the manager stock check.

**Pass:** job Approved; every stock line you intend to release is **MGR OK**; PMO portal later shows those lines as reserved.

### 4.7 Req PDF (optional check)

On the approved job, **Req PDF** downloads the approved requisition. Quantity is `qtyRequired` (the grid Qty), not a blank/zero column. You can download again after a previous export.

**Pass:** PDF lists the same quantities as the requisition table.

### 4.8 PMO release (physical issue)

**Menu:** **PMO portal** (`/inventory/fulfilment`)

Rows are **grouped by job**, not released one SKU at a time.

1. Find the job block (job number, recipient, destination).
2. Confirm each line’s remaining qty (capped at required). Reduce a line only if stock is short; you cannot type more than remaining required.
3. Click **Release stock** once. Every remaining required line on that job is issued in **one session**.
4. On-hand and reservation both reduce. There is **no Cancel reservation**.
5. Click **Acknowledge**. The browser downloads **one** sealed acknowledgement PDF listing all items in the session.
6. **Download acknowledgement** appears only if that PDF failed. After a successful generate it disappears and the completed job leaves the queue.

You cannot release the same required quantity again. A second full release is rejected.

**Pass:** stock on-hand dropped by the issued qty; one PDF lists every item; job gone from the PMO queue after acknowledge + PDF.

---

## 5. What you should never do in this UAT

| Don’t | Why |
| --- | --- |
| Test on production / `incaptta-pro` | This handover is staging-only |
| Set customer status to `CUSTOMER` | Status is ACTIVE/INACTIVE/BLACKLISTED; that value can block invoice issue |
| Use job **Create job** or a quote status dropdown **Accepted** instead of **Accept** | Those paths do not create the linked `INV-DRAFT-…` stub |
| Expect the draft invoice to appear before Accept | Invoice stub is created on Accept only |
| Expect job approval to issue an invoice or deduct stock | Issue is finance; deduct is PMO release |
| Cancel a reservation in the PMO portal | PMO cannot cancel |
| Release each item with a separate session on purpose | One job = one release session |
| Expect email, reminders, or cron on staging | `ALLOW_REAL_EMAIL` and scheduled jobs are off |

---

## 6. UAT checklist

Copy one row per trial. Fill IDs from the screens.

| Stage | Pass? | ID / evidence |
| --- | --- | --- |
| Health is `incaptta-pro-staging` | | `/api/health` JSON |
| Lead created | | Lead name |
| Converted to ACTIVE customer | | Customer id |
| Quote submitted, approved, marked sent | | Quote number |
| Quote **Accept** | | Accepting person |
| Draft job exists | | Job number |
| Draft invoice stub exists | | `INV-DRAFT-…` |
| Invoice Issued (then Sent) | | Invoice status |
| Job submitted + header approved | | Job badge Approved |
| Lines ACCT OK then MGR OK | | Item names |
| Req PDF quantities match grid | | Filename |
| PMO session release | | Session / dispatch id |
| Acknowledge PDF lists all items | | Filename |
| Job gone from PMO queue | | — |

---

## 7. If something fails

- **Missing permissions:** sign out and back in. ADMIN/ACCOUNTANT/MANAGER is required for job approvals; PMO portal also allows STOREKEEPER.
- **No draft invoice:** the quote was not **Accept**ed. Check Quotations, not only Job Cards.
- **Item not found in sections:** a line had no id; tell the owner (this was fixed on staging isolation — use a quote built after that fix).
- **PMO empty:** lines are not manager-approved / not reserved yet.
- **Release rejected:** remaining required is already zero, or typed qty exceeds remaining/reservation/on-hand.
- **Still on the PMO queue after acknowledge:** PDF generate failed; use **Download acknowledgement** once.

Record the quote number, job number, and the exact error toast. Do not retry the same flow on production.
