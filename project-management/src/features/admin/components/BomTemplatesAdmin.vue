<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { Plus, Trash2, Edit2, ChevronDown, ChevronRight, Database, Zap } from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useBomTemplateStore, type BomTemplateRow } from '../store/bomTemplateStore'
import { useAdminStore } from '../store/adminStore'
import { STRUCTURE_SIZES } from '@/features/jobCards/data/bomTemplates'
import EditableCell from '@/features/inventory/components/EditableCell.vue'
import { inventoryApi } from '@/features/inventory/api/inventoryApi'
import { Textarea } from '@/components/ui/textarea'

const store = useBomTemplateStore()
const adminStore = useAdminStore()

// ── Inventory for item name selector ─────────────────────────────────────────
const inventoryItemsList = ref<any[]>([])
const inventoryOptions = computed(() =>
  inventoryItemsList.value.map(item => ({
    value: item.id,
    label: `${item.name} (${item.sku})`,
    stockCount: item.onHand ?? 0,
    uom: item.uom || 'PCS',
    _name: item.name,
  }))
)

function handleInventorySelect(itemId: string) {
  const option = inventoryOptions.value.find(o => o.value === itemId)
  if (option) rowName.value = option._name
}

onMounted(async () => {
  store.listen()
  adminStore.fetchAll()
  try {
    inventoryItemsList.value = await inventoryApi.listInventory({ isActive: true })
  } catch (err) {
    console.error('Failed to load inventory for BOM editor', err)
  }
})
onUnmounted(() => store.cleanup())

// ── Expand/collapse ───────────────────────────────────────────────────────────
const expanded = ref<Record<string, boolean>>({})
function toggle(id: string) { expanded.value[id] = !expanded.value[id] }

// ── New template dialog ───────────────────────────────────────────────────────
const showNewTemplate = ref(false)
const newTemplateName = ref('')
async function handleCreateTemplate() {
  if (!newTemplateName.value.trim()) return
  await store.createTemplate(newTemplateName.value.trim())
  newTemplateName.value = ''
  showNewTemplate.value = false
}

// ── Rename template ───────────────────────────────────────────────────────────
const renamingId = ref<string | null>(null)
const renameValue = ref('')
function startRename(id: string, currentName: string) {
  renamingId.value = id
  renameValue.value = currentName
}
async function commitRename() {
  if (!renamingId.value || !renameValue.value.trim()) { renamingId.value = null; return }
  await store.renameTemplate(renamingId.value, renameValue.value.trim())
  renamingId.value = null
}

// ── Add item dialog (name only) ───────────────────────────────────────────────
const showAddDialog = ref(false)
const addingToTemplateId = ref('')
const rowName = ref('')

function openAddRow(templateId: string) {
  addingToTemplateId.value = templateId
  rowName.value = ''
  showAddDialog.value = true
}

async function handleAddRow() {
  if (!rowName.value.trim()) { toast.error('Item name is required'); return }
  const template = store.templates.find(t => t.id === addingToTemplateId.value)
  if (!template) return
  const quantities = Object.fromEntries(STRUCTURE_SIZES.map(s => [s, 0]))
  const newRows = [...template.rows, { id: crypto.randomUUID(), name: rowName.value.trim(), quantities }]
  await store.saveRows(addingToTemplateId.value, newRows)
  toast.success('Item added — click any cell to enter quantities')
  showAddDialog.value = false
}

// ── Edit item name dialog ─────────────────────────────────────────────────────
const showEditNameDialog = ref(false)
const editNameTemplateId = ref('')
const editNameRowId = ref('')
const editNameValue = ref('')

function openEditName(templateId: string, row: BomTemplateRow) {
  editNameTemplateId.value = templateId
  editNameRowId.value = row.id
  editNameValue.value = row.name
  showEditNameDialog.value = true
}

async function handleSaveItemName() {
  if (!editNameValue.value.trim()) return
  const template = store.templates.find(t => t.id === editNameTemplateId.value)
  if (!template) return
  const newRows = template.rows.map(r =>
    r.id === editNameRowId.value ? { ...r, name: editNameValue.value.trim() } : r
  )
  await store.saveRows(editNameTemplateId.value, newRows)
  toast.success('Item name updated')
  showEditNameDialog.value = false
}

// ── Inline cell editing (spreadsheet style) ───────────────────────────────────
interface CellId { templateId: string; rowId: string; sizeIdx: number }
const editingCell = ref<CellId | null>(null)
const editingValue = ref('')

function cellDataKey(templateId: string, rowId: string, sizeIdx: number) {
  return `${templateId}__${rowId}__${sizeIdx}`
}

function isEditingCell(templateId: string, rowId: string, sizeIdx: number) {
  const c = editingCell.value
  return c !== null && c.templateId === templateId && c.rowId === rowId && c.sizeIdx === sizeIdx
}

function startEdit(templateId: string, rowId: string, sizeIdx: number, currentQty: number) {
  editingCell.value = { templateId, rowId, sizeIdx }
  editingValue.value = currentQty > 0 ? String(currentQty) : ''
  nextTick(() => {
    const key = cellDataKey(templateId, rowId, sizeIdx)
    const input = document.querySelector(`[data-cell="${key}"] input`) as HTMLInputElement
    input?.focus()
    input?.select()
  })
}

async function commitEdit(moveToNext: boolean) {
  const cell = editingCell.value
  if (!cell) return
  // Clear immediately to prevent double-commit from blur after tab
  editingCell.value = null

  const { templateId, rowId, sizeIdx } = cell
  const size = STRUCTURE_SIZES[sizeIdx]
  const template = store.templates.find(t => t.id === templateId)
  if (!template) return
  const row = template.rows.find(r => r.id === rowId)
  if (!row) return

  const newQty = parseFloat(editingValue.value) || 0
  if (newQty !== (row.quantities[size!] ?? 0)) {
    const newRows = template.rows.map(r =>
      r.id === rowId ? { ...r, quantities: { ...r.quantities, [size!]: newQty } } : r
    )
    store.saveRows(templateId, newRows) // fire and forget — no await for responsiveness
  }

  if (moveToNext) {
    // Determine next cell: next size in same row, or first size of next row
    let nextCell: CellId | null = null
    if (sizeIdx + 1 < STRUCTURE_SIZES.length) {
      nextCell = { templateId, rowId, sizeIdx: sizeIdx + 1 }
    } else {
      const rowIdx = template.rows.findIndex(r => r.id === rowId)
      const nextRow = template.rows[rowIdx + 1]
      if (nextRow) nextCell = { templateId, rowId: nextRow.id, sizeIdx: 0 }
    }

    if (nextCell) {
      const nextTemplate = store.templates.find(t => t.id === nextCell!.templateId)
      const nextRow = nextTemplate?.rows.find(r => r.id === nextCell!.rowId)
      const nextQty = nextRow?.quantities[STRUCTURE_SIZES[nextCell.sizeIdx]!] ?? 0
      editingCell.value = nextCell
      editingValue.value = nextQty > 0 ? String(nextQty) : ''
      await nextTick()
      const key = cellDataKey(nextCell.templateId, nextCell.rowId, nextCell.sizeIdx)
      const input = document.querySelector(`[data-cell="${key}"] input`) as HTMLInputElement
      input?.focus()
      input?.select()
    }
  }
}

function handleCellKeydown(e: KeyboardEvent) {
  if (e.key === 'Tab') { e.preventDefault(); commitEdit(true) }
  else if (e.key === 'Enter') { e.preventDefault(); commitEdit(false) }
  else if (e.key === 'Escape') { editingCell.value = null }
}

function handleCellBlur() {
  // Only commits if not already cleared by Tab/Enter keydown
  commitEdit(false)
}

async function handleDeleteRow(templateId: string, rowId: string, name: string) {
  if (!confirm(`Delete "${name}" from this template?`)) return
  const template = store.templates.find(t => t.id === templateId)
  if (!template) return
  await store.saveRows(templateId, template.rows.filter(r => r.id !== rowId))
  toast.success('Item Removed')
}

async function handleDeleteTemplate(id: string, name: string) {
  if (!confirm(`Delete the entire "${name}" template? This cannot be undone.`)) return
  await store.deleteTemplate(id)
}

const savingMeta = ref<string | null>(null)
async function handleUpdateMeta(template: any) {
  savingMeta.value = template.id
  await store.updateTemplateMeta(template.id, {
    jobCategoryId: template.jobCategoryId || '',
    categoryDescription: template.categoryDescription || ''
  })
  savingMeta.value = null
}

const sizeLabels = STRUCTURE_SIZES.map(s => s.replace('m', ''))
</script>

<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex items-start justify-between">
      <div>
        <h3 class="text-lg font-medium">BOM Templates</h3>
        <p class="text-sm text-muted-foreground">Click any quantity cell to edit inline. Tab moves to the next cell.</p>
      </div>
      <div class="flex gap-2">
        <Button
          v-if="store.templates.length === 0"
          variant="outline" size="sm"
          :disabled="store.loading"
          @click="store.seedDefaults()"
        >
          <Database class="mr-2 size-4" />
          Seed Defaults
        </Button>
        <Button size="sm" @click="showNewTemplate = true">
          <Plus class="mr-2 size-4" />
          New Template
        </Button>
      </div>
    </div>

    <!-- Empty state -->
    <div v-if="store.templates.length === 0 && !store.loading" class="rounded-lg border border-dashed border-muted-foreground/30 p-10 text-center text-sm text-muted-foreground">
      <Zap class="mx-auto mb-3 size-8 opacity-30" />
      <p class="font-medium">No BOM templates yet.</p>
      <p class="mt-1">Click <strong>Seed Defaults</strong> to load the standard templates, or create a new one.</p>
    </div>

    <!-- Template list -->
    <div v-for="template in store.templates" :key="template.id" class="rounded-lg border bg-card shadow-sm">
      <!-- Template header row -->
      <div class="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors" @click="toggle(template.id)">
        <div class="flex items-center gap-3">
          <component :is="expanded[template.id] ? ChevronDown : ChevronRight" class="size-4 text-muted-foreground shrink-0" />
          <template v-if="renamingId === template.id">
            <Input
              v-model="renameValue"
              class="h-7 w-48 text-sm"
              @click.stop
              @keydown.enter="commitRename"
              @keydown.escape="renamingId = null"
              autofocus
            />
            <Button size="sm" variant="default" class="h-7 text-xs" @click.stop="commitRename">Save</Button>
            <Button size="sm" variant="ghost" class="h-7 text-xs" @click.stop="renamingId = null">Cancel</Button>
          </template>
          <template v-else>
            <span class="font-semibold text-sm">{{ template.name }}</span>
            <Badge variant="secondary" class="text-xs">{{ template.rows.length }} items</Badge>
          </template>
        </div>
        <div class="flex items-center gap-1" @click.stop>
          <Button size="sm" variant="ghost" class="h-7 px-2" @click="startRename(template.id, template.name)">
            <Edit2 class="size-3.5" />
          </Button>
          <Button size="sm" variant="ghost" class="h-7 px-2" @click="openAddRow(template.id)">
            <Plus class="size-3.5 mr-1" />
            <span class="text-xs">Add Item</span>
          </Button>
          <Button size="sm" variant="ghost" class="h-7 px-2 text-destructive hover:text-destructive" @click="handleDeleteTemplate(template.id, template.name)">
            <Trash2 class="size-3.5" />
          </Button>
        </div>
      </div>

      <div v-if="expanded[template.id]" class="p-4 bg-muted/20 border-t space-y-4">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div class="space-y-2">
            <Label class="text-[10px] font-bold uppercase tracking-wider opacity-60">Template Category</Label>
            <Select v-model="template.jobCategoryId" @update:modelValue="handleUpdateMeta(template)">
              <SelectTrigger class="h-9 bg-background border-muted-foreground/20">
                <SelectValue placeholder="Assign a category to this BOM" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-for="cat in adminStore.jobCategories" :key="cat.id" :value="cat.id">
                  {{ cat.name }}
                </SelectItem>
              </SelectContent>
            </Select>
            <p class="text-[10px] text-muted-foreground italic">Items will populate under this category in the Job Card.</p>
          </div>
          <div class="space-y-2">
            <Label class="text-[10px] font-bold uppercase tracking-wider opacity-60">Category Description</Label>
            <Textarea 
              v-model="template.categoryDescription" 
              placeholder="Detailed description for this category/section..." 
              class="min-h-[80px] text-xs bg-background border-muted-foreground/20 resize-none"
              @blur="handleUpdateMeta(template)"
            />
            <p class="text-[10px] text-muted-foreground italic">This will populate the section description in the Job Card.</p>
          </div>
        </div>
      </div>

      <!-- Spreadsheet table -->
      <div v-if="expanded[template.id]" class="border-t overflow-x-auto">
        <table class="w-full text-xs border-collapse">
          <thead class="bg-muted/40">
            <tr>
              <th class="text-left px-3 py-2 font-semibold sticky left-0 bg-muted/40 min-w-[180px] border-r border-border/40">Item Name</th>
              <th
                v-for="size in sizeLabels"
                :key="size"
                class="text-center px-1 py-2 font-semibold min-w-[64px] whitespace-nowrap border-r border-border/20 last:border-r-0"
              >
                {{ size }}
              </th>
              <th class="px-2 py-2 w-16 sticky right-0 bg-muted/40"></th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in template.rows"
              :key="row.id"
              class="border-t border-border/30 hover:bg-muted/10 transition-colors group"
            >
              <!-- Item name cell -->
              <td class="px-3 py-0 font-medium sticky left-0 bg-card border-r border-border/40 h-9">
                {{ row.name }}
              </td>

              <!-- Quantity cells — click to edit -->
              <td
                v-for="(size, i) in STRUCTURE_SIZES"
                :key="size"
                :data-cell="cellDataKey(template.id, row.id, i)"
                class="p-0 border-r border-border/20 last:border-r-0 h-9"
                @click="!isEditingCell(template.id, row.id, i) && startEdit(template.id, row.id, i, row.quantities[size] ?? 0)"
              >
                <!-- Editing state -->
                <input
                  v-if="isEditingCell(template.id, row.id, i)"
                  v-model="editingValue"
                  type="number"
                  min="0"
                  class="w-full h-9 px-2 text-center tabular-nums bg-primary/10 border-0 outline-none ring-2 ring-inset ring-primary text-foreground text-xs"
                  @keydown="handleCellKeydown"
                  @blur="handleCellBlur"
                />
                <!-- Display state -->
                <div
                  v-else
                  class="w-full h-9 flex items-center justify-center tabular-nums cursor-cell select-none hover:bg-muted/30 transition-colors"
                  :class="(row.quantities[size] ?? 0) > 0 ? 'text-foreground' : 'text-muted-foreground/35'"
                >
                  {{ (row.quantities[size] ?? 0) > 0 ? row.quantities[size] : '—' }}
                </div>
              </td>

              <!-- Row actions -->
              <td class="px-2 py-0 sticky right-0 bg-card h-9">
                <div class="flex gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button size="sm" variant="ghost" class="h-6 w-6 p-0" @click="openEditName(template.id, row)" title="Rename item">
                    <Edit2 class="size-3" />
                  </Button>
                  <Button size="sm" variant="ghost" class="h-6 w-6 p-0 text-destructive hover:text-destructive" @click="handleDeleteRow(template.id, row.id, row.name)">
                    <Trash2 class="size-3" />
                  </Button>
                </div>
              </td>
            </tr>
            <tr v-if="template.rows.length === 0">
              <td :colspan="STRUCTURE_SIZES.length + 2" class="px-3 py-6 text-center text-muted-foreground">
                No items yet. Click <strong>Add Item</strong> to get started.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>

  <!-- New Template Dialog -->
  <Dialog v-model:open="showNewTemplate">
    <DialogContent class="sm:max-w-sm">
      <DialogHeader>
        <DialogTitle>New BOM Template</DialogTitle>
      </DialogHeader>
      <div class="space-y-3 py-2">
        <Label>Template Name</Label>
        <Input v-model="newTemplateName" placeholder="e.g. Fan Ventilation" @keydown.enter="handleCreateTemplate" />
      </div>
      <DialogFooter>
        <Button variant="outline" @click="showNewTemplate = false">Cancel</Button>
        <Button @click="handleCreateTemplate" :disabled="!newTemplateName.trim()">Create</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>

  <!-- Add Item Dialog (name only) -->
  <Dialog v-model:open="showAddDialog">
    <DialogContent class="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>Add Item</DialogTitle>
      </DialogHeader>
      <div class="space-y-3 py-2">
        <Label>Item Name</Label>
        <EditableCell
          :value="inventoryOptions.find(o => o._name === rowName)?.value ?? ''"
          type="searchable-select"
          :options="inventoryOptions"
          :is-editing="true"
          placeholder="Search inventory items..."
          @update="handleInventorySelect"
        />
        <p v-if="rowName" class="text-xs text-muted-foreground">
          Selected: <span class="font-medium text-foreground">{{ rowName }}</span>
        </p>
      </div>
      <DialogFooter>
        <Button variant="outline" @click="showAddDialog = false">Cancel</Button>
        <Button @click="handleAddRow" :disabled="!rowName.trim()">Add Item</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>

  <!-- Edit Item Name Dialog -->
  <Dialog v-model:open="showEditNameDialog">
    <DialogContent class="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>Edit Item Name</DialogTitle>
      </DialogHeader>
      <div class="space-y-3 py-2">
        <Label>Item Name</Label>
        <EditableCell
          :value="inventoryOptions.find(o => o._name === editNameValue)?.value ?? ''"
          type="searchable-select"
          :options="inventoryOptions"
          :is-editing="true"
          placeholder="Search inventory items..."
          @update="(id: string) => { const opt = inventoryOptions.find(o => o.value === id); if (opt) editNameValue = opt._name }"
        />
        <p v-if="editNameValue" class="text-xs text-muted-foreground">
          Selected: <span class="font-medium text-foreground">{{ editNameValue }}</span>
        </p>
      </div>
      <DialogFooter>
        <Button variant="outline" @click="showEditNameDialog = false">Cancel</Button>
        <Button @click="handleSaveItemName" :disabled="!editNameValue.trim()">Save</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
