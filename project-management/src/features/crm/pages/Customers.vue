<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useAdminStore } from '@/features/admin/store/adminStore'
import { useCrmStore } from '../store/crmStore'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Users, Plus, Loader2 } from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import { useRouter } from 'vue-router'

const router = useRouter()
const adminStore = useAdminStore()
const { appSettings } = storeToRefs(adminStore)
const store = useCrmStore()

const isAddModalOpen = ref(false)
const isSubmitting = ref(false)
const newCustomer = ref({
    name: '',
    email: '',
    phone: '',
    address: ''
})

const currentPage = ref(1)
const paginatedCustomers = computed(() => {
    const start = (currentPage.value - 1) * 30
    return store.customers.slice(start, start + 30)
})
const totalPages = computed(() => Math.ceil(store.customers.length / 30) || 1)

onMounted(() => {
    store.fetchCustomers()
})

onUnmounted(() => {
    store.cleanup()
})

const handleSaveCustomer = async () => {
    if (!newCustomer.value.name) return toast.error('Customer name is required')

    isSubmitting.value = true
    try {
        await store.createCustomer({ ...newCustomer.value })
        toast.success('Customer added successfully')
        isAddModalOpen.value = false
        // Reset form
        newCustomer.value = { name: '', email: '', phone: '', address: '' }
    } catch (err: any) {
        toast.error('Failed to add customer')
        console.error(err)
    } finally {
        isSubmitting.value = false
    }
}

</script>

<template>
    <div class="space-y-6">
        <div class="flex items-center justify-between">
            <div>
                <h1 class="text-3xl font-bold tracking-tight">Customers</h1>
                <p class="text-muted-foreground">Manage your client database and contact information.</p>
            </div>
            <Button
                :style="{ backgroundColor: appSettings?.uiColors?.brandSecondaryColor || '#ff8903', borderColor: appSettings?.uiColors?.brandSecondaryColor || '#ff8903' }"
                class="hover:opacity-90 text-white" @click="isAddModalOpen = true">
                <Plus class="size-4 mr-2" />
                Add Customer
            </Button>
        </div>

        <Dialog :open="isAddModalOpen" @update:open="isAddModalOpen = $event">
            <DialogContent class="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Add New Customer</DialogTitle>
                    <DialogDescription>
                        Enter the client's contact details below. Click save when you're done.
                    </DialogDescription>
                </DialogHeader>
                <div class="grid gap-4 py-4">
                    <div class="grid grid-cols-4 items-center gap-4">
                        <Label for="name" class="text-right">Name</Label>
                        <Input id="name" v-model="newCustomer.name" placeholder="Company or Full Name"
                            class="col-span-3" />
                    </div>
                    <div class="grid grid-cols-4 items-center gap-4">
                        <Label for="email" class="text-right">Email</Label>
                        <Input id="email" type="email" v-model="newCustomer.email" placeholder="contact@example.com"
                            class="col-span-3" />
                    </div>
                    <div class="grid grid-cols-4 items-center gap-4">
                        <Label for="phone" class="text-right">Phone</Label>
                        <Input id="phone" v-model="newCustomer.phone" placeholder="+263 77..." class="col-span-3" />
                    </div>
                    <div class="grid grid-cols-4 items-start gap-4">
                        <Label for="address" class="text-right mt-2">Address</Label>
                        <Textarea id="address" v-model="newCustomer.address" placeholder="Physical Address"
                            class="col-span-3 h-20 resize-none" />
                    </div>
                </div>
                <DialogFooter>
                    <Button type="submit" @click="handleSaveCustomer" :disabled="isSubmitting">
                        <Loader2 v-if="isSubmitting" class="mr-2 h-4 w-4 animate-spin" />
                        {{ isSubmitting ? 'Saving...' : 'Save Customer' }}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>

        <Card
            class="bg-brand-primary/5 dark:bg-brand-primary/10 backdrop-blur-md border-brand-primary/20 dark:border-brand-primary/30 shadow-lg text-foreground dark:text-white overflow-hidden">
            <CardHeader>
                <CardTitle class="flex items-center gap-2 text-foreground dark:text-white">
                    <Users class="size-5 text-brand-primary" />
                    Customer Directory
                </CardTitle>
                <CardDescription class="text-muted-foreground dark:text-white/60">A complete list of registered clients
                    within the CRM.</CardDescription>
            </CardHeader>
            <CardContent>
                <div v-if="store.loading && store.customers.length === 0" class="flex justify-center py-8">
                    <Loader2 class="size-8 animate-spin text-muted-foreground" />
                </div>
                <div v-else-if="store.customers.length === 0" class="text-center py-12 text-muted-foreground">
                    No customers found. Click "Add Customer" to assign your first client.
                </div>
                <Table v-else>
                    <TableHeader>
                        <TableRow class="border-b hover:bg-transparent"
                            :style="{ borderColor: 'var(--crm-grid-border)' }">
                            <TableHead class="text-[11px] font-bold uppercase tracking-wider"
                                :style="{ color: 'var(--crm-grid-header-text)' }">System ID</TableHead>
                            <TableHead class="text-[11px] font-bold uppercase tracking-wider"
                                :style="{ color: 'var(--crm-grid-header-text)' }">Name</TableHead>
                            <TableHead class="text-[11px] font-bold uppercase tracking-wider"
                                :style="{ color: 'var(--crm-grid-header-text)' }">Email</TableHead>
                            <TableHead class="text-[11px] font-bold uppercase tracking-wider"
                                :style="{ color: 'var(--crm-grid-header-text)' }">Phone</TableHead>
                            <TableHead class="text-[11px] font-bold uppercase tracking-wider"
                                :style="{ color: 'var(--crm-grid-header-text)' }">Added On</TableHead>
                            <TableHead class="text-right text-[11px] font-bold uppercase tracking-wider"
                                :style="{ color: 'var(--crm-grid-header-text)' }">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        <TableRow v-for="client in paginatedCustomers" :key="client.id"
                            class="border-b transition-colors duration-200 cursor-pointer"
                            :style="{ borderColor: 'var(--crm-grid-border)' }"
                            :class="'hover:bg-brand-primary/5 dark:hover:bg-brand-primary/10'"
                            @click="router.push(`/crm/customers/${client.id}`)">
                            <TableCell class="py-4">
                                <span
                                    class="px-3 py-1.5 rounded-md border text-brand-primary font-mono text-xs shadow-sm font-bold"
                                    :style="{ backgroundColor: (appSettings?.uiColors?.brandPrimaryColor || '#79c21b') + '15', borderColor: (appSettings?.uiColors?.brandPrimaryColor || '#79c21b') + '30' }">
                                    {{ client.id.substring(0, 8) }}
                                </span>
                            </TableCell>
                            <TableCell class="font-medium flex items-center gap-2 text-foreground dark:text-white">
                                <div class="size-6 rounded-full flex items-center justify-center text-[10px] font-bold text-brand-primary"
                                    :style="{ backgroundColor: (appSettings?.uiColors?.brandPrimaryColor || '#79c21b') + '30' }">
                                    {{ client.name.charAt(0).toUpperCase() }}
                                </div>
                                {{ client.name }}
                            </TableCell>
                            <TableCell class="text-foreground/80 dark:text-white/80">{{ client.email || '-' }}
                            </TableCell>
                            <TableCell class="text-foreground/80 dark:text-white/80">{{ client.phone || '-' }}
                            </TableCell>
                            <TableCell class="text-muted-foreground dark:text-white/60 text-xs">{{
                                client.createdAt?.toDate?.()?.toLocaleDateString() || 'N/A' }}</TableCell>
                        </TableRow>
                    </TableBody>
                </Table>

                <!-- Customers Pagination Controls -->
                <div v-if="store.customers.length > 0" class="flex items-center justify-between border-t border-brand-primary/20 pt-4 mt-4 px-4 bg-brand-primary/5 dark:bg-brand-primary/10 rounded-b-xl py-3">
                    <p class="text-xs text-muted-foreground dark:text-white/60">
                        Showing {{ Math.min((currentPage - 1) * 30 + 1, store.customers.length) }}-{{ Math.min(currentPage * 30, store.customers.length) }} of {{ store.customers.length }}
                    </p>
                    <div class="flex items-center gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            class="h-8 border-brand-primary/30 text-brand-primary hover:bg-brand-primary/10 bg-transparent"
                            :disabled="currentPage === 1"
                            @click="currentPage--"
                        >
                            Previous
                        </Button>
                        <span class="text-xs font-bold text-foreground dark:text-white px-3 py-1 rounded bg-muted/20 border border-brand-primary/20">
                            {{ currentPage }} / {{ totalPages }}
                        </span>
                        <Button
                            variant="outline"
                            size="sm"
                            class="h-8 border-brand-primary/30 text-brand-primary hover:bg-brand-primary/10 bg-transparent"
                            :disabled="currentPage >= totalPages"
                            @click="currentPage++"
                        >
                            Next
                        </Button>
                    </div>
                </div>
            </CardContent>
        </Card>
    </div>
</template>
