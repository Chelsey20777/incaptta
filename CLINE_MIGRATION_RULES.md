# Cline Migration Rules: Vue 3 to Next.js

This document defines strict instructions, constraints, and architecture guidelines for the migration of the Incaptta Project Management systems from Vue 3 to Next.js 16.

> [!IMPORTANT]
> **READ-ONLY DIRECTORIES (NEVER WRITE CODE HERE)**
> You must **NEVER** add, modify, or delete any files in the following folders:
> - `project-management/`
> - `incaptta-manage/`
> - `incaptta-web/`
>
> These legacy codebases are written in Vue 3 (Vite + Pinia). They serve **strictly as reference material**. You may read their files to understand legacy logic, data schemas, layouts, and business rules, but any changes to them are strictly prohibited.

---

## 🚀 Writeable Migration Targets

All migration work, new pages, components, and logic must be written **only** in the following Next.js codebases:

1. **`project-management-next/`** - Next.js 16 ERP system target.
2. **`incaptta-manage-next/`** - Next.js 16 Manager Dashboard target.

---

## 🛠️ Next.js 16 Technical Stack

When writing code in either Next.js repository, adhere strictly to the following stack and patterns:

1. **Core Framework**: Next.js 16.2.9 (App Router) + React 19.2.4 + TypeScript.
2. **Styling**: Tailwind CSS v4 (`@tailwindcss/postcss`).
3. **UI Components & Accessibility**: Base UI primitives (`@base-ui/react`) and custom UI components built with Radix/Shadcn paradigms.
   - *Selector Rule*: Base UI primitives (like Tabs) rely on data attributes like `data-[orientation=horizontal]`. Do NOT use custom legacy styling classes like `data-horizontal`. Always use modern Tailwind v4 responsive classes.
4. **State Management**: Zustand (`zustand`). Do not introduce other state management libraries.
5. **Database**: Firestore (`firebase/firestore`). Use real-time synchronization via `onSnapshot` when real-time updates are needed (e.g., job cards, transactions).
6. **Form Handling & Validation**: React Hook Form + Zod for schema validation.
7. **Email System**: Resend. Secure operations with server actions (e.g., check authorizations server-side, validate inputs, verify signatures for webhooks).

---

## 📂 Mapping Legacy Vue to Next.js

When porting a legacy Vue feature:
- Look at the Vue component files under `project-management/src/features/...` or `incaptta-manage/src/...` to understand the state, computed properties, methods, and lifecycle hooks.
- Rewrite the features as functional React components inside the corresponding Next.js routes.
- Map Vue Router paths to Next.js App Router dynamic folders (e.g., `/crm/customers/:id` in Vue becomes `/crm/customers/[id]/page.tsx` in Next.js).
- Port Pinia store states to Zustand stores (e.g. `useAuthStore`, `useAdminStore`).
- Re-use the existing Firebase Firestore collection structure (e.g. `jobCards`, `users`, `requisitions`).

---

## 🧪 Verification Guidelines

- Ensure that any code written compiles without TypeScript or build errors.
- Run `npm run build` inside the targeted directory (`project-management-next` or `incaptta-manage-next`) to verify the build output before finalizing a task.

---

## 📋 Actionable Tasks & Next Steps

Always refer to **`PENDING_MIGRATION_MODULES.md`** in the workspace root for your prioritized, step-by-step migration objectives and target mappings.
