# IncapttaPro — Fowlrun → JobCard Integration
## Chunk 1: useCreateJobCardFromCalculator + CreateJobCardPanel

---

## Files Delivered

| File | Purpose |
|---|---|
| `src/features/jobCards/composables/useCreateJobCardFromCalculator.ts` | Core logic — maps BOQ → JobCard, matches inventory, writes Firestore |
| `src/components/agric-structures/calculator/CreateJobCardPanel.vue` | Slide-over UI panel triggered from calculator |
| `FOWLRUN_CALCULATOR_PATCH.md` | Exact minimal changes to existing FowlrunCalculator.vue |

---

## Cline Agent Prompt — Implement Chunk 1

Paste this directly into Cline:

```
You are working on IncapttaPro (Vue 3, TypeScript, Vite, Tailwind CSS v4, 
shadcn-vue, Pinia, Vue Router 5, Firebase/Firestore).

I have provided two new files. Copy them into the project EXACTLY as-is 
without modifying any logic:

FILE 1 — copy to:
src/features/jobCards/composables/useCreateJobCardFromCalculator.ts

FILE 2 — copy to:
src/components/agric-structures/calculator/CreateJobCardPanel.vue

Then apply ONLY the changes described in FOWLRUN_CALCULATOR_PATCH.md 
to the existing FowlrunCalculator.vue. Read that file carefully and 
make ONLY those additions — do not restructure or move existing code.

After copying, fix any import path issues:
- Verify @/lib/firebase exports { db }
- Verify @/stores/auth exports useAuthStore with currentUser property
- Verify @/types/fowlrun.types exports FowlrunCalculation and BOQItem
- Verify shadcn-vue components exist at @/components/ui/sheet, 
  @/components/ui/button, @/components/ui/input, @/components/ui/label,
  @/components/ui/select
- Verify Vue Router route name 'JobCardDetail' exists with params.id

If any import path differs from what the file expects, update the import 
path to match the actual location in this project. Do NOT change the logic.

Run tsc --noEmit and fix any TypeScript errors.
Do not add new dependencies.
```

---

## What Chunk 1 Does

```
User clicks "Create Job Card" on FowlrunCalculator
         ↓
CreateJobCardPanel slide-over opens
         ↓
User fills: Client Name, Site Location, Department, Category, Quote (optional)
         ↓
useCreateJobCardFromCalculator runs:
  1. Generates JC-2026-XXXX (systemCounters/jobCards transaction)
  2. Matches each material item against inventoryItems collection
     → MATCHED: snaps irdSellingPrice, costSnapshot, twidMarkupPercent, stockStatus
     → UNMATCHED: preserves BOQ unitPrice, flags for later mapping
  3. Builds requisitionSections[] (nested) + requisitionItems[] (flat mirror)
  4. Writes jobCards/{id} + jobCards/{id}/items sub-collection in batch
  5. Sets fowlrunMeta: { structureLength, structureWidth, floorArea, bays, ... }
         ↓
toast.success("JC-2026-0042 created · 3 items need inventory mapping")
         ↓
Navigates to /job-cards/{id}
```

---

## Firestore Fields Written

### jobCards/{id} (new fields added to existing schema)
```
fowlrunMeta: {
  structureLength: number      // e.g. 80
  structureWidth: number       // e.g. 10
  floorArea: number            // e.g. 800
  bays: number                 // e.g. 16
  birdCapacityMin: number
  birdCapacityMax: number
  linkedCalculationId: string | null
  linkedQuoteId: string | null
  source: 'fowlrun-calculator'
}
```

### requisitionItems[] (flat) — new fields on each item
```
boqCategory: 'material' | 'labour' | 'transport'
inventoryMatchStatus: 'MATCHED' | 'UNMATCHED'
stockStatus: 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK' | 'NOT_CHECKED'
stockAtSnapshot: number    // onHand at time of job card creation
```

---

## Chunk 2 Next
Step 3+4: JobCard Materials tab — stock badges, match actions, MapInventoryItemPanel
Depends on: Chunk 1 complete and job cards navigating correctly to detail page.
```
