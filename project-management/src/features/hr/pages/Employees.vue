<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useHrStore } from '../store/hrStore'
import { useAdminStore } from '@/features/admin/store/adminStore'
import { storeToRefs } from 'pinia'
import { useRouter } from 'vue-router'
import { useSession } from '@/composables/useSession'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { UserPlus, Search, Pencil, Trash2, Eye, Users } from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import type { Employee } from '../types'
import HRNav from '../components/HRNav.vue'

const hrStore = useHrStore()
const adminStore = useAdminStore()
const router = useRouter()
const { hasAnyRole } = useSession()
const { employees, loading } = storeToRefs(hrStore)
const { departments } = storeToRefs(adminStore)

const canManage = computed(() => hasAnyRole(['ADMIN', 'SUPER_ADMIN', 'MANAGER', 'ACCOUNTANT', 'TECHNICAL']))

onMounted(() => { hrStore.fetchEmployees(); adminStore.fetchAll?.() })
onUnmounted(() => hrStore.cleanup())

const search = ref('')
const filterDept = ref('')
const filterStatus = ref('')
const showDialog = ref(false)
const saving = ref(false)
const editingId = ref<string | null>(null)

const blank = (): Omit<Employee, 'id' | 'createdAt'> => ({
    fullName: '', nationalId: '', department: '', jobTitle: '',
    contractType: 'Full-Time', startDate: '', salary: 0,
    phone: '', email: '', status: 'Active'
})

const form = ref(blank())

const filtered = computed(() => {
    let list = employees.value
    if (search.value) {
        const q = search.value.toLowerCase()
        list = list.filter(e =>
            e.fullName?.toLowerCase().includes(q) ||
            e.email?.toLowerCase().includes(q) ||
            e.jobTitle?.toLowerCase().includes(q)
        )
    }
    if (filterDept.value && filterDept.value !== 'ALL') list = list.filter(e => e.department === filterDept.value)
    if (filterStatus.value && filterStatus.value !== 'ALL') list = list.filter(e => e.status === filterStatus.value)
    return list
})

function openAdd() {
    editingId.value = null
    form.value = blank()
    showDialog.value = true
}

function openEdit(emp: Employee) {
    editingId.value = emp.id!
    form.value = { ...emp } as any
    showDialog.value = true
}

async function save() {
    if (!form.value.fullName || !form.value.email) return
    saving.value = true
    try {
        await hrStore.saveEmployee(form.value, editingId.value || undefined)
        showDialog.value = false
        toast.success(editingId.value ? 'Employee updated successfully' : 'Employee added successfully')
    } catch (err: any) {
        console.error('Save employee error:', err)
        toast.error('Failed to save employee', { description: err.message || 'Check your permissions.' })
    } finally {
        saving.value = false
    }
}

async function remove(id: string, name: string) {
    if (!confirm(`Delete employee "${name}"? This cannot be undone.`)) return
    await hrStore.deleteEmployee(id)
}

function statusBadge(s: string) {
    const map: Record<string, string> = {
        Active: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
        'On Leave': 'bg-orange-500/10 text-orange-600 border-orange-500/20',
        Probation: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
        Terminated: 'bg-red-500/10 text-red-600 border-red-500/20'
    }
    return map[s] || ''
}

const uniqueDepts = computed(() => [...new Set(employees.value.map(e => e.department).filter(Boolean))])
</script>

<template>
    <div class="space-y-5">
        <HRNav />
        <div class="flex items-center justify-between gap-4 flex-wrap">
            <div>
                <h1 class="text-2xl font-bold tracking-tight flex items-center gap-2">
                    <Users class="size-6" /> Employee Management
                </h1>
                <p class="text-muted-foreground text-sm mt-1">{{ employees.length }} employees total</p>
            </div>
            <Button v-if="canManage" @click="openAdd" class="gap-2">
                <UserPlus class="size-4" /> Add Employee
            </Button>
        </div>

        <!-- Filters -->
        <div class="flex flex-wrap gap-3">
            <div class="relative flex-1 min-w-[200px]">
                <Search class="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <Input v-model="search" placeholder="Search name, email, title…" class="pl-9" />
            </div>
            <Select v-model="filterDept">
                <SelectTrigger class="w-44">
                    <SelectValue placeholder="All Departments" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="ALL">All Departments</SelectItem>
                    <SelectItem v-for="d in uniqueDepts" :key="d" :value="d">{{ d }}</SelectItem>
                </SelectContent>
            </Select>
            <Select v-model="filterStatus">
                <SelectTrigger class="w-36">
                    <SelectValue placeholder="All Status" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="ALL">All Status</SelectItem>
                    <SelectItem value="Active">Active</SelectItem>
                    <SelectItem value="On Leave">On Leave</SelectItem>
                    <SelectItem value="Probation">Probation</SelectItem>
                    <SelectItem value="Terminated">Terminated</SelectItem>
                </SelectContent>
            </Select>
        </div>

        <!-- Table -->
        <Card>
            <CardContent class="p-0">
                <div class="overflow-x-auto">
                    <table class="w-full text-sm">
                        <thead class="border-b bg-muted/40">
                            <tr>
                                <th class="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wider">Name</th>
                                <th class="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wider hidden md:table-cell">Department</th>
                                <th class="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wider hidden lg:table-cell">Title</th>
                                <th class="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wider hidden lg:table-cell">Contract</th>
                                <th class="text-right px-4 py-3 font-semibold text-xs uppercase tracking-wider hidden md:table-cell">Salary</th>
                                <th class="text-center px-4 py-3 font-semibold text-xs uppercase tracking-wider">Status</th>
                                <th class="text-right px-4 py-3 font-semibold text-xs uppercase tracking-wider">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-if="loading" class="text-center">
                                <td colspan="7" class="py-10 text-muted-foreground italic text-sm">Loading…</td>
                            </tr>
                            <tr v-else-if="filtered.length === 0">
                                <td colspan="7" class="py-10 text-center text-muted-foreground italic text-sm">No employees found</td>
                            </tr>
                            <tr v-for="emp in filtered" :key="emp.id"
                                class="border-b last:border-0 hover:bg-muted/30 transition-colors group">
                                <td class="px-4 py-3">
                                    <div class="flex items-center gap-3">
                                        <div class="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold shrink-0">
                                            {{ emp.fullName?.charAt(0) || '?' }}
                                        </div>
                                        <div>
                                            <p class="font-medium">{{ emp.fullName }}</p>
                                            <p class="text-xs text-muted-foreground">{{ emp.email }}</p>
                                        </div>
                                    </div>
                                </td>
                                <td class="px-4 py-3 text-muted-foreground hidden md:table-cell">{{ emp.department }}</td>
                                <td class="px-4 py-3 hidden lg:table-cell">{{ emp.jobTitle }}</td>
                                <td class="px-4 py-3 hidden lg:table-cell">
                                    <span class="text-xs bg-muted px-2 py-0.5 rounded">{{ emp.contractType }}</span>
                                </td>
                                <td class="px-4 py-3 text-right font-mono hidden md:table-cell">
                                    ${{ emp.salary?.toLocaleString() }}
                                </td>
                                <td class="px-4 py-3 text-center">
                                    <span class="text-xs px-2 py-0.5 rounded-full border" :class="statusBadge(emp.status)">
                                        {{ emp.status }}
                                    </span>
                                </td>
                                <td class="px-4 py-3 text-right">
                                    <div class="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <Button variant="ghost" size="icon" class="h-7 w-7"
                                            @click="router.push(`/hr/employees/${emp.id}`)">
                                            <Eye class="size-3.5" />
                                        </Button>
                                        <Button v-if="canManage" variant="ghost" size="icon" class="h-7 w-7"
                                            @click="openEdit(emp)">
                                            <Pencil class="size-3.5" />
                                        </Button>
                                        <Button v-if="canManage" variant="ghost" size="icon"
                                            class="h-7 w-7 hover:text-destructive"
                                            @click="remove(emp.id!, emp.fullName)">
                                            <Trash2 class="size-3.5" />
                                        </Button>
                                    </div>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </CardContent>
        </Card>

        <!-- Add/Edit Dialog -->
        <Dialog v-model:open="showDialog">
            <DialogContent class="w-[95vw] max-w-none max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{{ editingId ? 'Edit Employee' : 'Add Employee' }}</DialogTitle>
                </DialogHeader>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4 py-4">
                    <div class="space-y-1">
                        <label class="text-xs font-medium">Full Name *</label>
                        <Input v-model="form.fullName" placeholder="John Doe" />
                    </div>
                    <div class="space-y-1">
                        <label class="text-xs font-medium">National ID</label>
                        <Input v-model="form.nationalId" placeholder="ID number" />
                    </div>
                    <div class="space-y-1">
                        <label class="text-xs font-medium">Email *</label>
                        <Input v-model="form.email" type="email" placeholder="john@company.com" />
                    </div>
                    <div class="space-y-1">
                        <label class="text-xs font-medium">Phone</label>
                        <Input v-model="form.phone" placeholder="+263 77 000 0000" />
                    </div>
                    <div class="space-y-1">
                        <label class="text-xs font-medium">Department</label>
                        <Input v-model="form.department" placeholder="Engineering" />
                    </div>
                    <div class="space-y-1">
                        <label class="text-xs font-medium">Job Title</label>
                        <Input v-model="form.jobTitle" placeholder="Software Developer" />
                    </div>
                    <div class="space-y-1">
                        <label class="text-xs font-medium">Contract Type</label>
                        <Select v-model="form.contractType">
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="Full-Time">Full-Time</SelectItem>
                                <SelectItem value="Part-Time">Part-Time</SelectItem>
                                <SelectItem value="Contract">Contract</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div class="space-y-1">
                        <label class="text-xs font-medium">Start Date</label>
                        <Input v-model="form.startDate" type="date" />
                    </div>
                    <div class="space-y-1">
                        <label class="text-xs font-medium">Basic Salary ($)</label>
                        <Input v-model.number="form.salary" type="number" placeholder="0.00" />
                    </div>
                    <div class="space-y-1">
                        <label class="text-xs font-medium">Status</label>
                        <Select v-model="form.status">
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="Active">Active</SelectItem>
                                <SelectItem value="On Leave">On Leave</SelectItem>
                                <SelectItem value="Probation">Probation</SelectItem>
                                <SelectItem value="Terminated">Terminated</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" @click="showDialog = false">Cancel</Button>
                    <Button @click="save" :disabled="saving || !form.fullName || !form.email">
                        {{ saving ? 'Saving…' : (editingId ? 'Save Changes' : 'Add Employee') }}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    </div>
</template>
