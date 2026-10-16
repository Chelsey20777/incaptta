<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { 
  Settings2, 
  Save, 
  Plus, 
  Trash2, 
  ArrowLeft, 
  Loader2,
  Calculator,
  Info
} from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useAgricRates } from '../composables/useAgricRates'
import { useAgricTemplate, type TemplateItem, type FormulaVariable } from '../composables/useAgricTemplate'
import { toast } from 'vue-sonner'

const router = useRouter()
const { rates, loading: loadingRates, updateRates } = useAgricRates()
const { items: templateItems, loading: loadingTemplate, saveTemplate } = useAgricTemplate()

const isSaving = ref(false)

async function handleSaveRates() {
  isSaving.value = true
  try {
    await updateRates(rates.value)
  } catch (err) {}
  finally {
    isSaving.value = false
  }
}

async function handleSaveTemplate() {
  isSaving.value = true
  try {
    await saveTemplate(templateItems.value)
  } catch (err) {}
  finally {
    isSaving.value = false
  }
}

function addItem() {
  templateItems.value.push({
    id: crypto.randomUUID(),
    description: '',
    unit: 'pcs',
    category: 'material',
    multiplier: 1,
    variable: 'scale',
    baseUnitPrice: 0
  })
}

function removeItem(index: number) {
  templateItems.value.splice(index, 1)
}

const variables: { value: FormulaVariable; label: string }[] = [
  { value: 'area', label: 'Floor Area (m²)' },
  { value: 'perimeter', label: 'Perimeter (m)' },
  { value: 'wallArea', label: 'Wall Area (m²)' },
  { value: 'scale', label: 'Size Ratio (vs 80x10)' },
  { value: 'bays', label: 'Number of Bays' },
]
</script>

<template>
  <div class="h-full space-y-6 p-8 pt-6 pb-20 max-w-7xl mx-auto">
    <div class="flex items-center justify-between">
      <div class="space-y-1">
        <div class="flex items-center gap-2 text-sm text-muted-foreground mb-1">
           <Button variant="ghost" size="sm" class="h-7 px-2" @click="router.back()">
              <ArrowLeft class="size-4 mr-1" /> Back
           </Button>
           <span>/</span>
           <span>Agric Structures</span>
        </div>
        <h2 class="text-3xl font-bold tracking-tight flex items-center gap-2">
          <Settings2 class="size-8 text-brand-primary" />
          Agric Settings
        </h2>
      </div>
    </div>

    <div class="grid gap-6 md:grid-cols-3">
       <!-- Global Rates (Left) -->
       <div class="space-y-6">
          <Card class="border-brand-primary/10 shadow-lg">
             <CardHeader>
                <CardTitle class="text-lg flex items-center gap-2">
                   <Calculator class="size-4 text-brand-primary" />
                   Base Rates
                </CardTitle>
                <CardDescription>Global costs used across all calculators.</CardDescription>
             </CardHeader>
             <CardContent class="space-y-4">
                <div class="space-y-2">
                   <Label>Brick Unit Cost ($)</Label>
                   <Input v-model.number="rates.brickUnitCost" type="number" step="0.01" />
                </div>
                <div class="space-y-2">
                   <Label>Cement Bag Cost ($)</Label>
                   <Input v-model.number="rates.cementUnitCost" type="number" step="0.50" />
                </div>
                
                <Separator class="my-4" />
                
                <div class="flex items-center justify-between">
                   <div class="space-y-0.5">
                      <Label>Include Labour</Label>
                      <p class="text-[10px] text-muted-foreground">Default for new calculations</p>
                   </div>
                   <Switch v-model="rates.includeLabour" />
                </div>
                
                <div class="flex items-center justify-between">
                   <div class="space-y-0.5">
                      <Label>Include Transport</Label>
                      <p class="text-[10px] text-muted-foreground">Default for new calculations</p>
                   </div>
                   <Switch v-model="rates.includeTransport" />
                </div>

                <Button 
                  class="w-full bg-brand-primary hover:bg-brand-primary/90 mt-4" 
                  @click="handleSaveRates"
                  :disabled="isSaving || loadingRates"
                >
                   <Loader2 v-if="isSaving" class="mr-2 size-4 animate-spin" />
                   <Save v-else class="mr-2 size-4" />
                   Save Rates
                </Button>
             </CardContent>
          </Card>

          <div class="bg-blue-50 border border-blue-100 rounded-xl p-6 space-y-3">
             <div class="flex items-center gap-3">
                <Info class="size-6 text-blue-600" />
                <h3 class="font-bold text-blue-900 text-sm">Formula Variables</h3>
             </div>
             <div class="space-y-2">
                <p v-for="v in variables" :key="v.value" class="text-xs text-blue-800">
                   <span class="font-bold font-mono bg-blue-100 px-1 rounded">{{ v.value }}</span>: {{ v.label }}
                </p>
             </div>
             <p class="text-[10px] text-blue-700 leading-relaxed mt-2 italic">
                Quantities are calculated as: <code>ceil(Multiplier × Variable)</code>
             </p>
          </div>
       </div>

       <!-- BOQ Template (Right/Main) -->
       <div class="md:col-span-2">
          <Card class="border-brand-primary/10 shadow-lg h-full">
             <CardHeader class="flex flex-row items-center justify-between space-y-0">
                <div>
                   <CardTitle class="text-lg">Master BOQ Template</CardTitle>
                   <CardDescription>Define the list of items and formulas for the calculator.</CardDescription>
                </div>
                <Button size="sm" variant="outline" @click="addItem">
                   <Plus class="size-4 mr-2" /> Add Item
                </Button>
             </CardHeader>
             <CardContent class="p-0">
                <div class="overflow-auto max-h-[600px]">
                   <table class="w-full text-sm">
                      <thead class="bg-muted/50 sticky top-0 z-10 border-b">
                         <tr class="h-10 text-left text-xs uppercase font-bold text-muted-foreground">
                            <th class="px-4 min-w-[200px]">Description</th>
                            <th class="px-2 w-20">Unit</th>
                            <th class="px-2 w-32">Variable</th>
                            <th class="px-2 w-20">Multiplier</th>
                            <th class="px-2 w-20">Base $</th>
                            <th class="px-4 w-10"></th>
                         </tr>
                      </thead>
                      <tbody class="divide-y">
                         <tr v-for="(item, idx) in templateItems" :key="item.id" class="hover:bg-muted/30 transition-colors h-14">
                            <td class="px-4 py-2">
                               <Input v-model="item.description" class="h-8 text-xs" placeholder="Item description..." />
                            </td>
                            <td class="px-2">
                               <Input v-model="item.unit" class="h-8 text-xs text-center uppercase" />
                            </td>
                            <td class="px-2">
                               <Select v-model="item.variable">
                                  <SelectTrigger class="h-8 text-[10px]">
                                     <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                     <SelectItem v-for="v in variables" :key="v.value" :value="v.value">
                                        {{ v.value }}
                                     </SelectItem>
                                  </SelectContent>
                               </Select>
                            </td>
                            <td class="px-2">
                               <Input v-model.number="item.multiplier" type="number" class="h-8 text-xs text-center" />
                            </td>
                            <td class="px-2">
                               <Input v-model.number="item.baseUnitPrice" type="number" step="0.01" class="h-8 text-xs text-center" />
                            </td>
                            <td class="px-4">
                               <Button variant="ghost" size="sm" class="h-8 w-8 p-0 text-destructive hover:bg-destructive/10" @click="removeItem(idx)">
                                  <Trash2 class="size-3.5" />
                               </Button>
                            </td>
                         </tr>
                      </tbody>
                   </table>
                </div>
                
                <div class="p-6 border-t bg-muted/20 rounded-b-lg">
                   <div class="flex items-center justify-between">
                      <p class="text-xs text-muted-foreground italic">
                         Changes here will affect all NEW calculations. Existing Job Cards will remain unchanged.
                      </p>
                      <Button 
                        class="bg-brand-primary hover:bg-brand-primary/90 shadow-lg shadow-brand-primary/20 font-bold" 
                        @click="handleSaveTemplate"
                        :disabled="isSaving || loadingTemplate"
                      >
                         <Loader2 v-if="isSaving" class="mr-2 size-4 animate-spin" />
                         <Save v-else class="mr-2 size-4" />
                         Save BOQ Template
                      </Button>
                   </div>
                </div>
             </CardContent>
          </Card>
       </div>
    </div>
  </div>
</template>
