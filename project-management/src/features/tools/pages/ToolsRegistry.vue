<script setup lang="ts">
import { onMounted, onUnmounted, computed } from 'vue'
import { useAdminStore } from '@/features/admin/store/adminStore'
import { storeToRefs } from 'pinia'
import EntityTable from '@/features/admin/components/EntityTable.vue'
import { Card, CardContent } from '@/components/ui/card'
import { Wrench, CheckCircle, AlertTriangle, Play } from 'lucide-vue-next'

const store = useAdminStore()
const { toolsRegistry } = storeToRefs(store)

onMounted(() => {
    store.fetchAll()
})

onUnmounted(() => {
    store.cleanup()
})

// Support both unique serial items and bulk quantity items
const toolFields = [
    { key: 'name', label: 'Tool Name', placeholder: 'e.g. Dewalt Drill' },
    { key: 'serialNumber', label: 'Serial / Tag No.', placeholder: 'e.g. TL-001 (or N/A)' },
    { key: 'quantity', label: 'Quantity', placeholder: 'e.g. 1', type: 'number' },
    { 
        key: 'status', 
        label: 'Status', 
        type: 'select',
        options: [
            { value: 'Available', label: 'Available' },
            { value: 'In Use', label: 'In Use' },
            { value: 'Damaged', label: 'Damaged' },
            { value: 'Maintenance', label: 'Maintenance' }
        ]
    }
]

// Sum quantities and group by status
const stats = computed(() => {
    const list = toolsRegistry.value || []
    
    let total = 0
    let available = 0
    let inUse = 0
    let damaged = 0
    let maintenance = 0

    list.forEach(t => {
        const qty = Number(t.quantity) || 1
        total += qty

        const status = (t.status || '').toLowerCase()
        if (status.includes('available') || !status) {
            available += qty
        } else if (status.includes('in use') || status.includes('allocated')) {
            inUse += qty
        } else if (status.includes('damaged')) {
            damaged += qty
        } else if (status.includes('maintenance')) {
            maintenance += qty
        } else {
            available += qty // fallback
        }
    })

    return { total, available, inUse, damaged, maintenance }
})
</script>

<template>
    <div class="flex-1 space-y-6 p-8 pt-6">
        <div>
            <h2 class="text-3xl font-bold tracking-tight text-foreground">Tools Registry</h2>
            <p class="text-muted-foreground">Manage, track, and count company tools & equipment.</p>
        </div>

        <!-- Metric Counter Cards -->
        <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <Card class="bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 shadow-md">
                <CardContent class="p-4 flex items-center justify-between">
                    <div>
                        <p class="text-xs font-black uppercase tracking-wider text-muted-foreground">Total Tools</p>
                        <h3 class="text-2xl font-black mt-1">{{ stats.total }}</h3>
                    </div>
                    <div class="p-2.5 rounded-xl bg-primary/10 text-primary">
                        <Wrench class="size-5" />
                    </div>
                </CardContent>
            </Card>

            <Card class="bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 border border-emerald-500/20 shadow-md">
                <CardContent class="p-4 flex items-center justify-between">
                    <div>
                        <p class="text-xs font-black uppercase tracking-wider text-muted-foreground">Available</p>
                        <h3 class="text-2xl font-black mt-1 text-emerald-600 dark:text-emerald-400">{{ stats.available }}</h3>
                    </div>
                    <div class="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                        <CheckCircle class="size-5" />
                    </div>
                </CardContent>
            </Card>

            <Card class="bg-gradient-to-br from-blue-500/10 to-blue-500/5 border border-blue-500/20 shadow-md">
                <CardContent class="p-4 flex items-center justify-between">
                    <div>
                        <p class="text-xs font-black uppercase tracking-wider text-muted-foreground">In Use</p>
                        <h3 class="text-2xl font-black mt-1 text-blue-600 dark:text-blue-400">{{ stats.inUse }}</h3>
                    </div>
                    <div class="p-2.5 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
                        <Play class="size-5" />
                    </div>
                </CardContent>
            </Card>

            <Card class="bg-gradient-to-br from-destructive/10 to-destructive/5 border border-destructive/20 shadow-md">
                <CardContent class="p-4 flex items-center justify-between">
                    <div>
                        <p class="text-xs font-black uppercase tracking-wider text-muted-foreground">Damaged / Maint.</p>
                        <h3 class="text-2xl font-black mt-1 text-destructive">{{ stats.damaged + stats.maintenance }}</h3>
                    </div>
                    <div class="p-2.5 rounded-xl bg-destructive/10 text-destructive">
                        <AlertTriangle class="size-5" />
                    </div>
                </CardContent>
            </Card>
        </div>

        <EntityTable 
            title="Tool / Equipment" 
            description="Create, allocate, and inventory physical tools."
            collectionName="toolsRegistry" 
            :items="toolsRegistry" 
            :fields="toolFields" 
        />
    </div>
</template>
