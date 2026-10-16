<script setup lang="ts">
import { Warehouse, Droplets, Zap, Wind, Layers, Wrench } from 'lucide-vue-next'
import { services } from '@/data/services'

const iconMap: Record<string, typeof Warehouse> = {
  warehouse: Warehouse,
  droplets: Droplets,
  zap: Zap,
  wind: Wind,
  layers: Layers,
  wrench: Wrench
}
</script>

<template>
  <section id="services" class="services-section py-20 lg:py-28">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <!-- Section Header -->
      <div class="text-center mb-16">
        <h2 class="section-title">
          What We Build & Install
        </h2>
        <p class="section-subtitle">
          End-to-end poultry farming solutions
        </p>
      </div>

      <!-- Services Grid -->
      <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
        <div
          v-for="service in services"
          :key="service.id"
          class="service-card"
        >
          <!-- Tag Badge -->
          <span class="service-tag">
            {{ service.tag }}
          </span>

          <!-- Icon -->
          <div class="service-icon-wrap">
            <component
              :is="iconMap[service.icon]"
              class="w-6 h-6 text-accent"
            />
          </div>

          <!-- Title -->
          <h3 class="service-title">
            {{ service.title }}
          </h3>

          <!-- Description -->
          <p class="service-desc">
            {{ service.description }}
          </p>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.services-section {
  background-color: var(--c-light-bg);
}

.section-title {
  font-family: 'Poppins', sans-serif;
  font-size: 32px;
  font-weight: 700;
  color: var(--c-dark);
  margin-bottom: 16px;
}

.section-subtitle {
  font-size: 18px;
  color: var(--c-muted-deep);
}

.service-card {
  background-color: #ffffff;
  border: 0.5px solid rgba(0,0,0,0.08);
  border-left: 3px solid var(--c-green);
  border-radius: 10px;
  padding: 20px;
  border-top-left-radius: 0;
  border-bottom-left-radius: 0;
  transition: all 0.3s;
}

.service-card:hover {
  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
  border-left-color: var(--c-yellow);
}

.service-icon-wrap {
  background-color: #FFF9E6;
  border-radius: 8px;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 12px;
}

.text-accent {
  color: var(--c-yellow);
}

.service-tag {
  background-color: var(--c-tag-bg);
  color: var(--c-tag-text);
  font-size: 10px;
  font-weight: 700;
  padding: 3px 8px;
  border-radius: 10px;
  display: inline-block;
  margin-bottom: 12px;
}

.service-title {
  font-family: 'Poppins', sans-serif;
  font-weight: 700;
  font-size: 17px;
  margin-bottom: 8px;
  color: var(--c-dark);
}

.service-desc {
  color: var(--c-muted-deep);
  font-size: 14px;
  line-height: 1.6;
}
</style>
