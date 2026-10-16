# InCaptta Mobile - Master Development Blueprint

This document serves as the authoritative roadmap for the React Native (Expo) implementation of InCaptta Mobile. It is designed to be executed by an AI Agent, with a focus on achieving full functional parity with the InCaptta Production Desktop platform.

## Project Context
- **Target Subdirectory**: `incaptta-mobile-rn/`
- **Tech Stack**: Expo SDK 54, Expo Router, Zustand, NativeWind (Tailwind), Firebase JS SDK.
- **Brand Color**: InCaptta Emerald (`#00A63E`).
- **Target Database**: Firebase Project `incaptta-pro` (same as production).

---

## Phase 1: Authentication & Navigation Protection
**Goal**: Secure the app and establish the "Classic" auth flow.

- [ ] **Dependency Installation**: Install `expo-notifications`, `expo-image-picker`, `expo-camera`.
- [ ] **Login Screen Implementation**:
  - Create `app/(auth)/login.tsx`.
  - Implement Email/Password fields with Zod validation.
  - Connect to `useAuthStore.ts` and Firebase `signInWithEmailAndPassword`.
- [ ] **Navigation Guard**:
  - Modify `app/_layout.tsx` to monitor `user` state from `authStore`.
  - Redirect unauthenticated users to `/(auth)/login`.
  - Redirect authenticated users away from login to `/(tabs)`.
- [ ] **Persistence**: Ensure Firebase auth persistence is active for mobile sessions.

---

## Phase 2: High-Fidelity UI Foundation
**Goal**: Build the "InCaptta UI Kit" for consistent premium aesthetics.

- [ ] **Core Components (`src/components/`)**:
  - `Button.tsx`: Support variants (Primary, Secondary, Ghost, Danger).
  - `Input.tsx`: Custom labels, focus states, and error handling.
  - `Card.tsx`: Elevation-based containers for dashboards.
  - `Header.tsx`: Branded top bar with profile and notification icons.
- [ ] **Theming**: Ensure all components use Tailwind classes from the `incaptta-pro` palette defined in `tailwind.config.js`.

---

## Phase 3: Live Data & Job Cards
**Goal**: Transform placeholders into real-time data views.

- [ ] **Store Hydration**:
  - Update `src/stores/jobCardsStore.ts` to include `subscribeToJobCards()`.
  - Use Firestore `onSnapshot` to listen to the `jobCards` collection.
- [ ] **Job Cards Dashboard**:
  - Refactor `app/(tabs)/index.tsx`.
  - Implement a `FlatList` of Job Cards.
  - Display: Job Number, Title, Status (Draft/Submitted/Approved), and Profit/Revenue using `src/utils/financialEngine.ts`.
  - Implement Pull-to-Refresh.
- [ ] **Detail View**: Create `app/job-details/[id].tsx` to show full job card details and financial breakdown.

---

## Phase 4: Operational Features (Camera & Expenses)
**Goal**: Enable on-the-go operational entry.

- [ ] **OpEx Recording**:
  - Create `app/add-expense.tsx` (Modal).
  - Connect to `financialEngine` for real-time IRD/Twid calculation.
- [ ] **Camera/Receipt Integration**:
  - Implement `src/lib/camera.ts` using `expo-image-picker`.
  - Capture receipt photos, upload to Firebase Storage, and link the URL to the OpEx record.
- [ ] **Task Inbox**:
  - Implement `app/(tabs)/tasks.tsx`.
  - Filter tasks "Assigned to Me" from the `tasks` collection.

---

## Phase 5: Notifications & Approval Machine
**Goal**: Close the loop on real-time management.

- [ ] **Push Notifications**:
  - Configure `expo-notifications`.
  - Implement token registration: store `expoPushToken` in the user's Firestore document.
- [ ] **Approval Workflow**:
  - Implement the "2-Step Approval" logic in the UI.
  - Enable Managers to transition status from `SUBMITTED` -> `APPROVED`.
- [ ] **Alerts**: Set up local listeners for new tasks or pending approvals to trigger notifications.

---

## Phase 6: Finance & HR (Advanced)
**Goal**: Complete the mobile management suite.

- [ ] **Finance Hub**: `app/(tabs)/finance.tsx` - Summary of all Fund Transfers and OpEx.
- [ ] **HR Module**: `app/(tabs)/hr.tsx` - Staff directory and basic profile management.

---

## Evaluation Criteria (For the Evaluator)
When evaluating the build:
1. **Mathematical Accuracy**: Verify `financialEngine` results match production logic.
2. **Type Safety**: No `any` types; strictly follow `src/types/index.ts`.
3. **UI Fidelity**: Ensure the "Emerald" theme is applied correctly; check for premium spacing and animations.
4. **Performance**: Verify `FlatList` optimization and proper cleanup of Firestore listeners.
5. **Security**: Ensure no database access is possible without an authenticated session.
