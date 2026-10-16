/**
 * useCreateJobCardFromCalculator.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Creates a JobCard document in Firestore from a FowlrunCalculation.
 *
 * Patterns followed (from codebase audit):
 *  - Counter:   systemCounters/jobCards  { currentYear, sequence }  → JC-2026-0001
 *  - Firebase:  db from '@/lib/firebase'
 *  - Line items: irdSellingPrice (not unitPrice), costSnapshot (not purchasePrice)
 *  - sku NOT stored — only inventoryItemId + itemName
 *  - Both requisitionSections[] (nested) + requisitionItems[] (flat) written together
 *  - Inventory match: query inventoryItems where name matches item.description
 *  - All Firestore writes via batch
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { ref } from 'vue'
import {
  collection,
  doc,
  runTransaction,
  writeBatch,
  getDocs,
  query,
  where,
  serverTimestamp,
  getDoc,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useAuthStore } from '@/stores/auth'           // adjust path to your auth store
import type { FowlrunCalculation, BOQItem } from '@/types/fowlrun.types'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface InventoryMatch {
  inventoryItemId: string
  itemName: string
  irdSellingPrice: number       // inventory.sellingPrice → snapshotted as irdSellingPrice
  costSnapshot: number          // inventory.totalCost   → snapshotted as costSnapshot
  twidMarkupPercent: number     // inventory.markupPercent
  onHand: number
  matchStatus: 'MATCHED' | 'UNMATCHED'
  stockStatus: 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK' | 'NOT_CHECKED'
}

export interface MappedRequisitionItem {
  id: string
  inventoryItemId: string
  itemName: string
  description: string
  qty: number
  irdSellingPrice: number
  costSnapshot: number
  twidMarkupPercent: number
  impCostPercent: number
  rowIRDTot: number
  rowMUTot: number
  rowImpCostTot: number
  rowGrandTot: number
  // Fowlrun-specific extensions
  boqCategory: 'material' | 'labour' | 'transport'
  inventoryMatchStatus: 'MATCHED' | 'UNMATCHED'
  stockStatus: 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK' | 'NOT_CHECKED'
  linkedPrId?: string
  linkedPrStatus?: string
  stockAtSnapshot?: number
}

export interface RequisitionSection {
  id: string
  jobCategoryId: string
  description: string
  qty: number
  items: MappedRequisitionItem[]
}

export interface CreateJobCardOptions {
  clientName: string
  siteLocation: string
  linkedQuoteId?: string
  linkedCalculationId?: string
  assignedTo?: string[]
  departmentId: string
  departmentName: string
  jobCategoryId: string
  jobCategoryName: string
}

export interface CreateJobCardResult {
  jobCardId: string
  jobCardNumber: string
  unmatchedCount: number
  matchedCount: number
  totalItems: number
}

// ─── Composable ───────────────────────────────────────────────────────────────

export function useCreateJobCardFromCalculator() {
  const isCreating = ref(false)
  const error = ref<string | null>(null)

  // ── 1. Generate job card number (matches existing frontend pattern exactly) ──
  async function generateJobNumber(): Promise<string> {
    const currentYear = new Date().getFullYear()
    const counterRef = doc(db, 'systemCounters', 'jobCards')

    const nextNumber = await runTransaction(db, async (transaction) => {
      const counterSnap = await transaction.get(counterRef)
      let seq = 1
      if (counterSnap.exists()) {
        const data = counterSnap.data()
        if (data.currentYear === currentYear) {
          seq = (data.sequence || 0) + 1
        }
        // Year changed → seq resets to 1 (implicit — seq stays 1)
      }
      transaction.set(counterRef, {
        currentYear,
        sequence: seq,
        lastUpdatedAt: serverTimestamp(),
      })
      return seq
    })

    return `JC-${currentYear}-${String(nextNumber).padStart(4, '0')}`
  }

  // ── 2. Match a single BOQ item against inventoryItems collection ─────────────
  async function matchInventoryItem(
    boqItem: BOQItem,
    qtyRequired: number
  ): Promise<InventoryMatch> {
    const unmatched: InventoryMatch = {
      inventoryItemId: '',
      itemName: boqItem.description,
      irdSellingPrice: boqItem.unitPrice,
      costSnapshot: boqItem.unitPrice,
      twidMarkupPercent: 0,
      onHand: 0,
      matchStatus: 'UNMATCHED',
      stockStatus: 'NOT_CHECKED',
    }

    try {
      // Case-insensitive match on name field
      // Firestore doesn't support native case-insensitive — we query and filter
      const itemsRef = collection(db, 'inventoryItems')

      // Try exact name match first
      const exactQ = query(
        itemsRef,
        where('name', '==', boqItem.description),
        where('isActive', '==', true)
      )
      let snap = await getDocs(exactQ)

      // If no exact match, try lowercase normalized name field if you store it
      // (add nameLower field to inventoryItems for better matching in the future)
      if (snap.empty) {
        // Fallback: partial match via prefix range query
        const end = boqItem.description.slice(0, -1) +
          String.fromCharCode(boqItem.description.charCodeAt(boqItem.description.length - 1) + 1)
        const prefixQ = query(
          itemsRef,
          where('name', '>=', boqItem.description),
          where('name', '<', end),
          where('isActive', '==', true)
        )
        snap = await getDocs(prefixQ)
      }

      if (snap.empty) return unmatched

      // Take first match
      const inventoryDoc = snap.docs[0]
      const inv = inventoryDoc.data()

      const onHand: number = inv.onHand ?? 0
      let stockStatus: InventoryMatch['stockStatus'] = 'IN_STOCK'
      if (onHand === 0) {
        stockStatus = 'OUT_OF_STOCK'
      } else if (onHand < qtyRequired) {
        stockStatus = 'LOW_STOCK'
      }

      return {
        inventoryItemId: inventoryDoc.id,
        itemName: inv.name ?? boqItem.description,
        irdSellingPrice: inv.sellingPrice ?? boqItem.unitPrice,
        costSnapshot: inv.totalCost ?? boqItem.unitPrice,
        twidMarkupPercent: inv.markupPercent ?? 0,
        onHand,
        matchStatus: 'MATCHED',
        stockStatus,
      }
    } catch (err) {
      console.warn(`[FowlrunJobCard] Inventory match failed for "${boqItem.description}":`, err)
      return unmatched
    }
  }

  // ── 3. Map BOQ items → RequisitionLineItems with inventory matching ───────────
  async function mapBOQToRequisitionItems(
    calc: FowlrunCalculation
  ): Promise<MappedRequisitionItem[]> {
    const materialItems = calc.items.filter(i => i.category === 'material')
    const labourItems = calc.items.filter(i => i.category === 'labour')
    const transportItems = calc.items.filter(i => i.category === 'transport')

    // Run inventory matches in parallel for materials
    const materialMatches = await Promise.all(
      materialItems.map(item => matchInventoryItem(item, item.qty))
    )

    const mapped: MappedRequisitionItem[] = []

    // Materials — matched against inventory
    materialItems.forEach((item, idx) => {
      const match = materialMatches[idx]
      const rowIRDTot = item.qty * match.irdSellingPrice
      const rowMUTot = rowIRDTot * (match.twidMarkupPercent / 100)
      const rowGrandTot = rowIRDTot + rowMUTot

      mapped.push({
        id: crypto.randomUUID(),
        inventoryItemId: match.inventoryItemId,
        itemName: match.itemName,
        description: item.description,
        qty: item.qty,
        irdSellingPrice: match.irdSellingPrice,
        costSnapshot: match.costSnapshot,
        twidMarkupPercent: match.twidMarkupPercent,
        impCostPercent: 0,
        rowIRDTot: parseFloat(rowIRDTot.toFixed(2)),
        rowMUTot: parseFloat(rowMUTot.toFixed(2)),
        rowImpCostTot: 0,
        rowGrandTot: parseFloat(rowGrandTot.toFixed(2)),
        boqCategory: 'material',
        inventoryMatchStatus: match.matchStatus,
        stockStatus: match.stockStatus,
        stockAtSnapshot: match.onHand,
      })
    })

    // Labour — no inventory matching (tracked as ad-hoc equivalent)
    labourItems.forEach(item => {
      mapped.push({
        id: crypto.randomUUID(),
        inventoryItemId: '',
        itemName: item.description,
        description: item.description,
        qty: item.qty,
        irdSellingPrice: item.unitPrice,
        costSnapshot: item.unitPrice,
        twidMarkupPercent: 0,
        impCostPercent: 0,
        rowIRDTot: parseFloat((item.qty * item.unitPrice).toFixed(2)),
        rowMUTot: 0,
        rowImpCostTot: 0,
        rowGrandTot: parseFloat((item.qty * item.unitPrice).toFixed(2)),
        boqCategory: 'labour',
        inventoryMatchStatus: 'UNMATCHED',
        stockStatus: 'NOT_CHECKED',
      })
    })

    // Transport — no inventory matching
    transportItems.forEach(item => {
      mapped.push({
        id: crypto.randomUUID(),
        inventoryItemId: '',
        itemName: item.description,
        description: item.description,
        qty: item.qty,
        irdSellingPrice: item.unitPrice,
        costSnapshot: item.unitPrice,
        twidMarkupPercent: 0,
        impCostPercent: 0,
        rowIRDTot: parseFloat((item.qty * item.unitPrice).toFixed(2)),
        rowMUTot: 0,
        rowImpCostTot: 0,
        rowGrandTot: parseFloat((item.qty * item.unitPrice).toFixed(2)),
        boqCategory: 'transport',
        inventoryMatchStatus: 'UNMATCHED',
        stockStatus: 'NOT_CHECKED',
      })
    })

    return mapped
  }

  // ── 4. Group mapped items into requisitionSections (nested) ──────────────────
  function buildRequisitionSections(
    items: MappedRequisitionItem[],
    options: CreateJobCardOptions
  ): RequisitionSection[] {
    const materialItems = items.filter(i => i.boqCategory === 'material')
    const labourItems = items.filter(i => i.boqCategory === 'labour')
    const transportItems = items.filter(i => i.boqCategory === 'transport')

    const sections: RequisitionSection[] = []

    if (materialItems.length > 0) {
      sections.push({
        id: crypto.randomUUID(),
        jobCategoryId: options.jobCategoryId,
        description: 'Brickwork & Foundation Materials',
        qty: 1,
        items: materialItems,
      })
    }

    if (labourItems.length > 0) {
      sections.push({
        id: crypto.randomUUID(),
        jobCategoryId: options.jobCategoryId,
        description: 'Labour',
        qty: 1,
        items: labourItems,
      })
    }

    if (transportItems.length > 0) {
      sections.push({
        id: crypto.randomUUID(),
        jobCategoryId: options.jobCategoryId,
        description: 'Transport & Logistics',
        qty: 1,
        items: transportItems,
      })
    }

    return sections
  }

  // ── 5. Calculate totals from mapped items ────────────────────────────────────
  function calcTotals(items: MappedRequisitionItem[]) {
    const inventoryIRDTotal = items.reduce((s, i) => s + i.rowIRDTot, 0)
    const inventoryMUTotal = items.reduce((s, i) => s + i.rowMUTot, 0)
    const inventoryIMPCostTotal = items.reduce((s, i) => s + i.rowImpCostTot, 0)
    const grandTotal = items.reduce((s, i) => s + i.rowGrandTot, 0)

    return {
      inventoryIRDTotal: parseFloat(inventoryIRDTotal.toFixed(2)),
      inventoryMUTotal: parseFloat(inventoryMUTotal.toFixed(2)),
      inventoryIMPCostTotal: parseFloat(inventoryIMPCostTotal.toFixed(2)),
      adHocTotal: 0,
      grandTotal: parseFloat(grandTotal.toFixed(2)),
    }
  }

  // ── 6. Main entry point ───────────────────────────────────────────────────────
  async function createJobCardFromCalculation(
    calc: FowlrunCalculation,
    options: CreateJobCardOptions
  ): Promise<CreateJobCardResult> {
    isCreating.value = true
    error.value = null

    try {
      const authStore = useAuthStore()
      const currentUser = authStore.currentUser
      if (!currentUser) throw new Error('User not authenticated')

      // Step A — generate job number (transaction-safe)
      const jobCardNumber = await generateJobNumber()

      // Step B — map BOQ items + match inventory
      const mappedItems = await mapBOQToRequisitionItems(calc)

      // Step C — build nested sections + flat mirror
      const requisitionSections = buildRequisitionSections(mappedItems, options)
      const requisitionItems = mappedItems  // flat mirror

      // Step D — calculate totals
      const totals = calcTotals(mappedItems)

      // Step E — build dimension string e.g. "80x10m"
      const dimensionsOfStructure = `${calc.size.L}x${calc.size.W}m`

      // Step F — batch write jobCard doc + sub-collections
      const batch = writeBatch(db)
      const jobCardRef = doc(collection(db, 'jobCards'))

      batch.set(jobCardRef, {
        status: 'DRAFT',

        generalInfo: {
          jobTitle: `${dimensionsOfStructure} Fowlrun Construction — ${options.clientName}`,
          projectDescription: `Agric-Structures fowlrun construction project. Structure: ${dimensionsOfStructure}. Capacity: ${calc.birdCapacityMin.toLocaleString()}–${calc.birdCapacityMax.toLocaleString()} birds.`,
          requestingDepartmentId: options.departmentId,
          requestingDepartmentName: options.departmentName,
          jobCategoryId: options.jobCategoryId,
          jobCategoryName: options.jobCategoryName,
          jobNumber: jobCardNumber,
          jobInvoiceValue: totals.grandTotal,
          projectLocation: options.siteLocation,
          dimensionsOfStructure,
          currency: 'USD',
          totalAmount: totals.grandTotal,
        },

        // Fowlrun-specific metadata
        fowlrunMeta: {
          structureLength: calc.size.L,
          structureWidth: calc.size.W,
          floorArea: calc.area,
          bays: calc.bays,
          birdCapacityMin: calc.birdCapacityMin,
          birdCapacityMax: calc.birdCapacityMax,
          linkedCalculationId: options.linkedCalculationId ?? null,
          linkedQuoteId: options.linkedQuoteId ?? null,
          source: 'fowlrun-calculator',
        },

        // BOQ sections — nested (primary)
        requisitionSections,

        // BOQ items — flat mirror (required by existing codebase)
        requisitionItems,

        // Totals
        totals,

        // Keep deprecated summary field for backward compat
        summary: {
          ...totals,
          expensesByMethod: { CASH: 0, ECOCASH: 0, BANK: 0 },
          itemCount: mappedItems.length,
          lastUpdatedAt: serverTimestamp(),
        },

        adHocExpenses: [],

        submittedBy: {
          uid: currentUser.uid,
          email: currentUser.email ?? '',
          name: currentUser.displayName ?? currentUser.email ?? '',
        },

        createdBy: {
          uid: currentUser.uid,
          name: currentUser.displayName ?? currentUser.email ?? '',
        },

        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })

      // Write flat items to sub-collection (legacy pattern)
      mappedItems.forEach(item => {
        const itemRef = doc(collection(db, 'jobCards', jobCardRef.id, 'items'))
        batch.set(itemRef, {
          ...item,
          createdAt: serverTimestamp(),
        })
      })

      await batch.commit()

      // Derive counts for result
      const matchedCount = mappedItems.filter(
        i => i.inventoryMatchStatus === 'MATCHED'
      ).length
      const unmatchedCount = mappedItems.filter(
        i => i.inventoryMatchStatus === 'UNMATCHED'
      ).length

      return {
        jobCardId: jobCardRef.id,
        jobCardNumber,
        matchedCount,
        unmatchedCount,
        totalItems: mappedItems.length,
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to create job card'
      error.value = msg
      throw err
    } finally {
      isCreating.value = false
    }
  }

  return {
    isCreating,
    error,
    createJobCardFromCalculation,
  }
}
