<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { IncapttaProject } from '@/composables/usePublicProjects'
import {
  X,
  MapPin,
  Calendar,
  Building2,
  Maximize2,
  ChevronLeft,
  ChevronRight,
  Image as ImageIcon
} from 'lucide-vue-next'

const props = defineProps<{
  project: IncapttaProject | null
}>()

const emit = defineEmits<{
  close: []
}>()

const currentImageIndex = ref(0)

// Reset image index when project changes
watch(
  () => props.project,
  () => {
    currentImageIndex.value = 0
  }
)

const hasImages = computed(() => {
  return props.project?.images && props.project.images.length > 0
})

const currentImage = computed(() => {
  if (!hasImages.value || !props.project) return null
  return props.project.images[currentImageIndex.value]?.url || null
})

const categoryLabels: Record<string, string> = {
  'fowlrun-construction': 'Fowlrun Construction',
  'equipment-installation': 'Equipment Installation',
  'climate-control': 'Climate Control',
  'large-scale': 'Large Scale',
  'government': 'Government',
  'rehabilitation': 'Rehabilitation'
}

function handleClose() {
  emit('close')
}

function nextImage() {
  if (!props.project?.images.length) return
  currentImageIndex.value = (currentImageIndex.value + 1) % props.project.images.length
}

function prevImage() {
  if (!props.project?.images.length) return
  currentImageIndex.value = (currentImageIndex.value - 1 + props.project.images.length) % props.project.images.length
}

function selectImage(index: number) {
  currentImageIndex.value = index
}
</script>

<template>
  <!-- Modal Overlay -->
  <div
    v-if="project"
    class="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 lg:p-8"
    @click.self="handleClose"
  >
    <!-- Backdrop -->
    <div class="absolute inset-0 bg-black/80 backdrop-blur-sm" @click="handleClose" />

    <!-- Modal Content -->
    <div
      class="relative w-full max-w-5xl max-h-[90vh] bg-white rounded-2xl overflow-hidden shadow-2xl flex flex-col md:flex-row"
      @click.stop
    >
      <!-- Close Button -->
      <button
        class="absolute top-4 right-4 z-10 p-2 bg-white/90 hover:bg-white rounded-full shadow-lg transition-colors"
        @click="handleClose"
      >
        <X class="h-5 w-5 text-text-dark" />
      </button>

      <!-- Image Gallery (Left/Center Side) -->
      <div class="w-full md:w-1/2 bg-surface-dark flex flex-col">
        <!-- Main Image -->
        <div class="flex-1 flex items-center justify-center p-4 relative min-h-[300px] md:min-h-0">
          <img
            v-if="currentImage"
            :src="currentImage"
            :alt="project.title"
            class="max-w-full max-h-full object-contain rounded-lg"
          />
          <div v-else class="text-white/50 flex flex-col items-center">
            <ImageIcon class="h-16 w-16 mb-2" />
            <p>No images available</p>
          </div>

          <!-- Navigation Arrows -->
          <button
            v-if="hasImages && project.images.length > 1"
            class="absolute left-4 p-2 bg-white/20 hover:bg-white/40 rounded-full text-white transition-colors"
            @click="prevImage"
          >
            <ChevronLeft class="h-6 w-6" />
          </button>
          <button
            v-if="hasImages && project.images.length > 1"
            class="absolute right-4 p-2 bg-white/20 hover:bg-white/40 rounded-full text-white transition-colors"
            @click="nextImage"
          >
            <ChevronRight class="h-6 w-6" />
          </button>
        </div>

        <!-- Thumbnails -->
        <div
          v-if="hasImages && project.images.length > 1"
          class="p-4 border-t border-white/10 flex gap-2 overflow-x-auto"
        >
          <button
            v-for="(image, index) in project.images"
            :key="image.url"
            class="flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 transition-colors"
            :class="index === currentImageIndex ? 'border-accent' : 'border-transparent opacity-60 hover:opacity-100'"
            @click="selectImage(index)"
          >
            <img :src="image.url" alt="" class="w-full h-full object-cover" />
          </button>
        </div>
      </div>

      <!-- Details (Right Side) -->
      <div class="w-full md:w-1/2 p-6 md:p-8 overflow-y-auto max-h-[50vh] md:max-h-[90vh]">
        <!-- Category -->
        <span class="inline-block bg-accent text-surface-dark text-xs font-bold px-3 py-1 rounded mb-4">
          {{ categoryLabels[project.category] || project.category }}
        </span>

        <!-- Title -->
        <h2 class="text-2xl md:text-3xl font-heading font-bold text-text-dark mb-2">
          {{ project.title }}
        </h2>

        <!-- Client -->
        <p class="text-primary font-semibold text-lg mb-4">
          {{ project.client }}
        </p>

        <!-- Meta Info -->
        <div class="flex flex-wrap gap-4 text-text-muted text-sm mb-6">
          <span class="flex items-center gap-1">
            <MapPin class="h-4 w-4" />
            {{ project.location }}
          </span>
          <span class="flex items-center gap-1">
            <Calendar class="h-4 w-4" />
            {{ project.year }}
          </span>
          <span v-if="project.capacity" class="flex items-center gap-1">
            <Building2 class="h-4 w-4" />
            {{ project.capacity }}
          </span>
          <span v-if="project.structureSize" class="flex items-center gap-1">
            <Maximize2 class="h-4 w-4" />
            {{ project.structureSize }}
          </span>
        </div>

        <!-- Description -->
        <div class="mb-6">
          <h3 class="text-sm font-semibold text-text-muted uppercase tracking-wider mb-2">Description</h3>
          <p class="text-text-dark leading-relaxed whitespace-pre-line">
            {{ project.description }}
          </p>
        </div>

        <!-- Services -->
        <div v-if="project.services.length > 0" class="mb-6">
          <h3 class="text-sm font-semibold text-text-muted uppercase tracking-wider mb-3">Services Provided</h3>
          <div class="flex flex-wrap gap-2">
            <span
              v-for="service in project.services"
              :key="service"
              class="bg-primary/10 text-primary text-sm px-3 py-1 rounded-full"
            >
              {{ service }}
            </span>
          </div>
        </div>

        <!-- Tags -->
        <div v-if="project.tags.length > 0" class="mb-6">
          <h3 class="text-sm font-semibold text-text-muted uppercase tracking-wider mb-3">Tags</h3>
          <div class="flex flex-wrap gap-2">
            <span
              v-for="tag in project.tags"
              :key="tag"
              class="bg-surface-light text-text-dark text-xs px-2 py-1 rounded"
            >
              {{ tag }}
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
