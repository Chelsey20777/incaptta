<template>
  <div v-if="isOpen" class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
    <div class="bg-white dark:bg-gray-800 rounded-xl p-6 w-full max-w-lg shadow-xl">
      <h3 class="text-xl font-bold mb-6 text-gray-900 dark:text-white">Start New Flock</h3>
      
      <form @submit.prevent="submitForm" class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Batch Name</label>
          <input 
            type="text" 
            v-model="form.batchName" 
            placeholder="e.g., Batch 2024-A"
            required 
            class="w-full px-4 py-2 border rounded-lg dark:bg-gray-900 dark:border-gray-700" 
          />
        </div>

        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Breed</label>
            <input 
              type="text" 
              v-model="form.breed" 
              placeholder="e.g., Ross 308"
              required 
              class="w-full px-4 py-2 border rounded-lg dark:bg-gray-900 dark:border-gray-700" 
            />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Initial Quantity</label>
            <input 
              type="number" 
              v-model.number="form.initialQuantity" 
              min="1"
              required
              class="w-full px-4 py-2 border rounded-lg dark:bg-gray-900 dark:border-gray-700" 
            />
          </div>
        </div>

        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Start Date</label>
            <input 
              type="date" 
              v-model="form.startDate" 
              required 
              class="w-full px-4 py-2 border rounded-lg dark:bg-gray-900 dark:border-gray-700" 
            />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Bird Cost ($)</label>
            <input 
              type="number" 
              v-model.number="form.unitCost" 
              step="0.01"
              min="0"
              required 
              placeholder="0.00"
              class="w-full px-4 py-2 border rounded-lg dark:bg-gray-900 dark:border-gray-700" 
            />
          </div>
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Estimated Harvest</label>
          <input 
            type="date" 
            v-model="form.estimatedHarvestDate" 
            required 
            class="w-full px-4 py-2 border rounded-lg dark:bg-gray-900 dark:border-gray-700" 
          />
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Assign Staff</label>
          <div class="space-y-2 max-h-40 overflow-y-auto border rounded-lg p-2 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/50">
            <div v-if="employees.length === 0" class="text-xs text-gray-500 text-center py-2 italic">
              No active employees found.
            </div>
            <div v-for="staff in employees" :key="staff.id" class="flex items-center gap-2 hover:bg-white dark:hover:bg-gray-800 p-1 rounded transition-colors">
              <input 
                type="checkbox" 
                :id="staff.id" 
                :value="staff.id" 
                v-model="form.assignedStaffIds"
                class="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 h-4 w-4"
              />
              <label :for="staff.id" class="text-sm text-gray-700 dark:text-gray-300 cursor-pointer flex-1">
                {{ staff.fullName }}
              </label>
            </div>
          </div>
        </div>

        <div class="flex justify-end gap-3 mt-8">
          <button 
            type="button" 
            @click="closeModal" 
            class="px-4 py-2 text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200"
          >
            Cancel
          </button>
          <button 
            type="submit" 
            :disabled="isSubmitting"
            class="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-medium flex items-center justify-center min-w-[100px]"
          >
            <Loader2Icon v-if="isSubmitting" class="w-4 h-4 animate-spin mr-2" />
            Create Flock
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { poultryApi } from '../api/poultryApi'
import { db } from '@/lib/firebase'
import { collection, getDocs, query, where } from 'firebase/firestore'
import { Loader2Icon } from 'lucide-vue-next'

const props = defineProps<{
  isOpen: boolean
}>()

const emit = defineEmits(['close', 'saved'])

const isSubmitting = ref(false)
const employees = ref<any[]>([])

const form = ref({
  batchName: '',
  breed: '',
  initialQuantity: 1000,
  startDate: new Date().toISOString().split('T')[0],
  estimatedHarvestDate: new Date(Date.now() + 42 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
  assignedStaffIds: [] as string[],
  unitCost: 0,
  status: 'ACTIVE' as const
})

onMounted(async () => {
  // Fetch only active employees to assign
  const q = query(collection(db, 'employees'), where('status', '==', 'Active'))
  const snapshot = await getDocs(q)
  employees.value = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
})

function closeModal() {
  emit('close')
}

async function submitForm() {
  isSubmitting.value = true
  try {
    const payload = {
      ...form.value,
      currentQuantity: form.value.initialQuantity,
      startDate: new Date(form.value.startDate as string),
      estimatedHarvestDate: new Date(form.value.estimatedHarvestDate as string)
    }
    await poultryApi.createFlock(payload as any)
    emit('saved')
    closeModal()
  } catch (e: any) {
    alert(e.message)
  } finally {
    isSubmitting.value = false
  }
}
</script>
