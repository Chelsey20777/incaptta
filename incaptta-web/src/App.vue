<script setup lang="ts">
import { RouterView } from 'vue-router'
import NavBar from '@/components/layout/NavBar.vue'
import Footer from '@/components/layout/Footer.vue'
</script>

<template>
  <div class="min-h-screen app-wrapper">
    <NavBar />
    <main>
      <RouterView />
    </main>
    <Footer />
  </div>
</template>

<style scoped>
.app-wrapper {
  background-color: #ffffff;
}
</style>
