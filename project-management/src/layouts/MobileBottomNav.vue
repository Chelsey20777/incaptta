<script setup lang="ts">
import { 
  LayoutDashboard, 
  FileText, 
  Package, 
  ClipboardList, 
  Menu 
} from 'lucide-vue-next'
import { useRouter, useRoute } from 'vue-router'
import { useAdminStore } from '@/features/admin/store/adminStore'
import { storeToRefs } from 'pinia'

const router = useRouter()
const route = useRoute()
const adminStore = useAdminStore()
const { appSettings } = storeToRefs(adminStore)

const navItems = [
  { title: 'Home', icon: LayoutDashboard, path: '/' },
  { title: 'Job Cards', icon: FileText, path: '/job-cards' },
  { title: 'Tasks', icon: ClipboardList, path: '/tasks' },
  { title: 'Inventory', icon: Package, path: '/inventory' },
]

const isActive = (path: string) => {
  if (path === '/') return route.path === '/'
  return route.path.startsWith(path)
}

const emit = defineEmits(['open-menu'])
</script>

<template>
  <nav class="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-card/80 backdrop-blur-lg border-t z-50 flex items-center justify-around px-2 pb-safe">
    <button 
      v-for="item in navItems" 
      :key="item.path"
      @click="router.push(item.path)"
      class="flex flex-col items-center gap-1 flex-1 py-1 transition-all"
      :style="isActive(item.path) ? { color: appSettings?.uiColors?.brandPrimaryColor || '#79c21b' } : { color: 'hsl(var(--muted-foreground))' }"
    >
      <component :is="item.icon" class="size-5" :class="{ 'scale-110': isActive(item.path) }" />
      <span class="text-[10px] font-medium">{{ item.title }}</span>
      <div v-if="isActive(item.path)" 
           class="absolute bottom-1 w-1 h-1 rounded-full" 
           :style="{ backgroundColor: appSettings?.uiColors?.brandPrimaryColor || '#79c21b' }"></div>
    </button>
    
    <button 
      @click="$emit('open-menu')"
      class="flex flex-col items-center gap-1 flex-1 py-1 text-muted-foreground"
    >
      <Menu class="size-5" />
      <span class="text-[10px] font-medium">Menu</span>
    </button>
  </nav>
</template>

<style scoped>
.pb-safe {
  padding-bottom: env(safe-area-inset-bottom);
}
</style>
