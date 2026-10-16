<script setup lang="ts">
import { onMounted, computed, watch, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useAdminStore } from '@/features/admin/store/adminStore'
import { useChatStore } from '@/features/chat/store/chatStore'
import { useSession } from '@/composables/useSession'
import { useNotifications } from '@/composables/useNotifications'
import { Toaster } from '@/components/ui/sonner'
import { 
    LayoutDashboard, 
    FileText, 
    Layers, 
    Briefcase,
    Users,
    TrendingUp,
    Wallet,
    ArrowLeftRight,
    ScanLine,
    ShieldCheck,
    Package,
    Container,
    ClipboardList,
    UsersRound,
    User,
    UserCog,
    LifeBuoy,
    Loader2,
    MessageSquare
} from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import TopBar from './TopBar.vue'
import MobileBottomNav from './MobileBottomNav.vue'
import ChatSidebar from '@/features/chat/components/ChatSidebar.vue'
import InstallBanner from '@/components/InstallBanner.vue'
import UpdateBanner from '@/components/UpdateBanner.vue'
import BrandLogo from '@/components/BrandLogo.vue'
import { RouterLink, useRoute } from 'vue-router'

const { isAuthenticated, loading, user, hasAnyRole } = useSession()
const adminStore = useAdminStore()
const chatStore = useChatStore()
const { initNotifications } = useNotifications()
const route = useRoute()
const { appSettings } = storeToRefs(adminStore)
const { chats } = storeToRefs(chatStore)

const isNavMenuOpen = ref(false)

// Reusing nav items logic from TopBar for the common Navigation Sheet
const navItems = [
    { title: 'Dashboard', icon: LayoutDashboard, path: '/', roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ACCOUNTANT', 'SALES', 'TECHNICAL'] },
    { title: 'Job Cards', icon: FileText, path: '/job-cards', roles: ['SALES', 'TECHNICAL', 'ACCOUNTANT', 'MANAGER', 'ADMIN'] },
    { title: 'BOM Templates', icon: Layers, path: '/bom-templates', roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ACCOUNTANT', 'SALES', 'TECHNICAL', 'STOREKEEPER', 'DIRECTOR'] },
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
    { title: 'Pay Review', icon: ScanLine,     path: '/payment-submissions', roles: ['ACCOUNTANT', 'ADMIN', 'MANAGER', 'SUPER_ADMIN'] },
    { title: 'Inventory', icon: Package,       path: '/inventory',         roles: ['SUPER_ADMIN', 'ADMIN', 'STOREKEEPER', 'MANAGER', 'SALES'] },
    { title: 'Container Access', icon: Container, path: '/container-access', roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ACCOUNTANT', 'SALES', 'TECHNICAL', 'STOREKEEPER', 'DIRECTOR'] },
    { title: 'Tasks',     icon: ClipboardList, path: '/tasks',     roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ACCOUNTANT', 'SALES', 'TECHNICAL', 'STOREKEEPER'] },
    { title: 'HR',        icon: UsersRound,    path: '/hr',        roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ACCOUNTANT', 'SALES', 'TECHNICAL', 'STOREKEEPER'] },
    { title: 'Settings',  icon: UserCog,       path: '/admin',     roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER'] },
  { title: 'Support',   icon: LifeBuoy,      path: '/support',   roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ACCOUNTANT', 'SALES', 'TECHNICAL', 'STOREKEEPER'] },
  { title: 'Profile',   icon: User,          path: '/profile',   roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ACCOUNTANT', 'SALES', 'TECHNICAL', 'STOREKEEPER', 'DIRECTOR'] },
  { title: 'Verification Guide', icon: ShieldCheck, path: '/mfa-guide', roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ACCOUNTANT', 'SALES', 'TECHNICAL', 'STOREKEEPER', 'DIRECTOR'] },
  { title: 'Messages',  icon: MessageSquare, roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ACCOUNTANT', 'SALES', 'TECHNICAL', 'STOREKEEPER'], action: () => { chatStore.isChatOpen = true; isNavMenuOpen.value = false; } },
]

onMounted(() => {
  adminStore.fetchSettings()
  if (isAuthenticated.value) {
    adminStore.fetchUsers()
    chatStore.fetchChats()
    initNotifications()
  }
})

// Ensure chats are fetched if authentication happens after mount
watch(isAuthenticated, (authenticated) => {
  if (authenticated) {
    adminStore.fetchUsers()
    chatStore.fetchChats()
    initNotifications()
  }
})

const totalUnreadMessages = computed(() => {
  if (!user.value?.uid) return 0
  return chats.value.reduce((sum, chat) => sum + (chat.unreadCount?.[user.value?.uid || ''] || 0), 0)
})
</script>

<template>
  <div v-if="loading" class="h-screen w-full flex items-center justify-center">
    <Loader2 class="size-8 animate-spin text-primary" />
  </div>

  <div v-else class="flex flex-col h-screen w-full bg-background overflow-hidden relative">
    <!-- Top Navigation Bar -->
    <TopBar v-if="isAuthenticated" @open-menu="isNavMenuOpen = true" />

    <main class="flex-1 overflow-y-auto w-full pb-16 md:pb-0">
      <div class="px-3 py-4 md:p-8 w-full max-w-[1600px] mx-auto">
        <slot />
      </div>
    </main>

    <!-- Mobile Bottom Navigation -->
    <MobileBottomNav v-if="isAuthenticated" @open-menu="isNavMenuOpen = true" />

    <!-- Common Mobile Navigation Sheet -->
    <Sheet v-model:open="isNavMenuOpen">
      <SheetContent side="left" class="w-[300px] p-0 border-none">
        <div class="h-full flex flex-col bg-card">
          <div class="p-6 border-b">
            <div class="flex items-center gap-3">
              <div class="size-9 rounded-lg bg-primary/10 flex items-center justify-center p-1.5 overflow-hidden">
                <img v-if="appSettings?.logoDataUrl || appSettings?.logoUrl"
                     :src="appSettings.logoDataUrl || appSettings.logoUrl"
                     class="w-full h-full object-contain" />
                <BrandLogo v-else />
              </div>
              <span class="font-bold text-lg">
                <span :style="{ color: appSettings?.uiColors?.brandPrimaryColor || '#79c21b' }">INCAPTTA</span><span
                        :style="{ color: appSettings?.uiColors?.brandSecondaryColor || '#ff8903' }">PRO</span>
              </span>
            </div>
          </div>
          
          <div class="flex-1 overflow-y-auto py-4">
            <nav class="flex flex-col gap-0.5 px-2">
              <template v-for="item in navItems" :key="item.path || item.title">
                <!-- Group with children -->
                <template v-if="item.children && hasAnyRole(item.roles as any[])">
                  <div class="flex items-center gap-2 px-4 pt-4 pb-1">
                    <component :is="item.icon" class="size-3.5 text-muted-foreground" />
                    <span class="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{{ item.title }}</span>
                  </div>
                  <Button v-for="child in item.children" :key="child.path" variant="ghost" as-child
                          @click="isNavMenuOpen = false"
                          class="w-full justify-start gap-3 h-11 px-4 pl-9 border-l-2 border-transparent transition-all"
                          :style="route.path === child.path ? { backgroundColor: (appSettings?.uiColors?.brandPrimaryColor || '#79c21b') + '15', color: appSettings?.uiColors?.brandPrimaryColor || '#79c21b', borderLeftColor: appSettings?.uiColors?.brandPrimaryColor || '#79c21b' } : {}">
                    <RouterLink :to="child.path">
                      <component :is="child.icon" class="size-4.5" />
                      <span class="text-sm font-medium">{{ child.title }}</span>
                    </RouterLink>
                  </Button>
                </template>
                <!-- Simple link or Action -->
                <Button v-else-if="!item.children && hasAnyRole(item.roles as any[])" variant="ghost" :as-child="!!item.path"
                        @click="item.action ? (item.action() as any) : (isNavMenuOpen = false)"
                        class="w-full justify-start gap-3 h-12 px-4 border-l-2 border-transparent transition-all"
                        :style="(item.path && route.path === item.path) ? { backgroundColor: (appSettings?.uiColors?.brandPrimaryColor || '#79c21b') + '15', color: appSettings?.uiColors?.brandPrimaryColor || '#79c21b', borderLeftColor: appSettings?.uiColors?.brandPrimaryColor || '#79c21b' } : {}">
                  <component :is="item.path ? 'RouterLink' : 'div'" :to="item.path || ''" class="flex items-center gap-3 w-full">
                    <div class="relative">
                      <component :is="item.icon" class="size-5" />
                      <Badge v-if="item.title === 'Messages' && totalUnreadMessages > 0"
                        class="absolute -top-2 -right-2 h-4 min-w-[16px] rounded-full p-0 flex items-center justify-center bg-[#ff8903] text-white text-[9px] font-black border border-background">
                        {{ totalUnreadMessages > 9 ? '9+' : totalUnreadMessages }}
                      </Badge>
                    </div>
                    <span class="text-base font-medium">{{ item.title }}</span>
                  </component>
                </Button>
              </template>
            </nav>
          </div>
          
          <div class="p-4 border-t bg-muted/30">
            <p class="text-[10px] text-center text-muted-foreground font-medium">InCaptta Pro Mobile v1.0</p>
          </div>
        </div>
      </SheetContent>
    </Sheet>

    <!-- Chat Sidebar (as Sheet) -->
    <Sheet v-model:open="chatStore.isChatOpen">
      <SheetContent side="right" class="w-full sm:max-w-md p-0 border-none shadow-none h-full flex flex-col overflow-hidden [&>button]:hidden">
        <ChatSidebar />
      </SheetContent>
    </Sheet>
  </div>

  <Toaster />
  <UpdateBanner />
  <InstallBanner />

  <!-- Global Dynamic Theme Overrides -->
  <component is="style" v-if="appSettings?.uiColors">
    :root {
    --brand-primary: {{ appSettings.uiColors.brandPrimaryColor || '#79c21b' }};
    --brand-secondary: {{ appSettings.uiColors.brandSecondaryColor || '#ff8903' }};
    --grid-header-bg: {{ appSettings.uiColors.gridHeaderBgColor || '#2a0808' }};
    --grid-header-text: {{ appSettings.uiColors.gridHeaderTextColor || '#ff8903' }};
    --grid-secondary-bg: {{ appSettings.uiColors.gridSecondaryBgColor || '#1a0505' }};
    --grid-border: {{ appSettings.uiColors.gridBorderColor || 'rgba(255,137,3,0.1)' }};

    /* CRM Module Grid */
    --crm-grid-header-bg: {{ appSettings.uiColors.crmGridHeaderBg || '#2a0808' }};
    --crm-grid-header-text: {{ appSettings.uiColors.crmGridHeaderTextColor || '#ff8903' }};
    --crm-grid-border: {{ appSettings.uiColors.crmGridBorderColor || 'rgba(255,137,3,0.1)' }};

    /* OPEX Module Grid */
    --opex-grid-header-bg: {{ appSettings.uiColors.opexGridHeaderBg || '#2a0808' }};
    --opex-grid-header-text: {{ appSettings.uiColors.opexGridHeaderTextColor || '#ff8903' }};
    --opex-grid-border: {{ appSettings.uiColors.opexGridBorderColor || 'rgba(255,137,3,0.1)' }};

    /* Job Cards Module Grid */
    --job-cards-grid-header-bg: {{ appSettings.uiColors.jobCardsGridHeaderBg || '#2a0808' }};
    --job-cards-grid-header-text: {{ appSettings.uiColors.jobCardsGridHeaderTextColor || '#ff8903' }};
    --job-cards-grid-border: {{ appSettings.uiColors.jobCardsGridBorderColor || 'rgba(255,137,3,0.1)' }};

    /* Ledger Module Grid */
    --ledger-grid-header-bg: {{ appSettings.uiColors.ledgerGridHeaderBg || '#2a0808' }};
    --ledger-grid-header-text: {{ appSettings.uiColors.ledgerGridHeaderTextColor || '#ff8903' }};
    --ledger-grid-border: {{ appSettings.uiColors.ledgerGridBorderColor || 'rgba(255,137,3,0.1)' }};

    /* Inventory Module Grid */
    --inv-grid-header-bg: {{ appSettings.uiColors.inventoryGridHeaderBg || '#2a0808' }};
    --inv-grid-header-text: {{ appSettings.uiColors.inventoryGridHeaderTextColor || '#ff8903' }};
    --inv-grid-secondary-bg: {{ appSettings.uiColors.inventoryGridSecondaryBg || '#1a0505' }};
    --inv-grid-border: {{ appSettings.uiColors.inventoryGridBorderColor || 'rgba(255,137,3,0.1)' }};
    }
    .dark {
    --brand-primary: {{ appSettings.uiColors.brandPrimaryColor || '#74b419' }};
    --brand-secondary: {{ appSettings.uiColors.brandSecondaryColor || '#ff8903' }};
    --grid-header-bg: {{ appSettings.uiColors.gridHeaderBgColor || '#2a0808' }};
    --grid-header-text: {{ appSettings.uiColors.gridHeaderTextColor || '#ff8903' }};
    --grid-secondary-bg: {{ appSettings.uiColors.gridSecondaryBgColor || '#1a0505' }};
    --grid-border: {{ appSettings.uiColors.gridBorderColor || 'rgba(255,137,3,0.1)' }};

    /* Dark Mode Defaults (can be customized too if separate keys existed, but we reuse for now) */
    --crm-grid-header-bg: {{ appSettings.uiColors.crmGridHeaderBg || '#2a0808' }};
    --crm-grid-header-text: {{ appSettings.uiColors.crmGridHeaderTextColor || '#ff8903' }};
    --crm-grid-border: {{ appSettings.uiColors.crmGridBorderColor || 'rgba(255,137,3,0.1)' }};

    --opex-grid-header-bg: {{ appSettings.uiColors.opexGridHeaderBg || '#2a0808' }};
    --opex-grid-header-text: {{ appSettings.uiColors.opexGridHeaderTextColor || '#ff8903' }};
    --opex-grid-border: {{ appSettings.uiColors.opexGridBorderColor || 'rgba(255,137,3,0.1)' }};

    --job-cards-grid-header-bg: {{ appSettings.uiColors.jobCardsGridHeaderBg || '#2a0808' }};
    --job-cards-grid-header-text: {{ appSettings.uiColors.jobCardsGridHeaderTextColor || '#ff8903' }};
    --job-cards-grid-border: {{ appSettings.uiColors.jobCardsGridBorderColor || 'rgba(255,137,3,0.1)' }};

    --ledger-grid-header-bg: {{ appSettings.uiColors.ledgerGridHeaderBg || '#2a0808' }};
    --ledger-grid-header-text: {{ appSettings.uiColors.ledgerGridHeaderTextColor || '#ff8903' }};
    --ledger-grid-border: {{ appSettings.uiColors.ledgerGridBorderColor || 'rgba(255,137,3,0.1)' }};

    --inv-grid-header-bg: {{ appSettings.uiColors.inventoryGridHeaderBg || '#2a0808' }};
    --inv-grid-header-text: {{ appSettings.uiColors.inventoryGridHeaderTextColor || '#ff8903' }};
    --inv-grid-secondary-bg: {{ appSettings.uiColors.inventoryGridSecondaryBg || '#1a0505' }};
    --inv-grid-border: {{ appSettings.uiColors.inventoryGridBorderColor || 'rgba(255,137,3,0.1)' }};
    }
  </component>
</template>

<style>
/* Main layout styles */
@keyframes scale-in-center {
  0% {
    transform: scale(0);
    opacity: 0;
  }

  100% {
    transform: scale(1);
    opacity: 1;
  }
}
</style>
