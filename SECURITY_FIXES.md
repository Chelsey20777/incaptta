# Security Fixes — IncapttaPro
> Analysis Date: 2026-03-26
> Status: Pending

---

## 🔴 Critical — Fix Immediately

### 1. Firestore Rules Are Wide Open (Development Rules Deployed)
**File:** `firestore.rules`
**Problem:** The default `firestore.rules` file contains:
```js
allow read, write: if true;
```
Any user (authenticated or not) can read and write the entire database. The correct production rules exist in `firestore.rules.prod` but are not being deployed by default.

**Fix:**
```bash
firebase deploy --only firestore:rules --rules firestore.rules.prod
```
Or rename `firestore.rules.prod` → `firestore.rules` and update `firebase.json` to reference it.

---

### 2. Hardcoded UID Bypass in Production Rules
**File:** `firestore.rules.prod` — `isSuperAdmin()` function
**Problem:**
```js
isSuperAdmin() {
  return hasRole('SUPER_ADMIN') || request.auth.uid == '8kJn2rbDPWgzsxahHwrYp7jkcdf2';
}
```
One UID has permanent SUPER_ADMIN access at the database rules level regardless of their Firebase Auth claims. If this account is ever compromised, access cannot be revoked without redeploying rules.

**Fix:** Remove the hardcoded UID — rely solely on claims:
```js
isSuperAdmin() {
  return hasRole('SUPER_ADMIN');
}
```

---

### 3. Firebase Service Account JSON in the Repository
**File:** `incaptta-pro-firebase-adminsdk-fbsvc-45e8c324d9.json`
**Problem:** This file grants full Admin SDK access to Firebase. Anyone with repository access can use it to set custom claims on any user, making themselves any role including SUPER_ADMIN.

**Fix:**
1. Go to Firebase Console → Project Settings → Service Accounts
2. Delete / revoke the compromised key
3. Generate a new service account key
4. Store it outside the repo (environment variable or secrets manager)
5. Add the filename to `.gitignore` immediately:
```
incaptta-pro-firebase-adminsdk-*.json
*.json.key
```

---

### 4. Admin Escalation Scripts in Repo Root
**Files:**
- `fix_superadmin.js`
- `set_farai_admin.js`
- `set_farai_admin_final.js`
- `set_farai_admin_v2.js`

**Problem:** These scripts directly set Firebase custom claims and can be used to grant any role to any user. They are privilege escalation tools sitting openly in the repository.

**Fix:**
1. Delete all four files from the repository
2. Run `git rm fix_superadmin.js set_farai_admin.js set_farai_admin_final.js set_farai_admin_v2.js`
3. Commit the removal
4. If role changes are needed in future, use the Admin Dashboard UI which has proper audit logging

---

## 🟠 High — Fix Soon

### 5. Admin Can Update Their Own Roles
**File:** `src/routes/others.routes.ts` → `PATCH /api/users/:id`
**Problem:** The endpoint is protected by `rbacMiddleware(['ADMIN'])` but has no check preventing a user from patching their own record and granting themselves `SUPER_ADMIN` or any other role.

**Fix:** Add a self-edit guard in `src/controllers/user.controller.ts`:
```typescript
if (req.user.uid === req.params.id) {
  return res.status(403).json({ error: 'You cannot modify your own roles.' });
}
```
Also add a backend check preventing any non-SUPER_ADMIN from assigning the `SUPER_ADMIN` role:
```typescript
if (roles.includes('SUPER_ADMIN') && !req.user.roles.includes('SUPER_ADMIN')) {
  return res.status(403).json({ error: 'Only a SUPER_ADMIN can assign the SUPER_ADMIN role.' });
}
```

---

### 6. Disabled Users Retain Access Until Token Expires
**File:** `firestore.rules.prod` — `isActiveUser()` function
**Problem:**
```js
return isAuthenticated() && (request.auth.token.isActive == true || !('isActive' in request.auth.token));
```
- If `isActive` claim is missing from the token, the user is treated as active
- Firebase ID tokens are cached for up to 1 hour — disabling a user does not immediately revoke access

**Fix — Part A:** Remove the missing-claim default:
```js
isActiveUser() {
  return isAuthenticated() && request.auth.token.isActive == true;
}
```

**Fix — Part B:** Force token revocation on disable using Firebase Admin SDK:
```typescript
// In user.service.ts when setting isActive = false
await admin.auth().revokeRefreshTokens(uid);
```

---

### 7. Stale Claims After Role Revocation (No Force Refresh)
**File:** `src/services/user.service.ts` / `src/services/adminUserTools.ts`
**Problem:** When roles are changed, the Firebase ID token (cached up to 1 hour) still carries the old claims. The revoked/changed role remains effective until token expiry.

**Fix:** After any role or status change, revoke refresh tokens to force re-authentication:
```typescript
await admin.auth().revokeRefreshTokens(uid);
```
On the frontend, `useSession.ts` should detect the stale token and force a sign-out or token refresh:
```typescript
// In useSession — check token issue time vs revocation time
const tokenResult = await user.getIdTokenResult(true); // force refresh
```

---

## 🟡 Medium — Address When Possible

### 8. Inventory Manager PIN Hash Readable by All Users
**File:** Firestore `/appSettings` document — field `inventoryManagerPinHash`
**Problem:** The PIN hash is stored in `appSettings` which is readable by all authenticated users. PINs are typically 4–6 digits (~1,000,000 combinations) — easily brute-forced offline once the hash is obtained.

**Fix Options:**
- Move PIN verification to a backend Cloud Function (hash never exposed to client)
- Use bcrypt with a high work factor instead of a simple hash
- Or replace the PIN system with a proper role-based unlock that uses Firebase Auth re-authentication

---

### 9. No Protection Against Removing All Admins
**File:** `src/services/adminUserTools.ts`
**Problem:** The code prevents disabling the last SUPER_ADMIN but does not prevent disabling all ADMIN users, which could lock out user management for non-superadmins.

**Fix:** Add a similar guard for ADMIN users:
```typescript
if (roles.includes('ADMIN') === false && wasAdmin) {
  const adminCount = await countUsersWithRole('ADMIN');
  if (adminCount <= 1) {
    throw new Error('Cannot remove the last ADMIN user.');
  }
}
```

---

## 🔵 Low / Informational

### 10. DIRECTOR Role Has No Backend Enforcement
**Problem:** `DIRECTOR` is defined in the role schema but has no `rbacMiddleware` checks on any backend route. Access control is purely frontend-gated (router guards), which can be bypassed by direct API calls.

**Fix:** Review which API endpoints DIRECTOR should access and add `rbacMiddleware(['DIRECTOR', ...])` accordingly.

---

### 11. SUPER_ADMIN Has No Containment
**Problem:** By design, SUPER_ADMIN bypasses every single check — Firestore rules, middleware, frontend guards. A compromised SUPER_ADMIN account has unlimited access with no audit trail gaps.

**Recommendation:**
- Enforce MFA (Multi-Factor Authentication) on all SUPER_ADMIN accounts via Firebase Console
- Ensure audit logging covers all SUPER_ADMIN actions
- Limit the number of SUPER_ADMIN accounts to the absolute minimum (ideally 1–2)

---

## Summary Table

| # | Issue | Severity | File(s) | Status |
|---|---|---|---|---|
| 1 | Open Firestore rules deployed | 🔴 Critical | `firestore.rules` | ⬜ Pending |
| 2 | Hardcoded UID bypass in rules | 🔴 Critical | `firestore.rules.prod` | ⬜ Pending |
| 3 | Service account JSON in repo | 🔴 Critical | `incaptta-pro-firebase-adminsdk-*.json` | ⬜ Pending |
| 4 | Admin escalation scripts in repo | 🔴 Critical | `fix_superadmin.js` + 3 others | ⬜ Pending |
| 5 | Admin can update own roles | 🟠 High | `src/controllers/user.controller.ts` | ⬜ Pending |
| 6 | Disabled users retain access | 🟠 High | `firestore.rules.prod`, `user.service.ts` | ⬜ Pending |
| 7 | Stale claims after role change | 🟠 High | `src/services/adminUserTools.ts` | ⬜ Pending |
| 8 | PIN hash readable by all users | 🟡 Medium | Firestore `appSettings` | ⬜ Pending |
| 9 | No guard against removing all admins | 🟡 Medium | `src/services/adminUserTools.ts` | ⬜ Pending |
| 10 | DIRECTOR role not enforced on backend | 🔵 Low | `src/routes/` | ⬜ Pending |
| 11 | SUPER_ADMIN has no containment | 🔵 Low | System design | ⬜ Pending |
