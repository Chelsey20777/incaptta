import { ref, watch, computed, type Ref } from 'vue'
import { collection, query, where, orderBy, limit, getDocs, type DocumentData } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useDebounceFn } from '@vueuse/core'

export interface InventorySearchResult {
  id: string
  sku: string
  name: string
  uom: string
  categoryName: string
  onHand: number
  purchasePrice: number
  freightDuty: number
  totalCost: number
  markupPercent: number
  sellingPrice: number
  status: string  // ACTIVE | PENDING_GRN | INACTIVE
  reorderLevel: number
  location: string
}

export interface UseInventorySearchOptions {
  activeOnly?: boolean         // default: true — filter status: 'ACTIVE' only
  includePendingGrn?: boolean  // default: false — include status: 'PENDING_GRN'
  limit?: number               // default: 10
}

/**
 * Reusable, debounced inventory item search composable.
 * Used by PR item picker and any component needing inventory search.
 */
export function useInventorySearch(
  searchQuery: Ref<string>,
  options?: UseInventorySearchOptions
) {
  const results = ref<InventorySearchResult[]>([])
  const isSearching = ref(false)
  const noResults = ref(false)
  const error = ref<string | null>(null)

  const {
    activeOnly = true,
    includePendingGrn = false,
    limit: resultsLimit = 10
  } = options || {}

  // Determine status filter based on options
  const statusFilter = computed(() => {
    if (!activeOnly) {
      return [] // No status filter
    }
    if (includePendingGrn) {
      return ['ACTIVE', 'PENDING_GRN']
    }
    return ['ACTIVE']
  })

  // Debounced search function (300ms as per spec)
  const performSearch = useDebounceFn(async (searchTerm: string) => {
    if (searchTerm.length < 2) {
      results.value = []
      noResults.value = false
      return
    }

    isSearching.value = true
    error.value = null
    noResults.value = false

    try {
      const inventoryRef = collection(db, 'inventoryItems')

      // Build queries for name and SKU search
      const queries = []

      // Note: Firestore does not support native case-insensitive search.
      // If a nameLower field exists on inventoryItems, use it for better accuracy.
      // For now, we query the name field directly (case-sensitive prefix).
      // TODO: Consider adding a nameLower field to inventoryItems collection
      // and updating this query to use where('nameLower', '>=', searchLower)
      // for improved search accuracy.

      // Query by name (prefix match)
      queries.push(
        query(
          inventoryRef,
          where('name', '>=', searchTerm),
          where('name', '<=', searchTerm + '\uf8ff'),
          orderBy('name', 'asc'),
          limit(resultsLimit)
        )
      )

      // Query by SKU (exact/prefix match)
      queries.push(
        query(
          inventoryRef,
          where('sku', '>=', searchTerm),
          where('sku', '<=', searchTerm + '\uf8ff'),
          orderBy('sku', 'asc'),
          limit(resultsLimit)
        )
      )

      // Execute all queries in parallel
      const snapshots = await Promise.all(
        queries.map(q => getDocs(q).catch(err => {
          console.error('Firestore query error:', err)
          return { docs: [] } // Return empty result on error
        }))
      )

      // Merge and deduplicate results
      const mergedResults = new Map<string, InventorySearchResult>()
      
      for (const snapshot of snapshots) {
        for (const doc of snapshot.docs) {
          const data = doc.data() as DocumentData
          const id = doc.id

          // Determine status from data
          let status = 'ACTIVE'
          if (data.status) {
            status = data.status
          } else if (data.isActive === false) {
            status = 'INACTIVE'
          }
          // Note: PENDING_GRN status only exists if data.status is explicitly 'PENDING_GRN'

          // Map to InventorySearchResult
          const result: InventorySearchResult = {
            id,
            sku: data.sku || '',
            name: data.name || data.itemName || '',
            uom: data.uom || 'PCS',
            categoryName: data.categoryName || '',
            onHand: Number(data.onHand ?? data.inStock ?? 0),
            purchasePrice: Number(data.purchasePrice ?? data.avgUnitCost ?? data.totalCost ?? 0),
            freightDuty: Number(data.freightDuty ?? 0),
            totalCost: Number(data.totalCost ?? 0),
            markupPercent: Number(data.markupPercent ?? 0),
            sellingPrice: Number(data.sellingPrice ?? 0),
            status,
            reorderLevel: Number(data.reorderLevel ?? 0),
            location: data.location || ''
          }

          mergedResults.set(id, result)
        }
      }

      // Apply status filter if specified
      let filteredResults = Array.from(mergedResults.values())
      if (statusFilter.value.length > 0) {
        filteredResults = filteredResults.filter(item => 
          statusFilter.value.includes(item.status)
        )
      }

      // Limit results
      results.value = filteredResults.slice(0, resultsLimit)
      noResults.value = filteredResults.length === 0 && searchTerm.length >= 2

    } catch (err: any) {
      console.error('Inventory search error:', err)
      error.value = err.message || 'Search failed'
      results.value = []
    } finally {
      isSearching.value = false
    }
  }, 300)

  // Watch for search query changes
  watch(searchQuery, (newQuery) => {
    if (newQuery.trim() === '') {
      results.value = []
      noResults.value = false
      return
    }
    performSearch(newQuery.trim())
  })

  return {
    results,
    isSearching,
    noResults,
    error
  }
}
