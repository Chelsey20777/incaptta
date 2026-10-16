import { createRouter, createWebHistory } from 'vue-router'
import { user as sessionUser, claims as sessionClaims, loading as sessionLoading } from '@/composables/useSession'
import { watch } from 'vue'
import { signOut } from 'firebase/auth'
import { auth } from '@/lib/firebase'

const router = createRouter({
    history: createWebHistory(),
    routes: [
        {
            path: '/',
            name: 'Dashboard',
            component: () => import('@/views/Dashboard.vue'),
            meta: { requiresAuth: true }
        },
        {
            path: '/balances',
            name: 'Balances',
            component: () => import('@/views/Balances.vue'),
            meta: { requiresAuth: true }
        },
        {
            path: '/opex',
            name: 'Opex',
            component: () => import('@/views/Opex.vue'),
            meta: { requiresAuth: true }
        },
        {
            path: '/job-cards',
            name: 'JobCards',
            component: () => import('@/views/JobCards.vue'),
            meta: { requiresAuth: true }
        },
        {
            path: '/finance',
            name: 'Finance',
            component: () => import('@/views/Finance.vue'),
            meta: { requiresAuth: true }
        },
        {
            path: '/crm',
            name: 'CRM',
            component: () => import('@/views/Crm.vue'),
            meta: { requiresAuth: true }
        },
        {
            path: '/inventory',
            name: 'Inventory',
            component: () => import('@/views/Inventory.vue'),
            meta: { requiresAuth: true }
        },
        {
            path: '/hr',
            name: 'HR',
            component: () => import('@/views/Hr.vue'),
            meta: { requiresAuth: true }
        },
        {
            path: '/accounting',
            name: 'Accounting',
            component: () => import('@/views/Accounting.vue'),
            meta: { requiresAuth: true }
        },
        {
            path: '/auto-approvals',
            name: 'AutoApprovals',
            component: () => import('@/views/AutoApprovals.vue'),
            meta: { requiresAuth: true }
        },
        {
            path: '/login',
            name: 'Login',
            component: () => import('@/views/Login.vue'),
            meta: { guestOnly: true }
        },
        {
            path: '/unauthorized',
            name: 'Unauthorized',
            component: () => import('@/views/Login.vue'),
            meta: { guestOnly: false }
        }
    ]
})

// Function to wait for session to be ready
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

router.beforeEach(async (to, _from, next) => {
    await waitForSession()

    const isAuthenticated = !!sessionUser.value

    if (to.meta.guestOnly) {
        if (isAuthenticated) return next('/')
        return next()
    }

    if (to.meta.requiresAuth && !isAuthenticated) {
        return next('/login')
    }

    // Role check for Manager Portal — enforce MANAGER / ADMIN / SUPER_ADMIN only
    if (isAuthenticated && to.meta.requiresAuth) {
        const roles = sessionClaims.value.roles || []
        const roleArray = Array.isArray(roles) ? roles : [String(roles)]
        const isAuthorized = roleArray.some((r: string) => ['MANAGER', 'ADMIN', 'SUPER_ADMIN'].includes(r))

        if (!isAuthorized) {
            console.warn('[Router] User is not a Manager/Admin — signing out.')
            await signOut(auth)
            return next({ path: '/login', query: { reason: 'unauthorized' } })
        }
    }

    next()
})

export default router
