<script setup lang="ts">
import { useSeo } from '@/composables/useSeo'
import { services } from '@/data/services'
import { Warehouse, Droplets, Zap, Wind, Layers, Wrench, ArrowRight } from 'lucide-vue-next'

const iconMap: Record<string, typeof Warehouse> = {
  warehouse: Warehouse,
  droplets: Droplets,
  zap: Zap,
  wind: Wind,
  layers: Layers,
  wrench: Wrench
}

useSeo({
  title: 'Poultry Equipment & Services | Incaptta Zimbabwe',
  description: 'Pan feeder systems, nipple drinkers, PVC climate control curtains, layer cages, and fowlrun construction across Zimbabwe. Trusted by Irvines, SABLE Chickens, and University of Zimbabwe.',
  keywords: ['pan feeder system Zimbabwe', 'nipple drinker installation', 'PVC curtains poultry Zimbabwe', 'layer cage installation', 'fowlrun equipment Zimbabwe'],
  canonicalPath: '/services'
})
</script>

<template>
  <div class="min-h-screen bg-surface-light pt-20">
    <!-- Header -->
    <div class="services-header">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <h1 class="services-h1">Our Services</h1>
        <p class="services-desc">
          End-to-end poultry farming solutions tailored for Zimbabwe's climate and market conditions
        </p>
      </div>
    </div>

    <!-- Services Grid -->
    <div class="py-16 lg:py-24">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="grid lg:grid-cols-2 gap-8">
          <div
            v-for="service in services"
            :key="service.id"
            class="service-card-page"
          >
            <div class="flex items-start gap-6">
              <!-- Icon -->
              <div class="service-icon-wrap-page">
                <component :is="iconMap[service.icon]" class="w-8 h-8 text-accent" />
              </div>

              <!-- Content -->
              <div>
                <span class="service-tag-page">{{ service.tag }}</span>
                <h3 class="service-title-page">{{ service.title }}</h3>
                <p class="service-desc-page">{{ service.description }}</p>
              </div>
            </div>
          </div>
        </div>

        <!-- CTA -->
        <div class="mt-16 text-center">
          <a href="/#contact" class="services-cta-btn">
            Request a Quote for Your Project
            <ArrowRight class="w-5 h-5" />
          </a>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.services-header {
  background-color: var(--c-dark);
  padding: 64px 24px 60px;
  text-align: center;
}

.services-h1 {
  font-family: 'Poppins', sans-serif;
  font-size: 40px;
  font-weight: 800;
  color: #ffffff;
  margin-bottom: 16px;
}

.services-desc {
  font-size: 18px;
  color: var(--c-muted);
  max-width: 640px;
  margin: 0 auto;
}

.service-card-page {
  background-color: #ffffff;
  border-radius: 12px;
  padding: 32px;
  border: 1px solid rgba(0,0,0,0.08);
  box-shadow: 0 2px 8px rgba(0,0,0,0.04);
  transition: all 0.3s;
}

.service-card-page:hover {
  box-shadow: 0 8px 24px rgba(0,0,0,0.1);
}

.service-icon-wrap-page {
  background-color: #FFF9E6;
  border-radius: 12px;
  width: 64px;
  height: 64px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.text-accent {
  color: var(--c-yellow);
}

.service-tag-page {
  display: inline-block;
  background-color: var(--c-tag-bg);
  color: var(--c-tag-text);
  font-size: 11px;
  font-weight: 700;
  padding: 4px 12px;
  border-radius: 20px;
  margin-bottom: 12px;
}

.service-title-page {
  font-family: 'Poppins', sans-serif;
  font-size: 20px;
  font-weight: 700;
  color: var(--c-dark);
  margin-bottom: 8px;
}

.service-desc-page {
  color: var(--c-muted-deep);
  font-size: 15px;
  line-height: 1.6;
}

.services-cta-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background-color: var(--c-green);
  color: #ffffff;
  padding: 16px 32px;
  border-radius: 8px;
  font-weight: 600;
  font-size: 16px;
  transition: background-color 0.2s;
}

.services-cta-btn:hover {
  background-color: var(--c-green-mid);
}
</style>
