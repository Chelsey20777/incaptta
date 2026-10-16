import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

export const useUIStore = defineStore('ui', () => {
    const sidebarMode = ref<'expanded' | 'collapsed'>(
        (localStorage.getItem('sidebarMode') as 'expanded' | 'collapsed') || 'expanded'
    )

    const isCollapsed = ref(sidebarMode.value === 'collapsed')

    function toggleSidebar() {
        sidebarMode.value = sidebarMode.value === 'expanded' ? 'collapsed' : 'expanded'
        isCollapsed.value = sidebarMode.value === 'collapsed'
    }

    watch(sidebarMode, (newMode) => {
        localStorage.setItem('sidebarMode', newMode)
    })

    return {
        sidebarMode,
        isCollapsed,
        toggleSidebar
    }
})
