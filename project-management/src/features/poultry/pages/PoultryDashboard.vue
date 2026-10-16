<template>
  <div class="p-6 max-w-7xl mx-auto space-y-8">
    <header class="flex justify-between items-center">
      <div>
        <h1 class="text-3xl font-bold text-gray-900 dark:text-white tracking-tight">Pekka Poultry</h1>
        <p class="text-gray-500 dark:text-gray-400 mt-1">Farm Management Dashboard</p>
      </div>
      <div class="flex gap-3">
        <button 
          @click="router.push('/poultry/inventory')"
          class="px-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 transition-colors shadow-sm flex items-center gap-2"
        >
          <PackageIcon class="w-4 h-4" />
          Inventory
        </button>
        <button 
          @click="showCreateFlock = true"
          class="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium transition-colors shadow-sm flex items-center gap-2"
        >
          <PlusIcon class="w-4 h-4" />
          New Flock
        </button>
      </div>
    </header>

    <!-- Stats & Alerts Overview -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
      <div class="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
        <div class="flex justify-between items-start">
          <div>
            <p class="text-sm font-medium text-gray-500 dark:text-gray-400">Active Flocks</p>
            <h3 class="text-2xl font-bold text-gray-900 dark:text-white mt-1">{{ activeFlocks.length }}</h3>
          </div>
          <div class="p-2 bg-emerald-50 dark:bg-emerald-900/30 rounded-lg">
            <BirdIcon class="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
          </div>
        </div>
      </div>

      <div class="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
        <div class="flex justify-between items-start">
          <div>
            <p class="text-sm font-medium text-gray-500 dark:text-gray-400">Total Birds</p>
            <h3 class="text-2xl font-bold text-gray-900 dark:text-white mt-1">{{ totalActiveBirds.toLocaleString() }}</h3>
          </div>
          <div class="p-2 bg-blue-50 dark:bg-blue-900/30 rounded-lg">
            <ActivityIcon class="w-5 h-5 text-blue-600 dark:text-blue-400" />
          </div>
        </div>
      </div>

      <div class="bg-amber-50 dark:bg-amber-900/20 rounded-2xl p-6 shadow-sm border border-amber-100 dark:border-amber-900/30">
        <div class="flex justify-between items-start">
          <div>
            <p class="text-sm font-medium text-amber-700 dark:text-amber-400">System Alerts</p>
            <h3 class="text-2xl font-bold text-amber-900 dark:text-amber-300 mt-1">{{ alerts.length }}</h3>
          </div>
          <div class="p-2 bg-amber-100 dark:bg-amber-900/50 rounded-lg">
            <BellIcon class="w-5 h-5 text-amber-600 dark:text-amber-400" />
          </div>
        </div>
        <ul class="mt-3 space-y-1">
          <li v-for="alert in alerts.slice(0,2)" :key="alert.id" class="text-xs text-amber-800 dark:text-amber-200 flex items-center gap-1.5">
            <div class="w-1.5 h-1.5 rounded-full bg-amber-500"></div>
            <span class="truncate">{{ alert.message }}</span>
          </li>
        </ul>
      </div>
    </div>

    <!-- Active Flocks Grid -->
    <div>
      <h2 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">Current Batches</h2>
      
      <div v-if="store.isLoading" class="flex justify-center py-12">
        <Loader2Icon class="w-8 h-8 text-emerald-500 animate-spin" />
      </div>

      <div v-else-if="activeFlocks.length === 0" class="text-center py-16 bg-white dark:bg-gray-800 rounded-2xl border border-dashed border-gray-200 dark:border-gray-700">
        <div class="mx-auto w-16 h-16 bg-gray-50 dark:bg-gray-900 rounded-full flex items-center justify-center mb-4">
          <BirdIcon class="w-8 h-8 text-gray-400" />
        </div>
        <h3 class="text-lg font-medium text-gray-900 dark:text-white">No active flocks</h3>
        <p class="text-gray-500 mt-1 mb-4">Start a new batch to begin tracking.</p>
        <button @click="showCreateFlock = true" class="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium transition-colors">
          Create First Flock
        </button>
      </div>

      <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div 
          v-for="flock in activeFlocks" 
          :key="flock.id"
          @click="router.push(`/poultry/flock/${flock.id}`)"
          class="group bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700 hover:shadow-md hover:border-emerald-200 dark:hover:border-emerald-800 transition-all cursor-pointer relative overflow-hidden"
        >
          <!-- Status Banner -->
          <div v-if="flock.status === 'ON_MARKET'" class="absolute top-0 right-0 px-3 py-1 bg-amber-500 text-white text-xs font-bold rounded-bl-lg">
            ON MARKET
          </div>

          <div class="flex justify-between items-start mb-4">
            <div>
              <h3 class="font-bold text-lg text-gray-900 dark:text-white group-hover:text-emerald-600 transition-colors">{{ flock.batchName }}</h3>
              <p class="text-sm text-gray-500">{{ flock.breed }}</p>
            </div>
            <div class="w-10 h-10 rounded-full bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center">
              <span class="text-emerald-600 dark:text-emerald-400 font-semibold">{{ getFlockAge(flock.startDate) }}d</span>
            </div>
          </div>

          <div class="space-y-3">
            <div class="flex justify-between text-sm">
              <span class="text-gray-500">Survival</span>
              <span class="font-medium text-gray-900 dark:text-white">
                {{ ((flock.currentQuantity / flock.initialQuantity) * 100).toFixed(1) }}%
              </span>
            </div>
            
            <div class="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-2">
              <div 
                class="bg-emerald-500 h-2 rounded-full" 
                :style="{ width: `${(flock.currentQuantity / flock.initialQuantity) * 100}%` }"
              ></div>
            </div>

            <div class="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
              <div>
                <p class="text-xs text-gray-500">Current Birds</p>
                <p class="font-semibold text-gray-900 dark:text-white">{{ flock.currentQuantity }}</p>
              </div>
              <div>
                <p class="text-xs text-gray-500">Harvest In</p>
                <p class="font-semibold text-amber-600 dark:text-amber-400">{{ getDaysToHarvest(flock.estimatedHarvestDate) }} days</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Modals -->
    <CreateFlockModal 
      :is-open="showCreateFlock" 
      @close="showCreateFlock = false" 
      @saved="store.fetchFlocks" 
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { usePoultryStore } from '../store/poultryStore'
import { differenceInDays } from 'date-fns'
import CreateFlockModal from '../components/CreateFlockModal.vue'
import { 
  PackageIcon, 
  PlusIcon, 
  BirdIcon, 
  ActivityIcon, 
  BellIcon,
  Loader2Icon
} from 'lucide-vue-next'

const router = useRouter()
const store = usePoultryStore()

const showCreateFlock = ref(false)

onMounted(() => {
  store.fetchFlocks()
  store.fetchInventory()
})

const activeFlocks = computed(() => store.activeFlocks)

const totalActiveBirds = computed(() => {
  return activeFlocks.value.reduce((total, flock) => total + flock.currentQuantity, 0)
})

const alerts = computed(() => {
  const arr: any[] = []
  // Check inventory levels
  store.inventory.forEach(item => {
    if (item.quantity <= item.minStockLevel) {
      arr.push({ id: `inv-${item.id}`, message: `${item.itemName} is running low (${item.quantity} ${item.unit} left)` })
    }
  })
  // Check harvest dates
  activeFlocks.value.forEach(flock => {
    const days = getDaysToHarvest(flock.estimatedHarvestDate)
    if (days <= 7 && flock.status !== 'ON_MARKET') {
      arr.push({ id: `harv-${flock.id}`, message: `${flock.batchName} is ${days} days from harvest` })
    }
  })
  return arr
})

function getFlockAge(startDate: any): number {
  if (!startDate) return 0
  const start = startDate.toDate ? startDate.toDate() : new Date(startDate)
  return differenceInDays(new Date(), start)
}

function getDaysToHarvest(harvestDate: any): number {
  if (!harvestDate) return 0
  const end = harvestDate.toDate ? harvestDate.toDate() : new Date(harvestDate)
  return differenceInDays(end, new Date())
}
</script>
