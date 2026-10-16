<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useSeo } from '@/composables/useSeo'
import { usePublicProjects, type IncapttaProject } from '@/composables/usePublicProjects'
import { Image } from 'lucide-vue-next'

// Components
import ProjectCard from '@/components/projects/ProjectCard.vue'
import ProjectDetailModal from '@/components/projects/ProjectDetailModal.vue'

useSeo({
  title: 'Poultry Farm Projects Portfolio | Incaptta Zimbabwe',
  description: 'See Incaptta\'s completed projects: 60,000 bird UZ facility, 40,000 bird SABLE site, Irvines Zimbabwe installations, and Command Agriculture fowlruns.',
  keywords: ['poultry farm construction portfolio Zimbabwe', 'fowlrun projects', 'University Zimbabwe broiler project', 'SABLE chickens fowlrun'],
  canonicalPath: '/projects'
})

const { publishedProjects, loading, fetchPublishedProjects, cleanup } = usePublicProjects()

const selectedProject = ref<IncapttaProject | null>(null)
const selectedCategory = ref<string>('all')

// Fetch projects on mount
onMounted(() => {
  fetchPublishedProjects()
})

onUnmounted(() => {
  cleanup()
})

// Category options
const categories = [
  { value: 'all', label: 'All Projects' },
  { value: 'fowlrun-construction', label: 'Fowlrun Construction' },
  { value: 'equipment-installation', label: 'Equipment Installation' },
  { value: 'climate-control', label: 'Climate Control' },
  { value: 'large-scale', label: 'Large Scale' },
  { value: 'government', label: 'Government' },
  { value: 'rehabilitation', label: 'Rehabilitation' }
]

// Filtered projects
const filteredProjects = computed(() => {
  if (selectedCategory.value === 'all') {
    return publishedProjects.value
  }
  return publishedProjects.value.filter(p => p.category === selectedCategory.value)
})

function handleProjectClick(project: IncapttaProject) {
  selectedProject.value = project
}

function handleCloseModal() {
  selectedProject.value = null
}
</script>

<template>
  <div class="min-h-screen bg-surface-light pt-20">
    <!-- Header -->
    <div class="bg-primary py-12 lg:py-16">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="flex items-center gap-3 mb-4">
          <Image class="w-6 h-6 text-accent" />
          <span class="text-sm font-semibold tracking-wider text-accent uppercase">
            Our Portfolio
          </span>
        </div>
        <h1 class="text-3xl sm:text-4xl lg:text-5xl font-heading font-bold text-white mb-4">
          Projects We're Proud Of
        </h1>
        <p class="text-lg text-white/80 max-w-2xl">
          Trusted by Zimbabwe's largest poultry operations
        </p>
      </div>
    </div>

    <!-- Main Content -->
    <div class="py-12 lg:py-16">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <!-- Category Filter -->
        <div class="flex flex-wrap gap-2 mb-10">
          <button
            v-for="category in categories"
            :key="category.value"
            @click="selectedCategory = category.value"
            :class="[
              'px-4 py-2 rounded-full text-sm font-medium transition-colors',
              selectedCategory === category.value
                ? 'bg-primary text-white'
                : 'bg-white text-text-dark border border-gray-200 hover:border-primary hover:bg-primary/5'
            ]"
          >
            {{ category.label }}
          </button>
        </div>

        <!-- Loading State -->
        <div v-if="loading && publishedProjects.length === 0" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div v-for="i in 6" :key="i" class="bg-white rounded-xl overflow-hidden shadow-md">
            <div class="aspect-[4/3] bg-gray-200 animate-pulse" />
            <div class="p-4 space-y-3">
              <div class="h-4 bg-gray-200 rounded animate-pulse w-1/3" />
              <div class="h-6 bg-gray-200 rounded animate-pulse" />
              <div class="h-4 bg-gray-200 rounded animate-pulse w-2/3" />
            </div>
          </div>
        </div>

        <!-- Empty State -->
        <div
          v-else-if="filteredProjects.length === 0"
          class="text-center py-16"
        >
          <Image class="mx-auto h-12 w-12 text-text-muted/50" />
          <h3 class="mt-4 text-lg font-semibold text-text-dark">No projects found</h3>
          <p class="text-text-muted mt-2">
            {{ selectedCategory === 'all' ? 'No projects available at the moment.' : 'No projects in this category.' }}
          </p>
        </div>

        <!-- Projects Grid -->
        <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <ProjectCard
            v-for="project in filteredProjects"
            :key="project.id"
            :project="project"
            @click="handleProjectClick"
          />
        </div>
      </div>
    </div>

    <!-- Project Detail Modal -->
    <ProjectDetailModal
      :project="selectedProject"
      @close="handleCloseModal"
    />
  </div>
</template>
