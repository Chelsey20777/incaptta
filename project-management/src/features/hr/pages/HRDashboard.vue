<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'
import { useHrStore } from '../store/hrStore'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
    Users, CalendarOff, Wallet, Briefcase, AlertTriangle,
    ClipboardList, TrendingUp, UserCheck, Clock
} from 'lucide-vue-next'
import HRNav from '../components/HRNav.vue'

const hrStore = useHrStore()
const router = useRouter()
const { employees, leaveRequests, tasks, payrolls, jobPostings } = storeToRefs(hrStore)

onMounted(() => hrStore.fetchAll())
onUnmounted(() => hrStore.cleanup())

const totalEmployees = computed(() => employees.value.filter(e => e.status !== 'Terminated').length)
const onLeave = computed(() => employees.value.filter(e => e.status === 'On Leave').length)
const pendingLeave = computed(() => leaveRequests.value.filter(l => l.status === 'Pending').length)

const currentMonth = new Date().getMonth() + 1
const currentYear = new Date().getFullYear()
const monthlyPayrollTotal = computed(() =>
    payrolls.value
        .filter(p => p.month === currentMonth && p.year === currentYear)
        .reduce((s, p) => s + (p.netPay || 0), 0)
)

const openPositions = computed(() => jobPostings.value.filter(j => j.status === 'Open').length)
const overdueTasks = computed(() => tasks.value.filter(t => t.status === 'Overdue').length)
const pendingTasks = computed(() => tasks.value.filter(t => t.status === 'Pending').length)
const completedTasks = computed(() => tasks.value.filter(t => t.status === 'Completed').length)

const recentTasks = computed(() =>
    tasks.value
        .filter(t => t.status !== 'Completed')
        .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
        .slice(0, 5)
)

const recentLeave = computed(() =>
    leaveRequests.value.filter(l => l.status === 'Pending').slice(0, 5)
)

function fmt(n: number) {
    return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2 }).format(n)
}

function priorityColor(p: string) {
    return { Low: 'bg-slate-500', Medium: 'bg-blue-500', High: 'bg-orange-500', Critical: 'bg-red-600' }[p] || 'bg-slate-500'
}

function statusColor(s: string) {
    return {
        Pending: 'text-yellow-500', 'In Progress': 'text-blue-500',
        Completed: 'text-emerald-500', Overdue: 'text-red-500'
    }[s] || 'text-muted-foreground'
}
</script>

<template>
    <div class="space-y-6">
        <HRNav />
        <div>
            <h1 class="text-2xl font-bold tracking-tight">HR Dashboard</h1>
            <p class="text-muted-foreground text-sm mt-1">Human Resources overview</p>
        </div>

        <!-- KPI Cards -->
        <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            <Card class="cursor-pointer hover:border-primary/50 transition-colors" @click="router.push('/hr/employees')">
                <CardContent class="p-4 flex items-center gap-3">
                    <div class="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
                        <Users class="size-5 text-blue-500" />
                    </div>
                    <div>
                        <p class="text-2xl font-bold">{{ totalEmployees }}</p>
                        <p class="text-xs text-muted-foreground">Total Employees</p>
                    </div>
                </CardContent>
            </Card>

            <Card class="cursor-pointer hover:border-primary/50 transition-colors" @click="router.push('/hr/attendance')">
                <CardContent class="p-4 flex items-center gap-3">
                    <div class="w-10 h-10 rounded-lg bg-orange-500/10 flex items-center justify-center shrink-0">
                        <CalendarOff class="size-5 text-orange-500" />
                    </div>
                    <div>
                        <p class="text-2xl font-bold">{{ onLeave }}</p>
                        <p class="text-xs text-muted-foreground">On Leave</p>
                        <p v-if="pendingLeave" class="text-[10px] text-yellow-500">{{ pendingLeave }} pending</p>
                    </div>
                </CardContent>
            </Card>

            <Card class="cursor-pointer hover:border-primary/50 transition-colors" @click="router.push('/hr/payroll')">
                <CardContent class="p-4 flex items-center gap-3">
                    <div class="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
                        <Wallet class="size-5 text-emerald-500" />
                    </div>
                    <div>
                        <p class="text-lg font-bold">${{ fmt(monthlyPayrollTotal) }}</p>
                        <p class="text-xs text-muted-foreground">Monthly Payroll</p>
                    </div>
                </CardContent>
            </Card>

            <Card class="cursor-pointer hover:border-primary/50 transition-colors" @click="router.push('/hr/recruitment')">
                <CardContent class="p-4 flex items-center gap-3">
                    <div class="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center shrink-0">
                        <Briefcase class="size-5 text-purple-500" />
                    </div>
                    <div>
                        <p class="text-2xl font-bold">{{ openPositions }}</p>
                        <p class="text-xs text-muted-foreground">Open Positions</p>
                    </div>
                </CardContent>
            </Card>

            <Card class="cursor-pointer hover:border-primary/50 transition-colors" @click="router.push('/hr/tasks')">
                <CardContent class="p-4 flex items-center gap-3">
                    <div class="w-10 h-10 rounded-lg bg-red-500/10 flex items-center justify-center shrink-0">
                        <AlertTriangle class="size-5 text-red-500" />
                    </div>
                    <div>
                        <p class="text-2xl font-bold text-red-500">{{ overdueTasks }}</p>
                        <p class="text-xs text-muted-foreground">Overdue Tasks</p>
                    </div>
                </CardContent>
            </Card>
        </div>

        <!-- Task Summary Row -->
        <div class="grid grid-cols-3 gap-4">
            <Card>
                <CardContent class="p-4 flex items-center gap-3">
                    <Clock class="size-5 text-yellow-500 shrink-0" />
                    <div>
                        <p class="text-xl font-bold">{{ pendingTasks }}</p>
                        <p class="text-xs text-muted-foreground">Pending Tasks</p>
                    </div>
                </CardContent>
            </Card>
            <Card>
                <CardContent class="p-4 flex items-center gap-3">
                    <ClipboardList class="size-5 text-blue-500 shrink-0" />
                    <div>
                        <p class="text-xl font-bold">{{ tasks.filter(t => t.status === 'In Progress').length }}</p>
                        <p class="text-xs text-muted-foreground">In Progress</p>
                    </div>
                </CardContent>
            </Card>
            <Card>
                <CardContent class="p-4 flex items-center gap-3">
                    <UserCheck class="size-5 text-emerald-500 shrink-0" />
                    <div>
                        <p class="text-xl font-bold">{{ completedTasks }}</p>
                        <p class="text-xs text-muted-foreground">Completed</p>
                    </div>
                </CardContent>
            </Card>
        </div>

        <!-- Bottom Row -->
        <div class="grid md:grid-cols-2 gap-6">
            <!-- Upcoming / Overdue Tasks -->
            <Card>
                <CardHeader class="pb-3">
                    <CardTitle class="text-sm font-semibold flex items-center gap-2">
                        <ClipboardList class="size-4" />
                        Active Tasks
                    </CardTitle>
                </CardHeader>
                <CardContent class="p-4 pt-0">
                    <div v-if="recentTasks.length === 0" class="text-xs text-muted-foreground italic py-4 text-center">No active tasks</div>
                    <div v-for="task in recentTasks" :key="task.id"
                        class="flex items-center justify-between py-2 border-b last:border-0">
                        <div class="min-w-0 flex-1 mr-2">
                            <p class="text-sm font-medium truncate">{{ task.title }}</p>
                            <p class="text-xs text-muted-foreground">{{ task.assignedToName }} • Due {{ task.dueDate }}</p>
                        </div>
                        <div class="flex items-center gap-2 shrink-0">
                            <span class="w-2 h-2 rounded-full shrink-0" :class="priorityColor(task.priority)" />
                            <span class="text-xs" :class="statusColor(task.status)">{{ task.status }}</span>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <!-- Pending Leave Requests -->
            <Card>
                <CardHeader class="pb-3">
                    <CardTitle class="text-sm font-semibold flex items-center gap-2">
                        <CalendarOff class="size-4" />
                        Pending Leave Requests
                    </CardTitle>
                </CardHeader>
                <CardContent class="p-4 pt-0">
                    <div v-if="recentLeave.length === 0" class="text-xs text-muted-foreground italic py-4 text-center">No pending requests</div>
                    <div v-for="leave in recentLeave" :key="leave.id"
                        class="flex items-center justify-between py-2 border-b last:border-0">
                        <div class="min-w-0 flex-1 mr-2">
                            <p class="text-sm font-medium truncate">{{ leave.employeeName }}</p>
                            <p class="text-xs text-muted-foreground">{{ leave.type }} • {{ leave.startDate }} → {{ leave.endDate }}</p>
                        </div>
                        <span class="text-xs bg-yellow-500/10 text-yellow-600 px-2 py-0.5 rounded-full border border-yellow-500/20 shrink-0">
                            Pending
                        </span>
                    </div>
                </CardContent>
            </Card>
        </div>
    </div>
</template>
