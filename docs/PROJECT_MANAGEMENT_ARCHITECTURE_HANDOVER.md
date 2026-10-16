# Incaptta project-management architecture handover

Prepared: 26 September 2026  
Audience: Cursor implementation agent, project owner, operational reviewers  
Status: agreed architecture direction with explicitly identified outstanding decisions

## 1. Purpose and implementation boundary

Improve the connected customer-to-delivery workflow: enquiries, customer records, quotations, billing, job cards and inventory fulfilment. Preserve IRD/TWID commercial distinctions and existing transaction history.

This document consolidates the planning discussion. It is not evidence that features have been implemented or that live data has been reconciled. Repository inspection and isolated stock-posting checks informed the findings below. Live staging health, production data accuracy and deployed-rule parity were not verified.

### Mandatory staging-first boundary

- Use the existing staging environment; do not create a replacement merely because this plan describes isolation requirements.
- Target Firebase project `incaptta-pro-staging` on branch `codex/staging-isolation`.
- Production project is `incaptta-pro`. Do not merge to `main`, deploy production, or promote releases without an explicit subsequent request.
- Read `project-management-next/DEPLOYMENT.md` before deployment. Use explicit project targeting for every Firebase command: the root Firebase default points to production.
- `project-management-next/apphosting.staging.yaml` contains staging overrides. `apphosting.yaml` is the production default.
- Staging configuration points to separate Firebase Auth, Firestore, Storage and Functions resources and staging secrets. It sets real email and scheduled jobs off. Verify deployed enforcement, rather than assuming configuration alone proves isolation.
- Existing workflows: `.github/workflows/staging-release.yml`, `.github/workflows/staging-backend.yml`, and `.github/workflows/production-release.yml`.
- Local deployment-isolation tests passed during discovery. Firebase backend discovery failed and GitHub was unreachable; neither establishes that staging is unavailable.

### Preserve the current workspace

The checkout already contains many modified and untracked files, including deployment, inventory, Firestore rules and expense-approval work. Inspect `git status` and relevant diffs before editing. Do not revert, overwrite or bundle unrelated changes indiscriminately. Some findings refer to uncommitted code and must be revalidated against the implementation checkout.

Read applicable `AGENTS.md` files. The Next.js project explicitly requires consulting its installed Next.js documentation before implementation because this version may differ from familiar APIs.

## 2. Decision status and delivery principles

**Agreed** means explicitly accepted during the discussion. **Recommended implementation detail** means a proposed means of delivering that agreement, not an independently approved business policy. **Open** means obtain a decision before implementing dependent behaviour.

Agreed principles:

1. Receiver ownership and mandatory next actions make every open enquiry accountable.
2. Customer acceptance, internal approval, invoice issuance, payment and work authorisation are different events.
3. Accepted quotation revisions establish the commercial baseline.
4. IRD charges TWID its materials selling price. TWID markup and services charges are optional.
5. Manager quotation approval is initially required for every quotation.
6. Job approval does not itself approve individual expenses, establish customer acceptance or issue invoices.
7. Manager material approval authorises fulfilment; physical store dispatch deducts inventory.
8. Preserve histories and posted transactions; corrections must be attributable.
9. Implement and validate on staging before any separately authorised production promotion.

Do not expand this into a wholesale rewrite of HR, poultry, MBDI, chat, equipment hire or other modules. Review their integration dependencies where relevant, but their redesign has not been specified.

## 3. Current-state findings to revalidate

### Leads and customers

- Leads have New, Contacted, Qualified, Proposal, Negotiation, Won and Lost stages.
- Assignment is optional free text. Manual capture does not populate `createdBy` even though the type includes it.
- Notes are a mutable text field; structured lead activities and mandatory next-action tracking are absent from the inspected lead flow.
- Company and contact names are required; a response method is not. Channel choices do not separately represent WhatsApp, Facebook and email.
- CRM database access is broad within permitted roles, but is not available to every role. Permitted users can write/delete any lead. UI module permissions and Firestore role rules differ.
- Automatic synchronisation matches email or contact name and selects the first match. Journey links also use customer-name/email fallbacks.
- Opening a quotation can advance Proposal before saving. Quotation saves trigger Negotiation. Customer creation can reset a matched non-Won lead to New.
- Manual priorities use uppercase values; automatic creation uses title case. Filtering can disagree.
- “Won Revenue” is a sum of lead values, not verified receipts. The displayed win-rate denominator includes open leads.

### Quotations, invoices and jobs

- Quote materials are grouped into requisition sections and can be populated from BOM templates.
- Inventory selection uses `sellingPrice` for `irdSellingPrice`. The summary label “IRD Cost” is not the underlying inventory purchase cost.
- Other services are quantity × unit price, without a separate delivery-cost estimate in the inspected quote model.
- Current quote statuses are Draft, Sent, Accepted and Rejected; they do not separately represent internal approval.
- One job manager-approval path creates an invoice marked Sent with a 30-day due date, marks the quotation Accepted and synchronises the lead to Won.
- Current job path is Draft → Submitted → Pending Accountant → Approved Accountant → Pending Manager → Manager Approved (displayed as In Progress) → Closed.
- Accountant approval and the move to Pending Manager are separate writes. Financial closure and the status transition are also separate writes.
- Rejected, Cancelled and Completed exist in the UI, but their transitions are not consistently permitted by checked-in Firestore rules. Admin accountant-stage permissions also differ between client and rules.
- Same-status updates permit broad changes to job content without renewed approval.
- Submission accepts blanks/defaults such as “N/A” without enforcing the proposed preparation checklist.
- Closure can proceed from In Progress without mandatory handover/completion evidence in the inspected path.

### Inventory: verified behaviour and defects

The current server posting function atomically changes `inventoryItems.onHand`, creates a stock-ledger entry and marks the job line posted. Manager approval requires prior accountant line approval and sufficient stock. The inventory master reads the same `onHand` field.

Isolated checks ran the actual function with an in-memory transaction substitute; these were not Firestore-emulator, concurrency or live reconciliation tests:

- Issue 4 from 10 → on-hand 6.
- Retry that unchanged issue → on-hand remains 6.
- Request 4 from 3 → rejected, on-hand remains 3.
- Issue 4 from 6, then retry → retry incorrectly reports insufficient stock, although the original posting succeeded. Availability is checked before returning the existing movement.
- Return 50 without a recorded issue → balance increases from 10 to 60. The function does not enforce cumulative returns against original issues.
- Issue 4, change the stored line quantity to 5 and retry → stock/ledger remain at a deduction of 4 while the line shows 5. Existing movement payload consistency is not checked.
- Bulk approval posts one line per transaction and can partially succeed; this must be clearly presented.
- Current posting occurs at manager approval, not confirmed physical dispatch.

### Other job costs: discovery, not a completed redesign

- Ad hoc expenses below $200 currently have an accountant-only completion path. Larger expenses require manager approval. Approval is tied to OPEX/account posting.
- Legacy subcontract lines record charges and may also record OPEX/payments depending on selected payment method. Linked subcontract contracts use a separate path.
- Some financial calculations treat linked subcontract contract value and approved payments differently.
- Reserve-funded job commissions post a payment at final approval; a separate commissions module also exists. Reconciliation is needed; duplicate payment has not been demonstrated.
- Staff job-rate approval has a payroll-posting path.
- The financial engine treats some missing approval statuses as approved and uses different calculation bases across metrics. The job page overrides some engine totals using linked commercial values.

Do not claim these findings quantify losses or prove live balances are wrong.

## 4. Agreed lead and customer architecture

### Ownership

- Automatically assign the authenticated receiving/capturing staff member as initial owner.
- Preserve original receiver separately from current owner.
- Other authorised staff may contribute activities; one owner remains accountable.
- Owner-requested handover selects a new owner and requires a reason. Ownership changes only after recipient acceptance.
- Managers can reassign directly with a reason.
- While a handover is pending, the current owner retains responsibility. Handover preserves deadlines and history.
- Record initiator, previous/new owners, acceptance or manager action, and timestamps.
- Existing ambiguous assignee strings require review, not speculative identity matching.

### Quick capture and customer identity

Required: contact name, individual/business type, at least one response method, channel, requirement summary, next action and due date/time. Company is optional for individuals.

Channels: WhatsApp, Facebook, email, phone, website, walk-in and other. Record capture time automatically and received time separately; received time may be earlier for delayed entry.

Create or link a customer/contact record during capture. Newly created identities are prospective. Show possible matches for staff review; never merge solely on a matching name or address. Staff can add an interaction to an existing enquiry or open another enquiry for a different requirement.

Support several named contacts for a business. Keep customer identity separate from opportunity-specific scope, site, owner, documents and outcomes. Returning customers retain customer status. A prospect becomes a customer at the first accepted sale.

Collect detailed requirements during qualification and confirm billing details before formal documents are issued. Automatic WhatsApp/Facebook/email importing is not in the agreed initial scope.

### Activities and follow-ups

- Every open enquiry has a current next action, due date/time and owner.
- Record interactions individually: author, time, channel, summary and outcome.
- Completing the current action requires another action or a recorded closure outcome.
- Keep expected sales close date separate from follow-up deadline.
- Rescheduling requires a reason and retains the old deadline/history.
- Owners see due-today and overdue lists; managers see team follow-ups.

Agreed notification targets:

- First response within 2 working hours of receipt; outside-hours enquiries count from next opening.
- Follow-up reminder 30 minutes before deadline.
- One owner notification when overdue, plus visible overdue state.
- Manager escalation after 4 working hours overdue; ownership does not change.
- In-app delivery initially; daily work overview for owners/managers.

Open: business days/hours, holidays, manager routing, reminder behaviour outside hours, and the exact relationship between first-response timers and later custom follow-ups. Historical received times must not silently receive fresh response allowances when captured late.

### Controlled stages

- **New:** captured, assigned, first action scheduled.
- **Contacted:** contact attempt recorded with response outcome.
- **Qualified:** requirement, relevant location, timing and sufficient quotation information confirmed; budget can be unknown.
- **Proposal:** an approved quotation revision has actually been sent.
- **Negotiation:** recorded discussion of scope, price or terms.
- **Won:** recorded customer acceptance of the relevant approved quotation/scope.
- **Lost:** opportunity ended, mandatory reason recorded.

Allow genuine shortcuts with the required evidence; do not force fake intermediate activity. Log every transition and enforce requirements centrally. Form opening, draft saving, customer editing and job approval must not manufacture commercial progress.

Open: closed-enquiry reopening policy, disqualification handling, and handling multiple alternative quotations accepted under one enquiry.

## 5. Agreed quotation architecture

### Commercial calculation

For each material line:

`IRD charge = quantity × IRD selling price`

`TWID markup = IRD charge × optional markup percentage`

`Quotation subtotal = total IRD charge + optional TWID markup + optional services charges`

`Customer total = subtotal + applicable configured VAT`

Services lines use quantity × selling rate. Zero markup or no services charges is valid, not missing data. Do not change tax policy based on this document; verify applicable configuration and business requirements separately.

### Internal costing and margin review

Add a customer-hidden internal costing section with IRD charge to TWID and estimated TWID delivery costs such as labour, transport and subcontractors. Show selling subtotal excluding VAT, discount where applicable, estimated TWID profit and margin, and missing-cost warnings.

`Estimated TWID profit = customer subtotal − IRD charge − TWID delivery costs`

`Estimated TWID margin = estimated TWID profit / customer subtotal`

Handle a zero subtotal explicitly rather than dividing by zero. IRD's own contribution requires its purchase/landed cost and remains separate. Service revenue is not automatically profit. Distinguish confirmed zero costs from unknown costs and avoid counting the same cost in several categories.

All quotations initially require manager approval. Delegated value/discount/margin/payment-term limits are a potential later enhancement, not an approved initial policy. No numerical margin minimum or discount limit has been chosen.

### Revision, approval and response

Track internal review separately from customer response:

1. Prepare draft quotation and internal estimate.
2. Submit exact revision for manager review.
3. Approve to send, or return Changes required with a reason.
4. Record actual sending: recipient, channel and time. Advance lead to Proposal.
5. Record acceptance, requested changes, refusal or expiry separately.

Scope, price, commercial-term and internal-cost changes require renewed approval. Preserve sent/approved versions. Rejection preserves history and does not make the lead Lost.

Customer acceptance records accepting person, date, evidence and accepted revision. Changed terms are a revision request, not acceptance of the original. Expired quotations require revalidation. Lack of response continues follow-up rather than automatic loss.

Acceptance marks the quotation Accepted, enquiry Won and prospect Customer; creates one linked draft job card and first draft invoice under the agreed billing schedule; and notifies operations. These actions must tolerate retries without duplicate documents. They do not authorise work or assert that payment was received.

Open: exact evidence-upload/verification controls, rejection/revalidation permissions and internal-estimate confidentiality at API level. Customer PDFs/links must never expose internal costs.

## 6. Agreed invoicing architecture

- Acceptance creates the first draft invoice alongside the draft job card, based on agreed billing terms.
- Finance verifies billing identity, amounts, taxes, terms and credit approval before issuance.
- Record invoice issuance separately from sending/delivery.
- Calculate due dates from the agreed terms, not a hardcoded 30 days.
- Allocate receipts explicitly and show outstanding balance.
- Keep billing schedules distinct from payment instalments. A full invoice payable in instalments must not generate duplicate invoices for those same instalments.
- Work authorisation remains dependent on operational approval and required deposit/credit conditions.

Open and blocking before billing automation:

- Which arrangements are initially supported: full upfront, deposit/balance, milestones or credit?
- For each arrangement, define billed amount, issue trigger, due-date rule and whether the initial draft is immediately issuable or held for a later trigger.
- Define treatment of deposit requests/pro forma versus invoices, taxes, credits, cancellations, refunds and overpayments with the business's finance owner. Do not infer legal accounting treatment from this discussion.
- Define who can approve credit exceptions and evidence required for financial clearance.

Keep existing invoice credit-control protections while changing the workflow.

## 7. Agreed job-card architecture

### Draft preparation

Create the job from the accepted quotation revision with explicit customer, enquiry, quotation and billing links, accepted scope/quantities, relevant site/contact details, internal estimate and payment conditions.

Assign one accountable delivery owner. The enquiry owner remains the relationship contact unless explicitly handed over; the same person may hold both responsibilities.

Require an appropriate preparation checklist before submission: owner, scope, site details, schedule, delivery budget, tasks/milestones, labour/subcontract requirements, materials, equipment and relevant dependencies.

### Target stages

`Draft → Accountant Review → Manager Review → Approved → Ready to Start → In Progress → Work Completed → Closed`

- Accountant: review planned cost against quotation estimate, budget exceptions and financial conditions.
- Manager: approve execution plan, responsibility, resources and exceptions within authorised limits.
- Approved is not In Progress.
- Ready to Start requires financial clearance and operational readiness.
- Start is an explicit actor/time event.
- Changes required returns the job for correction with history.
- Completion requires work evidence and customer handover checks.
- Closure requires reconciliation of materials and costs and the agreed financial checklist.

Preserve approved baselines and record variations. Material changes need renewed approval. Separate commercial variations changing customer price from internal overruns absorbed by TWID.

Whole-job approval must not automatically approve individual costs, deduct stock, accept quotations or issue invoices. Align server transitions, rules and UI. Avoid partial multi-write approval/closure states.

Open: precise review checklists, exception authority, cancellation/reopening policy, whether unpaid customer balances block closure, and who verifies handover.

## 8. Agreed Storekeeper portal and location architecture

No dedicated storekeeper currently exists. Use the existing STOREKEEPER role and assign an authorised employee as acting storekeeper through their own account. No shared credentials. The permanent appointment later should not require a workflow rewrite.

### Location model

- Start with one configured default stock location and minimal selection overhead.
- Keep one shared item catalogue with separate balances per location.
- Track on-hand, reserved and available per item/location; available = on-hand − reserved.
- Every receipt, reservation, issue, return and adjustment identifies its location.
- A job delivery site is not automatically a stock location.
- Future inter-location transfers must record dispatch, in-transit quantity and destination receipt without double-counting. Schema must allow this; full transfer UI can be deferred until needed.
- Restrict fulfilment access to authorised locations.

### Portal work queues

Initial release: approved requisitions, reservations/shortages, partial dispatch, recipient acknowledgement, inspected returns and movement history.

Later connected work: purchasing receipts, physical counts/discrepancies and multi-location transfers. Define receipt/count behaviour before expanding scope.

Show materials, job reference, destination, required dates and relevant contacts. Do not expose customer prices, margins, commissions or unrelated financial details merely to grant fulfilment access. Existing STOREKEEPER access excludes full job-card access; supply purpose-specific views/endpoints rather than opening all job records.

### Fulfilment flow

`Request → Accountant/Manager approval → Reserve → Physical issue → Acknowledge receipt → Return unused materials`

- Approval authorises a quantity; it does not change on-hand stock.
- Reservations reduce available stock, not on-hand stock.
- Confirmed store dispatch reduces on-hand and the corresponding reservation together.
- Support partial fulfilment using separate immutable dispatch records, each with a unique movement ID, issuer, date, quantity and recipient.
- Recipient acknowledgement tracks custody and discrepancies; it never deducts stock again.
- Cancel unissued allocations by releasing reservations. Do not restore issued stock merely because the job was cancelled.
- Returns reference original issues and may not exceed outstanding returnable quantities across all prior returns.
- Inspect returns. Damaged/unusable stock must not inflate usable availability.
- Storekeepers cannot increase approved requirements, change commercial prices or approve their own discrepancy adjustments. A separate authorised reviewer is needed for adjustments where roles overlap.

### Posting integrity requirements

- Validate finite positive quantities and consistent units.
- Check duplicate movement IDs before fresh availability checks. Verify the original payload and return the original result for matching retries.
- Reject conflicting reuse of movement IDs.
- Post balance changes, movement and fulfilment state atomically.
- Protect posted item identities and quantities; use linked corrective movements.
- Enforce cumulative issued limits and return limits transactionally under concurrent requests.
- Reconcile server balances, movement history and fulfilled job quantities.
- Report bulk results per line; successful lines must not be repeated when retrying failures.
- Define recoverable failure states with an accountable operator and resolution history.

Example: reserve 30 out of 100 → on-hand 100, reserved 30, available 70. Issue 20 → on-hand 80, reserved 10, available 70. Release remaining reservation → on-hand 80, reserved 0, available 80.

Open: acting-storekeeper identity, reservation priority/expiry, negative-stock policy (recommend disallow), alternate items, unit conversions, damaged stock handling and adjustment approvers.

## 9. Related cost modules: next design work

These were discussed and inspected but detailed policies were not agreed. Do not silently replace current behaviour based only on general recommendations.

Recommended common presentation: **budget, committed, actual incurred/consumed and paid** as separate quantities. Accepted selling value changes only through approved commercial variations.

- **Ad hoc expenses:** decide request versus reimbursement/payment flows, cumulative job-budget limits, attachments, permitted payment accounts, corrections and whether to retain the current under-$200 policy.
- **Subcontractors:** unify legacy job lines and linked contracts around scope, commitment, variations, work certification, amounts owed and payment allocation. Preserve existing balances and prevent duplicate charges.
- **Commissions:** establish earning event, payment eligibility, cancellation/clawback rules and one obligation-to-payment linkage across job referrals and the separate module. Confirm Reserve treatment.
- **Staff rates/payroll:** distinguish estimated labour, approved work, earned amounts and payroll settlement; retain unique posting references.
- **Profitability:** reconcile IRD contribution, TWID margin, committed costs, actual costs, returns and commissions. Eliminate missing-status-as-approved ambiguity through explicit compatibility/migration rules.

## 10. Recommended technical shape

Retain the existing Next.js/Firebase stack unless discovery demonstrates a concrete need to change it. This is a workflow/control redesign, not approval for a framework migration.

Recommended domain records/interfaces (final names may follow repository conventions):

- Customer/account and contact IDs; enquiry with immutable receiver, current owner and stage.
- Enquiry activities, next actions, ownership requests and transition history.
- Versioned quotations with separate internal review and customer response; confidential costing per revision.
- Billing schedule, invoice lifecycle, receipt allocation and credit-clearance references.
- Job baseline, owner, operational stage, financial clearance, readiness and variations.
- Shared inventory item; stock location; per-location balance; approved requisition; reservation; dispatch; acknowledgement; return and movement.

Implement protected commands for consequential transitions rather than arbitrary client document patches. Actor identities and timestamps must be assigned/verified server-side. Use immutable explicit IDs across modules instead of name-based linking.

For acceptance creating several records, use deterministic identities and a transaction where practical. External notifications should run after durable state changes with retry-safe delivery; do not hold a database transaction open while calling external services. Expose incomplete downstream work as a recoverable exception.

Firestore rules must protect approved versions, posted quantities, restricted costs and action-specific permissions. Existing client-driven screens need coordinated migration so a rule change does not break old paths mid-release.

Do not maintain aggregate `onHand` and per-location balances through unrelated independent writes. Choose one authoritative representation and update compatibility projections transactionally until old readers are retired.

## 11. Migration and rollout

1. Inventory current schema, readers/writers, deployment state and existing uncommitted work.
2. Verify staging project identity, runtime health, Auth/Storage/Functions targets and suppression of real external effects.
3. Obtain the blocking business decisions for the next implementation slice.
4. Implement compatible additive types/fields, protected commands, rules and targeted UI together.
5. Run dry-run migration reports: ambiguous lead owners, broken document links, missing status/evidence, unsupported job transitions, duplicate postings and stock discrepancies.
6. Review exceptions before applying migration to staging. Never fabricate historical acceptance, approvals or payment evidence.
7. Assign reconciled existing stock to the default location. Do not replay historical issue deductions. Define a migration cutover/opening snapshot with provenance so opening quantities and historic ledger totals are not counted twice.
8. Make migration scripts resumable and retry-safe, with counts and audit output. Keep backups and a tested recovery procedure.
9. Complete role-based staging UAT and reconciliations.
10. Deploy the exact tested staging commit through existing workflows. Verify health and transaction checks after release.
11. Production promotion is a separate, explicitly authorised activity. Rehearse its migration and data recovery in staging first.

Realistic test data must be synthetic or appropriately sanitised. Staging notifications, timers and acceptance/invoice tests must not send real customer messages or move real money. The existing staging scheduled-job disablement means reminder testing needs a controlled staging-only clock/runner or manual trigger, not simply enabling production schedules.

Suggested delivery order: foundation/permissions and migrations → leads/customers → quotation revisions/costing → acceptance/billing/job preparation → job approvals/readiness → storekeeper fulfilment/location balances → agreed cost-module follow-ups. Read-only stock reconciliation and the confirmed posting defects should be addressed early in the inventory slice.

## 12. Acceptance and regression checks

### Leads/customers

- Capture an individual WhatsApp enquiry without a company; require a usable response identifier.
- Receiver ownership, accepted handover and direct manager reassignment preserve history/deadlines.
- Open enquiries cannot lose their next action; completing/rescheduling actions follows agreed rules.
- Business-hour response/reminder/escalation cases cover nights, holidays and delayed capture after business calendar is agreed.
- Repeat customers can have distinct enquiries without shared stage/document contamination.
- Draft quotation activity does not advance the lead. Sent/accepted evidence does.

### Quotations/invoices

- BOM/manual materials, optional zero markup and optional services calculate consistently across UI, server and PDF using a documented rounding rule.
- IRD charge and TWID internal costs remain distinct; unknown cost is not silently zero.
- Internal estimates are inaccessible through customer documents/endpoints.
- Approved/sent revision edits require a new review; acceptance pins the correct revision.
- Repeated/concurrent acceptance creates one intended job and billing draft, not duplicates.
- Finance issuance and delivery are distinct. Invoice/payment schedules cannot double-bill.
- Credit limits, payment allocation, partial payment and overpayment protections remain valid.

### Jobs/permissions

- Test every permitted and forbidden transition directly at the server/data boundary for each role.
- Approval does not bypass deposit/credit or readiness requirements.
- Changes after approval require the appropriate variation/review.
- Completion/closure/cancellation/reopening follow the eventual agreed checklists.
- Failed downstream work is visible and recoverable without repeating completed effects.

### Inventory

- Approval/reservation do not decrement on-hand; confirmed dispatch does.
- Partial and concurrent issues cannot exceed approved quantity or available stock.
- Matching retry after stock depletion returns original success; conflicting retry is rejected.
- Acknowledgement never deducts twice.
- Repeated/concurrent returns cannot exceed original issued quantity less previous returns.
- Cancellation releases unissued reservations and leaves issued stock unchanged.
- Posted-line edits are blocked; corrections leave linked history.
- Atomic failure leaves no orphan balance or ledger update; bulk partial failures are explicit.
- Storekeeper location permissions and financial confidentiality hold.
- Migrated default-location balances reconcile without replaying historic deductions.
- Future transfer scenarios preserve total owned stock and distinguish in-transit quantities.

### Existing checks

Use `npm run test:deployment` in `project-management-next`, configuration validation with the correct staging environment, relevant lint and build checks. The deployment guide notes unrelated existing global lint failures; report baseline failures accurately rather than masking new ones. Add meaningful emulator/integration tests for transaction concurrency and Firestore permission enforcement; isolated mocks alone are insufficient.

## 13. Source map for Cursor

- Environment: `project-management-next/DEPLOYMENT.md`, `apphosting.staging.yaml`, `src/lib/deployment-config.ts`, `src/lib/firebase-admin.ts`, `src/app/api/health/route.ts`; root `.firebaserc` and deployment workflows.
- Leads: `project-management-next/src/app/crm/leads/page.tsx`, `src/stores/crm-store.ts`, `src/features/crm/components/LeadJourneyPanel.tsx`.
- Quotations: `src/app/crm/quotations/page.tsx`, `src/features/crm/components/CrmDocumentWorkspace.tsx`, `QuoteRequisitionGrid.tsx`, `OtherServicesGrid.tsx`, `src/features/crm/types/index.ts` (all under `project-management-next`).
- Billing: `project-management-next/src/app/api/crm/invoices/`, `src/lib/server/customer-credit.ts`.
- Jobs: `project-management-next/src/app/job-cards/[id]/page.tsx`, `src/stores/job-cards-store.ts`, `src/lib/financial-engine.ts`, `src/features/jobCards/`.
- Stock: `project-management-next/src/lib/server/job-inventory-posting.ts`, `src/lib/server/job-inventory-posting-core.ts`, `src/app/api/job-cards/[id]/inventory-lines/`, `src/stores/inventory-store.ts`. Isolated posting checks: `scripts/test-job-inventory-posting.mjs` (`npm run test:inventory-posting`).
- Other costs: `project-management-next/src/lib/job-card-expense-approval.ts`, job expense/commission API routes, subcontractor and commission stores/modules.
- Access: root `firestore.rules`, `project-management-next/src/constants/modules.ts`, permission/auth stores.

## 14. First actions for the receiving agent

1. Read this document and deployment guide; inspect workspace changes without resetting them.
2. Confirm staging deployment and configuration through read-only checks.
3. Revalidate current findings and map existing data shapes/writers.
4. Present the blocking choices for the first delivery slice; do not invent unresolved business policies.
5. Implement in reviewable staging-only increments with migration reports and relevant tests.
6. Maintain this document with decision changes, completed work, validation evidence and remaining exceptions.

## 15. Implementation progress

Started: 26 September 2026 on `codex/staging-isolation`. No staging or production deploy has been performed from this work.

### Completed in checkout

Inventory posting integrity for the current manager-approval path:

- Duplicate movement IDs are resolved before availability checks.
- Matching retries return the original posted result and do not change on-hand.
- Conflicting reuse of a movement ID (changed item or quantity) is rejected.
- Returns cannot exceed posted issues minus prior posted returns on the same job/item or linked source line.
- Bulk manager approval still posts one line per transaction, reports approved / alreadyPosted / failed, and does not reselect successful lines on retry.
- Posted requisition rows are locked in the job inventory grid, including for admin quantity/item edits.
- Isolated in-memory transaction checks cover the handover posting scenarios: `npm run test:inventory-posting`.

These remain isolated checks, not Firestore-emulator, concurrency, or live reconciliation tests.

### Later same-day checkout work

Agreed workflow controls now exist in the checkout, still undeployed:

- Enquiry capture requires a response method, channel, requirement, next action and due time. Company is optional for individuals. The capturing user becomes owner/receiver. Priority filtering treats `Medium` and `MEDIUM` as the same value. Win rate uses closed enquiries only.
- Opening or saving a quotation, creating a customer, creating a draft job, or approving a job no longer manufactures Proposal, Negotiation, Won, or a Sent invoice.
- Quotations have a hidden internal costing section, manager review commands, record-sent (Proposal), and acceptance that creates one deterministic draft job plus a non-issuable DRAFT invoice stub. Customer PDFs strip internal costing.
- Job manager approval no longer accepts the quote or issues an invoice. `APPROVED_MANAGER` displays as Approved until an explicit Start Work event.
- Location/reservation math helpers exist (`available = onHand − reserved`).
- Manager material approval now reserves stock. Storekeepers dispatch or release from `/inventory/fulfilment` without full job-card access. Dispatch reduces on-hand and reserved together.
- Enquiry follow-up queues, activity history, complete-action replacement, and handover accept/reassign are in the leads UI.
- Firestore now locks client edits to `reserved` and permits Rejected/Cancelled job transitions that the UI already used.
- Isolated checks: `npm run test:architecture-workflow` and `npm run test:inventory-posting`.

### Later same-day open-gate work

Previously open gates now have configurable defaults in Admin → Operating policies. They remain changeable; they are not irreversible legal or tax policy.

- Business calendar (timezone, weekdays, hours, holidays) drives first-response, reminder and escalation states in-app. Staging crons stay off.
- Enquiry handover request and manager reassign pickers are on the journey panel. Closed-enquiry reopen is off unless enabled, and still requires a reason.
- Quotations store a billing arrangement. Acceptance writes a DRAFT invoice using the first billable amount. Finance issues separately from sending. Due dates come from the terms, not a hardcoded 30 days.
- Job preparation, ready-to-start, completion and closure checklists gate those actions. Unpaid-balance closure blocking is on by default and configurable.
- Store fulfilment shows reservation expiry, damaged quantity, and recipient acknowledgement that does not deduct stock again. Discrepancy adjustments require a second reviewer.
- Job cost status shows budget / committed / actual / paid without replacing the current posting engine. Missing approval status is not counted as approved.

### Remaining exceptions

- Exact holiday calendar, named acting storekeeper, credit-exception evidence, and finance-owner legal treatment of deposits/pro forma remain business decisions in settings, not invented law.
- Enquiry activities still live on the lead document.
- Legacy already-issued lines stay deducted; new manager approvals reserve instead of deducting.
- No staging deploy or live UAT has been run from this work.
