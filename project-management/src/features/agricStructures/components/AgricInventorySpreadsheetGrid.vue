<script setup lang="ts">
import { ref, reactive, computed, watch } from 'vue'
import {
    TableHeader,
    TableRow,
    TableHead,
    TableBody,
    TableCell
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Plus, Save, Loader2, Trash2 } from 'lucide-vue-next'
import type { InventoryItem } from '@/features/inventory/types'
import EditableCell from '@/features/inventory/components/EditableCell.vue'
import { computeTotalCost, computeSellingPrice, formatCurrency } from '@/features/inventory/utils/pricing'
import { agricInventoryApi } from '../api/agricInventoryApi'
import { useSession } from '@/composables/useSession'
import { toast } from 'vue-sonner'

const props = defineProps<{
    items: InventoryItem[]
    categories: any[]
    canManage?: boolean
}>()

const emit = defineEmits<{
    (e: 'refresh'): void
}>()

const { user } = useSession()
const savingId = ref<string | null>(null)

// --- Add Item Row State ---
const showAddRow = ref(false)
const newItem = reactive<Omit<InventoryItem, 'id' | 'createdAt' | 'updatedAt'>>({
    sku: '',
    name: '',
    description: '',
    categoryId: '',
    categoryName: '',
    uom: 'PCS',
    onHand: 0,
    isActive: true,
    purchasePrice: 0,
    freightDuty: 0,
    totalCost: 0,
    markupPercent: 0,
    sellingPrice: 0
})

const categoryOptions = computed(() =>
    props.categories.map(c => ({ value: c.id, label: c.name }))
)

function updateNewItemPricing() {
    newItem.totalCost = computeTotalCost(newItem.purchasePrice, newItem.freightDuty)
    newItem.sellingPrice = computeSellingPrice(newItem.totalCost, newItem.markupPercent)
}

// Watch for changes in pricing fields to update selling price in real-time
watch(
    [() => newItem.purchasePrice, () => newItem.freightDuty, () => newItem.markupPercent],
    () => {
        updateNewItemPricing()
    }
)

async function handleSaveNewItem() {
    if (!newItem.sku || !newItem.name || !newItem.categoryId) {
        toast.error('Missing Required Fields', { description: 'SKU, Name, and Category are required.' })
        return
    }

    try {
        savingId.value = 'new'
        const category = props.categories.find(c => c.id === newItem.categoryId)
        newItem.categoryName = category?.name || ''

        await agricInventoryApi.createInventoryItem({ ...newItem }, { uid: user.value?.uid!, email: user.value?.email! })
        toast.success('Agric Item Created')

        showAddRow.value = false
        Object.assign(newItem, {
            sku: '', name: '', description: '', categoryId: '', categoryName: '', uom: 'PCS',
            onHand: 0, isActive: true, purchasePrice: 0, freightDuty: 0,
            totalCost: 0, markupPercent: 0, sellingPrice: 0
        })
        emit('refresh')
    } catch (err: any) {
        toast.error('Failed to Create Item', { description: err.message })
    } finally {
        savingId.value = null
    }
}

async function updateItem(item: InventoryItem, field: keyof InventoryItem, value: any) {
    try {
        savingId.value = item.id
        const patch: any = { [field]: value }

        // Calculate pricing if relevant fields change
        if (['purchasePrice', 'freightDuty', 'markupPercent'].includes(field)) {
            const pPrice = Number(field === 'purchasePrice' ? value : (item.purchasePrice || 0))
            const fDuty = Number(field === 'freightDuty' ? value : (item.freightDuty || 0))
            const mPercent = Number(field === 'markupPercent' ? value : (item.markupPercent || 0))

            const newTotal = computeTotalCost(pPrice, fDuty)
            const newSelling = computeSellingPrice(newTotal, mPercent)

            patch.totalCost = newTotal
            patch.sellingPrice = newSelling
            
            // Immediate local update for UI reactivity
            item.totalCost = newTotal
            item.sellingPrice = newSelling
        }
        
        // Update local item for other fields too
        (item as any)[field] = value

        await agricInventoryApi.updateInventoryItem(item.id, patch, { uid: user.value?.uid!, email: user.value?.email! })
        emit('refresh')
    } catch (err: any) {
        toast.error('Update Failed', { description: err.message })
    } finally {
        savingId.value = null
    }
}

// Helper for template display
function getDisplaySellingPrice(item: InventoryItem) {
    if (item.sellingPrice && item.sellingPrice > 0) return item.sellingPrice
    const total = computeTotalCost(item.purchasePrice || 0, item.freightDuty || 0)
    return computeSellingPrice(total, item.markupPercent || 0)
}

const activeRowIndex = ref(-1)
const activeColIndex = ref(-1)
const isEditingActive = ref(false)

function setActiveCell(r: number, c: number, edit = false) {
    activeRowIndex.value = r
    activeColIndex.value = c
    isEditingActive.value = edit
}
</script>

<template>
    <div class="border rounded-md bg-background flex flex-col min-h-[500px]">
        <div class="p-2 border-b flex items-center justify-between bg-orange-50/20">
            <h3 class="text-xs font-bold uppercase tracking-wider text-orange-700">Stock Spreadsheet</h3>
            <Button v-if="canManage" size="sm" variant="outline" class="h-7 text-[11px]" @click="showAddRow = !showAddRow">
                <Plus class="size-3 mr-1" /> {{ showAddRow ? 'Cancel' : 'Add Material' }}
            </Button>
        </div>
        
        <div class="overflow-auto flex-1">
            <table class="w-full text-sm border-collapse min-w-[1200px]">
                <thead class="sticky top-0 bg-muted/50 z-10 border-b">
                    <tr class="h-10 text-[11px] uppercase font-bold text-muted-foreground whitespace-nowrap">
                        <th class="w-[180px] px-2 text-left border-r">Category</th>
                        <th class="w-[250px] px-2 text-left border-r">Name/SKU</th>
                        <th class="w-[100px] px-2 text-right border-r">On Hand</th>
                        <th class="w-[100px] px-2 text-right border-r">UOM</th>
                        <th class="w-[120px] px-2 text-right border-r">Purchase $</th>
                        <th class="w-[100px] px-2 text-right border-r">Freight</th>
                        <th class="w-[120px] px-2 text-right border-r">Cost $</th>
                        <th class="w-[100px] px-2 text-right border-r">Markup %</th>
                        <th class="w-[140px] px-2 text-right border-r font-bold text-orange-700 bg-orange-50">IRD (Selling $)</th>
                        <th class="w-[130px] px-2 text-right border-r">Total Purchase $</th>
                        <th class="w-[120px] px-2 text-right border-r">Total Freight</th>
                        <th class="w-[130px] px-2 text-right border-r">Total Cost $</th>
                        <th class="w-[150px] px-2 text-right">Total IRD Selling $</th>
                        <th class="w-[60px] px-2 text-center"></th>
                    </tr>
                </thead>
                <tbody>
                    <!-- Add Row -->
                    <tr v-if="showAddRow" class="h-10 bg-orange-50/30 border-b-2 border-orange-500">
                        <td class="p-0 border-r">
                            <EditableCell :value="newItem.categoryId" type="select" :options="categoryOptions"
                                :is-active="activeRowIndex === -10" :is-editing="true"
                                @update="(v) => newItem.categoryId = v" />
                        </td>
                        <td class="p-0 border-r flex">
                            <Input v-model="newItem.sku" placeholder="SKU" class="h-9 border-none rounded-none w-20 bg-transparent border-r" />
                            <Input v-model="newItem.name" placeholder="Item Name" class="h-9 border-none rounded-none flex-1 bg-transparent" />
                        </td>
                        <td class="p-0 border-r">
                             <Input v-model.number="newItem.onHand" type="number" class="h-9 border-none rounded-none text-right bg-transparent" />
                        </td>
                        <td class="p-0 border-r">
                             <Input v-model="newItem.uom" placeholder="PCS" class="h-9 border-none rounded-none text-right bg-transparent" />
                        </td>
                        <td class="p-0 border-r">
                             <Input v-model.number="newItem.purchasePrice" type="number" class="h-9 border-none rounded-none text-right bg-transparent" />
                        </td>
                        <td class="p-0 border-r">
                             <Input v-model.number="newItem.freightDuty" type="number" class="h-9 border-none rounded-none text-right bg-transparent" />
                        </td>
                        <td class="p-2 border-r text-right font-medium text-muted-foreground">
                            ${{ newItem.totalCost.toFixed(2) }}
                        </td>
                        <td class="p-0 border-r">
                             <Input v-model.number="newItem.markupPercent" type="number" class="h-9 border-none rounded-none text-right bg-transparent" />
                        </td>
                        <td class="p-2 border-r text-right font-bold text-orange-600">
                            ${{ newItem.sellingPrice.toFixed(2) }}
                        </td>
                        <td class="p-2 border-r text-right">
                            ${{ (newItem.onHand * newItem.purchasePrice).toFixed(2) }}
                        </td>
                        <td class="p-2 border-r text-right">
                            ${{ (newItem.onHand * newItem.freightDuty).toFixed(2) }}
                        </td>
                        <td class="p-2 border-r text-right">
                            ${{ (newItem.onHand * newItem.totalCost).toFixed(2) }}
                        </td>
                        <td class="p-2 border-r text-right">
                            ${{ (newItem.onHand * newItem.sellingPrice).toFixed(2) }}
                        </td>
                        <td class="p-0 text-center">
                            <Button size="icon" variant="ghost" class="size-8 text-orange-600" @click="handleSaveNewItem" :disabled="!!savingId">
                                <Loader2 v-if="savingId === 'new'" class="size-4 animate-spin" />
                                <Save v-else class="size-4" />
                            </Button>
                        </td>
                    </tr>

                    <!-- Items -->
                    <tr v-for="(item, rIdx) in items" :key="item.id" class="h-9 border-b hover:bg-muted/30 transition-colors" :class="{'opacity-50': savingId === item.id}">
                        <td class="p-0 border-r">
                            <EditableCell :value="item.categoryId" type="select" :options="categoryOptions"
                                :is-active="activeRowIndex === rIdx && activeColIndex === 0"
                                :is-editing="isEditingActive && activeRowIndex === rIdx && activeColIndex === 0"
                                @update="(v) => updateItem(item, 'categoryId', v)" @click="setActiveCell(rIdx, 0)" />
                        </td>
                        <td class="p-0 border-r">
                            <div class="flex items-center px-2 py-1 gap-2">
                                <span class="bg-muted px-1 rounded text-[10px] font-bold">{{ item.sku }}</span>
                                <EditableCell :value="item.name"
                                    :is-active="activeRowIndex === rIdx && activeColIndex === 1"
                                    :is-editing="isEditingActive && activeRowIndex === rIdx && activeColIndex === 1"
                                    @update="(v) => updateItem(item, 'name', v)" @click="setActiveCell(rIdx, 1)" />
                            </div>
                        </td>
                        <td class="p-0 border-r text-right">
                            <EditableCell :value="item.onHand" type="number"
                                :is-active="activeRowIndex === rIdx && activeColIndex === 2"
                                :is-editing="isEditingActive && activeRowIndex === rIdx && activeColIndex === 2"
                                @update="(v) => updateItem(item, 'onHand', v)" @click="setActiveCell(rIdx, 2)" />
                        </td>
                        <td class="p-0 border-r text-right">
                             <EditableCell :value="item.uom" 
                                :is-active="activeRowIndex === rIdx && activeColIndex === 3"
                                :is-editing="isEditingActive && activeRowIndex === rIdx && activeColIndex === 3"
                                @update="(v) => updateItem(item, 'uom', v)" @click="setActiveCell(rIdx, 3)" />
                        </td>
                        <td class="p-0 border-r text-right">
                            <EditableCell :value="item.purchasePrice" type="currency"
                                :is-active="activeRowIndex === rIdx && activeColIndex === 4"
                                :is-editing="isEditingActive && activeRowIndex === rIdx && activeColIndex === 4"
                                @update="(v) => updateItem(item, 'purchasePrice', v)" @click="setActiveCell(rIdx, 4)" />
                        </td>
                        <td class="p-0 border-r text-right">
                            <EditableCell :value="item.freightDuty" type="currency"
                                :is-active="activeRowIndex === rIdx && activeColIndex === 5"
                                :is-editing="isEditingActive && activeRowIndex === rIdx && activeColIndex === 5"
                                @update="(v) => updateItem(item, 'freightDuty', v)" @click="setActiveCell(rIdx, 5)" />
                        </td>
                        <td class="p-2 border-r text-right font-medium text-muted-foreground">
                            {{ formatCurrency(item.totalCost || 0) }}
                        </td>
                        <td class="p-0 border-r text-right">
                            <EditableCell :value="item.markupPercent" type="percent"
                                :is-active="activeRowIndex === rIdx && activeColIndex === 7"
                                :is-editing="isEditingActive && activeRowIndex === rIdx && activeColIndex === 7"
                                @update="(v) => updateItem(item, 'markupPercent', v)" @click="setActiveCell(rIdx, 7)" />
                        </td>
                        <td class="p-2 border-r text-right font-bold text-orange-700 bg-orange-50/30">
                            {{ formatCurrency(getDisplaySellingPrice(item)) }}
                        </td>
                        <td class="p-2 border-r text-right font-medium">
                            {{ formatCurrency(item.onHand * (item.purchasePrice || 0)) }}
                        </td>
                        <td class="p-2 border-r text-right font-medium">
                            {{ formatCurrency(item.onHand * (item.freightDuty || 0)) }}
                        </td>
                        <td class="p-2 border-r text-right font-medium">
                            {{ formatCurrency(item.onHand * (item.totalCost || 0)) }}
                        </td>
                        <td class="p-2 text-right font-bold text-orange-700">
                            {{ formatCurrency(item.onHand * getDisplaySellingPrice(item)) }}
                        </td>
                        <td class="p-0 text-center">
                             <Loader2 v-if="savingId === item.id" class="size-3 animate-spin mx-auto text-primary" />
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>
    </div>
</template>
