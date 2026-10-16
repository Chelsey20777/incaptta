'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/stores/auth-store'
import { useAdminStore } from '@/stores/admin-store'
import { usePermissionsStore } from '@/stores/permissions-store'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Loader2, RefreshCw, ShieldCheck, Settings } from 'lucide-react'
import { getIdTokenResult } from 'firebase/auth'
import { auth } from '@/lib/firebase'
import UsersTable from '@/components/admin/UsersTable'
import EntityTable from '@/components/admin/EntityTable'
import AppSettings from '@/components/admin/AppSettings'
import PermissionsMatrix from '@/components/admin/PermissionsMatrix'
import BomTemplatesAdmin from '@/components/admin/BomTemplatesAdmin'

// Simple PIN unlock utility - matches legacy Vue sessionStorage keys
function isManagerInventoryPinUnlocked(uid?: string): boolean {
  if (!uid) return false
  try {
    return sessionStorage.getItem(`inventory-manager-unlock:${uid}`) === 'granted'
  } catch {
    return false
  }
}

export default function AdminPage() {
  const router = useRouter()
  const authStore = useAuthStore()
  const adminStore = useAdminStore()
  const permissionsStore = usePermissionsStore()

  const { user, claims, loading: authLoading } = authStore
  const {
    users,
    departments,
    productCategories,
    inventoryCategories,
    jobCategories,
    expenseCategories,
    cashAccounts,
    appSettings,
    loading: adminLoading
  } = adminStore

  const [accessChecking, setAccessChecking] = useState(true)
  const [hasFetchedAdminData, setHasFetchedAdminData] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const roles = authStore.getRoles()
  const isSuperAdmin = authStore.isSuperAdmin()
  const isAdminOrSuperAdmin = isSuperAdmin || roles.includes('ADMIN')
  const isOnlyManager = roles.includes('MANAGER') && !isSuperAdmin && !roles.includes('ADMIN')

  const ensureSettingsAccess = useCallback(() => {
    if (authLoading) return

    const isRestrictedManager = roles.includes('MANAGER') && !isSuperAdmin

    if (!isRestrictedManager) {
      setAccessChecking(false)
      if (!hasFetchedAdminData) {
        adminStore.fetchAll()
        setHasFetchedAdminData(true)
      }
      return
    }

    // For MANAGER: check if PIN is configured and unlocked
    const pinHash = (appSettings as any).inventoryManagerPinHash

    if (pinHash && !isManagerInventoryPinUnlocked(user?.uid)) {
      setAccessChecking(true)
      router.replace('/settings-unlock?redirect=/admin')
      return
    }

    setAccessChecking(false)
    if (!hasFetchedAdminData) {
      adminStore.fetchAll()
      setHasFetchedAdminData(true)
    }
  }, [authLoading, roles, isSuperAdmin, user, appSettings, hasFetchedAdminData, adminStore, router])

  useEffect(() => {
    ensureSettingsAccess()
  }, [ensureSettingsAccess])

  // Load permissions for matrix
  useEffect(() => {
    if (permissionsStore.loading) {
      permissionsStore.load()
    }
  }, [permissionsStore])

  // Cleanup subscriptions on unmount
  useEffect(() => {
    return () => {
      adminStore.cleanup()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleRefreshPermissions = async () => {
    setRefreshing(true)
    try {
      if (auth.currentUser) {
        const tokenResult = await getIdTokenResult(auth.currentUser, true)
        authStore.setClaims(tokenResult.claims)
      }
      // Reload the role-permissions matrix from Firestore so the UI reflects
      // the latest saved configuration (not just the current user's claims).
      await permissionsStore.load()
    } catch (err) {
      console.error('[Admin] Refresh permissions failed:', err)
    } finally {
      setRefreshing(false)
    }
  }

  const deptFields = [
    { key: 'name', label: 'Department Name', placeholder: 'e.g. Workshop' },
    { key: 'head', label: 'Department Head', placeholder: 'e.g. John Doe' }
  ]

  const categoryFields = [
    { key: 'name', label: 'Category Name', placeholder: 'e.g. Electrical' },
    { key: 'type', label: 'Type', placeholder: 'e.g. Service/Product' }
  ]

  const inventoryCategoryFields = [
    { key: 'name', label: 'Category Name', placeholder: 'e.g. Irrigation Equipment' }
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

  if (accessChecking) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center p-8">
        <div className="flex flex-col items-center gap-3 text-center">
          <Loader2 className="size-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Checking settings access...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 space-y-6 sm:space-y-8 p-4 sm:p-8 pt-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:space-y-2">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">Admin Control Panel</h2>
            {isSuperAdmin && <ShieldCheck className="h-6 w-6 text-brand-primary" />}
          </div>
          <p className="text-muted-foreground text-sm sm:text-base">Manage system entities, roles, and reference data.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="w-full sm:w-auto"
            onClick={handleRefreshPermissions}
            disabled={refreshing || adminLoading}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh Permissions
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue={isOnlyManager ? 'departments' : 'users'} className="space-y-6">
        <div className="relative w-full overflow-x-auto overscroll-x-contain touch-pan-x scrollbar-brand pb-2 -mx-1 px-1">
          <TabsList className="bg-muted/50 p-1 inline-flex h-auto w-max min-w-full justify-start gap-1 rounded-xl">
            {!isOnlyManager && (
              <TabsTrigger value="users" className="shrink-0 px-4 sm:px-6 py-2 text-xs sm:text-sm">
                Users
              </TabsTrigger>
            )}
            <TabsTrigger value="departments" className="shrink-0 px-4 sm:px-6 py-2 text-xs sm:text-sm">
              Departments
            </TabsTrigger>
            <TabsTrigger value="prod-cats" className="shrink-0 px-4 sm:px-6 py-2 text-xs sm:text-sm">
              Product Cats
            </TabsTrigger>
            {isAdminOrSuperAdmin && (
              <TabsTrigger value="inventory-cats" className="shrink-0 px-4 sm:px-6 py-2 text-xs sm:text-sm">
                Inventory Cats
              </TabsTrigger>
            )}
            <TabsTrigger value="job-cats" className="shrink-0 px-4 sm:px-6 py-2 text-xs sm:text-sm">
              Job Cats
            </TabsTrigger>
            <TabsTrigger value="exp-cats" className="shrink-0 px-4 sm:px-6 py-2 text-xs sm:text-sm">
              Expense Cats
            </TabsTrigger>
            <TabsTrigger value="accounts" className="shrink-0 px-4 sm:px-6 py-2 text-xs sm:text-sm">
              Accounts
            </TabsTrigger>
            <TabsTrigger value="settings" className="shrink-0 px-4 sm:px-6 py-2 text-xs sm:text-sm">
              <Settings className="mr-1.5 h-4 w-4" />
              Settings
            </TabsTrigger>
            <TabsTrigger value="bom-templates" className="shrink-0 px-4 sm:px-6 py-2 text-xs sm:text-sm">
              BOM Templates
            </TabsTrigger>
            {isAdminOrSuperAdmin && (
              <TabsTrigger value="permissions" className="shrink-0 px-4 sm:px-6 py-2 text-xs sm:text-sm">
                <ShieldCheck className="mr-1.5 h-4 w-4" />
                Permissions
              </TabsTrigger>
            )}
          </TabsList>
        </div>

        {!isOnlyManager && (
          <TabsContent value="users" className="space-y-4">
            <UsersTable users={users} isAdmin={isAdminOrSuperAdmin} />
          </TabsContent>
        )}

        <TabsContent value="departments" className="space-y-4">
          <EntityTable
            title="Department"
            description="Manage organization structure and department heads."
            collectionName="departments"
            items={departments}
            fields={deptFields}
          />
        </TabsContent>

        <TabsContent value="prod-cats" className="space-y-4">
          <EntityTable
            title="Product Category"
            description="Manage service and product categories for catalog organization."
            collectionName="categories"
            items={productCategories}
            fields={categoryFields}
          />
        </TabsContent>

        {isAdminOrSuperAdmin && (
          <TabsContent value="inventory-cats" className="space-y-4">
            <EntityTable
              title="Inventory Category"
              description="Manage the categories available in Inventory Master. Product and job categories are kept separate."
              collectionName="inventoryCategories"
              items={inventoryCategories}
              fields={inventoryCategoryFields}
            />
          </TabsContent>
        )}

        <TabsContent value="job-cats" className="space-y-4">
          <EntityTable
            title="Job Category"
            description="Manage categories for job card classification."
            collectionName="jobCategories"
            items={jobCategories}
            fields={jobCategoryFields}
          />
        </TabsContent>

        <TabsContent value="exp-cats" className="space-y-4">
          <EntityTable
            title="Expense Category"
            description="Manage categories for operational expenditures."
            collectionName="expenseCategories"
            items={expenseCategories}
            fields={expenseCategoryFields}
          />
        </TabsContent>

        <TabsContent value="accounts" className="space-y-4">
          <EntityTable
            title="Cash Account"
            description="Manage treasury accounts (Cash, Ecocash, Bank)."
            collectionName="cashAccounts"
            items={cashAccounts}
            fields={accountFields}
          />
        </TabsContent>

        <TabsContent value="settings" className="space-y-4">
          <AppSettings />
        </TabsContent>

        <TabsContent value="bom-templates" className="space-y-4">
          <BomTemplatesAdmin />
        </TabsContent>

        {isAdminOrSuperAdmin && (
          <TabsContent value="permissions" className="space-y-4">
            <PermissionsMatrix />
          </TabsContent>
        )}
      </Tabs>
    </div>
  )
}
