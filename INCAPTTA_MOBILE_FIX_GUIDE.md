# Guide to Fixing Incaptta Mobile Issues

This document outlines the steps required to resolve the critical issues identified in the `incaptta-mobile` codebase.

## 1. Standardizing Routing System
The goal is to move away from `@ionic/vue-router` for router creation and use the base `vue-router` package to ensure consistency across the project.

### Steps:
1. Open [src/router/index.ts](file:///c:/Users/REAL%20TIME/Documents/incaptta/IncapttaPro/incaptta-mobile/src/router/index.ts).
2. Change the import:
   ```typescript
   // FROM
   import { createRouter, createWebHistory } from '@ionic/vue-router';
   // TO
   import { createRouter, createWebHistory } from 'vue-router';
   ```
3. Verify that the `routes` array uses `RouteRecordRaw` from `vue-router`.
4. In [src/main.ts](file:///c:/Users/REAL%20TIME/Documents/incaptta/IncapttaPro/incaptta-mobile/src/main.ts), ensure the app initialization still uses `IonicVue` but mounts the standard router.

---

## 2. Fixing Navigation Bugs
The Inventory tab currently redirects to the CRM module.

### Steps:
1. Open [src/views/TabsPage.vue](file:///c:/Users/REAL%20TIME/Documents/incaptta/IncapttaPro/incaptta-mobile/src/views/TabsPage.vue).
2. Locate line 16:
   ```html
   <!-- CURRENT -->
   <ion-tab-button tab="inventory" href="/tabs/crm/customers">
   <!-- CORRECT -->
   <ion-tab-button tab="inventory" href="/tabs/inventory">
   ```
3. Save the file and restart the dev server to test.

---

## 3. Resolving Firestore Permission Denied Errors
Permission errors are typically caused by strict Role-Based Access Control (RBAC) in `firestore.rules` that doesn't match the actual custom claims of the logged-in user.

### Steps:
1. **Verify User Claims**: Ensure your test user has the appropriate roles (e.g., `ADMIN`, `SUPER_ADMIN`, `SALES`) assigned via the Firebase Admin SDK.
2. **Review Rules**: Check [firestore.rules](file:///c:/Users/REAL%20TIME/Documents/incaptta/IncapttaPro/firestore.rules). If a rule requires `isJobCardStaff()`, verify that the role logic correctly includes the user's role.
3. **Check Auth Status**: Ensure `request.auth.token.get('isActive', true) != false` is handled correctly. If the token doesn't have `isActive` set, it defaults to `true`, but if it's explicitly `false`, access will be denied.
4. **Local Debugging**: Use the Firebase Emulator or log the `authStore.user` in the mobile app to see exactly what claims are being sent.

---

## 4. Environment & Build Configuration
Ensure the `.env` file in `incaptta-mobile` (if existing) or the root env variables match the Firestore project configuration.

### Steps:
1. Check [src/lib/firebase.ts](file:///c:/Users/REAL%20TIME/Documents/incaptta/IncapttaPro/incaptta-mobile/src/lib/firebase.ts).
2. Verify that the `apiKey` and `projectId` match your intended environment (production vs staging).
3. If using [Capacitor](https://capacitorjs.com/), run `npx cap sync` after any configuration changes to sync with Android/iOS platforms.
