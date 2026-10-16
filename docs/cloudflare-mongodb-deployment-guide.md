# Incaptta: Cloudflare Deployment & MongoDB Atlas Setup Guide

This guide provides step-by-step instructions for deploying Incaptta to **Cloudflare** and utilizing **MongoDB Atlas** as the database with self-hosted authentication.

---

## 1. Setting up MongoDB Atlas

1. **Create an Atlas Account & Cluster**:
   - Sign in to [MongoDB Atlas](https://www.mongodb.com/cloud/atlas).
   - Create a project and deploy a cluster (Free M0 or dedicated).
   - Select a region close to your primary user base (e.g., `af-south-1` or `eu-west-1` / `us-east-1`).

2. **Configure Database Access**:
   - Go to **Security** → **Database Access**.
   - Click **Add New Database User**.
   - Choose **Password** authentication.
   - Set a secure username and password (e.g. `incaptta_admin`).
   - Assign the **Read and write to any database** privilege (or `dbOwner` on `incaptta`).

3. **Configure Network Access**:
   - Go to **Security** → **Network Access**.
   - Click **Add IP Address**.
   - Because Cloudflare Workers run across hundreds of global edge data centers with dynamic IP addresses, select **Allow Access from Anywhere** (`0.0.0.0/0`).
   - *Security Note*: Access remains cryptographically secured by TLS 1.3 encryption and your strong database credentials.

4. **Obtain Connection String**:
   - On the Database Deployments page, click **Connect** → **Drivers** (Node.js).
   - Copy the SRV connection string:
     ```text
     mongodb+srv://<username>:<password>@cluster0.xxxxx.mongodb.net/incaptta?retryWrites=true&w=majority
     ```

---

## 2. Seeding the Admin User or Migrating Existing Data

### Option A: Quick-Seed a Super Admin in MongoDB Atlas
To immediately log into the ERP using MongoDB credentials:
```bash
# Set your environment variable
$env:MONGODB_URI="mongodb+srv://<username>:<password>@cluster0.xxxxx.mongodb.net/incaptta?retryWrites=true&w=majority"

# Run the admin seeder
npm run seed:mongodb-admin
```
This creates:
- **Email**: `admin@incaptta.com`
- **Password**: `Admin@123456`
- **Roles**: `SUPER_ADMIN`, `ADMIN`, `MANAGER`, `ACCOUNTANT`, `SALES`, `TECHNICAL`, `STOREKEEPER`, `DIRECTOR` (all modules unlocked).

### Option B: Full Data Migration from Firestore to MongoDB Atlas
To copy your existing collections (`users`, `inventoryItems`, `jobCards`, `quotations`, `invoices`, `clients`, `expenses`, etc.) from Firestore to MongoDB Atlas:
```bash
$env:MONGODB_URI="mongodb+srv://<username>:<password>@cluster0.xxxxx.mongodb.net/incaptta?retryWrites=true&w=majority"
npm run migrate:firestore-to-mongodb
```
This script transforms Firestore Timestamps into BSON Dates, preserves existing document IDs (`_id`), and generates a `migration-report.json`.

---

## 3. Deploying the Marketing Site (`incaptta-web`) to Cloudflare Pages

The marketing website is built with Vue 3 and Vite.

### Method 1: Cloudflare Dashboard (Recommended for Continuous Deployment)
1. In Cloudflare Dashboard, go to **Workers & Pages** → **Create application** → **Pages** → **Connect to Git**.
2. Select the Incaptta repository.
3. Configure the build settings:
   - **Root directory**: `incaptta-web`
   - **Framework preset**: `Vite`
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
4. Click **Save and Deploy**.

### Method 2: Command Line (Wrangler CLI)
```bash
cd incaptta-web
npm run build
npx wrangler pages deploy dist --project-name=incaptta-web
```

---

## 4. Deploying the Primary ERP (`project-management-next`) to Cloudflare

The ERP is powered by Next.js 16 (App Router) and deployed via OpenNext with Node.js compatibility (`nodejs_compat`).

### Step 1: Set Secrets in Cloudflare Workers
Run the following in `project-management-next`:
```bash
cd project-management-next

# Set MongoDB Atlas URI
npx wrangler secret put MONGODB_URI

# Set JWT Secret key (minimum 32 characters)
npx wrangler secret put JWT_SECRET
```

### Step 2: Build and Deploy
```bash
cd project-management-next

# Build for Cloudflare
npm run build:cloudflare

# Deploy to Cloudflare Workers
npm run deploy:cloudflare
```

---

## 5. Architecture & Security Highlights

1. **Dual-Auth Bridge**:
   - `src/middleware.ts` first checks for a self-hosted MongoDB JWT using `jose`.
   - If not present or during migration, it gracefully falls back to Firebase JWKS.
   - The login page automatically attempts MongoDB Atlas authentication before falling back to Firebase.
2. **Edge Connection Pooling**:
   - `src/lib/mongodb.ts` caches the `MongoClient` instance globally across warm worker invocations to prevent TCP connection exhaustion.
3. **Session Cookies**:
   - The `/api/auth/login` endpoint issues an authenticated `__session` token compatible with Next.js edge route guards and SSR.
