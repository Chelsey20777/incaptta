<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft, Clock } from 'lucide-vue-next'

const route = useRoute()
const router = useRouter()

// Get title from path, e.g. /job-cards -> Job Cards
const title = route.path
  .replace('/', '')
  .split('-')
  .map(word => word.charAt(0).toUpperCase() + word.slice(1))
  .join(' ')
</script>

<template>
  <div class="flex-1 flex flex-col min-h-screen bg-background">
    <!-- Header -->
    <header class="p-4 border-b bg-card sticky top-0 z-10 shadow-sm flex items-center gap-3">
      <button 
        @click="router.push('/')"
        class="size-10 rounded-full flex items-center justify-center bg-muted/50 hover:bg-muted text-muted-foreground transition-colors"
      >
        <ArrowLeft class="size-5" />
      </button>
      <h1 class="text-lg font-black tracking-tight">{{ title }}</h1>
    </header>

    <!-- Content -->
    <main class="flex-1 p-6 flex flex-col items-center justify-center text-center">
      <div class="size-20 rounded-full bg-primary/10 flex items-center justify-center text-primary mb-6 animate-pulse">
        <Clock class="size-10" />
      </div>
      <h2 class="text-xl font-black mb-2">Coming Soon</h2>
      <p class="text-sm text-muted-foreground max-w-[250px]">
        The {{ title }} mobile view is currently under construction and will be available soon.
      </p>
      
      <button 
        @click="router.push('/')"
        class="mt-8 px-6 py-3 rounded-xl bg-primary text-primary-foreground font-bold shadow-sm hover:opacity-90 transition-opacity active:scale-95"
      >
        Return Home
      </button>
    </main>
  </div>
</template>
