<script setup lang="ts">
import { onMounted, onUnmounted, computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAdminStore } from '../store/adminStore'
import { useSession } from '@/composables/useSession'
import { storeToRefs } from 'pinia'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { RefreshCw, ShieldCheck, Settings, Loader2 } from 'lucide-vue-next'
import UsersTable from '../components/UsersTable.vue'
import EntityTable from '../components/EntityTable.vue'
import AppSettings from '../components/AppSettings.vue'
import PermissionsMatrix from '../components/PermissionsMatrix.vue'
import BomTemplatesAdmin from '../components/BomTemplatesAdmin.vue'
import { usePermissionsStore } from '../store/permissionsStore'
import {
  getInventoryManagerPinHash,
  isManagerInventoryPinUnlocked
} from '@/features/inventory/utils/inventoryAccessPin'

const store = useAdminStore()
const permissionsStore = usePermissionsStore()
const router = useRouter()
const route = useRoute()
const { refreshSession, claims, user, loading: sessionLoading } = useSession()
const {
  users,
  departments,
  productCategories,
  jobCategories,
  expenseCategories,
  cashAccounts,
  appSettings,
  loading
} = storeToRefs(store)

const accessChecking = ref(true)
const hasFetchedAdminData = ref(false)

async function ensureSettingsAccess() {
  if (sessionLoading.value) return

  const roles = claims.value.roles || []
  const roleArray = Array.isArray(roles) ? roles : [String(roles)]
  const isRestrictedManager = roleArray.includes('MANAGER') && !roleArray.includes('SUPER_ADMIN')

  if (!isRestrictedManager) {
    accessChecking.value = false
    if (!hasFetchedAdminData.value) {
      store.fetchAll()
      hasFetchedAdminData.value = true
    }
    return
  }

  const pinHash = appSettings.value?.inventoryManagerPinHash || await getInventoryManagerPinHash()

  if (pinHash && !isManagerInventoryPinUnlocked(user.value?.uid)) {
    accessChecking.value = true
    router.replace({
      path: '/settings-unlock',
      query: { redirect: route.fullPath }
    })
    return
  }

  accessChecking.value = false
  if (!hasFetchedAdminData.value) {
    store.fetchAll()
    hasFetchedAdminData.value = true
  }
}

onMounted(() => {
  ensureSettingsAccess()
  console.log('[AdminDashboard] Current Claims:', claims.value)
  // Ensure permissions config is loaded for the matrix
  if (permissionsStore.loading) permissionsStore.load()
})

watch(
  [claims, sessionLoading, appSettings],
  () => {
    ensureSettingsAccess()
  },
  { immediate: true }
)

onUnmounted(() => {
  store.cleanup()
})

const isOnlyManager = computed(() => {
  const roles = claims.value.roles || []
  const roleArray = Array.isArray(roles) ? roles : [String(roles)]
  return roleArray.includes('MANAGER') && !roleArray.includes('ADMIN') && !roleArray.includes('SUPER_ADMIN')
})

const isAdminOrSuperAdmin = computed(() => {
  const roles = claims.value.roles || []
  const roleArray = Array.isArray(roles) ? roles : [String(roles)]
  return roleArray.includes('ADMIN') || roleArray.includes('SUPER_ADMIN')
})

const deptFields = [
  { key: 'name', label: 'Department Name', placeholder: 'e.g. Workshop' },
  { key: 'head', label: 'Department Head', placeholder: 'e.g. John Doe' }
]

const categoryFields = [
  { key: 'name', label: 'Category Name', placeholder: 'e.g. Electrical' },
  { key: 'type', label: 'Type', placeholder: 'e.g. Service/Product' }
]

const jobCategoryFields = [
  { key: 'name', label: 'Category Name', placeholder: 'e.g. Repair' },
  { key: 'code', label: 'Code', placeholder: 'e.g. REP' },
  { key: 'unit', label: 'Unit', placeholder: 'e.g. sqm, birds, m' }
]

const expenseCategoryFields = [
  { key: 'name', label: 'Category Name', placeholder: 'e.g. Fuel' },
  { key: 'description', label: 'Description', placeholder: 'Brief description' }
]

const accountFields = [
  { key: 'name', label: 'Account Name', placeholder: 'e.g. Petty Cash' },
  { key: 'type', label: 'Type', placeholder: 'CASH / ECOCASH / BANK' },
  { key: 'currency', label: 'Currency', placeholder: 'USD / ZIG' }
]

</script>

<template>
  <div class="flex-col md:flex">
    <div v-if="accessChecking" class="flex min-h-[50vh] items-center justify-center p-8">
      <div class="flex flex-col items-center gap-3 text-center">
        <Loader2 class="size-8 animate-spin text-primary" />
        <p class="text-sm text-muted-foreground">Checking settings access...</p>
      </div>
    </div>

    <div v-else class="flex-1 space-y-8 p-8 pt-6">
      <div class="flex items-center justify-between space-y-2">
        <div>
          <div class="flex items-center gap-2">
            <h2 class="text-3xl font-bold tracking-tight text-foreground">Admin Control Panel</h2>
            <ShieldCheck v-if="claims.roles?.includes('SUPER_ADMIN')" class="h-6 w-6 text-primary" />
          </div>
          <p class="text-muted-foreground">Manage system entities, roles, and reference data.</p>
        </div>
        <div class="flex items-center gap-2">
          <Button variant="outline" size="sm" @click="refreshSession" :disabled="loading">
            <RefreshCw class="mr-2 h-4 w-4" :class="{ 'animate-spin': loading }" />
            Refresh Permissions
          </Button>
        </div>
      </div>

      <Tabs :default-value="isOnlyManager ? 'departments' : 'users'" class="space-y-6">
        <ScrollArea class="w-full">
          <TabsList class="bg-muted/50 p-1 w-full justify-start overflow-x-auto">
            <TabsTrigger v-if="!isOnlyManager" value="users" class="px-8">Users</TabsTrigger>
            <TabsTrigger value="departments" class="px-8">Departments</TabsTrigger>
            <TabsTrigger value="prod-cats" class="px-8">Product Cats</TabsTrigger>
            <TabsTrigger value="job-cats" class="px-8">Job Cats</TabsTrigger>
            <TabsTrigger value="exp-cats" class="px-8">Expense Cats</TabsTrigger>
            <TabsTrigger value="accounts" class="px-8">Accounts</TabsTrigger>
            <TabsTrigger value="settings" class="px-8">
              <Settings class="mr-2 h-4 w-4" />
              Settings
            </TabsTrigger>
            <TabsTrigger value="bom-templates" class="px-8">BOM Templates</TabsTrigger>
            <TabsTrigger v-if="isAdminOrSuperAdmin" value="permissions" class="px-8">
              <ShieldCheck class="mr-2 h-4 w-4" />
              Permissions
            </TabsTrigger>
          </TabsList>
        </ScrollArea>

        <TabsContent v-if="!isOnlyManager" value="users" class="space-y-4">
          <UsersTable :users="users" :is-admin="isAdminOrSuperAdmin" />
        </TabsContent>

        <TabsContent value="departments" class="space-y-4">
          <EntityTable title="Department" description="Manage organization structure and department heads."
            collectionName="departments" :items="departments" :fields="deptFields" />
        </TabsContent>

        <TabsContent value="prod-cats" class="space-y-4">
          <EntityTable title="Product Category"
            description="Manage service and product categories for catalog organization." collectionName="categories"
            :items="productCategories" :fields="categoryFields" />
        </TabsContent>

        <TabsContent value="job-cats" class="space-y-4">
          <EntityTable title="Job Category" description="Manage categories for job card classification."
            collectionName="jobCategories" :items="jobCategories" :fields="jobCategoryFields" />
        </TabsContent>

        <TabsContent value="exp-cats" class="space-y-4">
          <EntityTable title="Expense Category" description="Manage categories for operational expenditures."
            collectionName="expenseCategories" :items="expenseCategories" :fields="expenseCategoryFields" />
        </TabsContent>

        <TabsContent value="accounts" class="space-y-4">
          <EntityTable title="Cash Account" description="Manage treasury accounts (Cash, Ecocash, Bank)."
            collectionName="cashAccounts" :items="cashAccounts" :fields="accountFields" />
        </TabsContent>

        <TabsContent value="settings" class="space-y-4">
          <AppSettings />
        </TabsContent>

        <TabsContent value="bom-templates" class="space-y-4">
          <BomTemplatesAdmin />
        </TabsContent>

        <TabsContent v-if="isAdminOrSuperAdmin" value="permissions" class="space-y-4">
          <PermissionsMatrix />
        </TabsContent>
      </Tabs>
    </div>
  </div>
</template>
