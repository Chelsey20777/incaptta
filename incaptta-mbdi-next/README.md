# Incaptta MBDI (standalone)

Owner-facing Next.js app for **Monetised Business Development Initiatives**. Uses the same Firebase project (`incaptta-pro`) as Projects — Auth, Firestore, and Storage stay in sync.

Approvals, indicator verification, and payroll posting stay in **project-management-next**. This app is for initiative owners: checklist, claims, chat, and notifications.

## Local development

```bash
cd incaptta-mbdi-next
npm install
npm run dev
```

Copy Firebase env vars from Projects (`NEXT_PUBLIC_FIREBASE_*`). Open [http://localhost:3000](http://localhost:3000).

## Granting MBDI access (`modules.mbdi`)

Employees need a per-user grant. Approver roles (`SUPER_ADMIN`, `ADMIN`, `MANAGER`, `DIRECTOR`) bypass the grant.

For **MBDI-only** users (no Projects modules):

1. Open **Projects** → Admin → Users.
2. Invite / edit roles → assign **MBDI Staff** (not Technical).
3. Enable **MBDI access** (`users/{uid}.modules.mbdi = true`) — auto-enabled when you select MBDI Staff on create.

Other staff:

1. Open **Projects** → Admin → Users.
2. Edit the user and enable **MBDI access**.
3. Or set in Firestore Console:

```json
{
  "modules": { "mbdi": true }
}
```

Users without the grant (and without an approver role) see: *“MBDI is not enabled for your account — contact your administrator.”*

## App Hosting

Suggested backend id: **`incaptta-mbdi`** (directory: `incaptta-mbdi-next`).

Create the backend in Firebase Console → App Hosting, pointing at this folder / branch. Do not replace the Projects backend.

After deploy, add the hosted URL to **Firebase Auth → Authorized domains** (e.g. `incaptta-mbdi--incaptta-pro.europe-west4.hosted.app`).

Also deploy updated **Firestore rules** from the repo root (`firestore.rules`) so MBDI initiative chats (`type: 'mbdi'`) can be read/joined. Chat documents use deterministic IDs `mbdi_{initiativeId}` — no new composite index required for get-or-create.

## Quick test script

1. In Projects Admin → Users, enable **MBDI access** for employee A.
2. Log in as A on the standalone URL → see only A’s initiatives.
3. Open an initiative → tick indicators (when status is In Progress) → Chat → send a message.
4. Log in as a manager on Projects → open the same initiative → see the message; verify indicators / approve claims as usual.
5. Disable MBDI access for A → A sees the access-denied screen on next load.

## Routes

| Route | Purpose |
|-------|---------|
| `/login` | Firebase email/password |
| `/initiatives` | Own initiatives register |
| `/initiatives/[id]` | Detail: scope, checklist, claims, chat |
| `/notifications` | `mbdiNotifications` inbox |
| `/access-denied` | Missing `modules.mbdi` |
