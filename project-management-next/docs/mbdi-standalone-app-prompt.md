# Agent prompt: Standalone MBDI app (App Hosting + shared Incaptta Pro backend)

Copy everything below the line into a new Cursor agent chat (or similar) to implement the standalone MBDI application.

---

## Mission

Build a **standalone Next.js App Router application** for Incaptta’s **Monetised Business Development Initiative (MBDI)** so selected employees can work their initiatives on a focused mobile-friendly app, while **all data stays synced** with the main Projects app (`project-management-next`) via the **same Firebase project `incaptta-pro`** (Auth, Firestore, Storage).

Also implement in **project-management-next**:

1. **Per-user MBDI access** admin control (`users/{uid}.modules.mbdi`).
2. **Initiative-linked Chat** (reuse existing `chats` / messages model) as the primary collaboration surface on initiative detail (standalone + optionally main app).

Do **not** edit any `.plan.md` files. Prefer porting/adapting existing MBDI and chat code over rewriting from scratch.

---

## Product defaults (v1)

| Decision | Choice |
|----------|--------|
| Audience | **Initiative owners** (tick indicators, submit claims, chat, view own initiatives) |
| Approvers | Keep **approve / verify / pay / delete** in main Projects (`project-management-next`) |
| Access | **Not all staff** — Admin grants `modules.mbdi` per user; approver roles bypass |
| Chat | **Initiative-scoped group chat** linked to each initiative |
| Hosting | New Firebase **App Hosting** backend in `incaptta-pro` (suggested id: `incaptta-mbdi`) |
| Sync | Same Firestore collections — no separate MBDI database |

---

## Monorepo context

Repo root: `IncapttaPro`

| App | Role |
|-----|------|
| `project-management-next` | Main Projects app (existing MBDI + Admin + Chat + payroll approval) |
| New app e.g. `incaptta-mbdi-next` (or `mbdi-next`) | Standalone owner-facing MBDI UI |

Existing App Hosting backends in this project (for reference):

- `incaptta-projects` → `https://incaptta-projects--incaptta-pro.europe-west4.hosted.app`
- `incaptta-manage`, `incaptta-chat`

Create a **new** backend (e.g. `incaptta-mbdi`) pointing at the new app directory; do not replace Projects.

Firebase web app / config: use the same `incaptta-pro` project credentials pattern as `project-management-next` (env / `NEXT_PUBLIC_FIREBASE_*`).

---

## MBDI domain (must preserve)

### Purpose

Staff deliver measurable business-development initiatives and earn tiered USD rewards paid via payroll: **50% on completion**, **50% on confirmed performance**.

Tiers: Bronze / Silver / Gold / Strategic (see `src/features/mbdi/types.ts`).

### Lifecycle statuses

```
PENDING_APPROVAL → APPROVED (in progress)
                ↘ REJECTED

APPROVED → (all success indicators VERIFIED) → COMPLETION_CLAIMED
  → COMPLETED (50% payroll) → PERFORMANCE_CLAIMED
  → VALUE_CONFIRMED (100% payroll)
```

Success indicators (tasks): `PENDING` → owner marks `DONE` → manager `VERIFIED` (or returns). Stage 2 claim requires **all** verified.

### Ownership

An initiative is “mine” if any of:

1. `ownerId === auth.uid`
2. Auth email matches `ownerEmail` (case-insensitive)
3. `users/{uid}.employeeId === initiative.ownerId`

Helper: `project-management-next/src/features/mbdi/utils/ownership.ts`  
Linked employee hook: `.../use-linked-employee-id.ts`

### Key Firestore collections (shared — do not fork)

- `mbdiInitiatives/{id}` — initiative docs (incl. `tasks`, `claims`, payments, `endDate`, `dueRemindersSent`)
- `mbdiInitiatives/{id}/comments/{commentId}` — lightweight comments (keep; Chat is separate)
- `mbdiNotifications/{id}` — in-app Rocket notifications (`userId`, `read`, `link`, `type`, …)
- `mbdiPayrollPostings` — do not expose write UI in standalone
- `systemCounters/mbdiInitiatives` — numbering (approver create flow stays in Projects)
- `users/{uid}` — profile, `roles`, **`modules.mbdi`**, `employeeId`, `email`
- `chats/{id}` + `chats/{id}/messages` — chat rooms / messages
- Storage: reuse patterns under `mbdi/...` and `chats/...` for attachments

### Notifications

Types live in `features/mbdi/utils/notify.ts` (includes `MBDI_COMMENT`, `MBDI_DUE_SOON`, claim/indicator events). Standalone must subscribe to unread `mbdiNotifications` for the signed-in user and deep-link to `/initiatives/[id]` (or equivalent).

Due reminders (7/3/1 days) already run via cron + Cloud Function against the same data — standalone only **consumes** notifications.

---

## Part A — Per-user MBDI access (main Projects Admin)

### Today

Module access is **role-matrix only** (`rolePermissions/config` → `canAccessModule`). MBDI was previously forced on for all roles (`withMbdiEnabledForAllRoles` / disabled matrix toggle). **Remove force-on for employees**; replace with per-user grants.

### Data model

On `users/{uid}`:

```ts
modules?: {
  mbdi?: boolean  // default false / missing = no employee access
}
```

### Gate helper (shared logic)

```ts
canAccessMbdi(user, roles):
  if roles includes SUPER_ADMIN | ADMIN | MANAGER | DIRECTOR → true  // approver bypass
  if user.modules?.mbdi === true → true
  else → false
```

Use this in:

- `project-management-next` RouteGuard for `/mbdi`
- Sidebar MBDI item + topbar Rocket visibility
- **Standalone app** root guard / layout

### Admin UI

In `project-management-next` Admin → Users (`UsersTable` / user edit):

- Add toggle **“MBDI access”** bound to `modules.mbdi`
- Persist via existing admin user update / link APIs (`admin-store`, `/api/users` if applicable)
- Approvers do not need the toggle (bypass), but showing it as on/disabled is fine

### Standalone UX when denied

If authenticated but `!canAccessMbdi`: show a clear **“MBDI is not enabled for your account — contact your administrator”** screen (not a silent home redirect only).

---

## Part B — Standalone app (owner UX)

### Routes (suggested)

| Route | Purpose |
|-------|---------|
| `/login` | Firebase Auth email/password (same users as Projects) |
| `/` or `/initiatives` | Register: **own initiatives only** |
| `/initiatives/[id]` | Detail: scope (read), checklist, claims, **Chat tab**, notifications entry |
| `/notifications` (optional) | List `mbdiNotifications` |

### Features in v1

- Login / logout; block inactive users (`isActive` claims)
- List + search own initiatives (status pills, progress, end date)
- Detail: success indicators checklist (owner mark done only — **no verify/unverify**)
- Submit Stage 2 / Stage 3 claims when status allows (owner); upload evidence if existing helpers support it
- **Chat tab** (primary collaboration) — see Part C
- Optional: keep existing Comments component as secondary “notes” or hide if Chat supersedes
- Unread badges: MBDI notifications + initiative chat unread
- Mobile-first layout; MBDI red/orange accents (match Projects MBDI chrome)
- PWA-friendly (installable) if easy to port from Projects patterns

### Explicitly out of scope for standalone v1

- Approve/reject proposals; set tier/reward; verify indicators
- Approve claims / payroll posting
- Delete initiatives; CSV export; HR employee picker create-for-others
- Full company chat directory / random DMs (except as needed inside initiative chat participants)
- Super Admin / Permissions matrix UI

Managers continue those actions in **Projects** `/mbdi`.

### Ownership & security

- Register filter: `isMbdiInitiativeOwner` only (non-approvers)
- Detail: if not owner and not approver → redirect away
- Firestore rules already allow authed read of initiatives broadly; **client must still enforce owner-only UX**. Prefer tightening reads later if required; do not weaken rules.

### Reference paths to port from (`project-management-next`)

```
src/features/mbdi/types.ts
src/features/mbdi/ui.tsx
src/features/mbdi/utils/ownership.ts
src/features/mbdi/utils/use-linked-employee-id.ts
src/features/mbdi/utils/notify.ts          # client notify helpers as needed
src/stores/mbdi-store.ts                   # slim to owner actions
src/components/mbdi/task-checklist.tsx     # strip approver buttons
src/components/mbdi/comments.tsx           # optional
src/app/mbdi/page.tsx                      # register patterns
src/app/mbdi/[id]/page.tsx                # detail patterns (owner-only slices)
src/lib/firebase.ts / auth-store patterns
src/stores/chat-store.ts                   # initiative chat get-or-create + messages
src/app/chat/page.tsx                      # UI patterns to slim-port
```

Follow existing Next.js agent rules in that app’s `AGENTS.md` / `node_modules/next/dist/docs/` when writing App Router code.

---

## Part C — Initiative-linked Chat

### Model

Extend (or set fields on) `chats` documents:

```ts
{
  type: 'mbdi'                 // distinguish from DMs / normal groups
  mbdiInitiativeId: string
  isGroup: true
  groupName: string            // e.g. mbdiNo || title
  participants: string[]       // owner uid + invited staff / approvers
  unreadCount: { [uid]: number }
  // …existing chat fields (lastMessage, updatedAt, etc.)
}
```

### Behaviour

1. **Get-or-create** when user opens Chat tab on an initiative:
   - Query `chats` where `mbdiInitiativeId == id` (and `type == 'mbdi'` if indexed)
   - If none: create group with participants = owner uid (+ current user if different) and optionally known approver uids / allow invite later
2. Reuse `chat-store` send/listen/mark-read patterns; Storage attachments under existing chat paths
3. Unread: badge on initiative row + chat tab from `unreadCount[uid]`
4. Mentions: staff `@` from `users` is enough in v1; entity tags (job cards, etc.) optional later
5. Both apps see the same thread because they share `chats` / `messages`

### Indexes

Add any required composite Firestore indexes for `type` + `mbdiInitiativeId` or `mbdiInitiativeId` + `participants` as queries demand.

### Comments vs Chat

- **Chat** = primary real-time collaboration for the initiative  
- **Comments** = optional keep for short notes / @notify via `MBDI_COMMENT`; do not build a third messaging system

---

## Part D — App Hosting & Auth checklist

1. Scaffold Next.js app in monorepo; wire Firebase client to `incaptta-pro`
2. Add `apphosting.yaml` (mirror `project-management-next` patterns; secrets only as needed)
3. Create App Hosting backend `incaptta-mbdi` (or agreed name) connected to this directory / branch
4. Auth: email/password; load custom claims (`roles`, `isActive`); session cookie pattern if Projects uses it for middleware — keep standalone consistent or document divergence
5. Ensure authorized domains include the new `*.hosted.app` URL in Firebase Auth console
6. Smoke: user **without** `modules.mbdi` cannot use app; user **with** grant sees only own initiatives; chat messages appear in Projects if opened there; manager still approves in Projects

---

## Implementation order

1. **Projects:** `modules.mbdi` field + Admin Users toggle + `canAccessMbdi` gate (replace force-all-roles MBDI access for employees)
2. **Projects:** initiative chat get-or-create + Chat tab on `/mbdi/[id]` (proves shared model)
3. **Scaffold** standalone app; auth + gate + own-initiatives register + detail checklist/claims
4. **Port** chat client into standalone initiative detail
5. **Deploy** App Hosting backend; Auth domain; end-to-end test
6. Document URL and admin steps in a short `README.md` inside the new app

---

## Acceptance criteria

- [ ] Admin can enable/disable MBDI for a specific user via Users table (`modules.mbdi`)
- [ ] User without grant cannot use standalone or Projects `/mbdi` (approvers still can)
- [ ] Owner completes checklist + claim flows in standalone; data visible in Projects
- [ ] Initiative Chat is shared: message in standalone appears in Projects for same initiative
- [ ] Unread badges work for MBDI notifications and initiative chat
- [ ] No payroll/approve surfaces in standalone v1
- [ ] App Hosting backend live on `incaptta-pro`

---

## Working style

- Match existing Incaptta patterns (Zustand, Firestore `onSnapshot`, shadcn/ui if present)
- Minimal scope creep; prefer porting over greenfield rewrites
- Do not commit secrets (`.env`, service account JSON)
- After substantive work, summarize files changed and how to grant a test user MBDI access

---

## Quick admin test script (after build)

1. In Projects Admin → Users, enable **MBDI access** for employee A  
2. Log in as A on standalone URL → see only A’s initiatives  
3. Open initiative → Chat → send message  
4. Log in as manager on Projects → open same initiative → see message; approve as usual  
5. Disable MBDI access for A → A sees “not enabled” on next load  

END OF PROMPT
