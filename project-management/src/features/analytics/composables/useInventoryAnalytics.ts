/**
 * useInventoryAnalytics — Inventory Domain Analytics Composable
 *
 * Computes InventoryAnalyticsContext by reading:
 *   - inventoryStore.items / lowStockItems / totalValue → snapshot metrics
 *   - stockLedger Firestore collection (direct getDocs query) → stock movement
 *
 * The snapshot metrics (totalItems, activeItems, lowStockCount, totalInventoryValue)
 * are reactive computed values sourced from the store.
 *
 * Stock movement (totalIssued, totalReturned, topConsumedItems) requires a
 * one-time Firestore query because no store method provides a period-range
 * bulk fetch of the stockLedger collection. The query re-runs whenever
 * periodDays changes via a watch.
 *
 * stockMovement is optional per the unified-context spec — it will be undefined
 * while the query is in-flight or if the query fails.
 *
 * The caller is responsible for ensuring inventoryStore is hydrated.
 */

import { computed, ref, watch, toValue } from 'vue'
import type { Ref } from 'vue'
import { db } from '@/lib/firebase'
import { collection, query, where, getDocs, Timestamp } from 'firebase/firestore'
import { useInventoryStore } from '@/features/inventory/store/inventoryStore'
import type {
  InventoryAnalyticsContext,
  InvStockMovement,
  InvTopConsumedItem,
} from '../types/unified-context'

// ─── Constants ────────────────────────────────────────────────────────────────

/** Firestore collection name — mirrors LEDGER_COLLECTION in inventoryApi.ts */
const LEDGER_COLLECTION = 'stockLedger'

/** Maximum items in the topConsumedItems list. */
const TOP_CONSUMED_LIMIT = 10

// ─── Composable ───────────────────────────────────────────────────────────────

export function useInventoryAnalytics(periodDays: Ref<number>) {
  const inventoryStore = useInventoryStore()

  /**
   * stockMovement is populated by the async Firestore query.
   * undefined while loading or on query failure.
   */
  const stockMovement = ref<InvStockMovement | undefined>(undefined)

  /**
   * Fetches all stockLedger entries where postedAt >= periodStart.
   * Aggregates ISSUE and RETURN movements. ADJUST entries are ignored
   * for the totalIssued / totalReturned totals.
   *
   * StockLedgerEntry shape (confirmed in inventory/types/index.ts):
   *   movementType: 'ISSUE' | 'RETURN' | 'ADJUST'
   *   qty: number  — negative = outflow (ISSUE), positive = inflow (RETURN)
   *   inventoryItemId: string
   *   postedAt: Timestamp
   */
  async function fetchStockMovement(days: number): Promise<void> {
    const now = new Date()
    const periodStartDate = new Date(now)
    periodStartDate.setDate(periodStartDate.getDate() - days)

    try {
      const startTs = Timestamp.fromDate(periodStartDate)
      const q = query(
        collection(db, LEDGER_COLLECTION),
        where('postedAt', '>=', startTs),
      )
      const snap = await getDocs(q)
      const entries = snap.docs.map(d => ({ id: d.id, ...d.data() })) as any[]

      let totalIssued = 0
      let totalReturned = 0
      const itemIssuedMap = new Map<string, number>()

      for (const e of entries) {
        // qty is stored as negative for outflows (ISSUE); take abs value for totals
        const qty = Math.abs(Number(e.qty) || 0)
        if (e.movementType === 'ISSUE') {
          totalIssued += qty
          const itemId = String(e.inventoryItemId ?? '')
          if (itemId) {
            itemIssuedMap.set(itemId, (itemIssuedMap.get(itemId) ?? 0) + qty)
          }
        } else if (e.movementType === 'RETURN') {
          totalReturned += qty
        }
        // ADJUST entries are intentionally excluded from issued/returned totals
      }

      // Resolve item labels from the store — items must be hydrated by caller
      const topConsumedItems: InvTopConsumedItem[] = Array.from(itemIssuedMap.entries())
        .map(([id, issued]): InvTopConsumedItem => {
          const storeItem = inventoryStore.items.find(i => (i as any).id === id)
          const label = String((storeItem as any)?.name ?? (storeItem as any)?.label ?? id)
          return { id, label, totalIssued: issued }
        })
        .sort((a, b) => b.totalIssued - a.totalIssued)
        .slice(0, TOP_CONSUMED_LIMIT)

      stockMovement.value = { totalIssued, totalReturned, topConsumedItems }
    } catch (err) {
      console.error('[useInventoryAnalytics] Failed to fetch stock movement:', err)
      // Leave stockMovement undefined — callers must handle the optional
      stockMovement.value = undefined
    }
  }

  // Re-fetch whenever periodDays changes. immediate: true runs on mount.
  watch(periodDays, (days) => { fetchStockMovement(days) }, { immediate: true })

  const context = computed<InventoryAnalyticsContext>(() => {
    const allItems = inventoryStore.items

    return {
      totalItems: allItems.length,
      // isActive is a boolean field confirmed on InventoryItem in inventoryStore
      activeItems: allItems.filter(i => (i as any).isActive).length,
      lowStockCount: inventoryStore.lowStockItems.length,
      totalInventoryValue: inventoryStore.totalValue,
      // stockMovement is undefined while the async query is in-flight
      ...(stockMovement.value !== undefined ? { stockMovement: stockMovement.value } : {}),
    }
  })

  return {
    /**
     * Readonly reactive computed ref. Access via context.value.
     * The snapshot fields update reactively; stockMovement updates after each
     * async fetch triggered by periodDays changes.
     */
    context: context as Readonly<typeof context>,
  }
}
