import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { poultryApi } from '../api/poultryApi'
import type { PoultryFlock, PoultryInventoryItem, PoultryDailyLog, PoultrySale } from '../types'

export const usePoultryStore = defineStore('poultry', () => {
  const flocks = ref<PoultryFlock[]>([])
  const inventory = ref<PoultryInventoryItem[]>([])
  const currentLogs = ref<PoultryDailyLog[]>([])
  const currentSales = ref<PoultrySale[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  const activeFlocks = computed(() => flocks.value.filter(f => f.status === 'ACTIVE' || f.status === 'ON_MARKET'))
  const closedFlocks = computed(() => flocks.value.filter(f => f.status === 'CLOSED'))

  async function fetchFlocks() {
    isLoading.value = true
    try {
      flocks.value = await poultryApi.getFlocks()
    } catch (e: any) {
      error.value = e.message
    } finally {
      isLoading.value = false
    }
  }

  async function fetchInventory() {
    isLoading.value = true
    try {
      inventory.value = await poultryApi.getInventory()
    } catch (e: any) {
      error.value = e.message
    } finally {
      isLoading.value = false
    }
  }

  async function fetchFlockDetails(flockId: string) {
    isLoading.value = true
    try {
      currentLogs.value = await poultryApi.getLogsByFlock(flockId)
      currentSales.value = await poultryApi.getSalesByFlock(flockId)
    } catch (e: any) {
      error.value = e.message
    } finally {
      isLoading.value = false
    }
  }

  return {
    flocks,
    inventory,
    currentLogs,
    currentSales,
    isLoading,
    error,
    activeFlocks,
    closedFlocks,
    fetchFlocks,
    fetchInventory,
    fetchFlockDetails
  }
})
