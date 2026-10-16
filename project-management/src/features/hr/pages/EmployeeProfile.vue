<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useHrStore } from '../store/hrStore'
import { storeToRefs } from 'pinia'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, Mail, Phone, Calendar, Briefcase, TrendingUp, ClipboardList, Wallet } from 'lucide-vue-next'
import { getRating, getRatingColor } from '../types'

const route = useRoute()
const router = useRouter()
const hrStore = useHrStore()
const { employees, leaveRequests, tasks, kpis, performanceReviews, payrolls } = storeToRefs(hrStore)

onMounted(() => hrStore.fetchAll())
onUnmounted(() => hrStore.cleanup())

const id = route.params.id as string

const employee = computed(() => employees.value.find(e => e.id === id))
const empLeave = computed(() => leaveRequests.value.filter(l => l.employeeId === id).slice(0, 10))
const empTasks = computed(() => tasks.value.filter(t => t.assignedTo === id).slice(0, 10))
const empKpis = computed(() => kpis.value.filter(k => k.employeeId === id))
const empReviews = computed(() => performanceReviews.value.filter(r => r.employeeId === id))
const empPayroll = computed(() => payrolls.value.filter(p => p.employeeId === id).slice(0, 6))

const latestReview = computed(() => empReviews.value[0])

const avgCompletion = computed(() => {
    const mine = tasks.value.filter(t => t.assignedTo === id && t.status === 'Completed')
    if (!mine.length) return 0
    return Math.round(mine.reduce((s, t) => s + t.completionPercent, 0) / mine.length)
})

function statusBadge(s: string) {
    const m: Record<string, string> = {
        Active: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
        'On Leave': 'bg-orange-500/10 text-orange-600 border-orange-500/20',
        Probation: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
        Terminated: 'bg-red-500/10 text-red-600 border-red-500/20'
    }
    return m[s] || ''
}

function taskStatusColor(s: string) {
    return {
        Pending: 'text-yellow-500', 'In Progress': 'text-blue-500',
        Completed: 'text-emerald-500', Overdue: 'text-red-500'
    }[s] || 'text-muted-foreground'
}

function leaveStatusColor(s: string) {
    return { Pending: 'text-yellow-500', Approved: 'text-emerald-500', Rejected: 'text-red-500' }[s] || ''
}

function priorityDot(p: string) {
    return { Low: 'bg-slate-400', Medium: 'bg-blue-500', High: 'bg-orange-500', Critical: 'bg-red-600' }[p] || ''
}
</script>

<template>
    <div v-if="!employee" class="flex items-center justify-center h-64 text-muted-foreground">
        Loading employee…
    </div>

    <div v-else class="space-y-6">
        <!-- Header -->
        <div class="flex items-center gap-4">
            <Button variant="ghost" size="icon" @click="router.back()">
                <ArrowLeft class="size-4" />
            </Button>
            <div class="flex items-center gap-4 flex-1">
                <div class="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center text-xl font-bold shrink-0">
                    {{ employee.fullName?.charAt(0) }}
                </div>
                <div>
                    <h1 class="text-xl font-bold">{{ employee.fullName }}</h1>
                    <p class="text-sm text-muted-foreground">{{ employee.jobTitle }} · {{ employee.department }}</p>
                </div>
                <span class="ml-auto text-xs px-2 py-0.5 rounded-full border" :class="statusBadge(employee.status)">
                    {{ employee.status }}
                </span>
            </div>
        </div>

        <div class="grid md:grid-cols-3 gap-6">
            <!-- Left: Personal Info -->
            <div class="space-y-4">
                <Card>
                    <CardHeader class="pb-2">
                        <CardTitle class="text-sm font-semibold">Personal Information</CardTitle>
                    </CardHeader>
                    <CardContent class="space-y-3 text-sm">
                        <div class="flex items-center gap-2 text-muted-foreground">
                            <Mail class="size-4 shrink-0" />
                            <span class="truncate">{{ employee.email }}</span>
                        </div>
                        <div class="flex items-center gap-2 text-muted-foreground">
                            <Phone class="size-4 shrink-0" />
                            <span>{{ employee.phone || '—' }}</span>
                        </div>
                        <div class="flex items-center gap-2 text-muted-foreground">
                            <Calendar class="size-4 shrink-0" />
                            <span>Started {{ employee.startDate }}</span>
                        </div>
                        <div class="flex items-center gap-2 text-muted-foreground">
                            <Briefcase class="size-4 shrink-0" />
                            <span>{{ employee.contractType }}</span>
                        </div>
                        <div class="pt-2 border-t">
                            <p class="text-xs text-muted-foreground">National ID</p>
                            <p class="font-medium">{{ employee.nationalId || '—' }}</p>
                        </div>
                        <div>
                            <p class="text-xs text-muted-foreground">Basic Salary</p>
                            <p class="font-mono font-semibold">${{ employee.salary?.toLocaleString() }}</p>
                        </div>
                    </CardContent>
                </Card>

                <!-- Overall Performance Score -->
                <Card>
                    <CardHeader class="pb-2">
                        <CardTitle class="text-sm font-semibold flex items-center gap-2">
                            <TrendingUp class="size-4" /> Performance
                        </CardTitle>
                    </CardHeader>
                    <CardContent class="space-y-3">
                        <div v-if="latestReview">
                            <div class="flex items-end justify-between mb-1">
                                <span class="text-3xl font-bold">{{ latestReview.overallScore }}%</span>
                                <span class="text-sm font-semibold" :class="getRatingColor(latestReview.rating)">
                                    {{ latestReview.rating }}
                                </span>
                            </div>
                            <div class="w-full bg-muted rounded-full h-2">
                                <div class="h-2 rounded-full bg-primary transition-all"
                                    :style="{ width: latestReview.overallScore + '%' }" />
                            </div>
                            <p class="text-xs text-muted-foreground mt-1">Period: {{ latestReview.period }}</p>
                        </div>
                        <div v-else class="text-xs text-muted-foreground italic">No review yet</div>

                        <!-- KPI Bars -->
                        <div v-if="empKpis.length" class="space-y-2 pt-2 border-t">
                            <p class="text-xs font-medium text-muted-foreground">KPI Breakdown</p>
                            <div v-for="kpi in empKpis" :key="kpi.id" class="space-y-1">
                                <div class="flex justify-between text-xs">
                                    <span class="truncate mr-2">{{ kpi.name }}</span>
                                    <span class="shrink-0 text-muted-foreground">{{ kpi.weight }}%</span>
                                </div>
                                <div class="w-full bg-muted rounded-full h-1.5">
                                    <div class="h-1.5 rounded-full bg-blue-500 transition-all"
                                        :style="{ width: (latestReview?.kpiScores?.find(s => s.kpiId === kpi.id)?.actualScore || 0) + '%' }" />
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            <!-- Right: Tasks + Leave + Payroll -->
            <div class="md:col-span-2 space-y-4">
                <!-- Tasks -->
                <Card>
                    <CardHeader class="pb-2">
                        <CardTitle class="text-sm font-semibold flex items-center gap-2">
                            <ClipboardList class="size-4" /> Tasks
                            <span class="ml-auto text-xs text-muted-foreground">
                                Avg completion: {{ avgCompletion }}%
                            </span>
                        </CardTitle>
                    </CardHeader>
                    <CardContent class="p-0">
                        <div class="overflow-x-auto">
                            <table class="w-full text-xs">
                                <thead class="border-b bg-muted/30">
                                    <tr>
                                        <th class="text-left px-3 py-2 font-semibold">Task</th>
                                        <th class="text-center px-3 py-2 font-semibold hidden sm:table-cell">Priority</th>
                                        <th class="text-center px-3 py-2 font-semibold">Progress</th>
                                        <th class="text-center px-3 py-2 font-semibold">Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr v-if="empTasks.length === 0">
                                        <td colspan="4" class="py-4 text-center text-muted-foreground italic">No tasks</td>
                                    </tr>
                                    <tr v-for="t in empTasks" :key="t.id" class="border-b last:border-0">
                                        <td class="px-3 py-2">
                                            <p class="font-medium truncate max-w-[180px]">{{ t.title }}</p>
                                            <p class="text-muted-foreground">Due {{ t.dueDate }}</p>
                                        </td>
                                        <td class="px-3 py-2 text-center hidden sm:table-cell">
                                            <span class="w-2 h-2 rounded-full inline-block" :class="priorityDot(t.priority)" />
                                        </td>
                                        <td class="px-3 py-2 text-center">
                                            <div class="flex items-center gap-1">
                                                <div class="flex-1 bg-muted rounded-full h-1.5">
                                                    <div class="h-1.5 rounded-full bg-primary"
                                                        :style="{ width: t.completionPercent + '%' }" />
                                                </div>
                                                <span class="shrink-0 text-[10px]">{{ t.completionPercent }}%</span>
                                            </div>
                                        </td>
                                        <td class="px-3 py-2 text-center" :class="taskStatusColor(t.status)">{{ t.status }}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </CardContent>
                </Card>

                <!-- Leave History -->
                <Card>
                    <CardHeader class="pb-2">
                        <CardTitle class="text-sm font-semibold">Leave History</CardTitle>
                    </CardHeader>
                    <CardContent class="p-0">
                        <table class="w-full text-xs">
                            <thead class="border-b bg-muted/30">
                                <tr>
                                    <th class="text-left px-3 py-2 font-semibold">Type</th>
                                    <th class="text-left px-3 py-2 font-semibold hidden sm:table-cell">Period</th>
                                    <th class="text-center px-3 py-2 font-semibold">Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr v-if="empLeave.length === 0">
                                    <td colspan="3" class="py-4 text-center text-muted-foreground italic">No leave records</td>
                                </tr>
                                <tr v-for="l in empLeave" :key="l.id" class="border-b last:border-0">
                                    <td class="px-3 py-2 font-medium">{{ l.type }}</td>
                                    <td class="px-3 py-2 text-muted-foreground hidden sm:table-cell">
                                        {{ l.startDate }} → {{ l.endDate }}
                                    </td>
                                    <td class="px-3 py-2 text-center font-semibold" :class="leaveStatusColor(l.status)">
                                        {{ l.status }}
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </CardContent>
                </Card>

                <!-- Payroll History -->
                <Card>
                    <CardHeader class="pb-2">
                        <CardTitle class="text-sm font-semibold flex items-center gap-2">
                            <Wallet class="size-4" /> Payroll History
                        </CardTitle>
                    </CardHeader>
                    <CardContent class="p-0">
                        <table class="w-full text-xs">
                            <thead class="border-b bg-muted/30">
                                <tr>
                                    <th class="text-left px-3 py-2 font-semibold">Period</th>
                                    <th class="text-right px-3 py-2 font-semibold hidden sm:table-cell">Basic</th>
                                    <th class="text-right px-3 py-2 font-semibold">Net Pay</th>
                                    <th class="text-center px-3 py-2 font-semibold">Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr v-if="empPayroll.length === 0">
                                    <td colspan="4" class="py-4 text-center text-muted-foreground italic">No payroll records</td>
                                </tr>
                                <tr v-for="p in empPayroll" :key="p.id" class="border-b last:border-0">
                                    <td class="px-3 py-2 font-medium">{{ p.month }}/{{ p.year }}</td>
                                    <td class="px-3 py-2 text-right font-mono hidden sm:table-cell">${{ p.basicSalary?.toLocaleString() }}</td>
                                    <td class="px-3 py-2 text-right font-mono font-semibold">${{ p.netPay?.toLocaleString() }}</td>
                                    <td class="px-3 py-2 text-center">
                                        <span class="px-1.5 py-0.5 rounded text-[10px] border"
                                            :class="p.status === 'Paid' ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' : 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20'">
                                            {{ p.status }}
                                        </span>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </CardContent>
                </Card>
            </div>
        </div>
    </div>
</template>
