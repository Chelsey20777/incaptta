# InCaptta Mobile: React Native (Expo) Architecture Specification

**Role**: Lead Architect (Antigravity) -> Third-Party Developer
**Objective**: Rebuild the InCaptta Mobile experience using React Native to achieve superior performance and reach full feature parity with the desktop platform.

---

## 1. Technical Stack (The "How")

The developer MUST use the following technologies. Deviations are only allowed with explicit approval from the Architect.

- **Framework**: [Expo](https://expo.dev/) (SDK 50+)
- **Routing**: [Expo Router](https://docs.expo.dev/router/introduction/) (File-based, Typed)
- **State Management**: [Zustand](https://github.com/pmndrs/zustand)
- **Styling**: [NativeWind](https://www.nativewind.dev/) (Tailwind CSS for React Native)
- **Backend**: [Firebase JS SDK](https://firebase.google.com/docs/web/setup) (Auth, Firestore, Storage)
- **Icons**: [Lucide React Native](https://lucide.dev/guide/packages/lucide-react-native)
- **Forms**: [React Hook Form](https://react-hook-form.com/) + [Zod](https://zod.dev/)

---

## 2. Directory Structure

The project follows a **Feature-Based Modular Architecture**. All implementation code resides in the `src` directory.

```
incaptta-mobile-rn/
├── app/                  # Expo Router (Root, Tabs, Auth)
├── src/
│   ├── components/       # Global/Reusable UI components (Buttons, Inputs, etc.)
│   ├── features/         # Domain-specific logic, components, and hooks
│   │   ├── jobCards/
│   │   ├── tasks/
│   │   ├── finance/
│   │   └── hr/
│   ├── stores/          # Zustand store definitions
│   ├── lib/             # Third-party configurations (Firebase initialization)
│   ├── types/           # Global TypeScript definitions
│   ├── utils/           # Helper functions (Formatting, calculations)
│   └── constants/       # App-wide constants (Theme tokens, API keys)
```

---

## 3. High-Priority Functional Requirements

### 3.1 Financial Engine
The developer MUST implement a 1:1 mirror of the desktop's `financialEngine.ts`. All financial calculations (IRD Revenue, Net Profit, Twid Amount) must be computed in real-time during data entry.

### 3.2 2-Step Approval Machine
All critical records (Job Cards, OpEx, Fund Transfers) must follow the platform's standard state machine:
1. **DRAFT**: Editable by the creator.
2. **SUBMITTED**: Locked for creator; visible to Finance/Manager.
3. **APPROVED / COMPLETED**: Final state; locked for all.

### 3.3 Offline-First Considerations
While the app prioritizes a live Firebase connection, it should handle intermittent connectivity gracefully using Firestore's built-in persistence.

---

## 4. Design Guidelines

- **Theme**: InCaptta Emerald (`#00A63E`) as the primary brand color.
- **Aesthetic**: Premium, data-dense, yet mobile-optimized. Use cards, clear typography (Inter/Roboto), and subtle shadows.
- **Responsive**: The app must maintain the **Web/PWA version** via Expo Web, ensuring the layout scales from small mobile screens to tablets.

---

## 5. Evaluation & Acceptance Criteria

Every module delivered by the developer will be evaluated against:

1. **Feature Parity**: Does the module support every feature of the legacy Vue mobile app?
2. **Type Safety**: Is the codebase fully Typed? (Strict TS configurations).
3. **Performance**: Does the app maintain 60FPS during navigation and list scrolling (use `FlashList` for complex lists)?
4. **Security**: Does it respect Firebase custom claims and security rules for role-based access?
5. **Clean Code**: No hardcoded strings, efficient hook usage, and clear separation of concerns.

---

## 6. Project Foundation

- **Project Folder**: `incaptta-mobile-rn`
- **Existing Logic Reference**: `incaptta-mobile` (Legacy Vue branch)
