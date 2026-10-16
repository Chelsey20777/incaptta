<template>
  <div v-if="isOpen" class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
    <div class="bg-white dark:bg-gray-800 rounded-xl p-6 w-full max-w-md shadow-xl">
      <h3 class="text-xl font-bold mb-6 text-gray-900 dark:text-white">Record Daily Log</h3>
      
      <form @submit.prevent="submitLog" class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Date</label>
          <input 
            type="date" 
            v-model="form.date" 
            required 
            class="w-full px-4 py-3 border rounded-xl dark:bg-gray-900 dark:border-gray-700 text-lg" 
          />
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Mortality (Dead Birds)</label>
          <input 
            type="number" 
            v-model.number="form.mortality" 
            min="0"
            class="w-full px-4 py-3 border rounded-xl dark:bg-gray-900 dark:border-gray-700 text-lg text-red-600 font-bold" 
          />
        </div>

        <div class="p-4 bg-gray-50 dark:bg-gray-900/50 rounded-xl border border-gray-100 dark:border-gray-800">
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Feed Consumed</label>
          <select 
            v-model="form.feedItemId" 
            class="w-full px-4 py-3 border rounded-lg dark:bg-gray-800 dark:border-gray-700 mb-3"
          >
            <option value="">Select Feed Type (Optional)</option>
            <option v-for="item in feedItems" :key="item.id" :value="item.id">
              {{ item.itemName }} ({{ item.quantity }} {{ item.unit }} left)
            </option>
          </select>
          
          <div v-if="form.feedItemId">
            <label class="block text-xs font-medium text-gray-500 mb-1">Quantity Used</label>
            <input 
              type="number" 
              v-model.number="form.feedConsumed" 
              min="0"
              step="0.1"
              class="w-full px-4 py-3 border rounded-lg dark:bg-gray-800 dark:border-gray-700" 
            />
          </div>
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Notes / Observations</label>
          <textarea 
            v-model="form.notes" 
            rows="2"
            class="w-full px-4 py-2 border rounded-xl dark:bg-gray-900 dark:border-gray-700" 
          ></textarea>
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
            :disabled="isSubmitting"
            class="px-6 py-3 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 font-bold flex items-center justify-center min-w-[120px]"
          >
            <span v-if="isSubmitting" class="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full"></span>
            <span v-else>Save Log</span>
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { poultryApi } from '../api/poultryApi'
import { usePoultryStore } from '../store/poultryStore'

const props = defineProps<{
  isOpen: boolean;
  flockId: string;
}>()

const emit = defineEmits(['close', 'saved'])
const store = usePoultryStore()

const isSubmitting = ref(false)

const form = ref({
  date: new Date().toISOString().split('T')[0],
  mortality: 0,
  feedItemId: '',
  feedConsumed: 0,
  notes: ''
})

const feedItems = computed(() => {
  return store.inventory.filter(i => i.type === 'FEED')
})

function closeModal() {
  form.value = {
    date: new Date().toISOString().split('T')[0],
    mortality: 0,
    feedItemId: '',
    feedConsumed: 0,
    notes: ''
  }
  emit('close')
}

async function submitLog() {
  isSubmitting.value = true
  try {
    const payload = {
      flockId: props.flockId,
      date: new Date(form.value.date as string),
      mortality: form.value.mortality,
      feedItemId: form.value.feedItemId || undefined,
      feedConsumed: form.value.feedConsumed || 0,
      notes: form.value.notes,
      loggedBy: 'current-user-id' // Ideally get from Auth store
    }

    await poultryApi.createDailyLog(payload as any)
    emit('saved')
    closeModal()
  } catch (e: any) {
    alert(e.message)
  } finally {
    isSubmitting.value = false
  }
}
</script>
