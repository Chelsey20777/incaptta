<script setup lang="ts">
import { useSeo } from '@/composables/useSeo'
import HeroSection from '@/components/sections/HeroSection.vue'
import ServicesSection from '@/components/sections/ServicesSection.vue'
import ProjectsSection from '@/components/sections/ProjectsSection.vue'
import TestimonialsSection from '@/components/sections/TestimonialsSection.vue'
import StatsSection from '@/components/sections/StatsSection.vue'
import CtaSection from '@/components/sections/CtaSection.vue'
import StructuredData from '@/components/seo/StructuredData.vue'

useSeo({
  title: 'Incaptta Agri-Structures | Fowlrun Construction Zimbabwe',
  description: 'Zimbabwe\'s leading agri-structures company. We design and build high-performance fowlruns, install automated feeding & drinking systems, and deliver complete poultry farming solutions.',
  keywords: ['fowlrun construction Zimbabwe', 'poultry structures Zimbabwe', 'agri-structures Harare', 'chicken house construction Zimbabwe', 'nipple drinker installation Zimbabwe', 'pan feeder system Zimbabwe', 'Incaptta'],
  canonicalPath: '/'
})
</script>

<template>
  <div class="min-h-screen bg-surface-light">
    <StructuredData type="localBusiness" />
    <HeroSection />
    <ServicesSection />
    <ProjectsSection />
    <TestimonialsSection />
    <StatsSection />
    <CtaSection />
  </div>
</template>
