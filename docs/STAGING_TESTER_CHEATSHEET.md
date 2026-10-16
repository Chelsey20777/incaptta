# Staging tester cheat-sheet

Full steps: [STAGING_TESTER_HANDBOOK.md](./STAGING_TESTER_HANDBOOK.md)

## Where

- **Only** Firebase project `incaptta-pro-staging` (branch `codex/staging-isolation`).
- Confirm: open `/api/health` → `"firebaseProjectId": "incaptta-pro-staging"`, `"environment": "staging"`.
- Ask the owner for **STAGING_BASE_URL** if you do not have the link.
- **Stop** if health shows `incaptta-pro` or production. Do not use `https://incaptta-projects--incaptta-pro.europe-west4.hosted.app`.

Real email and scheduled jobs are **off**. After a role grant, **sign out and sign back in**.

## Accounts (already granted)

| Email | Roles |
| --- | --- |
| `chelsey@vectraops.co.zw` | ADMIN, ACCOUNTANT, MANAGER |
| `faraimufambisi@gmail.com` | ADMIN, ACCOUNTANT, MANAGER |
| `adonismuzataet@gmail.com` | SUPER_ADMIN, ACCOUNTANT, MANAGER |

ADMIN can use the PMO portal. No dedicated PMO (STOREKEEPER) login is required for this UAT.

## Happy path (clicks)

1. CRM → **Leads** — create lead → **Convert to customer** (customer status stays **ACTIVE**, never `CUSTOMER`).
2. Convert lead → **Quotation** — add inventory lines → save.
3. Quotations: **Submit** → **Approve** → **Mark sent** → **Accept** (type the accepting person).
4. CRM → **Invoices** — find `INV-DRAFT-…` → **Issue** → **Send**.
5. **Job Cards** — open the draft from Accept → **Submit for Approval** → approve the job (accountant, then manager) until badge **Approved**.
6. **Inventory & Requisitions** — accountant **ACCT OK**, then manager **MGR OK** (this **reserves** stock; it does not deduct on-hand).
7. Optional: **Req PDF** — quantities must match the grid.
8. **PMO portal** (`/inventory/fulfilment`) — one **Release stock** for the **whole job** → **Acknowledge** → one PDF. No cancel. No second full release. Download hides after the PDF succeeds.

## Do / don’t

| Do | Don’t |
| --- | --- |
| Use **Accept** on the quotation | Use Create job / status dropdown Accepted and expect an invoice |
| Issue the invoice in CRM → Invoices | Expect job approval to create or issue the invoice |
| Release the job as one PMO session | Cancel reservation or release the same qty twice |
| Treat the acknowledgement PDF as a receipt | Treat it as an invoice (no prices) |
| Test on staging only | Touch production |
