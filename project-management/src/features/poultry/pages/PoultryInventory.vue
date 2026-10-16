<template>
  <div class="p-6 max-w-7xl mx-auto space-y-6">
    <div class="flex items-center justify-between">
      <div>
        <h2 class="text-2xl font-bold text-gray-900 dark:text-white">Poultry Inventory</h2>
        <p class="text-gray-500">Manage feed, vaccines, and medicine stock</p>
      </div>
      <button 
        @click="showModal = true"
        class="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium transition-colors shadow-sm"
      >
        Add Item
      </button>
    </div>

    <div class="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
      <table class="w-full text-left text-sm">
        <thead class="bg-gray-50 dark:bg-gray-900/50 text-gray-500 dark:text-gray-400">
          <tr>
            <th class="px-6 py-4 font-medium">Item Name</th>
            <th class="px-6 py-4 font-medium">Type</th>
            <th class="px-6 py-4 font-medium">Stock Level</th>
            <th class="px-6 py-4 font-medium">Unit Price</th>
            <th class="px-6 py-4 font-medium">Total Value</th>
            <th class="px-6 py-4 font-medium text-right">Actions</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-100 dark:divide-gray-700">
          <tr v-if="store.isLoading">
            <td colspan="6" class="px-6 py-8 text-center text-gray-500">Loading inventory...</td>
          </tr>
          <tr v-else-if="store.inventory.length === 0">
            <td colspan="6" class="px-6 py-8 text-center text-gray-500">No inventory items found. Add one to get started.</td>
          </tr>
          <tr 
            v-for="item in store.inventory" 
            :key="item.id"
            class="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
          >
            <td class="px-6 py-4">
              <div class="font-medium text-gray-900 dark:text-white">{{ item.itemName }}</div>
              <div v-if="item.quantity <= item.minStockLevel" class="text-xs text-amber-600 font-medium flex items-center gap-1 mt-1">
                Low Stock Warning
              </div>
            </td>
            <td class="px-6 py-4">
              <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium"
                :class="{
                  'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200': item.type === 'FEED',
                  'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200': item.type === 'MEDICINE' || item.type === 'VACCINE',
                  'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300': item.type === 'OTHER'
                }">
                {{ item.type }}
              </span>
            </td>
            <td class="px-6 py-4 text-gray-700 dark:text-gray-300">
              <span :class="{'text-amber-600 font-bold': item.quantity <= item.minStockLevel}">
                {{ item.quantity }} {{ item.unit }}
              </span>
            </td>
            <td class="px-6 py-4 text-gray-700 dark:text-gray-300">${{ item.unitPrice.toFixed(2) }}</td>
            <td class="px-6 py-4 font-medium text-gray-900 dark:text-white">${{ (item.quantity * item.unitPrice).toFixed(2) }}</td>
            <td class="px-6 py-4 text-right flex justify-end gap-2">
              <button 
                @click="handleEdit(item)"
                class="text-emerald-600 hover:text-emerald-700 font-medium text-sm"
              >
                Edit
              </button>
              <button 
                @click="handleDelete(item.id)"
                class="text-red-600 hover:text-red-700 font-medium text-sm"
              >
                Delete
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Inventory Modal (Add/Edit) -->
    <div v-if="showModal" class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div class="bg-white dark:bg-gray-800 rounded-xl p-6 w-full max-w-md shadow-xl">
        <h3 class="text-lg font-bold mb-4 text-gray-900 dark:text-white">
          {{ isEditing ? 'Edit' : 'Add' }} Inventory Item
        </h3>
        <form @submit.prevent="saveItem" class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Item Name</label>
            <input v-model="formItem.itemName" required class="w-full px-3 py-2 border rounded-lg dark:bg-gray-900 dark:border-gray-700" />
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Type</label>
              <select v-model="formItem.type" class="w-full px-3 py-2 border rounded-lg dark:bg-gray-900 dark:border-gray-700">
                <option value="FEED">Feed</option>
                <option value="MEDICINE">Medicine</option>
                <option value="VACCINE">Vaccine</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Unit</label>
              <input v-model="formItem.unit" placeholder="e.g., Bags, Bottles" required class="w-full px-3 py-2 border rounded-lg dark:bg-gray-900 dark:border-gray-700" />
            </div>
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Quantity</label>
              <input v-model.number="formItem.quantity" type="number" required class="w-full px-3 py-2 border rounded-lg dark:bg-gray-900 dark:border-gray-700" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Min Stock Level</label>
              <input v-model.number="formItem.minStockLevel" type="number" required class="w-full px-3 py-2 border rounded-lg dark:bg-gray-900 dark:border-gray-700" />
            </div>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Unit Price ($)</label>
            <input v-model.number="formItem.unitPrice" type="number" step="0.01" required class="w-full px-3 py-2 border rounded-lg dark:bg-gray-900 dark:border-gray-700" />
          </div>
          <div class="flex justify-end gap-3 mt-6">
            <button type="button" @click="closeModal" class="px-4 py-2 text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200">Cancel</button>
            <button type="submit" class="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700">
              {{ isEditing ? 'Update' : 'Save' }} Item
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { usePoultryStore } from '../store/poultryStore'
import { poultryApi } from '../api/poultryApi'

const store = usePoultryStore()
const showModal = ref(false)
const isEditing = ref(false)
const editingId = ref<string | null>(null)

const formItem = ref({
  itemName: '',
  type: 'FEED',
  unit: '',
  quantity: 0,
  minStockLevel: 5,
  unitPrice: 0,
  totalValue: 0
})

onMounted(() => {
  store.fetchInventory()
})

function resetForm() {
  formItem.value = {
    itemName: '', type: 'FEED', unit: '', quantity: 0, minStockLevel: 5, unitPrice: 0, totalValue: 0
  }
  isEditing.value = false
  editingId.value = null
}

function closeModal() {
  showModal.value = false
  resetForm()
}

function handleEdit(item: any) {
  isEditing.value = true
  editingId.value = item.id
  formItem.value = { ...item }
  showModal.value = true
}

async function handleDelete(id: string) {
  if (!confirm('Are you sure you want to delete this item?')) return
  try {
    await poultryApi.deleteInventoryItem(id)
    store.fetchInventory()
  } catch (e) {
    console.error(e)
    alert('Failed to delete item')
  }
}

async function saveItem() {
  try {
    formItem.value.totalValue = formItem.value.quantity * formItem.value.unitPrice
    
    if (isEditing.value && editingId.value) {
      await poultryApi.updateInventoryItem(editingId.value, formItem.value as any)
    } else {
      await poultryApi.addInventoryItem(formItem.value as any)
    }

    showModal.value = false
    store.fetchInventory()
    resetForm()
  } catch (e) {
    console.error(e)
    alert('Failed to save item')
  }
}
</script>
