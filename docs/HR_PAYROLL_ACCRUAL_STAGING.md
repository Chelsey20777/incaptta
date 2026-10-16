# HR Payroll Accrual and Salary Arrears — Staging Only

## Purpose and boundary

Recognise earned payroll in its earning month, carry unpaid wages as liabilities, and record payments as settlements. Target only Firebase project `incaptta-pro-staging` and branch `codex/staging-isolation`. Follow `project-management-next/DEPLOYMENT.md`. Production `incaptta-pro`, database clearing, and business-chapter archiving are excluded.

Server payroll operations require both staging configuration and the initialized Firebase application's staging project identity. Client staging UI is gated by the same deployment/project pair. No production promotion is authorised by this document.

## Accounting and workflow

1. An accountant publishes an immutable, effective-dated statutory policy with currency, source/review reference, NSSA employee/employer rates and cap, PAYE bands, AIDS rate, and employer ZIMDEF/WCIF rates. No unverified rates are seeded. A new policy is a new record; historical payroll retains its policy snapshot.
2. Prepare employee/month payroll using basic salary, manual allowances, approved source earnings, recoveries, due date and policy. Available cash does not restrict preparation or recognition. Draft advance instalments reserve the advance balance.
3. A manager approves and recognises the reviewed revision at or after earning-month end. The journal debits gross salary expense and employer contribution expense; credits net salaries payable, statutory payables and recoveries. Recognition recovers salary advances once as a noncash offset and releases the reservation. Payment never repeats that recovery.
4. Record real cash payments with amount, actual date, currency, account, reference and evidence link or signed receipt reference. Employee settlements allocate oldest arrears first within one employee/currency. Each allocation is retained. Statutory remittances settle a specified authority and payroll record. Partial payments are supported; overpayment is rejected.
5. Payment status is derived from net entitlement and settlements. Salaries Account funding is a cash asset, independent of employee and statutory liabilities. New settlement entries in the cashbook are excluded from fresh payroll expense.
6. Unpaid, unadjusted recognition can be reversed with a reason, preserving the original journal and restoring advance reservations. Corrected payroll is reviewed again. Recognised basic salary/manual allowances can also be changed through signed delta journals, including after partial payment, provided revised liabilities do not fall below settlements. Settled payroll cannot be deleted or reversed. Changes to advance recovery, statutory policy, or source earnings after recognition require separate review; the earnings adjustment does not silently rewrite them.

### Source earnings

Job staff rates and MBDI claims carry an explicit `earningPeriod` (`YYYY-MM`). Approval date is separate. Source records are verified on the server and postings are deduplicated by source. A late earning targeting an already recognised or legacy month creates a separate supplement in that same earning month, never rolls into a later month. Supplements must be prepared and recognised. Existing ambiguous source periods remain reconciliation exceptions.

Supplements share the employee's monthly tax bands and contribution cap with already recognised payroll, using the same policy. Preparing or recognising alongside unreconciled legacy payroll is blocked. Approval of new staff rates requires the earning month; locked historical sources are not assigned a guessed period.

### Currency boundary

Recognition and arrears totals are kept separately by currency. Existing liquid accounts support USD payroll settlement; IRD is not treated as a USD funding source. Unsupported settlement currencies are rejected rather than converted implicitly. Consolidated existing financial reports remain USD; use the payroll report for currency-specific totals. Extending cash accounts to other currencies is a separate treasury change.

## Interfaces and records

Authenticated `GET /api/hr/payroll?from=YYYY-MM-DD&asOf=YYYY-MM-DD` returns payroll, policies, immutable journals, payment allocations, historical payroll totals and reconciliation exceptions. Active finance/management roles only.

Authenticated `POST /api/hr/payroll` accepts commands:

- `policy`: accountant-reviewed statutory configuration.
- `draft`: employee, earning period, optional existing payroll ID, earnings, recoveries, policy ID and salary due date.
- `recognize`: payroll ID and expected revision; manager required.
- `earning`: verified job/MBDI source and line identifiers; manager required.
- `pay`: stable request ID, employee, currency, amount, actual payment date, funding account, reference, evidence and employee/statutory allocation type; accountant required.
- `reverse`: payroll ID and correction reason; manager required.
- `adjust`: stable request ID, expected revision, corrected basic/manual earnings and reason; manager required.

New collections: `payrollPolicies`, `payrollJournal`, `payrollPayments`, `payrollPaymentRequests`. Payroll version 2 adds recognition, currency, earning date, due date, policy snapshot, revision, paid/outstanding balances and statutory balances. Journals/payments are server-authoritative. Request fingerprints reject reuse of a payment or adjustment key for different details. Firestore transactions serialize concurrent payroll settlements and use the existing account posting guard.

## Reports, evidence and reconciliation

- P&L/monthly payroll expense comes from earning-period journals. Settlements do not create a second expense. Staging monthly staff-rate costs are included through payroll recognition, while job detail retains its costing view.
- Current balance sheet includes net employee and statutory payables. Statutory remittances reduce the latter.
- The HR arrears report supports an as-at date and opening/current-period/closing reconciliation by currency. Original payroll month remains visible on payments and payslips.
- Existing general balance-sheet assets do not have complete historical snapshots; the new as-at functionality applies to payroll balances, not a claim of historical reconstruction for every business asset.
- Payslips show entitlement, paid amount, outstanding balance and employer costs, and explicitly state that they are not payment evidence.
- Evidence references are retained with settlements. They must identify a retained bank proof or signed receipt; entering a reference does not validate the underlying document.
- Missing monthly payroll, unrecognised drafts, legacy records, orphan references, ambiguous payment dates and balance discrepancies are surfaced for review.

Before any future historical conversion, run the read-only audit:

```sh
node project-management-next/scripts/reconcile-payroll-accrual.mjs --project incaptta-pro-staging --output /tmp/payroll-accrual-staging-reconciliation.json
```

The audit rejects production projects/credentials and `--apply`. It preserves document IDs and evidence in a restricted local report. No automatic historical migration is supplied: ambiguous old records must be reconciled before a separately reviewed conversion. Existing payroll is not silently recognised again.

## Acceptance and release

- September $1,000 recognition creates September expense/payable with no cash change.
- October $600 + $400 payments reduce the September liability to $400 then zero without new salary expense. October payroll is independent.
- Insufficient cash blocks settlement, not recognition.
- Late approval retains service month; recognised months receive supplements.
- Employee deductions, employer contributions, advance recoveries and statutory settlements reconcile separately.
- Same-key retries return the original result; changed payloads and concurrent overpayments are rejected.
- Direct client edits cannot change recognised payroll, journals or settlement records.
- Reversals and adjustments retain attributable evidence and balanced journals.
- Historical payroll totals use earning dates and actual payment dates, including year boundaries.
- Deploy only an explicitly selected staging commit; check staging health and run UAT with accountant and manager roles. Production remains excluded.

## Validation record

The read-only staging audit on 3 October 2026 found 87 legacy payroll records: 68 marked Paid and 19 Unpaid. There were no duplicate employee/month records and no orphan payroll references in the collections inspected. Sixty salary expense records lack an explicit payment date/processed timestamp and require evidence review before historical conversion. No records were migrated or deleted. The full audit contains private payroll data and is stored locally with restricted permissions, not committed.

Local checks include `test:payroll-accrual` (calculation and workflow scenarios), `test:payroll-rules` (Firestore emulator access checks), and `test:payroll-transactions` (real concurrent Firestore emulator transactions). Emulator scripts require `FIRESTORE_EMULATOR_HOST=127.0.0.1:<port>` and refuse remote hosts. The transaction suite uses a separate emulator-only database named `payroll-tests`.

For a Firebase CLI login instead of application default credentials, append `--firebase-cli` to the read-only audit command. Authentication tokens are used in memory and never included in the report.
