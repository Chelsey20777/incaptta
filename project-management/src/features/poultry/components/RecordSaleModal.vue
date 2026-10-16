<template>
  <div v-if="isOpen" class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
    <div class="bg-white dark:bg-gray-800 rounded-xl p-6 w-full max-w-md shadow-xl">
      <h3 class="text-xl font-bold mb-6 text-gray-900 dark:text-white">Record Sale</h3>
      
      <form @submit.prevent="submitSale" class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Date</label>
          <input 
            type="date" 
            v-model="form.date" 
            required 
            class="w-full px-4 py-3 border rounded-xl dark:bg-gray-900 dark:border-gray-700" 
          />
        </div>

        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Quantity Sold</label>
            <input 
              type="number" 
              v-model.number="form.quantitySold" 
              min="1"
              :max="maxQuantity"
              required
              class="w-full px-4 py-3 border rounded-xl dark:bg-gray-900 dark:border-gray-700 font-bold" 
            />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Unit Price ($)</label>
            <input 
              type="number" 
              v-model.number="form.unitPrice" 
              min="0"
              step="0.01"
              required
              class="w-full px-4 py-3 border rounded-xl dark:bg-gray-900 dark:border-gray-700" 
            />
          </div>
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Total Revenue</label>
          <div class="w-full px-4 py-3 bg-gray-50 dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-700 text-lg font-bold text-emerald-600 dark:text-emerald-400">
            ${{ totalRevenue.toFixed(2) }}
          </div>
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Total Weight (kg) - Optional</label>
          <input 
            type="number" 
            v-model.number="form.totalWeight" 
            min="0"
            step="0.1"
            class="w-full px-4 py-3 border rounded-xl dark:bg-gray-900 dark:border-gray-700" 
          />
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Buyer Name</label>
          <input 
            type="text" 
            v-model="form.buyerName" 
            required
            class="w-full px-4 py-3 border rounded-xl dark:bg-gray-900 dark:border-gray-700" 
          />
        </div>

        <div class="flex justify-end gap-3 mt-8">
          <button 
            type="button" 
            @click="closeModal" 
            class="px-6 py-3 text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 font-medium"
          >
            Cancel
          </button>
          <button 
            type="submit" 
            :disabled="isSubmitting || form.quantitySold < 1"
            class="px-6 py-3 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 font-bold flex items-center justify-center min-w-[120px]"
          >
            <span v-if="isSubmitting" class="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full"></span>
            <span v-else>Confirm Sale</span>
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { poultryApi } from '../api/poultryApi'

const props = defineProps<{
  isOpen: boolean;
  flockId: string;
  maxQuantity: number;
}>()

const emit = defineEmits(['close', 'saved'])

const isSubmitting = ref(false)

const form = ref({
  date: new Date().toISOString().split('T')[0],
  quantitySold: 1,
  totalWeight: undefined as number | undefined,
  unitPrice: 0,
  buyerName: ''
})

const totalRevenue = computed(() => {
  return (form.value.quantitySold || 0) * (form.value.unitPrice || 0)
})

function closeModal() {
  form.value = {
    date: new Date().toISOString().split('T')[0],
    quantitySold: 1,
    totalWeight: undefined,
    unitPrice: 0,
    buyerName: ''
  }
  emit('close')
}

async function submitSale() {
  isSubmitting.value = true
  try {
    const payload = {
      flockId: props.flockId,
      date: new Date(form.value.date as string),
      quantitySold: form.value.quantitySold,
      totalWeight: form.value.totalWeight,
      unitPrice: form.value.unitPrice,
      totalRevenue: totalRevenue.value,
      buyerName: form.value.buyerName,
      recordedBy: 'current-user-id' // Ideally get from Auth store
    }

    await poultryApi.recordSale(payload as any)
    emit('saved')
    closeModal()
  } catch (e: any) {
    alert(e.message)
  } finally {
    isSubmitting.value = false
  }
}
</script>
