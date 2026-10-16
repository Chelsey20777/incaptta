<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useHrStore } from '../store/hrStore'
import { useSession } from '@/composables/useSession'
import { storeToRefs } from 'pinia'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { CalendarOff, PlusCircle, CheckCircle, XCircle } from 'lucide-vue-next'
import type { LeaveRequest } from '../types'
import HRNav from '../components/HRNav.vue'

const hrStore = useHrStore()
const { user, hasAnyRole } = useSession()
const { employees, leaveRequests, loading } = storeToRefs(hrStore)

onMounted(() => { hrStore.fetchEmployees(); hrStore.fetchLeaveRequests() })
onUnmounted(() => hrStore.cleanup())

const canApprove = computed(() => hasAnyRole(['ADMIN', 'SUPER_ADMIN', 'MANAGER', 'ACCOUNTANT', 'TECHNICAL']))

const filterStatus = ref('')
const showDialog = ref(false)
const saving = ref(false)

const form = ref({
    employeeId: '',
    type: 'Annual' as LeaveRequest['type'],
    startDate: '',
    endDate: '',
    reason: ''
})

const filtered = computed(() => {
    let list = leaveRequests.value
    if (filterStatus.value && filterStatus.value !== 'ALL') list = list.filter(l => l.status === filterStatus.value)
    return list
})

const currentEmployee = computed(() =>
    employees.value.find(e => e.email === user.value?.email)
)

function openRequest() {
    form.value = { employeeId: currentEmployee.value?.id || '', type: 'Annual', startDate: '', endDate: '', reason: '' }
    showDialog.value = true
}

async function submit() {
    if (!form.value.employeeId || !form.value.startDate || !form.value.endDate) return
    saving.value = true
    try {
        const emp = employees.value.find(e => e.id === form.value.employeeId)
        await hrStore.submitLeaveRequest({
            ...form.value,
            employeeName: emp?.fullName || ''
        })
        showDialog.value = false
    } finally {
        saving.value = false
    }
}

async function approve(id: string) {
    await hrStore.updateLeaveStatus(id, 'Approved', user.value?.uid || '', user.value?.displayName || user.value?.email || '')
}

async function reject(id: string) {
    await hrStore.updateLeaveStatus(id, 'Rejected', user.value?.uid || '', user.value?.displayName || user.value?.email || '')
}

function statusColor(s: string) {
    return {
        Pending: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20',
        Approved: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
        Rejected: 'bg-red-500/10 text-red-600 border-red-500/20'
    }[s] || ''
}

function daysBetween(start: string, end: string) {
    const d = (new Date(end).getTime() - new Date(start).getTime()) / 86400000
    return isNaN(d) ? 0 : Math.round(d) + 1
}

// Leave balance per employee (simple tracker: annual = 20 days per year)
const leaveBalance = computed(() => {
    const map: Record<string, number> = {}
    employees.value.forEach(e => {
        const used = leaveRequests.value
            .filter(l => l.employeeId === e.id && l.status === 'Approved' && l.type === 'Annual')
            .reduce((s, l) => s + daysBetween(l.startDate, l.endDate), 0)
        map[e.id!] = Math.max(0, 20 - used)
    })
    return map
})
</script>

<template>
    <div class="space-y-5">
        <HRNav />
        <div class="flex items-center justify-between gap-4 flex-wrap">
            <div>
                <h1 class="text-2xl font-bold tracking-tight flex items-center gap-2">
                    <CalendarOff class="size-6" /> Attendance & Leave
                </h1>
                <p class="text-muted-foreground text-sm mt-1">Manage leave requests and approvals</p>
            </div>
            <Button @click="openRequest" class="gap-2">
                <PlusCircle class="size-4" /> Request Leave
            </Button>
        </div>

        <!-- Summary Cards -->
        <div class="grid grid-cols-3 gap-4">
            <Card>
                <CardContent class="p-4">
                    <p class="text-2xl font-bold">{{ leaveRequests.filter(l => l.status === 'Pending').length }}</p>
                    <p class="text-xs text-muted-foreground">Pending Requests</p>
                </CardContent>
            </Card>
            <Card>
                <CardContent class="p-4">
                    <p class="text-2xl font-bold text-emerald-500">{{ leaveRequests.filter(l => l.status === 'Approved').length }}</p>
                    <p class="text-xs text-muted-foreground">Approved</p>
                </CardContent>
            </Card>
            <Card>
                <CardContent class="p-4">
                    <p class="text-2xl font-bold text-red-500">{{ leaveRequests.filter(l => l.status === 'Rejected').length }}</p>
                    <p class="text-xs text-muted-foreground">Rejected</p>
                </CardContent>
            </Card>
        </div>

        <!-- Leave Balance Table -->
        <Card>
            <CardHeader class="pb-2">
                <CardTitle class="text-sm font-semibold">Annual Leave Balance (20 days/year)</CardTitle>
            </CardHeader>
            <CardContent class="p-0">
                <div class="overflow-x-auto">
                    <table class="w-full text-sm">
                        <thead class="border-b bg-muted/30">
                            <tr>
                                <th class="text-left px-4 py-2 font-semibold text-xs">Employee</th>
                                <th class="text-left px-4 py-2 font-semibold text-xs hidden md:table-cell">Department</th>
                                <th class="text-center px-4 py-2 font-semibold text-xs">Days Used</th>
                                <th class="text-center px-4 py-2 font-semibold text-xs">Remaining</th>
                                <th class="text-left px-4 py-2 font-semibold text-xs">Balance</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="emp in employees.filter(e => e.status !== 'Terminated')" :key="emp.id"
                                class="border-b last:border-0">
                                <td class="px-4 py-2 font-medium">{{ emp.fullName }}</td>
                                <td class="px-4 py-2 text-muted-foreground hidden md:table-cell">{{ emp.department }}</td>
                                <td class="px-4 py-2 text-center">{{ 20 - (leaveBalance[emp.id!] || 20) }}</td>
                                <td class="px-4 py-2 text-center font-semibold"
                                    :class="(leaveBalance[emp.id!] || 20) < 5 ? 'text-red-500' : 'text-emerald-500'">
                                    {{ leaveBalance[emp.id!] ?? 20 }}
                                </td>
                                <td class="px-4 py-2">
                                    <div class="w-24 bg-muted rounded-full h-1.5">
                                        <div class="h-1.5 rounded-full bg-primary transition-all"
                                            :style="{ width: ((leaveBalance[emp.id!] ?? 20) / 20 * 100) + '%' }" />
                                    </div>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </CardContent>
        </Card>

        <!-- Leave Requests -->
        <Card>
            <CardHeader class="pb-2">
                <div class="flex items-center justify-between">
                    <CardTitle class="text-sm font-semibold">Leave Requests</CardTitle>
                    <Select v-model="filterStatus" class="w-36">
                        <SelectTrigger class="h-8 text-xs w-36">
                            <SelectValue placeholder="All Status" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="ALL">All Status</SelectItem>
                            <SelectItem value="Pending">Pending</SelectItem>
                            <SelectItem value="Approved">Approved</SelectItem>
                            <SelectItem value="Rejected">Rejected</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </CardHeader>
            <CardContent class="p-0">
                <div class="overflow-x-auto">
                    <table class="w-full text-sm">
                        <thead class="border-b bg-muted/30">
                            <tr>
                                <th class="text-left px-4 py-2 font-semibold text-xs">Employee</th>
                                <th class="text-left px-4 py-2 font-semibold text-xs">Type</th>
                                <th class="text-left px-4 py-2 font-semibold text-xs hidden md:table-cell">Period</th>
                                <th class="text-center px-4 py-2 font-semibold text-xs hidden sm:table-cell">Days</th>
                                <th class="text-left px-4 py-2 font-semibold text-xs hidden lg:table-cell">Reason</th>
                                <th class="text-center px-4 py-2 font-semibold text-xs">Status</th>
                                <th v-if="canApprove" class="text-right px-4 py-2 font-semibold text-xs">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-if="filtered.length === 0">
                                <td :colspan="canApprove ? 7 : 6" class="py-8 text-center text-muted-foreground italic text-sm">
                                    No leave requests
                                </td>
                            </tr>
                            <tr v-for="req in filtered" :key="req.id" class="border-b last:border-0 hover:bg-muted/20">
                                <td class="px-4 py-2 font-medium">{{ req.employeeName }}</td>
                                <td class="px-4 py-2">{{ req.type }}</td>
                                <td class="px-4 py-2 text-muted-foreground hidden md:table-cell">
                                    {{ req.startDate }} → {{ req.endDate }}
                                </td>
                                <td class="px-4 py-2 text-center hidden sm:table-cell">
                                    {{ daysBetween(req.startDate, req.endDate) }}
                                </td>
                                <td class="px-4 py-2 text-muted-foreground max-w-[200px] truncate hidden lg:table-cell">
                                    {{ req.reason }}
                                </td>
                                <td class="px-4 py-2 text-center">
                                    <span class="text-xs px-2 py-0.5 rounded-full border" :class="statusColor(req.status)">
                                        {{ req.status }}
                                    </span>
                                </td>
                                <td v-if="canApprove" class="px-4 py-2 text-right">
                                    <div v-if="req.status === 'Pending'" class="flex justify-end gap-1">
                                        <Button variant="ghost" size="icon" class="h-7 w-7 hover:text-emerald-500"
                                            @click="approve(req.id!)">
                                            <CheckCircle class="size-4" />
                                        </Button>
                                        <Button variant="ghost" size="icon" class="h-7 w-7 hover:text-destructive"
                                            @click="reject(req.id!)">
                                            <XCircle class="size-4" />
                                        </Button>
                                    </div>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </CardContent>
        </Card>

        <!-- Leave Request Dialog -->
        <Dialog v-model:open="showDialog">
            <DialogContent class="w-[95vw] max-w-none">
                <DialogHeader>
                    <DialogTitle>Request Leave</DialogTitle>
                </DialogHeader>
                <div class="space-y-4 py-2">
                    <div class="space-y-1">
                        <label class="text-xs font-medium">Employee</label>
                        <Select v-model="form.employeeId">
                            <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem v-for="e in employees" :key="e.id" :value="e.id!">{{ e.fullName }}</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div class="space-y-1">
                        <label class="text-xs font-medium">Leave Type</label>
                        <Select v-model="form.type">
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="Annual">Annual</SelectItem>
                                <SelectItem value="Sick">Sick</SelectItem>
                                <SelectItem value="Emergency">Emergency</SelectItem>
                                <SelectItem value="Study">Study</SelectItem>
                                <SelectItem value="Maternity/Paternity">Maternity/Paternity</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div class="grid grid-cols-2 gap-3">
                        <div class="space-y-1">
                            <label class="text-xs font-medium">Start Date</label>
                            <Input v-model="form.startDate" type="date" />
                        </div>
                        <div class="space-y-1">
                            <label class="text-xs font-medium">End Date</label>
                            <Input v-model="form.endDate" type="date" />
                        </div>
                    </div>
                    <div class="space-y-1">
                        <label class="text-xs font-medium">Reason</label>
                        <Textarea v-model="form.reason" placeholder="Reason for leave…" class="min-h-[80px]" />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" @click="showDialog = false">Cancel</Button>
                    <Button @click="submit" :disabled="saving || !form.employeeId || !form.startDate || !form.endDate">
                        {{ saving ? 'Submitting…' : 'Submit Request' }}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    </div>
</template>
