<script setup lang="ts">
import {
    Sidebar,
    SidebarContent,
    SidebarHeader,
    SidebarFooter,
    SidebarMenu,
    SidebarMenuItem,
    SidebarMenuButton
} from '@/components/ui/sidebar'
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import {
    ChevronDown,
    LayoutDashboard,
    FileText,
    Wallet,
    ArrowLeftRight,
    UserCog,
    LogOut,
    Package,
    Users,
    UsersRound,
    ClipboardList,
    TrendingUp,
    CalendarOff,
    Briefcase,
    ShoppingCart,
    Building2,
    Layers,
    Container,
    Bird,
    Scale,
    ShieldCheck
} from 'lucide-vue-next'
import { useSession } from '@/composables/useSession'
import { auth } from '@/lib/firebase'
import { useRouter } from 'vue-router'
import { useUIStore } from '@/stores/uiStore'
import { storeToRefs } from 'pinia'
import BrandLogo from '@/components/BrandLogo.vue'

const { user, hasAnyRole } = useSession()
const router = useRouter()
const uiStore = useUIStore()
const { isCollapsed } = storeToRefs(uiStore)

const handleLogout = async () => {
    try {
        await auth.signOut()
        router.push('/login')
    } catch (err) {
        console.error('Logout failed:', err)
    }
}

const navItems = [
    { title: 'Dashboard', icon: LayoutDashboard, path: '/', roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ACCOUNTANT', 'SALES', 'TECHNICAL', 'STOREKEEPER', 'DIRECTOR'] },
    { title: 'Job Cards', icon: FileText, path: '/job-cards', roles: ['SALES', 'TECHNICAL', 'ACCOUNTANT', 'MANAGER', 'ADMIN'] },
    { title: 'BOM Templates', icon: Layers, path: '/bom-templates', roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ACCOUNTANT', 'SALES', 'TECHNICAL', 'STOREKEEPER', 'DIRECTOR'] },
    { title: 'CRM Customers', icon: Users, path: '/crm/customers', roles: ['SALES', 'MANAGER', 'ADMIN', 'ACCOUNTANT', 'SUPER_ADMIN', 'TECHNICAL'] },
    { title: 'Quotations', icon: FileText, path: '/crm/quotations', roles: ['SALES', 'MANAGER', 'ADMIN', 'ACCOUNTANT', 'SUPER_ADMIN', 'TECHNICAL'] },
    { title: 'Invoices', icon: FileText, path: '/crm/invoices', roles: ['SALES', 'MANAGER', 'ADMIN', 'ACCOUNTANT', 'SUPER_ADMIN', 'TECHNICAL'] },
    { title: 'OPEX', icon: Wallet, path: '/opex', roles: ['ACCOUNTANT', 'ADMIN', 'MANAGER', 'TECHNICAL'] },
    { title: 'Transfers', icon: ArrowLeftRight, path: '/transfers', roles: ['ACCOUNTANT', 'ADMIN', 'MANAGER'] },
    { title: 'Ledger', icon: FileText, path: '/ledger', roles: ['ACCOUNTANT', 'ADMIN', 'MANAGER'] },
    { title: 'Auto Approvals', icon: ShieldCheck, path: '/accounting/auto-approvals', roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ACCOUNTANT', 'DIRECTOR'] },
    { title: 'Inventory', icon: Package, path: '/inventory', roles: ['SUPER_ADMIN', 'ADMIN', 'STOREKEEPER', 'MANAGER', 'SALES'] },
    { title: 'Container Access', icon: Container, path: '/container-access', roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ACCOUNTANT', 'SALES', 'TECHNICAL', 'STOREKEEPER', 'DIRECTOR'] },
    { title: 'Procurement', icon: ShoppingCart, path: '/procurement/requisitions', roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ACCOUNTANT', 'STOREKEEPER', 'TECHNICAL', 'DIRECTOR'] },
    { title: 'Agric Dashboard', icon: LayoutDashboard, path: '/agric-structures/dashboard', roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ACCOUNTANT', 'SALES', 'TECHNICAL', 'DIRECTOR'] },
    { title: 'Agric Inventory', icon: Package, path: '/agric-structures/inventory', roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ACCOUNTANT', 'STOREKEEPER', 'DIRECTOR'] },
    { title: 'Fowlrun Calculator', icon: Building2, path: '/agric-structures/fowlrun', roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ACCOUNTANT', 'SALES', 'TECHNICAL', 'DIRECTOR'] },
    { title: 'Pekka Poultry', icon: Bird, path: '/poultry', roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'POULTRY_MANAGER', 'FARM_HAND', 'DIRECTOR'] },
    { title: 'Accounting', icon: Scale, path: '/accounting/dashboard', roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ACCOUNTANT', 'DIRECTOR'] },
    { title: 'Settings', icon: UserCog, path: '/admin', roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER'] },
    { title: 'HR', icon: UsersRound, path: '/hr', roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ACCOUNTANT', 'SALES', 'TECHNICAL', 'STOREKEEPER'] },
    { title: 'Employees', icon: Users, path: '/hr/employees', roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ACCOUNTANT', 'SALES', 'TECHNICAL', 'STOREKEEPER'] },
    { title: 'Attendance', icon: CalendarOff, path: '/hr/attendance', roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ACCOUNTANT', 'SALES', 'TECHNICAL', 'STOREKEEPER'] },
    { title: 'Payroll', icon: Wallet, path: '/hr/payroll', roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ACCOUNTANT'] },
    { title: 'Tasks', icon: ClipboardList, path: '/hr/tasks', roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ACCOUNTANT', 'SALES', 'TECHNICAL', 'STOREKEEPER'] },
    { title: 'Performance', icon: TrendingUp, path: '/hr/performance', roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ACCOUNTANT', 'SALES', 'TECHNICAL', 'STOREKEEPER'] },
    { title: 'Recruitment', icon: Briefcase, path: '/hr/recruitment', roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER'] },
]
</script>

<template>
    <Sidebar collapsible="none" class="border-r h-full transition-all duration-300 ease-in-out"
        :class="isCollapsed ? 'w-16' : 'w-64'">
        <SidebarHeader class="h-16 flex items-center px-4 border-b overflow-hidden whitespace-nowrap">
            <div class="flex items-center gap-2">
                <div class="size-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 p-1.5">
                    <BrandLogo />
                </div>
                <h2 v-if="!isCollapsed" class="text-lg font-bold truncate transition-opacity duration-300 tracking-tighter uppercase">
                    <span class="text-brand-primary">INCAPTTA</span><span class="text-brand-secondary">PRO</span>
                </h2>
            </div>
        </SidebarHeader>

        <SidebarContent class="overflow-x-hidden scrollbar-sidebar">
            <SidebarMenu class="p-2 space-y-1">
                <template v-for="item in navItems" :key="item.path">
                    <SidebarMenuItem v-if="hasAnyRole(item.roles as any[])">
                        <SidebarMenuButton as-child :tooltip="isCollapsed ? item.title : undefined"
                            class="w-full justify-start overflow-hidden whitespace-nowrap"
                            :active="$route.path === item.path">
                            <RouterLink :to="item.path">
                                <component :is="item.icon" class="size-4 shrink-0 transition-all"
                                    :class="isCollapsed ? 'mr-0 mx-auto' : 'mr-2'" />
                                <span v-if="!isCollapsed" class="transition-opacity duration-300">{{ item.title
                                }}</span>
                            </RouterLink>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                </template>
            </SidebarMenu>
        </SidebarContent>

        <SidebarFooter class="border-t p-2">
            <DropdownMenu>
                <DropdownMenuTrigger as-child>
                    <Button variant="ghost" class="w-full justify-start gap-2 px-1 py-1.5 h-auto overflow-hidden">
                        <div class="flex size-8 items-center justify-center rounded-full bg-primary/10 shrink-0">
                            {{ user?.displayName?.charAt(0) || user?.email?.charAt(0).toUpperCase() || 'U' }}
                        </div>

                        <div v-if="!isCollapsed"
                            class="flex flex-col items-start overflow-hidden text-left transition-opacity duration-300">
                            <span class="text-sm font-medium truncate w-full">{{ user?.displayName || 'User' }}</span>
                            <span class="text-xs text-muted-foreground truncate w-full">{{ user?.email }}</span>
                        </div>

                        <ChevronDown v-if="!isCollapsed" class="ml-auto size-4 opacity-50 shrink-0" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent :side="isCollapsed ? 'right' : 'top'" align="end" class="w-56">
                    <DropdownMenuItem @click="handleLogout">
                        <LogOut class="mr-2 size-4" />
                        <span>Log out</span>
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
        </SidebarFooter>
    </Sidebar>
</template>

<style scoped>
.transition-all {
    transition: all 0.3s ease-in-out;
}
</style>
