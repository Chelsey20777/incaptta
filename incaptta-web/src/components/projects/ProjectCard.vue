<script setup lang="ts">
import { computed } from 'vue'
import type { IncapttaProject } from '@/composables/usePublicProjects'
import { MapPin, Calendar, ArrowRight, Image } from 'lucide-vue-next'

const props = defineProps<{
  project: IncapttaProject
}>()

const emit = defineEmits<{
  click: [project: IncapttaProject]
}>()

const coverImage = computed(() => {
  if (!props.project.images || props.project.images.length === 0) return null
  return props.project.images[props.project.coverImageIndex]?.url || props.project.images[0]?.url
})

const categoryLabels: Record<string, string> = {
  'fowlrun-construction': 'Fowlrun Construction',
  'equipment-installation': 'Equipment Installation',
  'climate-control': 'Climate Control',
  'large-scale': 'Large Scale',
  'government': 'Government',
  'rehabilitation': 'Rehabilitation'
}

function handleClick() {
  emit('click', props.project)
}
</script>

<template>
  <div
    class="group bg-white rounded-xl overflow-hidden shadow-md hover:shadow-xl transition-all duration-300 cursor-pointer border border-gray-100"
    @click="handleClick"
  >
    <!-- Cover Image -->
    <div class="aspect-[4/3] bg-primary relative overflow-hidden">
      <img
        v-if="coverImage"
        :src="coverImage"
        :alt="project.title"
        class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
      />
      <div v-else class="w-full h-full flex items-center justify-center bg-primary">
        <Image class="h-16 w-16 text-white/30" />
      </div>

      <!-- Category Badge -->
      <div class="absolute top-3 left-3">
        <span class="bg-accent text-surface-dark text-xs font-bold px-2 py-1 rounded">
          {{ categoryLabels[project.category] || project.category }}
        </span>
      </div>

      <!-- Capacity Badge (if present) -->
      <div v-if="project.capacity" class="absolute bottom-3 left-3">
        <span class="bg-white/90 text-text-dark text-xs font-medium px-2 py-1 rounded">
          {{ project.capacity }}
        </span>
      </div>
    </div>

    <!-- Content -->
    <div class="p-4">
      <!-- Client -->
      <p class="text-accent text-sm font-semibold mb-1">
        {{ project.client }}
      </p>

      <!-- Title -->
      <h3 class="text-text-dark font-bold text-lg mb-2 line-clamp-2 group-hover:text-primary transition-colors">
        {{ project.title }}
      </h3>

      <!-- Meta -->
      <div class="flex items-center gap-3 text-text-muted text-sm mb-3">
        <span class="flex items-center gap-1">
          <MapPin class="h-3.5 w-3.5" />
          {{ project.location }}
        </span>
        <span class="flex items-center gap-1">
          <Calendar class="h-3.5 w-3.5" />
          {{ project.year }}
        </span>
      </div>

      <!-- Services -->
      <div v-if="project.services.length > 0" class="flex flex-wrap gap-1.5 mb-4">
        <span
          v-for="service in project.services.slice(0, 3)"
          :key="service"
          class="bg-surface-light text-text-dark text-[10px] px-2 py-0.5 rounded-full"
        >
          {{ service }}
        </span>
        <span v-if="project.services.length > 3" class="text-text-muted text-[10px]">
          +{{ project.services.length - 3 }}
        </span>
      </div>

      <!-- View Details -->
      <button class="flex items-center gap-1 text-primary text-sm font-medium hover:gap-2 transition-all">
        View Details
        <ArrowRight class="h-4 w-4" />
      </button>
    </div>
  </div>
</template>
