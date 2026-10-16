import { createRouter, createWebHistory } from 'vue-router'
import { auth } from '@/lib/firebase'
import { watch } from 'vue'
import { user as sessionUser, claims as sessionClaims, loading as sessionLoading } from '@/composables/useSession'
import {
    getInventoryManagerPinHash,
    isManagerInventoryPinUnlocked
} from '@/features/inventory/utils/inventoryAccessPin'
import { usePermissionsStore } from '@/features/admin/store/permissionsStore'

export type { UserRole } from '@/constants/roles'

const router = createRouter({
    history: createWebHistory(),
    routes: [
        {
            path: '/',
            component: () => import('@/features/analytics/pages/AnalyticsDashboard.vue'),
            meta: { roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ACCOUNTANT', 'SALES', 'TECHNICAL', 'STOREKEEPER', 'DIRECTOR'], module: 'dashboard' }
        },

        {
            path: '/job-cards',
            component: () => import('@/features/jobCards/pages/JobCardsList.vue'),
            meta: { roles: ['SALES', 'TECHNICAL', 'ACCOUNTANT', 'MANAGER', 'ADMIN', 'DIRECTOR'], module: 'jobCards' }
        },
        {
            path: '/job-cards/new',
            component: () => import('@/features/jobCards/pages/CreateJobCard.vue'),
            meta: { roles: ['SALES', 'TECHNICAL', 'ADMIN', 'ACCOUNTANT', 'MANAGER'], module: 'jobCards' }
        },
        {
            path: '/job-cards/:id',
            name: 'JobCardDetail',
            component: () => import('@/features/jobCards/pages/JobCardDetail.vue'),
            meta: { roles: ['SALES', 'TECHNICAL', 'ACCOUNTANT', 'MANAGER', 'ADMIN', 'DIRECTOR'], module: 'jobCards' }
        },
        {
            path: '/commissions',
            component: () => import('@/features/commissions/pages/AllCommissions.vue'),
            meta: { roles: ['ACCOUNTANT', 'ADMIN', 'MANAGER', 'DIRECTOR'], module: 'commissions' }
        },
        {
            path: '/my-commissions',
            component: () => import('@/features/commissions/pages/MyCommissions.vue'),
            meta: { roles: ['SALES'], module: 'commissions' }
        },
        {
            path: '/opex',
            component: () => import('@/features/operationalExpenses/pages/OpexList.vue'),
            meta: { roles: ['ACCOUNTANT', 'ADMIN', 'MANAGER', 'TECHNICAL', 'SALES', 'STOREKEEPER', 'DIRECTOR'], module: 'opex' }
        },
        {
            path: '/opex/new',
            component: () => import('@/features/operationalExpenses/pages/CreateOpex.vue'),
            meta: { roles: ['ACCOUNTANT', 'ADMIN', 'MANAGER', 'TECHNICAL', 'SALES', 'STOREKEEPER'], module: 'opex' }
        },
        {
            path: '/opex/:id',
            component: () => import('@/features/operationalExpenses/pages/OpexDetail.vue'),
            meta: { roles: ['ACCOUNTANT', 'ADMIN', 'MANAGER', 'TECHNICAL', 'SALES', 'STOREKEEPER', 'DIRECTOR'], module: 'opex' }
        },
        // ─── Container Access Authorization ────────────────────────────────────
        {
            path: '/container-access',
            component: () => import('@/features/containerAccess/pages/CAAList.vue'),
            meta: { roles: ['MANAGER', 'ADMIN', 'SUPER_ADMIN', 'TECHNICAL', 'ACCOUNTANT', 'SALES', 'STOREKEEPER', 'DIRECTOR'], module: 'containerAccess' }
        },
        {
            path: '/container-access/new',
            component: () => import('@/features/containerAccess/pages/CreateCAA.vue'),
            meta: { roles: ['MANAGER', 'ADMIN', 'SUPER_ADMIN', 'TECHNICAL', 'ACCOUNTANT', 'SALES', 'STOREKEEPER', 'DIRECTOR'], module: 'containerAccess' }
        },
        {
            path: '/container-access/:id',
            name: 'CAADetail',
            component: () => import('@/features/containerAccess/pages/CAADetail.vue'),
            meta: { roles: ['MANAGER', 'ADMIN', 'SUPER_ADMIN', 'TECHNICAL', 'ACCOUNTANT', 'SALES', 'STOREKEEPER', 'DIRECTOR'], module: 'containerAccess' }
        },
        {
            path: '/transfers',
            component: () => import('@/features/fundTransfers/pages/TransfersList.vue'),
            meta: { roles: ['ACCOUNTANT', 'ADMIN', 'MANAGER', 'DIRECTOR'], module: 'finance' }
        },
        {
            path: '/transfers/new',
            component: () => import('@/features/fundTransfers/pages/TransferFunds.vue'),
            meta: { roles: ['ACCOUNTANT', 'ADMIN', 'MANAGER'], module: 'finance' }
        },
        {
            path: '/ledger',
            component: () => import('@/features/fundTransfers/pages/LedgerView.vue'),
            meta: { roles: ['ACCOUNTANT', 'ADMIN', 'MANAGER', 'DIRECTOR'], module: 'finance' }
        },
        {
            path: '/ledger/top-up',
            component: () => import('@/features/fundTransfers/pages/RecordTopUp.vue'),
            meta: { roles: ['ACCOUNTANT', 'ADMIN', 'MANAGER'], module: 'finance' }
        },
        {
            path: '/admin',
            component: () => import('@/features/admin/pages/AdminDashboard.vue'),
            meta: { roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER'], module: 'admin' }
        },
        {
            path: '/settings-unlock',
            component: () => import('@/features/admin/pages/SettingsUnlockPage.vue'),
            meta: { roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER'], module: 'admin' }
        },
        {
            path: '/inventory-unlock',
            component: () => import('@/features/inventory/pages/InventoryUnlockPage.vue'),
            meta: { roles: ['SUPER_ADMIN', 'ADMIN', 'STOREKEEPER', 'MANAGER', 'SALES'], module: 'inventory' }
        },
        {
            path: '/inventory',
            component: () => import('@/features/inventory/pages/InventoryGridPage.vue'),
            meta: { roles: ['SUPER_ADMIN', 'ADMIN', 'STOREKEEPER', 'MANAGER', 'SALES'], module: 'inventory' }
        },
        {
            path: '/inventory/master',
            redirect: '/inventory'
        },
        {
            path: '/inventory/new',
            component: () => import('@/features/inventory/pages/InventoryCreatePage.vue'),
            meta: { roles: ['SUPER_ADMIN', 'ADMIN', 'STOREKEEPER', 'MANAGER'], module: 'inventory' }
        },
        {
            path: '/inventory/:id',
            component: () => import('@/features/inventory/pages/InventoryDetailPage.vue'),
            meta: { roles: ['SUPER_ADMIN', 'ADMIN', 'STOREKEEPER', 'MANAGER', 'SALES'], module: 'inventory' }
        },
        {
            path: '/inventory/:id/edit',
            component: () => import('@/features/inventory/pages/InventoryEditPage.vue'),
            meta: { roles: ['SUPER_ADMIN', 'ADMIN', 'STOREKEEPER', 'MANAGER'], module: 'inventory' }
        },
        {
            path: '/inventory/:id/adjust',
            component: () => import('@/features/inventory/pages/InventoryAdjustPage.vue'),
            meta: { roles: ['SUPER_ADMIN', 'ADMIN', 'STOREKEEPER', 'MANAGER'], module: 'inventory' }
        },

        {
            path: '/crm',
            component: () => import('@/features/crm/layouts/CrmLayout.vue'),
            meta: { roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'SALES', 'ACCOUNTANT', 'TECHNICAL', 'DIRECTOR'], module: 'crm' },
            children: [
                { path: '', redirect: '/crm/customers' },
                {
                    path: 'customers',
                    component: () => import('@/features/crm/pages/Customers.vue'),
                    meta: { roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'SALES', 'ACCOUNTANT', 'TECHNICAL', 'DIRECTOR'], module: 'crm' }
                },
                {
                    path: 'quotations',
                    component: () => import('@/features/crm/pages/Quotations.vue'),
                    meta: { roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'SALES', 'ACCOUNTANT', 'TECHNICAL', 'DIRECTOR'], module: 'crm' }
                },
                {
                    path: 'invoices',
                    component: () => import('@/features/crm/pages/Invoices.vue'),
                    meta: { roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'SALES', 'ACCOUNTANT', 'TECHNICAL', 'DIRECTOR'], module: 'crm' }
                }
            ]
        },
        {
            path: '/crm/customers/:id',
            component: () => import('@/features/crm/pages/CustomerDetail.vue'),
            meta: { roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'SALES', 'ACCOUNTANT', 'TECHNICAL', 'DIRECTOR'], module: 'crm' }
        },
        {
            path: '/crm/leads',
            component: () => import('@/features/crm/pages/Leads.vue'),
            meta: { roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'SALES', 'ACCOUNTANT', 'TECHNICAL', 'DIRECTOR'], module: 'crm' }
        },
        {
            path: '/tasks',
            component: () => import('@/features/tasks/pages/TasksPage.vue'),
            meta: { roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ACCOUNTANT', 'SALES', 'TECHNICAL', 'STOREKEEPER', 'DIRECTOR'], module: 'tasks' }
        },

        // ─── HR Module ─────────────────────────────────────────────────────────
        {
            path: '/hr',
            component: () => import('@/features/hr/pages/HRDashboard.vue'),
            meta: { roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ACCOUNTANT', 'SALES', 'TECHNICAL', 'STOREKEEPER', 'DIRECTOR'], module: 'hr' }
        },
        {
            path: '/hr/employees',
            component: () => import('@/features/hr/pages/Employees.vue'),
            meta: { roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ACCOUNTANT', 'SALES', 'TECHNICAL', 'STOREKEEPER', 'DIRECTOR'], module: 'hr' }
        },
        {
            path: '/hr/employees/:id',
            component: () => import('@/features/hr/pages/EmployeeProfile.vue'),
            meta: { roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ACCOUNTANT', 'SALES', 'TECHNICAL', 'STOREKEEPER', 'DIRECTOR'], module: 'hr' }
        },
        {
            path: '/hr/attendance',
            component: () => import('@/features/hr/pages/Attendance.vue'),
            meta: { roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ACCOUNTANT', 'SALES', 'TECHNICAL', 'STOREKEEPER', 'DIRECTOR'], module: 'hr' }
        },
        {
            path: '/hr/payroll',
            component: () => import('@/features/hr/pages/Payroll.vue'),
            meta: { roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ACCOUNTANT', 'TECHNICAL', 'DIRECTOR'], module: 'hrPayroll' }
        },
        {
            path: '/hr/salaries-account',
            component: () => import('@/features/hr/pages/SalariesAccount.vue'),
            meta: { roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ACCOUNTANT', 'DIRECTOR'], module: 'hrPayroll' }
        },
        {
            path: '/hr/tasks',
            component: () => import('@/features/hr/pages/Tasks.vue'),
            meta: { roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ACCOUNTANT', 'SALES', 'TECHNICAL', 'STOREKEEPER', 'DIRECTOR'], module: 'hr' }
        },
        {
            path: '/hr/performance',
            component: () => import('@/features/hr/pages/Performance.vue'),
            meta: { roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ACCOUNTANT', 'SALES', 'TECHNICAL', 'STOREKEEPER', 'DIRECTOR'], module: 'hr' }
        },
        {
            path: '/hr/recruitment',
            component: () => import('@/features/hr/pages/Recruitment.vue'),
            meta: { roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ACCOUNTANT', 'TECHNICAL', 'DIRECTOR'], module: 'hrRecruitment' }
        },
        {
            path: '/tools-registry',
            component: () => import('@/features/tools/pages/ToolsRegistry.vue'),
            meta: { roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ACCOUNTANT', 'SALES', 'TECHNICAL', 'STOREKEEPER', 'DIRECTOR'], module: 'tools' }
        },
        {
            path: '/accounting',
            meta: { roles: ['ACCOUNTANT', 'ADMIN', 'SUPER_ADMIN', 'DIRECTOR'], module: 'accounting' },
            children: [
                { path: '', redirect: '/accounting/dashboard' },
                {
                    path: 'dashboard',
                    component: () => import('@/features/accounting/pages/AccountingDashboard.vue')
                },
                {
                    path: 'vat',
                    component: () => import('@/features/accounting/pages/VatDashboard.vue')
                },
                {
                    path: 'tax',
                    component: () => import('@/features/accounting/pages/TaxComputation.vue')
                },
                {
                    path: 'reports',
                    component: () => import('@/features/accounting/pages/FinancialReports.vue')
                },
                {
                    path: 'auto-approvals',
                    component: () => import('@/features/accounting/pages/AutoApprovalsAudit.vue')
                }
            ]
        },

        {
            path: '/support',
            component: () => import('@/features/support/pages/SupportPage.vue'),
            meta: { roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ACCOUNTANT', 'SALES', 'TECHNICAL', 'STOREKEEPER', 'DIRECTOR'], module: 'support' }
        },

        // ─── Procurement ───────────────────────────────────────────────────
        {
            path: '/procurement/requisitions',
            component: () => import('@/features/procurement/pages/RequisitionsView.vue'),
            meta: { roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ACCOUNTANT', 'STOREKEEPER', 'TECHNICAL', 'DIRECTOR'], module: 'procurement' }
        },
        {
            path: '/procurement/requisitions/new',
            component: () => import('@/features/procurement/pages/NewRequisitionView.vue'),
            meta: { roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ACCOUNTANT', 'STOREKEEPER', 'TECHNICAL'], module: 'procurement' }
        },
        {
            path: '/procurement/requisitions/:id',
            component: () => import('@/features/procurement/pages/RequisitionDetailView.vue'),
            meta: { roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ACCOUNTANT', 'STOREKEEPER', 'TECHNICAL', 'DIRECTOR'], module: 'procurement' }
        },
        {
            path: '/procurement/purchase-orders',
            component: () => import('@/features/procurement/pages/PurchaseOrdersView.vue'),
            meta: { roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ACCOUNTANT', 'STOREKEEPER', 'DIRECTOR'], module: 'procurement' }
        },
        {
            path: '/procurement/purchase-orders/:id',
            component: () => import('@/features/procurement/pages/PurchaseOrderDetailView.vue'),
            meta: { roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ACCOUNTANT', 'STOREKEEPER', 'DIRECTOR'], module: 'procurement' }
        },
        {
            path: '/procurement/grns',
            component: () => import('@/features/procurement/pages/GRNsView.vue'),
            meta: { roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ACCOUNTANT', 'STOREKEEPER', 'DIRECTOR'], module: 'procurement' }
        },
        {
            path: '/procurement/grns/new',
            component: () => import('@/features/procurement/pages/CreateGRNView.vue'),
            meta: { roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'STOREKEEPER'], module: 'procurement' }
        },
        {
            path: '/procurement/grns/:id',
            component: () => import('@/features/procurement/pages/GRNDetailView.vue'),
            meta: { roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ACCOUNTANT', 'STOREKEEPER', 'DIRECTOR'], module: 'procurement' }
        },
        {
            path: '/procurement/supplier-invoices',
            component: () => import('@/features/procurement/pages/SupplierInvoicesView.vue'),
            meta: { roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ACCOUNTANT', 'DIRECTOR'], module: 'procurement' }
        },
        {
            path: '/procurement/supplier-invoices/new',
            component: () => import('@/features/procurement/pages/CreateInvoiceView.vue'),
            meta: { roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ACCOUNTANT'], module: 'procurement' }
        },
        {
            path: '/procurement/supplier-invoices/:id',
            component: () => import('@/features/procurement/pages/InvoiceDetailView.vue'),
            meta: { roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ACCOUNTANT', 'DIRECTOR'], module: 'procurement' }
        },
        {
            path: '/procurement/process-payment',
            component: () => import('@/features/procurement/pages/ProcessPaymentView.vue'),
            meta: { roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ACCOUNTANT'], module: 'procurement' }
        },
        {
            path: '/procurement/suppliers',
            component: () => import('@/features/procurement/pages/SuppliersView.vue'),
            meta: { roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ACCOUNTANT', 'STOREKEEPER', 'DIRECTOR'], module: 'procurement' }
        },

        // ─── BOM Templates ─────────────────────────────────────────────────
        {
            path: '/bom-templates',
            component: () => import('@/features/admin/pages/BomTemplatesPage.vue'),
            meta: { roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ACCOUNTANT', 'SALES', 'TECHNICAL', 'STOREKEEPER', 'DIRECTOR'], module: 'jobCards' }
        },

        // ─── Agric Structures ──────────────────────────────────────────────
        {
            path: '/agric-structures/dashboard',
            component: () => import('@/features/agricStructures/pages/AgricDashboard.vue'),
            meta: { roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ACCOUNTANT', 'SALES', 'TECHNICAL', 'DIRECTOR'], module: 'jobCards' }
        },
        {
            path: '/agric-structures/inventory',
            component: () => import('@/features/agricStructures/pages/AgricInventoryGridPage.vue'),
            meta: { roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ACCOUNTANT', 'STOREKEEPER', 'DIRECTOR'], module: 'inventory' }
        },
        {
            path: '/agric-structures/quotations',
            name: 'AgricQuotationList',
            component: () => import('@/features/agricStructures/pages/AgricQuotationList.vue'),
            meta: { roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ACCOUNTANT', 'SALES', 'TECHNICAL', 'DIRECTOR'], module: 'jobCards' }
        },
        {
            path: '/agric-structures/settings',
            name: 'AgricSettings',
            component: () => import('@/features/agricStructures/pages/AgricSettings.vue'),
            meta: { roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'DIRECTOR'], module: 'jobCards' }
        },
        {
            path: '/agric-structures/job-cards',
            component: () => import('@/features/agricStructures/pages/AgricJobCardList.vue'),
            meta: { roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ACCOUNTANT', 'SALES', 'TECHNICAL', 'DIRECTOR'], module: 'jobCards' }
        },
        {
            path: '/agric-structures/job-cards/:id',
            component: () => import('@/features/agricStructures/pages/AgricJobCardDetail.vue'),
            meta: { roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ACCOUNTANT', 'SALES', 'TECHNICAL', 'DIRECTOR'], module: 'jobCards' }
        },
        {
            path: '/agric-structures/fowlrun',
            component: () => import('@/features/agricStructures/pages/FowlrunCalculatorPage.vue'),
            meta: { roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ACCOUNTANT', 'SALES', 'TECHNICAL', 'DIRECTOR'], module: 'jobCards' }
        },
        // ─── Pekka Poultry ──────────────────────────────────────────────────
        {
            path: '/poultry',
            component: () => import('@/features/poultry/pages/PoultryDashboard.vue'),
            meta: { roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'POULTRY_MANAGER', 'FARM_HAND', 'DIRECTOR'], module: 'poultry' }
        },
        {
            path: '/poultry/inventory',
            component: () => import('@/features/poultry/pages/PoultryInventory.vue'),
            meta: { roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'POULTRY_MANAGER', 'FARM_HAND', 'DIRECTOR'], module: 'poultry' }
        },
        {
            path: '/poultry/flock/:id',
            component: () => import('@/features/poultry/pages/FlockDetails.vue'),
            meta: { roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'POULTRY_MANAGER', 'FARM_HAND', 'DIRECTOR'], module: 'poultry' }
        },

        // ─── Analytics (now the main dashboard at /) ───────────────────────
        { path: '/analytics', redirect: '/' },

        // ─── Verification (public) ─────────────────────────────────────────
        {
            path: '/verify/:token',
            component: () => import('@/features/verification/pages/VerifyDocument.vue'),
            meta: { public: true }
        },

        // ─── Payment Submissions (admin/accountant review) ─────────────────
        {
            path: '/payment-submissions',
            component: () => import('@/features/verification/pages/PaymentSubmissions.vue'),
            meta: { roles: ['ACCOUNTANT', 'ADMIN', 'MANAGER', 'SUPER_ADMIN', 'DIRECTOR'], module: 'finance' }
        },

        {
            path: '/login',
            name: 'Login',
            component: () => import('@/features/auth/pages/Login.vue'),
            meta: { guestOnly: true }
        },
        {
            path: '/profile',
            name: 'Profile',
            component: () => import('@/features/auth/pages/Profile.vue'),
            meta: { roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ACCOUNTANT', 'SALES', 'STOREKEEPER', 'TECHNICAL', 'DIRECTOR'] }
        },
        {
            path: '/mfa-guide',
            name: 'MfaGuide',
            component: () => import('@/features/auth/pages/MfaGuide.vue'),
            meta: { roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ACCOUNTANT', 'SALES', 'STOREKEEPER', 'TECHNICAL', 'DIRECTOR'] }
        }
    ]
})

// Wait for session to be ready (auth state + claims loaded)
const waitForSession = () => {
    return new Promise((resolve) => {
        if (!sessionLoading.value) {
            resolve(true)
            return
        }
        const unwatch = watch(sessionLoading, (isLoading) => {
            if (!isLoading) {
                unwatch()
                resolve(true)
            }
        })
    })
}

// Wait for permissions store to finish loading from Firestore
let permissionsLoadStarted = false
const waitForPermissions = () => {
    return new Promise<void>((resolve) => {
        const store = usePermissionsStore()
        if (!store.loading) {
            resolve()
            return
        }
        if (!permissionsLoadStarted) {
            permissionsLoadStarted = true
            store.load()
        }
        const unwatch = watch(() => store.loading, (isLoading) => {
            if (!isLoading) {
                unwatch()
                resolve()
            }
        })
    })
}


router.beforeEach(async (to, _from, next) => {
    await waitForSession()

    const isAuthenticated = !!sessionUser.value

    // Handle public routes (no auth required)
    if (to.meta.public) {
        return next()
    }

    // Handle guest-only routes (like Login)
    if (to.meta.guestOnly) {
        if (isAuthenticated) return next('/')
        return next()
    }

    // Require authentication for all other routes
    if (!isAuthenticated) {
        return next('/login')
    }

    // Deactivated account check — sign out entirely to clear the JWT
    if (sessionClaims.value.isActive === false) {
        console.warn('[Router] Deactivated account attempted navigation:', sessionUser.value?.email)
        await auth.signOut()
        return next({ path: '/login', query: { reason: 'deactivated' } })
    }

    // Role-based Access Control
    const currentRoles = sessionClaims.value.roles || []
    const roleArray = Array.isArray(currentRoles) ? currentRoles : [String(currentRoles)]
    const isSuperAdmin = roleArray.includes('SUPER_ADMIN')

    // SUPER_ADMIN bypasses all checks
    if (isSuperAdmin) {
        return next()
    }

    // Wait for permissions config to load, then check module access
    await waitForPermissions()
    const permissionsStore = usePermissionsStore()

    const moduleKey = to.meta.module as string | undefined
    if (moduleKey) {
        // Use configurable permissions (Firestore config or defaults)
        const hasAccess = roleArray.some(r => permissionsStore.roleCanAccess(r, moduleKey))
        if (!hasAccess) {
            console.warn(`[Router] Access Denied: ${to.path}. User roles:`, roleArray)
            return next('/')
        }
    } else {
        // Fallback: static meta.roles (for routes without a module, e.g. /profile)
        const requiredRoles = (to.meta.roles as string[]) || []
        if (requiredRoles.length > 0) {
            const hasAccess = requiredRoles.some(r => roleArray.includes(r))
            if (!hasAccess) {
                console.warn(`[Router] Access Denied: ${to.path}. User roles:`, roleArray)
                return next('/')
            }
        }
    }

    const isInventoryRoute = to.path.startsWith('/inventory')
    const isInventoryUnlockRoute = to.path === '/inventory-unlock'
    const isSettingsRoute = to.path.startsWith('/admin')
    const isSettingsUnlockRoute = to.path === '/settings-unlock'
    const isRestrictedManager =
        roleArray.includes('MANAGER') &&
        !roleArray.includes('SUPER_ADMIN')

    if (isRestrictedManager && isInventoryRoute && !isInventoryUnlockRoute) {
        const pinHash = await getInventoryManagerPinHash()
        if (pinHash && !isManagerInventoryPinUnlocked(sessionUser.value?.uid)) {
            return next({
                path: '/inventory-unlock',
                query: { redirect: to.fullPath }
            })
        }
    }

    if (isInventoryUnlockRoute && !isRestrictedManager) {
        const redirect = typeof to.query.redirect === 'string' ? to.query.redirect : '/inventory'
        return next(redirect.startsWith('/inventory') ? redirect : '/inventory')
    }

    if (isRestrictedManager && isSettingsRoute && !isSettingsUnlockRoute) {
        const pinHash = await getInventoryManagerPinHash()
        if (pinHash && !isManagerInventoryPinUnlocked(sessionUser.value?.uid)) {
            return next({
                path: '/settings-unlock',
                query: { redirect: to.fullPath }
            })
        }
    }

    if (isSettingsUnlockRoute && !isRestrictedManager) {
        const redirect = typeof to.query.redirect === 'string' ? to.query.redirect : '/admin'
        return next(redirect.startsWith('/admin') ? redirect : '/admin')
    }

    next()
})


export default router
