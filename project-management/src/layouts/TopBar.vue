<script setup lang="ts">
import {
    LayoutDashboard,
    FileText,
    Wallet,
    ArrowLeftRight,
    UserCog,
    LogOut,
    Package,
    Users,
    UsersRound,
    User,
    ChevronDown,
    Palette,
    Check,
    Menu,
    LifeBuoy,
    TrendingUp,
    ClipboardList,
    Briefcase,
    ScanLine,
    BarChart3,
    Layers,
    Container,
    Bell,
    BellOff,
    Construction,
    Building2,
    PackageSearch,
    Bird,
    Scale,
    Receipt,
    Settings2,
    ShieldCheck,
    Wrench
} from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu'
const emit = defineEmits(['open-menu'])
import { useSession } from '@/composables/useSession'
import { useAdminStore } from '@/features/admin/store/adminStore'
import { storeToRefs } from 'pinia'
import { auth } from '@/lib/firebase'
import { useRouter, useRoute } from 'vue-router'
import BrandLogo from '@/components/BrandLogo.vue'
import { useNotifications } from '@/composables/useNotifications'

defineProps<{
    title?: string
}>()

const { user, hasAnyRole, isAuthenticated } = useSession()
const { requestPermission } = useNotifications()
const adminStore = useAdminStore()
const { appSettings } = storeToRefs(adminStore)
const router = useRouter()
const route = useRoute()

import { onMounted, ref } from 'vue'
const notificationStatus = ref(window.Notification?.permission || 'default')

onMounted(() => {
    adminStore.fetchSettings()
})

import { useTheme } from '@/composables/useTheme'
const { mode, colorTheme, setTheme } = useTheme()

const themeGroups: { label: string; items: { id: string; name: string; mode: string; color: string; swatch: [string, string, string] }[] }[] = [
    {
        label: 'Standard',
        items: [
            { id: 'light',     name: 'Light',          mode: 'light', color: 'default',    swatch: ['#ffffff', '#e5e7eb', '#111827'] },
            { id: 'dark',      name: 'Dark',            mode: 'dark',  color: 'default',    swatch: ['#1f2937', '#374151', '#f9fafb'] },
            { id: 'midnight',  name: 'Midnight',        mode: 'dark',  color: 'midnight',   swatch: ['#000000', '#111111', '#f9fafb'] },
            { id: 'charcoal',  name: 'Charcoal',        mode: 'dark',  color: 'charcoal',   swatch: ['#1e2230', '#2a2f40', '#f9fafb'] },
        ]
    },
    {
        label: 'Colour',
        items: [
            { id: 'nordic',           name: 'Nordic',          mode: 'dark',  color: 'nordic',      swatch: ['#2e3545', '#3b4560', '#81c5e8'] },
            { id: 'emerald',          name: 'Emerald',         mode: 'dark',  color: 'emerald',     swatch: ['#152b20', '#1e3d2c', '#5ce69a'] },
            { id: 'red',              name: 'Ruby Red',        mode: 'dark',  color: 'red',         swatch: ['#1f0e0a', '#2e1410', '#e05c5c'] },
            { id: 'orange',           name: 'Sunset Orange',   mode: 'dark',  color: 'orange',      swatch: ['#1f1509', '#2e1e0b', '#f5a623'] },
            { id: 'green',            name: 'Forest Green',    mode: 'dark',  color: 'green',       swatch: ['#0f1f12', '#152a18', '#65c96a'] },
            { id: 'new-emarald',      name: 'Emerald Light',   mode: 'light', color: 'new-emarald', swatch: ['#f0faf4', '#d1fae5', '#00A63E'] },
            { id: 'new-emarald-dark', name: 'Emerald Dark',   mode: 'dark',  color: 'new-emarald', swatch: ['#162a1e', '#1e3d2c', '#00A63E'] },
        ]
    },
    {
        label: 'Nature',
        items: [
            { id: 'nature-light', name: 'Forest Canopy — Day',   mode: 'light', color: 'nature', swatch: ['#eef7e8', '#c9e8b0', '#4a8c12'] },
            { id: 'nature-dark',  name: 'Forest Canopy — Night', mode: 'dark',  color: 'nature', swatch: ['#0e1e11', '#16301a', '#79c21b'] },
        ]
    },
]

const themes = themeGroups.flatMap(g => g.items)

const handleRequestPermission = async () => {
    try {
        await requestPermission()
        notificationStatus.value = window.Notification?.permission || 'default'
    } catch (err) {
        console.error('Failed to request notification permission:', err)
    }
}

const handleLogout = async () => {
    try {
        await auth.signOut()
        router.push('/login')
    } catch (err) {
        console.error('Logout failed:', err)
    }
}

type NavChild = { title: string; icon: any; path: string; roles?: string[] }
type NavItem = {
    title: string
    icon: any
    path?: string
    roles: string[]
    children?: NavChild[]
}

const navItems: NavItem[] = [
    { title: 'Dashboard', icon: LayoutDashboard, path: '/', roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ACCOUNTANT', 'SALES', 'TECHNICAL'] },
    { title: 'Job Cards', icon: FileText, path: '/job-cards', roles: ['SALES', 'TECHNICAL', 'ACCOUNTANT', 'MANAGER', 'ADMIN'] },
    {
        title: 'CRM', icon: Briefcase,
        roles: ['SALES', 'MANAGER', 'ADMIN', 'ACCOUNTANT', 'SUPER_ADMIN', 'TECHNICAL'],
        children: [
            { title: 'Customers',   icon: Users,       path: '/crm/customers' },
            { title: 'Quotations',  icon: FileText,    path: '/crm/quotations' },
            { title: 'Invoices',    icon: FileText,    path: '/crm/invoices' },
            { title: 'Leads',       icon: TrendingUp,  path: '/crm/leads' },
        ]
    },
    {
        title: 'Finance', icon: Wallet,
        roles: ['ACCOUNTANT', 'ADMIN', 'MANAGER', 'TECHNICAL', 'SALES', 'STOREKEEPER'],
        children: [
            { title: 'OPEX',            icon: Wallet,         path: '/opex' },
            { title: 'Transfers',       icon: ArrowLeftRight, path: '/transfers' },
            { title: 'Ledger',          icon: FileText,       path: '/ledger' },
            { title: 'Auto Approvals',  icon: ShieldCheck,    path: '/accounting/auto-approvals' },
        ]
    },
    {
        title: 'Accounting', icon: Scale,
        roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ACCOUNTANT', 'DIRECTOR'],
        children: [
            { title: 'Command Center', icon: LayoutDashboard, path: '/accounting/dashboard' },
            { title: 'VAT Return',    icon: Receipt,         path: '/accounting/vat' },
            { title: 'ITF12C Tax',    icon: Scale,           path: '/accounting/tax' },
            { title: 'Reports',       icon: FileText,        path: '/accounting/reports' },
        ]
    },
    { title: 'Inventory', icon: Package,       path: '/inventory',         roles: ['SUPER_ADMIN', 'ADMIN', 'STOREKEEPER', 'MANAGER', 'SALES'] },
    {
        title: 'Agric Structure', icon: Construction,
        roles: ['ADMIN', 'MANAGER', 'SALES', 'TECHNICAL'],
        children: [
            { title: 'Dashboard', icon: LayoutDashboard, path: '/agric-structures/dashboard' },
            { title: 'Fowlrun Calculator', icon: Construction, path: '/agric-structures/fowlrun' },
            { title: 'Quotations', icon: FileText, path: '/agric-structures/quotations' },
            { title: 'Job Cards', icon: Building2, path: '/agric-structures/job-cards' },
            { title: 'Inventory', icon: PackageSearch, path: '/agric-structures/inventory' },
            { title: 'Settings', icon: Settings2, path: '/agric-structures/settings' },
        ]
    },
    { title: 'Pekka Poultry', icon: Bird, path: '/poultry', roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'POULTRY_MANAGER', 'FARM_HAND', 'DIRECTOR'] },
    {
        title: 'Other Services', icon: Layers,
        roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ACCOUNTANT', 'SALES', 'TECHNICAL', 'STOREKEEPER', 'DIRECTOR'],
        children: [
            { title: 'BOM Templates',    icon: Layers,        path: '/bom-templates', roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ACCOUNTANT', 'SALES', 'TECHNICAL', 'STOREKEEPER', 'DIRECTOR'] },
            { title: 'Pay Review',       icon: ScanLine,      path: '/payment-submissions', roles: ['ACCOUNTANT', 'ADMIN', 'MANAGER', 'SUPER_ADMIN'] },
            { title: 'HR',               icon: UsersRound,    path: '/hr' },
            { title: 'Tools Registry',   icon: Wrench,        path: '/tools-registry' },
            { title: 'Tasks',            icon: ClipboardList, path: '/tasks' },
            { title: 'Container Access', icon: Container,     path: '/container-access' },
            { title: 'Verification Guide', icon: ShieldCheck,  path: '/mfa-guide' },
            { title: 'Support',          icon: LifeBuoy,      path: '/support' }
        ]
    },
    { title: 'Settings',  icon: UserCog,       path: '/admin',     roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER'] },
]

function isGroupActive(item: NavItem): boolean {
    if (!item.children) return false
    return item.children.some(c => route.path.startsWith(c.path))
}
</script>

<template>
    <header v-if="isAuthenticated"
        class="h-16 border-b flex items-center px-4 md:px-6 bg-card/50 backdrop-blur sticky top-0 z-50 w-full justify-between gap-4">

        <!-- Mobile Navigation Trigger -->
        <div class="lg:hidden">
            <Button variant="ghost" size="icon" class="h-9 w-9" @click="$emit('open-menu')">
                <Menu class="size-5" />
            </Button>
        </div>

        <!-- Left: Logo & Brand -->
        <RouterLink to="/" class="flex items-center gap-3 shrink-0 hover:opacity-80 transition-opacity">
            <div class="size-9 rounded-lg bg-primary/10 flex items-center justify-center p-1 overflow-hidden shrink-0">
                <img v-if="appSettings?.logoDataUrl || appSettings?.logoUrl"
                    :src="appSettings.logoDataUrl || appSettings.logoUrl" class="w-full h-full object-contain" />
                <BrandLogo v-else />
            </div>
            <h2 class="text-xl font-bold hidden lg:block tracking-tight">
                <span :style="{ color: appSettings?.uiColors?.brandPrimaryColor || '#79c21b' }">INCAPTTA</span><span
                    :style="{ color: appSettings?.uiColors?.brandSecondaryColor || '#ff8903' }">PRO</span>
            </h2>
        </RouterLink>

        <!-- Center: Navigation -->
        <nav class="hidden lg:flex items-center flex-1 justify-center overflow-x-auto no-scrollbar py-1">
            <ul class="flex items-center gap-0.5">
                <template v-for="item in navItems" :key="item.path || item.title">
                    <!-- Dropdown Group -->
                    <li v-if="item.children && hasAnyRole(item.roles as any[])">
                        <DropdownMenu>
                            <DropdownMenuTrigger as-child>
                                <Button variant="ghost" size="sm" class="h-9 px-2.5 gap-1"
                                    :class="{ 'bg-primary/10 text-primary hover:bg-primary/20': isGroupActive(item) }">
                                    <component :is="item.icon" class="size-4" />
                                    <span class="text-sm font-medium">{{ item.title }}</span>
                                    <ChevronDown class="size-3 opacity-50" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start" class="w-48">
                                <template v-for="child in item.children" :key="child.path">
                                    <DropdownMenuItem v-if="!child.roles || hasAnyRole(child.roles as any[])" as-child>
                                        <RouterLink :to="child.path" class="flex items-center gap-2 w-full">
                                            <component :is="child.icon" class="size-4" />
                                            {{ child.title }}
                                        </RouterLink>
                                    </DropdownMenuItem>
                                </template>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </li>
                    <!-- Simple Link -->
                    <li v-else-if="!item.children && hasAnyRole(item.roles as any[])">
                        <Button variant="ghost" size="sm" as-child class="h-9 px-2.5 gap-1.5"
                            :class="{ 'bg-primary/10 text-primary hover:bg-primary/20': route.path === item.path }">
                            <RouterLink :to="item.path!">
                                <component :is="item.icon" class="size-4" />
                                <span class="text-sm font-medium">{{ item.title }}</span>
                            </RouterLink>
                        </Button>
                    </li>
                </template>
            </ul>
        </nav>

        <!-- Right: Global Actions & Profile -->
        <div class="flex items-center gap-2 shrink-0">
            <Button v-if="notificationStatus !== 'granted'" 
                    variant="ghost" size="icon" class="h-9 w-9 text-muted-foreground hover:text-primary transition-colors"
                    @click="handleRequestPermission">
                <BellOff class="size-4" />
            </Button>
            <div v-else class="h-9 w-9 flex items-center justify-center text-primary/40">
                <Bell class="size-4" />
            </div>

            <DropdownMenu>
                <DropdownMenuTrigger as-child>
                    <Button variant="ghost" size="icon" class="h-9 w-9 rounded-full">
                        <Palette class="size-4" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" class="w-56 mt-2 p-1.5">
                    <p class="text-[10px] font-black uppercase tracking-widest text-muted-foreground px-2 pt-1 pb-2">Appearance</p>
                    <template v-for="group in themeGroups" :key="group.label">
                        <p class="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/50 px-2 pt-2 pb-1">{{ group.label }}</p>
                        <DropdownMenuItem
                            v-for="t in group.items"
                            :key="t.id"
                            @click="setTheme(t.mode as any, t.color as any)"
                            class="flex items-center gap-2.5 px-2 py-1.5 rounded-md cursor-pointer"
                            :class="{ 'bg-primary/10 ring-1 ring-primary/30': mode === t.mode && colorTheme === t.color }">
                            <div class="flex rounded overflow-hidden shrink-0 border border-black/10 shadow-sm" style="width:36px;height:22px">
                                <div class="flex-1" :style="{ background: t.swatch[0] }"></div>
                                <div class="flex-1" :style="{ background: t.swatch[1] }"></div>
                                <div style="width:8px" :style="{ background: t.swatch[2] }"></div>
                            </div>
                            <span class="text-xs font-medium flex-1">{{ t.name }}</span>
                            <Check v-if="mode === t.mode && colorTheme === t.color" class="size-3 text-primary shrink-0" />
                        </DropdownMenuItem>
                    </template>
                </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
                <DropdownMenuTrigger as-child>
                    <Button variant="ghost"
                        class="flex items-center gap-2 p-1 pl-2 h-10 border rounded-full hover:bg-accent transition-colors">
                        <div class="flex flex-col items-end text-right mr-1 hidden sm:flex">
                            <span class="text-xs font-semibold truncate max-w-[120px]">{{ user?.displayName || 'User' }}</span>
                            <span class="text-[10px] text-muted-foreground truncate max-w-[120px]">{{ user?.email }}</span>
                        </div>
                        <div
                            class="size-8 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary">
                            {{ user?.displayName?.charAt(0) || user?.email?.charAt(0).toUpperCase() || 'U' }}
                        </div>
                        <ChevronDown class="size-4 opacity-50 mr-1" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" class="w-56 mt-2">
                    <div class="px-2 py-1.5 sm:hidden">
                        <p class="text-sm font-medium truncate">{{ user?.displayName }}</p>
                        <p class="text-xs text-muted-foreground truncate">{{ user?.email }}</p>
                    </div>
                    <DropdownMenuItem as-child>
                        <RouterLink to="/profile" class="flex items-center w-full">
                            <User class="mr-2 size-4" />
                            <span>My Profile</span>
                        </RouterLink>
                    </DropdownMenuItem>
                    <DropdownMenuItem @click="handleRequestPermission">
                        <Bell class="mr-2 size-4" />
                        <span>Enable Notifications</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem @click="handleLogout" class="text-destructive focus:text-destructive">
                        <LogOut class="mr-2 size-4" />
                        <span>Log out</span>
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    </header>
</template>

<style scoped>
.no-scrollbar::-webkit-scrollbar {
    display: none;
}

.no-scrollbar {
    -ms-overflow-style: none;
    scrollbar-width: none;
}
</style>
