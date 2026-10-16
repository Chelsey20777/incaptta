# IncapttaPro Backend API

Express/TypeScript API for the IncapttaPro project management system. This document was moved from the root README so the repository homepage can focus on the full product monorepo.

## Setup

1. **Prerequisites**: Node.js 18+, Firebase Project.
2. **Install Dependencies** (from the repository root):

   ```bash
   npm install
   ```

3. **Environment Variables**:
   Create a `.env` file based on `.env.example`:

   ```ini
   PORT=3000
   GOOGLE_APPLICATION_CREDENTIALS=./path/to/service-account-key.json
   ```

   If running in an environment with default Google credentials (e.g., GCE, Cloud Run), `GOOGLE_APPLICATION_CREDENTIALS` is optional.

4. **Run Development Server**:

   ```bash
   npm run dev
   ```

5. **Run Tests**:

   ```bash
   npm test
   ```

6. **Build**:

   ```bash
   npm run build
   ```

## API Endpoints

### Inventory

- `GET /api/inventory`: List items (filters: category, sku, isActive).
- `POST /api/inventory`: Create item (Admin, Storekeeper).
- `GET /api/inventory/:id`: Get item details.
- `PATCH /api/inventory/:id`: Update item (Admin, Storekeeper).
- `POST /api/inventory/import`: Bulk import (Stub).

### Job Requisitions

- `POST /api/job-requisitions`: Create draft requisition.
- `GET /api/job-requisitions`: List requisitions.
- `GET /api/job-requisitions/:id`: Get requisition details.
- `PATCH /api/job-requisitions/:id`: Update draft.
- `POST /api/job-requisitions/:id/submit`: Submit for approval.
- `POST /api/job-requisitions/:id/line-items/:lineItemId/approve`: Approve line (Accountant/Director).
- `POST /api/job-requisitions/:id/line-items/:lineItemId/release`: Deduct stock & issue item (Director/Admin).
- `POST /api/job-requisitions/:id/cancel`: Cancel.

### Clients

- `GET /api/clients`: List clients.
- `POST /api/clients`: Create client.
- `GET /api/clients/:id`: Details.
- `PATCH /api/clients/:id`: Update.

### Users

- `GET /api/users/me`: Current user profile.
- `GET /api/users`: List users (Admin, Manager).
- `PATCH /api/users/:id`: Update user role (Admin).

### Billing

- `POST /api/quotations/from-job-requisition/:jrId`: Generate Quote.
- `GET /api/quotations/:id`: Get Quote.
- `POST /api/invoices/from-quotation/:quoteId`: Generate Invoice.
- `GET /api/invoices/:id`: Get Invoice.

### Stock Ledger

- `GET /api/stock-ledger`: Audit trail of all inventory movements.
- `POST /api/stock-ledger/adjust`: Manual stock adjustment (Admin).

## Assumptions & Design Decisions

1. **Inventory Impact**: Stock is deducted in a staged manner. A line item can be partially `RELEASED` multiple times until `qtyIssued` reaches `qtyRequested`.
2. **Concurrency**: Transactional logic is used for all stock movements (Issue, Return, Adjust) to prevent race conditions and negative stock.
3. **Idempotency**: Stock releases use a deterministic `releaseId` to prevent duplicate deductions on retry.
4. **Authentication**: Takes a Firebase ID Token in the `Authorization: Bearer <token>` header.
5. **RBAC**: Roles (Admin, Director, Accountant, employee) are checked against the `users` collection.

## Testing

Jest is used for testing. `src/tests/jobRequisition.test.ts` verifies the critical stock deduction logic using mocked Firestore transactions.

## Emergency Access Recovery

If the application has no running server and you need to promote a user to `SUPER_ADMIN` in a "break-glass" emergency, you can run the promotion script directly from your terminal.

The script connects directly to Firebase Auth and Firestore using the environment credentials.

### Usage

Run the script from the project root directory, passing the target user's Firebase UID as the argument:

```bash
npx ts-node scripts/assign-super-admin.ts <USER_UID>
```

### Script Actions

1. Resolves the user's email and fetches their current custom claims.
2. Promotes the user by adding `SUPER_ADMIN` to their role array and sets `isActive` to true.
3. Synchronizes the roles update to the Firestore `/users/{uid}` document.
4. Updates the Firebase Auth custom user claims.
5. Revokes all current refresh tokens forcing active client sessions to re-authenticate immediately.
