<script setup lang="ts">
import { useRoute } from 'vue-router'
import { useSession } from '@/composables/useSession'
import { Users, CalendarOff, Wallet, ClipboardList, TrendingUp, Briefcase, LayoutDashboard, Landmark } from 'lucide-vue-next'

const route = useRoute()
const { hasAnyRole } = useSession()

const navLinks = [
    { title: 'Overview', icon: LayoutDashboard, path: '/hr', roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ACCOUNTANT', 'SALES', 'TECHNICAL', 'STOREKEEPER'] },
    { title: 'Employees', icon: Users, path: '/hr/employees', roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ACCOUNTANT', 'SALES', 'TECHNICAL', 'STOREKEEPER'] },
    { title: 'Attendance', icon: CalendarOff, path: '/hr/attendance', roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ACCOUNTANT', 'SALES', 'TECHNICAL', 'STOREKEEPER'] },
    { title: 'Payroll', icon: Wallet, path: '/hr/payroll', roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ACCOUNTANT', 'TECHNICAL'] },
    { title: 'Tasks', icon: ClipboardList, path: '/hr/tasks', roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ACCOUNTANT', 'SALES', 'TECHNICAL', 'STOREKEEPER'] },
    { title: 'Performance', icon: TrendingUp, path: '/hr/performance', roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ACCOUNTANT', 'SALES', 'TECHNICAL', 'STOREKEEPER'] },
    { title: 'Recruitment', icon: Briefcase, path: '/hr/recruitment', roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ACCOUNTANT', 'TECHNICAL'] },
    { title: 'Salaries Account', icon: Landmark, path: '/hr/salaries-account', roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ACCOUNTANT', 'DIRECTOR'] },
]

function isActive(path: string) {
    return path === '/hr' ? route.path === '/hr' : route.path.startsWith(path)
}
</script>

<template>
    <nav class="flex items-center gap-1 overflow-x-auto no-scrollbar border-b pb-3 mb-5">
        <template v-for="link in navLinks" :key="link.path">
            <RouterLink
                v-if="hasAnyRole(link.roles as any[])"
                :to="link.path"
                class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors shrink-0"
                :class="isActive(link.path)
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'">
                <component :is="link.icon" class="size-3.5" />
                {{ link.title }}
            </RouterLink>
        </template>
    </nav>
</template>

<style scoped>
.no-scrollbar::-webkit-scrollbar { display: none; }
.no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
</style>
