import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useDashboardStore = defineStore('dashboard', () => {
  const stats = ref({
    totalJobCards: 0,
    pendingApprovals: 0,
    activeTasks: 0,
    lowStockItems: 0,
    totalRevenue: 0,
    monthlyOpex: 0
  })

  const recentActivity = ref<any[]>([])

  const updateStats = (newStats: Partial<typeof stats.value>) => {
    stats.value = { ...stats.value, ...newStats }
  }

  const addActivity = (activity: any) => {
    recentActivity.value.unshift(activity)
    if (recentActivity.value.length > 20) {
      recentActivity.value = recentActivity.value.slice(0, 20)
    }
  }

  return {
    stats,
    recentActivity,
    updateStats,
    addActivity
  }
})
