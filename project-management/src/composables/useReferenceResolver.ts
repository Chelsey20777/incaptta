import { computed } from 'vue'
import { useAdminStore } from '@/features/admin/store/adminStore'

export function useReferenceResolver() {
    const adminStore = useAdminStore()

    // O(1) Lookup Maps
    const departmentMap = computed(() => {
        return Object.fromEntries(adminStore.departments.map(d => [d.id, d.name]))
    })

    const jobCategoryMap = computed(() => {
        return Object.fromEntries(adminStore.jobCategories.map(c => [c.id, c.name]))
    })

    const productCategoryMap = computed(() => {
        return Object.fromEntries(adminStore.productCategories.map(c => [c.id, c.name]))
    })

    const expenseCategoryMap = computed(() => {
        return Object.fromEntries(adminStore.expenseCategories.map(c => [c.id, c.name]))
    })

    // Resolver Functions
    function resolveDepartmentName(id?: string): string {
        if (!id) return '—'
        return departmentMap.value[id] || id
    }

    function resolveJobCategoryName(id?: string): string {
        if (!id) return '—'
        return jobCategoryMap.value[id] || id
    }

    function resolveInventoryCategoryName(id?: string): string {
        if (!id) return '—'
        return productCategoryMap.value[id] || id
    }

    function resolveExpenseCategoryName(id?: string): string {
        if (!id) return '—'
        return expenseCategoryMap.value[id] || id
    }

    function resolvePaymentMethod(method?: string): string {
        if (!method) return '—'
        const formatMap: Record<string, string> = {
            'CASH': 'Cash',
            'ECOCASH': 'EcoCash',
            'BANK': 'Bank Transfer'
        }
        return formatMap[method] || method
    }

    return {
        resolveDepartmentName,
        resolveJobCategoryName,
        resolveInventoryCategoryName,
        resolveExpenseCategoryName,
        resolvePaymentMethod
    }
}
