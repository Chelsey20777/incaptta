# Blueprint: B2B Equipment Hire (Machinery Rental) Module

This blueprint provides the complete, self-contained implementation specification and code templates for the **B2B Equipment Hire (Machinery Rental) Module**.

---

## 1. Database Schema & Data Models (Firestore Docs)

The application uses **Google Cloud Firestore** (via `@/lib/firebase`) for all data. We will create three new Firestore collections:

### Collection 1: `equipmentAssets`
Each document represents a piece of high-value machinery or implement.
- **`id`** (`string`): Document ID.
- **`name`** (`string`): e.g., "John Deere 6155M Tractor", "McHale F5500 Baler".
- **`serialNumber`** (`string`): e.g., "1JD6155M-XYZ789".
- **`category`** (`'Tractor' | 'Harvester' | 'Implement' | 'Other'`): Classification.
- **`currentEngineHours`** (`number`): Floating-point number recording aggregate engine meter.
- **`currentOdometer`** (`number`): Floating-point number recording mileage (if applicable).
- **`compatibilityTags`** (`string[]`): Array of strings containing matching specifications (e.g., `["hp:150", "hitch:three-point", "cat:2"]`). Tractors advertise hitches/HP, while Implements advertise hitch/HP requirements.
- **`status`** (`'Available' | 'On_Hire' | 'Maintenance' | 'Standby'`): Asset status.
- **`createdAt`** (`timestamp`): Server timestamp.
- **`updatedAt`** (`timestamp`): Server timestamp.

### Collection 2: `hireContracts`
Each document represents a commercial rental agreement.
- **`id`** (`string`): Document ID.
- **`customerId`** (`string`): Customer ID link.
- **`customerName`** (`string`): Customer name cached for display.
- **`assetId`** (`string`): EquipmentAsset document link.
- **`assetName`** (`string`): Cached asset name.
- **`status`** (`'Draft' | 'Active' | 'Pending_Return' | 'Closed'`): Lifecycle state.
- **`startDate`** (`string`): Format `YYYY-MM-DD`.
- **`endDate`** (`string`): Format `YYYY-MM-DD`.
- **`hireType`** (`'WET' | 'DRY'`): WET includes driver/operator, DRY does not.
- **`baseDailyRate`** (`number`): Base cost per day in USD.
- **`includedDailyHours`** (`number`): Included daily engine hours (typically `8.0`).
- **`excessHourRate`** (`number`): Billing rate per excess hour.
- **`standbyRatePercentage`** (`number`): Fraction of daily rate applied on approved standby days (default `0.50`).
- **`standbyDays`** (`string[]`): Array of `YYYY-MM-DD` strings flagged as standby/rain-out dates.
- **`createdAt`** / **`updatedAt`** (`timestamp`): System stamps.

### Collection 3: `inspectionLogs`
Each document stores pre-hire (Gate-Out) or post-hire (Gate-In) asset reports.
- **`id`** (`string`): Document ID.
- **`contractId`** (`string`): Linked contract ID.
- **`type`** (`'PRE_HIRE' | 'POST_HIRE'`): Stage indicator.
- **`engineHoursRecorded`** (`number`): Meter reading during inspection.
- **`fuelLevelPercentage`** (`number`): Fuel level (0 to 100).
- **`biosecurityWashdownCertified`** (`boolean`): Certification status.
- **`damageNotes`** (`string`): Text notes.
- **`signedOffByUserId`** (`string`): ID of inspecting technician.
- **`signedOffByUserName`** (`string`): Cached technician name.
- **`createdAt`** (`timestamp`): System stamp.

---

## 2. Invoicing Calculation Engine

Create a utility class `src/lib/billing-engine.ts` to compute invoices.

```typescript
export interface InvoiceBreakdown {
  totalDays: number;
  standbyDaysCount: number;
  billableDaysCount: number;
  baseTimeCost: number;
  allowedHours: number;
  actualHours: number;
  excessHours: number;
  excessCost: number;
  totalInvoiceCost: number;
}

export function calculateFinalRentalInvoice(
  contract: any,
  preInspection: any,
  postInspection: any
): InvoiceBreakdown {
  const start = new Date(contract.startDate);
  const end = new Date(contract.endDate);
  
  // Calculate calendar days (inclusive)
  const diffTime = Math.abs(end.getTime() - start.getTime());
  const totalDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

  // Filter approved standby days that fall within the contract range
  const standbyDaysCount = (contract.standbyDays || []).filter((dateStr: string) => {
    const d = new Date(dateStr);
    return d >= start && d <= end;
  }).length;

  const billableDaysCount = Math.max(0, totalDays - standbyDaysCount);

  // 1. Base Time Cost Calculation
  const normalRateCost = billableDaysCount * (contract.baseDailyRate || 0);
  const standbyRateCost = standbyDaysCount * (contract.baseDailyRate || 0) * (contract.standbyRatePercentage || 0.5);
  const baseTimeCost = normalRateCost + standbyRateCost;

  // 2. Allowed engine hours (standby days tally 0 hours allowance)
  const allowedHours = billableDaysCount * (contract.includedDailyHours || 8.0);

  // 3. Actual engine hours utilized
  const initialHours = preInspection?.engineHoursRecorded || 0;
  const finalHours = postInspection?.engineHoursRecorded || initialHours;
  const actualHours = Math.max(0, finalHours - initialHours);

  // 4. Excess hours calculation
  const excessHours = Math.max(0, actualHours - allowedHours);
  const excessCost = excessHours * (contract.excessHourRate || 0);

  // 5. Grand Total
  const totalInvoiceCost = baseTimeCost + excessCost;

  return {
    totalDays,
    standbyDaysCount,
    billableDaysCount,
    baseTimeCost,
    allowedHours,
    actualHours,
    excessHours,
    excessCost,
    totalInvoiceCost
  };
}
```

---

## 3. Zustand Store (`src/stores/equipment-hire-store.ts`)

```typescript
'use client'

import { create } from 'zustand'
import { db } from '@/lib/firebase'
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp
} from 'firebase/firestore'
import { toast } from 'sonner'

export interface EquipmentAsset {
  id: string
  name: string
  serialNumber: string
  category: 'Tractor' | 'Harvester' | 'Implement' | 'Other'
  currentEngineHours: number
  currentOdometer: number
  compatibilityTags: string[]
  status: 'Available' | 'On_Hire' | 'Maintenance' | 'Standby'
}

export interface HireContract {
  id: string
  customerId: string
  customerName: string
  assetId: string
  assetName: string
  status: 'Draft' | 'Active' | 'Pending_Return' | 'Closed'
  startDate: string
  endDate: string
  hireType: 'WET' | 'DRY'
  baseDailyRate: number
  includedDailyHours: number
  excessHourRate: number
  standbyRatePercentage: number
  standbyDays: string[]
}

export interface InspectionLog {
  id: string
  contractId: string
  type: 'PRE_HIRE' | 'POST_HIRE'
  engineHoursRecorded: number
  fuelLevelPercentage: number
  biosecurityWashdownCertified: boolean
  damageNotes: string
  signedOffByUserId: string
  signedOffByUserName: string
  createdAt?: any
}

interface EquipmentHireState {
  assets: EquipmentAsset[]
  contracts: HireContract[]
  inspections: InspectionLog[]
  loading: boolean
  
  fetchData: () => () => void
  createAsset: (asset: Omit<EquipmentAsset, 'id'>) => Promise<void>
  updateAssetStatus: (id: string, status: EquipmentAsset['status'], engineHours?: number) => Promise<void>
  createContract: (contract: Omit<HireContract, 'id'>) => Promise<string>
  updateContractStatus: (id: string, status: HireContract['status']) => Promise<void>
  addStandbyDay: (id: string, dateStr: string) => Promise<void>
  saveInspection: (inspection: Omit<InspectionLog, 'id'>) => Promise<void>
}

export const useEquipmentHireStore = create<EquipmentHireState>((set, get) => {
  let unsubscribeAll: (() => void)[] = []

  return {
    assets: [],
    contracts: [],
    inspections: [],
    loading: false,

    fetchData: () => {
      // Clean up previous listeners
      unsubscribeAll.forEach(unsub => unsub())
      unsubscribeAll = []

      set({ loading: true })

      const unsubAssets = onSnapshot(collection(db, 'equipmentAssets'), (snap) => {
        const assets: EquipmentAsset[] = []
        snap.forEach(d => assets.push({ id: d.id, ...d.data() } as any))
        set({ assets })
      })

      const unsubContracts = onSnapshot(query(collection(db, 'hireContracts'), orderBy('startDate', 'desc')), (snap) => {
        const contracts: HireContract[] = []
        snap.forEach(d => contracts.push({ id: d.id, ...d.data() } as any))
        set({ contracts })
      })

      const unsubInspections = onSnapshot(collection(db, 'inspectionLogs'), (snap) => {
        const inspections: InspectionLog[] = []
        snap.forEach(d => inspections.push({ id: d.id, ...d.data() } as any))
        set({ inspections, loading: false })
      })

      unsubscribeAll = [unsubAssets, unsubContracts, unsubInspections]
      return () => {
        unsubscribeAll.forEach(unsub => unsub())
        unsubscribeAll = []
      }
    },

    createAsset: async (asset) => {
      await addDoc(collection(db, 'equipmentAssets'), {
        ...asset,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      })
      toast.success('Equipment asset created successfully')
    },

    updateAssetStatus: async (id, status, engineHours) => {
      const updateData: Record<string, any> = { status, updatedAt: serverTimestamp() }
      if (engineHours !== undefined) {
        updateData.currentEngineHours = engineHours
      }
      await updateDoc(doc(db, 'equipmentAssets', id), updateData)
    },

    createContract: async (contract) => {
      const docRef = await addDoc(collection(db, 'hireContracts'), {
        ...contract,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      })
      toast.success('Contract drafted successfully')
      return docRef.id
    },

    updateContractStatus: async (id, status) => {
      await updateDoc(doc(db, 'hireContracts', id), {
        status,
        updatedAt: serverTimestamp()
      })
    },

    addStandbyDay: async (id, dateStr) => {
      const contract = get().contracts.find(c => c.id === id)
      if (!contract) return
      const standbyDays = [...(contract.standbyDays || [])]
      if (standbyDays.includes(dateStr)) {
        toast.info('Day is already marked as Standby')
        return
      }
      standbyDays.push(dateStr)
      await updateDoc(doc(db, 'hireContracts', id), {
        standbyDays,
        updatedAt: serverTimestamp()
      })
      toast.success('Standby day approved')
    },

    saveInspection: async (inspection) => {
      await addDoc(collection(db, 'inspectionLogs'), {
        ...inspection,
        createdAt: serverTimestamp()
      })
      toast.success('Inspection record logged')
    }
  }
})
```

---

## 4. UI Dashboard: Dispatch Board Calendar (`src/app/equipment-hire/page.tsx`)

Render this interface containing:
1. **Visual Dispatch Board**:
   - Dates for next 14 days on the X-Axis.
   - Equipment Assets listed on the Y-Axis.
   - Dynamic bar segments indicating active contract timelines.
   - Color code bar segments by status (Green = Active/On_Hire, Blue = Standby, Yellow = Maintenance).
   - Display a distinct striped overlay for the **24-Hour Post-Hire Biosecurity Washdown Buffer** (immediately following a contract end date).
2. **Contracts Tab**: Filterable list by status (Draft, Active, Pending_Return, Closed) with actions to log inspections.
3. **Add Asset Dialog**: Standard form to create new equipment including categories and HP compatibility tags.

---

## 5. Multi-Step Lifecycle Wizard Dialog

Implement step-by-step form flows for executing contract status transitions:

```
[Draft Contract] ──► Pre-Hire (Gate-Out) ──► [Active/On_Hire] ──► Post-Hire (Gate-In) ──► [Invoice Summary] ──► [Closed]
```

### Step 1: Contract Draft
- Fields: Customer Selector, Equipment Asset Selector, Start & End Dates, Daily Base Rate, Included Hours, Excess Rate, Wet/Dry Option.
- **Tractor-Implement Compatibility Validation Rule**: If Category is an `Implement`, search compatibility tags for horse-power (`hp:`) and hitch types (`hitch:`). Warn user or block if tractor specs do not match hitch requirements.

### Step 2: Gate-Out Pre-Hire Inspection
- Requires: Technical operator authentication sign-off.
- Mandatory Fields: Current Engine Hours (must default to Asset's current engine hours), fuel level slider, damage notes checklist.
- Mandatory Action Checkbox: **"Biosecurity Washdown Complete & Certified"**.
- Action: On submission, logs `PRE_HIRE` inspection, updates asset status to `On_Hire`, updates contract status to `Active`.

### Step 3: Gate-In Post-Hire Inspection
- Triggered when returning the asset.
- Mandatory Fields: Returning Engine Hours, fuel level percentage, return damage notes.
- **Strict Validation Rule**: Returning engine hours *MUST* be $\ge$ the Departure engine hours.
- Action: Logs `POST_HIRE` inspection, sets contract status to `Pending_Return`.

### Step 4: Invoice Summary
- Triggered on `Pending_Return` contracts.
- Invokes `calculateFinalRentalInvoice` to display the breakdown table:
  - Base billable days cost.
  - Standby days credits.
  - Excess engine hours fee (comparing actual hours against allocated limit).
  - Total amount due.
- Provide a button **"Close Contract & Post to Ledger"** that updates contract status to `Closed` and updates the Asset state back to `Available`. This starts the 24-hour washdown buffer indicator.

---

## 6. Integration Steps (Links and Navs)

1. Add the sidebar icon and menu link in `src/components/layout/app-sidebar.tsx`:
   - Import `Truck` from `lucide-react`.
   - Add entry:
     ```typescript
     { title: 'Equipment Hire', icon: Truck, path: '/equipment-hire', roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'TECHNICAL', 'DIRECTOR'] }
     ```
2. Add the mobile navigation drawer sync in `src/components/layout/app-layout.tsx` (using the same roles and properties).
