<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useIncapttaProjects } from '@/features/projects/composables/useIncapttaProjects'
import type { IncapttaProject } from '@/features/projects/types/incapttaProject.types'
import { PROJECT_CATEGORIES } from '@/features/projects/types/incapttaProject.types'
import { toast } from 'vue-sonner'

// UI Components
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Image,
  Plus,
  ExternalLink,
  Trash2,
  Star,
  Eye,
  EyeOff,
  Loader2,
  MapPin,
  Calendar
} from 'lucide-vue-next'

// Components
import ProjectFormSlideOver from '@/features/projects/components/ProjectFormSlideOver.vue'

const {
  projects,
  loading,
  fetchProjects,
  cleanup,
  togglePublished,
  toggleFeatured,
  deleteProject
} = useIncapttaProjects()

const isSlideOverOpen = ref(false)
const selectedProject = ref<IncapttaProject | null>(null)
const isDeleting = ref<string | null>(null)

onMounted(() => {
  fetchProjects()
})

onUnmounted(() => {
  cleanup()
})

function handleAddProject() {
  selectedProject.value = null
  isSlideOverOpen.value = true
}

function handleEditProject(project: IncapttaProject) {
  selectedProject.value = project
  isSlideOverOpen.value = true
}

function handleSlideOverClose() {
  isSlideOverOpen.value = false
  selectedProject.value = null
}

async function handleTogglePublished(project: IncapttaProject) {
  try {
    await togglePublished(project.id)
    toast.success(project.published ? 'Project unpublished' : 'Project published')
  } catch (err: any) {
    toast.error('Failed to update published status', { description: err.message })
  }
}

async function handleToggleFeatured(project: IncapttaProject) {
  try {
    await toggleFeatured(project.id)
    toast.success(project.featured ? 'Removed from featured' : 'Added to featured')
  } catch (err: any) {
    toast.error('Failed to update featured status', { description: err.message })
  }
}

async function handleDeleteProject(project: IncapttaProject) {
  if (project.published) {
    toast.error('Cannot delete a published project. Unpublish it first.')
    return
  }

  const confirmed = confirm(`Are you sure you want to delete "${project.title}"? This action cannot be undone.`)
  if (!confirmed) return

  isDeleting.value = project.id
  try {
    await deleteProject(project.id)
    toast.success('Project deleted successfully')
  } catch (err: any) {
    toast.error('Failed to delete project', { description: err.message })
  } finally {
    isDeleting.value = null
  }
}

function getCategoryLabel(category: string): string {
  const cat = PROJECT_CATEGORIES.find(c => c.value === category)
  return cat?.label || category
}

function getPublicProjectUrl(project: IncapttaProject): string {
  return `https://incaptta.com/#/projects/${project.id}`
}

const sortedProjects = computed(() => {
  return [...projects.value].sort((a, b) => a.sortOrder - b.sortOrder)
})
</script>

<template>
  <div class="space-y-6 p-4 md:p-6">
    <!-- Header -->
    <div class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
      <div>
        <h2 class="text-3xl font-bold tracking-tight flex items-center gap-2">
          <Image class="h-8 w-8 text-brand-primary" />
          Projects Gallery
        </h2>
        <p class="text-muted-foreground">Manage projects displayed on the public website</p>
      </div>
      <Button @click="handleAddProject" class="gap-2">
        <Plus class="h-4 w-4" />
        Add Project
      </Button>
    </div>

    <!-- Projects Grid -->
    <div v-if="loading && projects.length === 0" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      <div v-for="i in 6" :key="i">
        <Skeleton class="h-64 w-full" />
      </div>
    </div>

    <!-- Empty State -->
    <div
      v-else-if="projects.length === 0"
      class="text-center py-12 border-2 border-dashed border-muted rounded-lg"
    >
      <Image class="mx-auto h-12 w-12 text-muted-foreground/50" />
      <h3 class="mt-4 text-lg font-semibold">No projects yet</h3>
      <p class="text-muted-foreground max-w-md mx-auto mt-2">
        Add your first project to display in the public gallery.
      </p>
      <Button @click="handleAddProject" class="mt-4 gap-2">
        <Plus class="h-4 w-4" />
        Add Your First Project
      </Button>
    </div>

    <!-- Projects Cards -->
    <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      <Card
        v-for="project in sortedProjects"
        :key="project.id"
        class="overflow-hidden group"
        :class="{ 'opacity-60': !project.published }"
      >
        <!-- Cover Image -->
        <div class="aspect-video bg-muted relative overflow-hidden">
          <img
            v-if="project.images && project.images.length > 0"
            :src="project.images[project.coverImageIndex]?.url || project.images[0]?.url"
            :alt="project.title"
            class="w-full h-full object-cover"
          />
          <div v-else class="w-full h-full flex items-center justify-center bg-brand-primary/10">
            <Image class="h-12 w-12 text-brand-primary/50" />
          </div>

          <!-- Published Badge -->
          <div class="absolute top-2 left-2">
            <Badge
              :variant="project.published ? 'default' : 'secondary'"
              :class="project.published ? 'bg-green-500' : ''"
            >
              {{ project.published ? 'Published' : 'Draft' }}
            </Badge>
          </div>

          <!-- Featured Badge -->
          <div v-if="project.featured" class="absolute top-2 right-2">
            <Badge class="bg-amber-500 text-white">
              <Star class="h-3 w-3 mr-1 fill-white" />
              Featured
            </Badge>
          </div>
        </div>

        <CardContent class="p-4 space-y-3">
          <!-- Title & Client -->
          <div>
            <h3 class="font-semibold line-clamp-1">{{ project.title }}</h3>
            <p class="text-sm text-muted-foreground">{{ project.client }}</p>
          </div>

          <!-- Meta -->
          <div class="flex items-center gap-3 text-xs text-muted-foreground">
            <span class="flex items-center gap-1">
              <MapPin class="h-3 w-3" />
              {{ project.location }}
            </span>
            <span class="flex items-center gap-1">
              <Calendar class="h-3 w-3" />
              {{ project.year }}
            </span>
          </div>

          <!-- Category -->
          <Badge variant="outline" class="text-xs">
            {{ getCategoryLabel(project.category) }}
          </Badge>

          <!-- Services Preview -->
          <div v-if="project.services.length > 0" class="flex flex-wrap gap-1">
            <Badge
              v-for="service in project.services.slice(0, 2)"
              :key="service"
              variant="secondary"
              class="text-[10px]"
            >
              {{ service }}
            </Badge>
            <Badge v-if="project.services.length > 2" variant="secondary" class="text-[10px]">
              +{{ project.services.length - 2 }}
            </Badge>
          </div>

          <!-- Toggles & Actions -->
          <div class="pt-3 border-t space-y-3">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <Switch
                  :checked="project.published"
                  @update:checked="handleTogglePublished(project)"
                />
                <span class="text-sm">
                  {{ project.published ? 'Published' : 'Draft' }}
                </span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                class="h-8 w-8"
                :class="project.featured ? 'text-amber-500' : 'text-muted-foreground'"
                @click="handleToggleFeatured(project)"
              >
                <Star class="h-4 w-4" :class="{ 'fill-current': project.featured }" />
              </Button>
            </div>

            <div class="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                class="flex-1"
                @click="handleEditProject(project)"
              >
                Edit
              </Button>
              <Button
                v-if="project.published"
                variant="outline"
                size="icon"
                class="h-9 w-9 shrink-0"
                as-child
              >
                <a
                  :href="getPublicProjectUrl(project)"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalLink class="h-4 w-4" />
                </a>
              </Button>
              <Button
                variant="outline"
                size="icon"
                class="h-9 w-9 shrink-0 text-destructive hover:text-destructive"
                :disabled="isDeleting === project.id || project.published"
                @click="handleDeleteProject(project)"
              >
                <Loader2 v-if="isDeleting === project.id" class="h-4 w-4 animate-spin" />
                <Trash2 v-else class="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>

    <!-- Project Form Slide Over -->
    <ProjectFormSlideOver
      :open="isSlideOverOpen"
      :project="selectedProject"
      @update:open="handleSlideOverClose"
      @saved="handleSlideOverClose"
    />
  </div>
</template>
