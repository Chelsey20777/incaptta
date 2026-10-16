<template>
  <div class="p-6 max-w-7xl mx-auto space-y-6">
    <div v-if="store.isLoading && !flock" class="flex justify-center py-12">
      <div class="animate-spin w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full"></div>
    </div>

    <div v-else-if="flock">
      <!-- Header -->
      <header class="flex flex-col md:flex-row md:justify-between md:items-start gap-4 mb-8">
        <div>
          <div class="flex items-center gap-3 mb-2">
            <h1 class="text-3xl font-bold text-gray-900 dark:text-white">{{ flock.batchName }}</h1>
            <span class="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider"
              :class="{
                'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-400': flock.status === 'ACTIVE',
                'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-400': flock.status === 'ON_MARKET',
                'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400': flock.status === 'CLOSED'
              }">
              {{ flock.status.replace('_', ' ') }}
            </span>
          </div>
          <p class="text-gray-500">{{ flock.breed }} • Started {{ new Date(flock.startDate).toLocaleDateString() }}</p>
        </div>
        
        <div class="flex flex-wrap gap-3">
          <button 
            v-if="flock.status !== 'CLOSED'"
            @click="showLogModal = true"
            class="px-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 rounded-lg shadow-sm hover:bg-gray-50 font-medium"
          >
            Log Daily Data
          </button>
          <button 
            v-if="flock.status === 'ON_MARKET' || flock.status === 'ACTIVE'"
            @click="showSaleModal = true"
            class="px-4 py-2 bg-emerald-600 text-white rounded-lg shadow-sm hover:bg-emerald-700 font-medium"
          >
            Record Sale
          </button>
        </div>
      </header>

      <!-- KPI Cards -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div class="bg-white dark:bg-gray-800 p-5 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm">
          <p class="text-sm text-gray-500 mb-1">Current Birds</p>
          <p class="text-2xl font-bold text-gray-900 dark:text-white">{{ flock.currentQuantity }} <span class="text-sm font-normal text-gray-400">/ {{ flock.initialQuantity }}</span></p>
        </div>
        <div class="bg-white dark:bg-gray-800 p-5 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm">
          <p class="text-sm text-gray-500 mb-1">Survival Rate</p>
          <p class="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{{ ((flock.currentQuantity / flock.initialQuantity) * 100).toFixed(1) }}%</p>
        </div>
        <div class="bg-white dark:bg-gray-800 p-5 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm">
          <p class="text-sm text-gray-500 mb-1">Total Revenue</p>
          <p class="text-2xl font-bold text-gray-900 dark:text-white">${{ totalRevenue.toFixed(2) }}</p>
        </div>
        <div class="bg-white dark:bg-gray-800 p-5 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm">
          <p class="text-sm text-gray-500 mb-1">Total Feed Used</p>
          <p class="text-2xl font-bold text-gray-900 dark:text-white">{{ totalFeedConsumed.toFixed(1) }} <span class="text-sm font-normal text-gray-400">units</span></p>
        </div>
      </div>

      <!-- Tabs -->
      <div class="border-b border-gray-200 dark:border-gray-700 mb-6">
        <nav class="flex gap-6">
          <button 
            @click="activeTab = 'logs'"
            class="pb-4 px-1 text-sm font-medium border-b-2 transition-colors"
            :class="activeTab === 'logs' ? 'border-emerald-500 text-emerald-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'"
          >
            Daily Logs
          </button>
          <button 
            @click="activeTab = 'sales'"
            class="pb-4 px-1 text-sm font-medium border-b-2 transition-colors"
            :class="activeTab === 'sales' ? 'border-emerald-500 text-emerald-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'"
          >
            Sales History
          </button>
          <button 
            @click="activeTab = 'financials'"
            class="pb-4 px-1 text-sm font-medium border-b-2 transition-colors"
            :class="activeTab === 'financials' ? 'border-emerald-500 text-emerald-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'"
          >
            Financials (P&L)
          </button>
        </nav>
      </div>

      <!-- Tab Content: Logs -->
      <div v-if="activeTab === 'logs'" class="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        <table class="w-full text-left text-sm">
          <thead class="bg-gray-50 dark:bg-gray-900/50 text-gray-500">
            <tr>
              <th class="px-6 py-4 font-medium">Date</th>
              <th class="px-6 py-4 font-medium">Mortality</th>
              <th class="px-6 py-4 font-medium">Feed Consumed</th>
              <th class="px-6 py-4 font-medium">Notes</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100 dark:divide-gray-700">
            <tr v-if="store.currentLogs.length === 0">
              <td colspan="4" class="px-6 py-8 text-center text-gray-500">No logs recorded yet.</td>
            </tr>
            <tr v-for="log in store.currentLogs" :key="log.id" class="hover:bg-gray-50 dark:hover:bg-gray-800/50">
              <td class="px-6 py-4">{{ new Date(log.date).toLocaleDateString() }}</td>
              <td class="px-6 py-4 text-red-600 font-medium">{{ log.mortality || 0 }}</td>
              <td class="px-6 py-4">{{ log.feedConsumed || 0 }}</td>
              <td class="px-6 py-4 text-gray-500">{{ log.notes || '-' }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Tab Content: Sales -->
      <div v-if="activeTab === 'sales'" class="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        <table class="w-full text-left text-sm">
          <thead class="bg-gray-50 dark:bg-gray-900/50 text-gray-500">
            <tr>
              <th class="px-6 py-4 font-medium">Date</th>
              <th class="px-6 py-4 font-medium">Buyer</th>
              <th class="px-6 py-4 font-medium text-right">Qty Sold</th>
              <th class="px-6 py-4 font-medium text-right">Price/Unit</th>
              <th class="px-6 py-4 font-medium text-right">Revenue</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100 dark:divide-gray-700">
            <tr v-if="store.currentSales.length === 0">
              <td colspan="5" class="px-6 py-8 text-center text-gray-500">No sales recorded yet.</td>
            </tr>
            <tr v-for="sale in store.currentSales" :key="sale.id" class="hover:bg-gray-50 dark:hover:bg-gray-800/50">
              <td class="px-6 py-4">{{ new Date(sale.date).toLocaleDateString() }}</td>
              <td class="px-6 py-4">{{ sale.buyerName }}</td>
              <td class="px-6 py-4 text-right font-medium">{{ sale.quantitySold }}</td>
              <td class="px-6 py-4 text-right">${{ sale.unitPrice.toFixed(2) }}</td>
              <td class="px-6 py-4 text-right text-emerald-600 font-bold">${{ sale.totalRevenue.toFixed(2) }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Tab Content: Financials -->
      <div v-if="activeTab === 'financials'" class="space-y-6">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div class="bg-white dark:bg-gray-800 p-6 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm">
            <h3 class="text-lg font-bold mb-4 text-gray-900 dark:text-white">Revenue</h3>
            <div class="flex justify-between items-center py-2 border-b border-gray-100 dark:border-gray-700">
              <span class="text-gray-600 dark:text-gray-400">Total Bird Sales</span>
              <span class="font-bold text-gray-900 dark:text-white">${{ totalRevenue.toFixed(2) }}</span>
            </div>
          </div>

          <div class="bg-white dark:bg-gray-800 p-6 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm">
            <h3 class="text-lg font-bold mb-4 text-gray-900 dark:text-white">Initial Investment</h3>
            <div class="flex justify-between items-center py-2 border-b border-gray-100 dark:border-gray-700">
              <span class="text-gray-600 dark:text-gray-400">Purchase Price ({{ flock.initialQuantity }} birds @ ${{ flock.unitCost?.toFixed(2) || '0.00' }})</span>
              <span class="font-bold text-red-600">-${{ (flock.initialQuantity * (flock.unitCost || 0)).toFixed(2) }}</span>
            </div>
          </div>
          
          <div class="bg-white dark:bg-gray-800 p-6 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm md:col-span-2">
            <h3 class="text-lg font-bold mb-4 text-gray-900 dark:text-white">Profit & Loss Summary</h3>
            <div class="space-y-2">
              <div class="flex justify-between items-center py-2">
                <span class="text-gray-600 dark:text-gray-400">Gross Revenue</span>
                <span class="font-bold text-gray-900 dark:text-white">${{ totalRevenue.toFixed(2) }}</span>
              </div>
              <div class="flex justify-between items-center py-2">
                <span class="text-gray-600 dark:text-gray-400">Initial Stock Cost</span>
                <span class="font-bold text-red-600">-${{ (flock.initialQuantity * (flock.unitCost || 0)).toFixed(2) }}</span>
              </div>
              <!-- Future: Subtract feed costs etc here -->
              <div class="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 flex justify-between items-center">
                <span class="font-bold text-lg text-gray-900 dark:text-white">Net Return (to date)</span>
                <span class="font-bold text-xl" :class="totalRevenue - (flock.initialQuantity * (flock.unitCost || 0)) >= 0 ? 'text-emerald-600' : 'text-red-600'">
                  ${{ (totalRevenue - (flock.initialQuantity * (flock.unitCost || 0))).toFixed(2) }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    
    <div v-else class="py-12 text-center text-gray-500">
      Flock not found.
    </div>

    <!-- Modals -->
    <DailyLogModal 
      v-if="flock"
      :is-open="showLogModal" 
      :flock-id="flock.id" 
      @close="showLogModal = false" 
      @saved="refreshData" 
    />
    
    <RecordSaleModal 
      v-if="flock"
      :is-open="showSaleModal" 
      :flock-id="flock.id" 
      :max-quantity="flock.currentQuantity"
      @close="showSaleModal = false" 
      @saved="refreshData" 
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { usePoultryStore } from '../store/poultryStore'
import { poultryApi } from '../api/poultryApi'
import type { PoultryFlock } from '../types'
import DailyLogModal from '../components/DailyLogModal.vue'
import RecordSaleModal from '../components/RecordSaleModal.vue'

const route = useRoute()
const store = usePoultryStore()

const flockId = route.params.id as string
const flock = ref<PoultryFlock | null>(null)
const activeTab = ref('logs')

const showLogModal = ref(false)
const showSaleModal = ref(false)

onMounted(async () => {
  store.fetchInventory() // Pre-load inventory for the modal
  await refreshData()
})

async function refreshData() {
  flock.value = await poultryApi.getFlock(flockId)
  if (flock.value) {
    await store.fetchFlockDetails(flockId)
  }
}

const totalRevenue = computed(() => {
  return store.currentSales.reduce((sum, sale) => sum + sale.totalRevenue, 0)
})

const totalFeedConsumed = computed(() => {
  return store.currentLogs.reduce((sum, log) => sum + (log.feedConsumed || 0), 0)
})
</script>
