<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import AppLayout from './layouts/AppLayout.vue'
import UpdateBanner from './components/UpdateBanner.vue'

const route = useRoute()
const isAuthPage = computed(() => route.path === '/login' || route.path.startsWith('/verify/'))
</script>

<template>
  <template v-if="isAuthPage">
    <router-view />
  </template>
  <template v-else>
    <AppLayout>
      <router-view />
    </AppLayout>
  </template>
  
  <UpdateBanner />
</template>

