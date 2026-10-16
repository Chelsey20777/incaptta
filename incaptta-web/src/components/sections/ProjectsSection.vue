<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'
import { MapPin, Calendar, Image } from 'lucide-vue-next'
import { usePublicProjects } from '@/composables/usePublicProjects'
import { projects as staticProjects } from '@/data/projects'

const { featuredProjects, loading, fetchFeaturedProjects, cleanup } = usePublicProjects()

// Fetch featured projects on mount
onMounted(() => {
  fetchFeaturedProjects()
})

onUnmounted(() => {
  cleanup()
})

// Use Firestore projects if available, otherwise fall back to static data
const displayProjects = computed(() => {
  if (featuredProjects.value.length > 0) {
    // Map Firestore projects to the format expected by the template
    return featuredProjects.value.slice(0, 4).map(p => ({
      id: p.id,
      client: p.client,
      title: p.title,
      description: p.description,
      tags: p.tags,
      location: p.location,
      year: p.year,
      // Use cover image if available
      hasImage: p.images && p.images.length > 0,
      coverImage: p.images && p.images.length > 0
        ? (p.images[p.coverImageIndex]?.url || p.images[0]?.url)
        : null
    }))
  }
  // Fallback to static projects (limit to 4)
  return staticProjects.slice(0, 4).map(p => ({
    ...p,
    hasImage: false,
    coverImage: null
  }))
})

</script>

<template>
  <section id="projects" class="projects-section py-20 lg:py-28">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <!-- Section Header -->
      <div class="text-center mb-16">
        <h2 class="section-title">
          Projects We're Proud Of
        </h2>
        <p class="section-subtitle">
          Trusted by Zimbabwe's largest poultry operations
        </p>
      </div>

      <!-- Loading State -->
      <div v-if="loading && featuredProjects.length === 0" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div v-for="i in 4" :key="i" class="project-card-placeholder">
          <div class="aspect-video bg-gray-700 animate-pulse" />
          <div class="p-6 space-y-3">
            <div class="h-4 bg-gray-700 rounded animate-pulse w-1/3" />
            <div class="h-6 bg-gray-700 rounded animate-pulse" />
            <div class="h-4 bg-gray-700 rounded animate-pulse w-2/3" />
          </div>
        </div>
      </div>

      <!-- Projects Grid -->
      <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div
          v-for="project in displayProjects"
          :key="project.id"
          class="project-card"
        >
          <!-- Image/Placeholder -->
          <div class="aspect-video project-image-area relative overflow-hidden">
            <img
              v-if="project.hasImage && project.coverImage"
              :src="project.coverImage"
              :alt="project.title"
              class="w-full h-full object-cover"
            />
            <div v-else class="w-full h-full flex items-center justify-center">
              <div class="text-center">
                <div class="w-16 h-16 bg-white/10 rounded-full flex items-center justify-center mx-auto mb-2">
                  <Image class="w-8 h-8 text-white/50" />
                </div>
                <p class="text-white/40 text-sm">Project Photo</p>
              </div>
            </div>
          </div>

          <!-- Content -->
          <div class="p-6">
            <!-- Client Name -->
            <p class="project-client">
              {{ project.client }}
            </p>

            <!-- Title -->
            <h3 class="project-title line-clamp-2">
              {{ project.title }}
            </h3>

            <!-- Description -->
            <p class="project-desc line-clamp-3">
              {{ project.description }}
            </p>

            <!-- Tags -->
            <div class="flex flex-wrap gap-2 mb-4">
              <span
                v-for="tag in project.tags.slice(0, 3)"
                :key="tag"
                class="project-tag"
              >
                {{ tag }}
              </span>
              <span v-if="project.tags.length > 3" class="project-tag-more">
                +{{ project.tags.length - 3 }}
              </span>
            </div>

            <!-- Meta -->
            <div class="flex items-center gap-4 project-meta">
              <span class="flex items-center gap-1">
                <MapPin class="w-3 h-3" />
                {{ project.location }}
              </span>
              <span class="flex items-center gap-1">
                <Calendar class="w-3 h-3" />
                {{ project.year }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.projects-section {
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

.project-card-placeholder {
  background-color: var(--c-dark);
  border-radius: 12px;
  overflow: hidden;
}

.project-card {
  background-color: var(--c-dark);
  border: 1px solid rgba(249,168,37,0.15);
  border-radius: 12px;
  overflow: hidden;
  transition: box-shadow 0.3s;
}

.project-card:hover {
  box-shadow: 0 8px 24px rgba(0,0,0,0.2);
}

.project-image-area {
  background-color: var(--c-green);
}

.project-client {
  color: var(--c-yellow);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 1px;
  text-transform: uppercase;
  margin-bottom: 6px;
}

.project-title {
  color: #ffffff;
  font-family: 'Poppins', sans-serif;
  font-size: 17px;
  font-weight: 700;
  margin-bottom: 8px;
  line-height: 1.3;
}

.project-desc {
  color: var(--c-muted);
  font-size: 13px;
  line-height: 1.6;
  margin-bottom: 12px;
}

.project-tag {
  background-color: rgba(255,255,255,0.08);
  color: var(--c-light-text);
  font-size: 10px;
  padding: 3px 8px;
  border-radius: 10px;
}

.project-tag-more {
  color: var(--c-muted-deep);
  font-size: 10px;
}

.project-meta {
  color: var(--c-muted-deep);
  font-size: 11px;
}

.line-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.line-clamp-3 {
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
