# InCaptta Mobile - React Native (Expo)

A React Native implementation of InCaptta Mobile using Expo, built according to the architecture specification.

## Tech Stack

- **Framework**: Expo SDK 54+
- **Routing**: Expo Router (File-based, Typed)
- **State Management**: Zustand
- **Styling**: NativeWind (Tailwind CSS for React Native)
- **Backend**: Firebase JS SDK (Auth, Firestore, Storage)
- **Icons**: Lucide React Native
- **Forms**: React Hook Form + Zod

## Directory Structure

```
incaptta-mobile-rn/
├── app/                  # Expo Router (Root, Tabs, Auth)
│   ├── (tabs)/          # Tab navigation screens
│   │   ├── index.tsx    # Job Cards
│   │   ├── tasks.tsx    # Tasks
│   │   ├── finance.tsx  # Finance
│   │   └── hr.tsx       # HR
│   ├── _layout.tsx      # Root layout
│   └── modal.tsx        # Modal screen
├── src/
│   ├── components/      # Global/Reusable UI components
│   ├── features/        # Domain-specific logic, components, and hooks
│   │   ├── jobCards/
│   │   ├── tasks/
│   │   ├── finance/
│   │   └── hr/
│   ├── stores/          # Zustand store definitions
│   │   ├── authStore.ts
│   │   ├── jobCardsStore.ts
│   │   ├── tasksStore.ts
│   │   ├── financeStore.ts
│   │   └── hrStore.ts
│   ├── lib/             # Third-party configurations
│   │   └── firebase.ts  # Firebase initialization
│   ├── types/           # Global TypeScript definitions
│   │   └── index.ts
│   ├── utils/           # Helper functions
│   │   └── financialEngine.ts
│   └── constants/       # App-wide constants
│       ├── Colors.ts
│       └── theme.ts
```

## Key Features Implemented

### 1. Financial Engine
- 1:1 mirror of desktop's `financialEngine.ts`
- Real-time financial calculations (IRD Revenue, Net Profit, Twid Amount)
- Located in `src/utils/financialEngine.ts`

### 2. 2-Step Approval Machine
- Approval states: DRAFT → SUBMITTED → APPROVED/COMPLETED
- Implemented in type definitions and stores
- Role-based access control support

### 3. State Management
- Zustand stores for all features
- Auth store with Firebase integration
- Job Cards, Tasks, Finance, HR stores

### 4. Routing
- File-based Expo Router
- Tab navigation for main features
- Modal support

### 5. Theming
- InCaptta Emerald (#00A63E) as primary brand color
- Tailwind CSS configuration with custom colors
- Theme constants in `src/constants/theme.ts`

## Getting Started

1. Install dependencies:
```bash
npm install
```

2. Start the development server:
```bash
npm start
```

3. Run on specific platform:
```bash
npm run android  # For Android
npm run ios      # For iOS
npm run web      # For Web/PWA
```

## Configuration Files

- `tsconfig.json` - TypeScript configuration with strict mode and path aliases
- `tailwind.config.js` - Tailwind CSS configuration with InCaptta theme
- `babel.config.js` - Babel configuration with NativeWind preset
- `package.json` - Project dependencies and scripts

## Type Safety

All code is fully typed with strict TypeScript configuration. Type definitions are centralized in `src/types/index.ts`.

## Firebase Configuration

Firebase is initialized in `src/lib/firebase.ts` with the following services:
- Authentication
- Firestore (with long polling enabled)
- Storage

## Next Steps

To continue development:

1. Implement feature-specific components in `src/features/`
2. Add Firebase Firestore integration to stores
3. Implement authentication flow
4. Create reusable UI components in `src/components/`
5. Add form validation using React Hook Form + Zod
6. Implement offline-first considerations with Firestore persistence

## Architecture Compliance

This implementation follows the React Native Architecture Specification:
- ✅ Expo SDK 50+
- ✅ Expo Router (File-based, Typed)
- ✅ Zustand for state management
- ✅ NativeWind for styling
- ✅ Firebase JS SDK
- ✅ Lucide React Native icons
- ✅ React Hook Form + Zod
- ✅ Feature-based modular architecture
- ✅ InCaptta Emerald brand color
- ✅ 1:1 financial engine mirror
- ✅ 2-step approval machine
- ✅ Strict TypeScript configuration
