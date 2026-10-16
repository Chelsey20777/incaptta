<script setup lang="ts">
import { ref, reactive } from 'vue'
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Trash2, Edit2, Plus } from 'lucide-vue-next'
import { useAdminStore } from '../store/adminStore'

const props = defineProps<{
    title: string
    description: string
    collectionName: string
    items: any[]
    fields: { key: string; label: string; placeholder?: string; type?: string; options?: any[] }[]
}>()

const store = useAdminStore()
const isDialogOpen = ref(false)
const isEditing = ref(false)
const currentItem = reactive<any>({})

function openCreate() {
    isEditing.value = false
    Object.keys(currentItem).forEach(key => delete currentItem[key])
    props.fields.forEach(f => {
        if (f.type === 'select' && f.options && f.options.length > 0) {
            const firstOpt = f.options[0]
            currentItem[f.key] = typeof firstOpt === 'string' ? firstOpt : firstOpt.value
        } else {
            currentItem[f.key] = ''
        }
    })
    isDialogOpen.value = true
}

function openEdit(item: any) {
    isEditing.value = true
    Object.assign(currentItem, item)
    isDialogOpen.value = true
}

async function handleSave() {
    await store.saveEntity(props.collectionName, { ...currentItem }, props.title)
    isDialogOpen.value = false
}

async function handleDelete(id: string) {
    if (confirm(`Are you sure you want to delete this ${props.title.toLowerCase()}?`)) {
        await store.deleteEntity(props.collectionName, id, props.title)
    }
}
</script>

<template>
    <div class="space-y-4">
        <div class="flex justify-between items-center">
            <div>
                <h3 class="text-lg font-medium">{{ title }}</h3>
                <p class="text-sm text-muted-foreground">{{ description }}</p>
            </div>
            <Button size="sm" @click="openCreate">
                <Plus class="mr-2 size-4" />
                New {{ title }}
            </Button>
        </div>

        <Card>
            <CardContent class="p-0">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead v-for="field in fields" :key="field.key">{{ field.label }}</TableHead>
                            <TableHead class="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        <TableRow v-for="item in items" :key="item.id">
                            <TableCell v-for="field in fields" :key="field.key" class="font-medium">
                                {{ item[field.key] || 'N/A' }}
                            </TableCell>
                            <TableCell class="text-right space-x-2">
                                <Button variant="ghost" size="icon" @click="openEdit(item)">
                                    <Edit2 class="size-4" />
                                </Button>
                                <Button variant="ghost" size="icon" class="text-destructive"
                                    @click="handleDelete(item.id)">
                                    <Trash2 class="size-4" />
                                </Button>
                            </TableCell>
                        </TableRow>
                        <TableRow v-if="items.length === 0">
                            <TableCell :colspan="fields.length + 1"
                                class="h-24 text-center text-muted-foreground italic text-[10px]">
                                No {{ title.toLowerCase() }} found.
                            </TableCell>
                        </TableRow>
                    </TableBody>
                </Table>
            </CardContent>
        </Card>

        <Dialog v-model:open="isDialogOpen">
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{{ isEditing ? 'Edit' : 'Create' }} {{ title }}</DialogTitle>
                </DialogHeader>
                <div class="grid gap-4 py-4">
                    <div v-for="field in fields" :key="field.key" class="grid grid-cols-4 items-center gap-4">
                        <Label :for="field.key" class="text-right">{{ field.label }}</Label>
                        <select v-if="field.type === 'select'" :id="field.key" v-model="currentItem[field.key]"
                            class="col-span-3 h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 text-foreground dark:text-white">
                            <option v-for="opt in field.options" :key="typeof opt === 'string' ? opt : opt.value" :value="typeof opt === 'string' ? opt : opt.value" class="bg-background text-foreground">
                                {{ typeof opt === 'string' ? opt : opt.label }}
                            </option>
                        </select>
                        <Input v-else :id="field.key" v-model="currentItem[field.key]" :placeholder="field.placeholder"
                            :type="field.type || 'text'" class="col-span-3" />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" @click="isDialogOpen = false">Cancel</Button>
                    <Button @click="handleSave">Save</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    </div>
</template>
