<script setup lang="ts">
import { ref, reactive, watch, computed } from 'vue'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter
} from '@/components/ui/sheet'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  X,
  Upload,
  Image as ImageIcon,
  Star,
  Loader2,
  Check,
  ExternalLink
} from 'lucide-vue-next'
import { useIncapttaProjects } from '../composables/useIncapttaProjects'
import type { IncapttaProject, ProjectFormData } from '../types/incapttaProject.types'
import { PROJECT_CATEGORIES } from '../types/incapttaProject.types'
import { toast } from 'vue-sonner'

const props = defineProps<{
  open: boolean
  project: IncapttaProject | null
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  saved: []
}>()

const {
  uploadProjectImage,
  setCoverImage,
  uploadProgress,
  createProject,
  updateProject
} = useIncapttaProjects()

const isSubmitting = ref(false)
const isUploading = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)

const form = reactive<ProjectFormData>({
  title: '',
  client: '',
  location: '',
  year: new Date().getFullYear().toString(),
  description: '',
  category: 'fowlrun-construction',
  tags: [],
  capacity: null,
  structureSize: null,
  services: [],
  featured: false,
  published: false,
  sortOrder: 0
})

const tagInput = ref('')
const serviceInput = ref('')
const currentImages = ref<{ url: string; caption: string | null }[]>([])

// Watch for project prop changes to populate form
watch(
  () => props.project,
  (project) => {
    if (project) {
      form.title = project.title
      form.client = project.client
      form.location = project.location
      form.year = project.year
      form.description = project.description
      form.category = project.category
      form.tags = [...project.tags]
      form.capacity = project.capacity
      form.structureSize = project.structureSize
      form.services = [...project.services]
      form.featured = project.featured
      form.published = project.published
      form.sortOrder = project.sortOrder
      currentImages.value = [...project.images]
    } else {
      // Reset form
      form.title = ''
      form.client = ''
      form.location = ''
      form.year = new Date().getFullYear().toString()
      form.description = ''
      form.category = 'fowlrun-construction'
      form.tags = []
      form.capacity = null
      form.structureSize = null
      form.services = []
      form.featured = false
      form.published = false
      form.sortOrder = 0
      currentImages.value = []
    }
    tagInput.value = ''
    serviceInput.value = ''
  },
  { immediate: true }
)

const isEditing = computed(() => !!props.project)

function validateForm(): boolean {
  if (!form.title.trim()) {
    toast.error('Title is required')
    return false
  }
  if (!form.client.trim()) {
    toast.error('Client is required')
    return false
  }
  if (!form.location.trim()) {
    toast.error('Location is required')
    return false
  }
  if (!form.year.trim()) {
    toast.error('Year is required')
    return false
  }
  if (!form.description.trim()) {
    toast.error('Description is required')
    return false
  }
  return true
}

async function handleSubmit() {
  if (!validateForm()) return

  isSubmitting.value = true
  try {
    if (props.project) {
      await updateProject(props.project.id, { ...form })
      toast.success('Project updated successfully')
    } else {
      await createProject({ ...form })
      toast.success('Project created successfully')
    }
    emit('saved')
    emit('update:open', false)
  } catch (err: any) {
    toast.error('Failed to save project', { description: err.message })
  } finally {
    isSubmitting.value = false
  }
}

function handleCancel() {
  emit('update:open', false)
}

function handleFileSelect(event: Event) {
  const target = event.target as HTMLInputElement
  const files = target.files
  if (!files || files.length === 0) return

  // Limit to 10 images total
  const totalImages = currentImages.value.length + files.length
  if (totalImages > 10) {
    toast.error('Maximum 10 images allowed per project')
    return
  }

  // Upload each file
  Array.from(files).forEach(async (file) => {
    if (!props.project) {
      toast.error('Please save the project first before uploading images')
      return
    }

    isUploading.value = true
    try {
      await uploadProjectImage(props.project.id, file, null)
      toast.success('Image uploaded successfully')
    } catch (err: any) {
      toast.error('Failed to upload image', { description: err.message })
    } finally {
      isUploading.value = false
    }
  })

  // Clear input
  target.value = ''
}

async function handleSetCover(index: number) {
  if (!props.project) return
  try {
    await setCoverImage(props.project.id, index)
    toast.success('Cover image updated')
  } catch (err: any) {
    toast.error('Failed to set cover image', { description: err.message })
  }
}

function addTag() {
  const tag = tagInput.value.trim()
  if (tag && !form.tags.includes(tag)) {
    form.tags.push(tag)
    tagInput.value = ''
  }
}

function removeTag(tag: string) {
  form.tags = form.tags.filter(t => t !== tag)
}

function addService() {
  const service = serviceInput.value.trim()
  if (service && !form.services.includes(service)) {
    form.services.push(service)
    serviceInput.value = ''
  }
}

function removeService(service: string) {
  form.services = form.services.filter(s => s !== service)
}

function handleTagKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    e.preventDefault()
    addTag()
  }
}

function handleServiceKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    e.preventDefault()
    addService()
  }
}

const publicProjectUrl = computed(() => {
  if (!props.project) return '#'
  return `https://incaptta.com/#/projects/${props.project.id}`
})
</script>

<template>
  <Sheet :open="open" @update:open="emit('update:open', $event)">
    <SheetContent side="right" class="w-full sm:max-w-2xl overflow-hidden flex flex-col p-0">
      <SheetHeader class="px-6 py-4 border-b shrink-0">
        <SheetTitle>{{ isEditing ? 'Edit Project' : 'Add New Project' }}</SheetTitle>
        <SheetDescription>
          {{ isEditing ? 'Update project details and images' : 'Create a new project for the gallery' }}
        </SheetDescription>
      </SheetHeader>

      <ScrollArea class="flex-1">
        <div class="px-6 py-4 space-y-6">
          <!-- Basic Info -->
          <div class="space-y-4">
            <h3 class="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Basic Information</h3>

            <div class="space-y-2">
              <Label for="title">Title *</Label>
              <Input id="title" v-model="form.title" placeholder="Project title..." />
            </div>

            <div class="grid grid-cols-2 gap-4">
              <div class="space-y-2">
                <Label for="client">Client *</Label>
                <Input id="client" v-model="form.client" placeholder="Client name..." />
              </div>
              <div class="space-y-2">
                <Label for="location">Location *</Label>
                <Input id="location" v-model="form.location" placeholder="City, Country..." />
              </div>
            </div>

            <div class="grid grid-cols-2 gap-4">
              <div class="space-y-2">
                <Label for="year">Year *</Label>
                <Input id="year" v-model="form.year" placeholder="2024" />
              </div>
              <div class="space-y-2">
                <Label for="category">Category *</Label>
                <Select v-model="form.category">
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem v-for="cat in PROJECT_CATEGORIES" :key="cat.value" :value="cat.value">
                      {{ cat.label }}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div class="space-y-2">
              <Label for="description">Description *</Label>
              <Textarea id="description" v-model="form.description" rows="4" placeholder="Project description..." />
            </div>
          </div>

          <!-- Structure Details -->
          <div class="space-y-4">
            <h3 class="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Structure Details</h3>

            <div class="grid grid-cols-2 gap-4">
              <div class="space-y-2">
                <Label for="capacity">Capacity (optional)</Label>
                <Input id="capacity" :model-value="form.capacity ?? ''" @update:model-value="(v: string | number) => form.capacity = v ? String(v) : null" placeholder="e.g. 40,000 birds" />
              </div>
              <div class="space-y-2">
                <Label for="structureSize">Structure Size (optional)</Label>
                <Input id="structureSize" :model-value="form.structureSize ?? ''" @update:model-value="(v: string | number) => form.structureSize = v ? String(v) : null" placeholder="e.g. 126m × 14m" />
              </div>
            </div>
          </div>

          <!-- Services -->
          <div class="space-y-4">
            <h3 class="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Services</h3>

            <div class="space-y-2">
              <Label>Add Service</Label>
              <div class="flex gap-2">
                <Input
                  v-model="serviceInput"
                  placeholder="Type service and press Enter..."
                  @keydown="handleServiceKeydown"
                />
                <Button type="button" variant="secondary" @click="addService">Add</Button>
              </div>
            </div>

            <div class="flex flex-wrap gap-2">
              <Badge
                v-for="service in form.services"
                :key="service"
                variant="secondary"
                class="cursor-pointer hover:bg-destructive hover:text-destructive-foreground"
                @click="removeService(service)"
              >
                {{ service }}
                <X class="ml-1 h-3 w-3" />
              </Badge>
            </div>
          </div>

          <!-- Tags -->
          <div class="space-y-4">
            <h3 class="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Tags</h3>

            <div class="space-y-2">
              <Label>Add Tag</Label>
              <div class="flex gap-2">
                <Input
                  v-model="tagInput"
                  placeholder="Type tag and press Enter..."
                  @keydown="handleTagKeydown"
                />
                <Button type="button" variant="secondary" @click="addTag">Add</Button>
              </div>
            </div>

            <div class="flex flex-wrap gap-2">
              <Badge
                v-for="tag in form.tags"
                :key="tag"
                variant="outline"
                class="cursor-pointer hover:bg-destructive hover:text-destructive-foreground"
                @click="removeTag(tag)"
              >
                {{ tag }}
                <X class="ml-1 h-3 w-3" />
              </Badge>
            </div>
          </div>

          <!-- Settings -->
          <div class="space-y-4">
            <h3 class="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Settings</h3>

            <div class="space-y-4 p-4 bg-muted/50 rounded-lg">
              <div class="flex items-center justify-between">
                <div>
                  <Label class="font-medium">Published</Label>
                  <p class="text-sm text-muted-foreground">Show on public website</p>
                </div>
                <Switch v-model:checked="form.published" />
              </div>

              <div class="flex items-center justify-between">
                <div>
                  <Label class="font-medium">Featured</Label>
                  <p class="text-sm text-muted-foreground">Show on homepage</p>
                </div>
                <Switch v-model:checked="form.featured" />
              </div>

              <div class="space-y-2">
                <Label for="sortOrder">Sort Order</Label>
                <Input id="sortOrder" v-model.number="form.sortOrder" type="number" min="0" />
                <p class="text-xs text-muted-foreground">Lower numbers appear first</p>
              </div>
            </div>
          </div>

          <!-- Images (only for existing projects) -->
          <div v-if="isEditing" class="space-y-4">
            <h3 class="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
              <ImageIcon class="h-4 w-4" />
              Images
            </h3>

            <!-- Upload Button -->
            <div class="space-y-2">
              <input
                ref="fileInput"
                type="file"
                accept="image/*"
                multiple
                class="hidden"
                @change="handleFileSelect"
              />
              <Button
                type="button"
                variant="outline"
                class="w-full"
                @click="fileInput?.click()"
                :disabled="isUploading || currentImages.length >= 10"
              >
                <Upload class="mr-2 h-4 w-4" />
                Upload Images ({{ currentImages.length }}/10)
              </Button>

              <!-- Upload Progress -->
              <div v-if="isUploading" class="space-y-1">
                <Progress :value="uploadProgress" />
                <p class="text-xs text-muted-foreground text-center">{{ uploadProgress }}%</p>
              </div>
            </div>

            <!-- Image Thumbnails -->
            <div v-if="currentImages.length > 0" class="grid grid-cols-3 gap-2">
              <div
                v-for="(image, index) in currentImages"
                :key="image.url"
                class="relative aspect-square rounded-lg overflow-hidden border group"
                :class="{ 'ring-2 ring-brand-primary': project && index === project.coverImageIndex }"
              >
                <img :src="image.url" alt="" class="w-full h-full object-cover" />

                <!-- Cover indicator -->
                <div
                  v-if="project && index === project.coverImageIndex"
                  class="absolute top-1 left-1 bg-brand-primary text-white text-[10px] px-1.5 py-0.5 rounded"
                >
                  Cover
                </div>

                <!-- Hover actions -->
                <div class="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    class="h-8 w-8 text-white hover:text-white hover:bg-white/20"
                    :disabled="project && index === project.coverImageIndex"
                    @click="handleSetCover(index)"
                    title="Set as cover"
                  >
                    <Star class="h-4 w-4" :class="{ 'fill-yellow-400': project && index === project.coverImageIndex }" />
                  </Button>
                </div>
              </div>
            </div>
          </div>

          <!-- View on Site Link -->
          <div v-if="isEditing && form.published" class="pt-4 border-t">
            <a
              :href="publicProjectUrl"
              target="_blank"
              rel="noopener noreferrer"
              class="flex items-center gap-2 text-sm text-brand-primary hover:underline"
            >
              <ExternalLink class="h-4 w-4" />
              View on public site
            </a>
          </div>
        </div>
      </ScrollArea>

      <SheetFooter class="px-6 py-4 border-t shrink-0 gap-2">
        <Button variant="outline" @click="handleCancel" :disabled="isSubmitting || isUploading">
          Cancel
        </Button>
        <Button @click="handleSubmit" :disabled="isSubmitting || isUploading">
          <Loader2 v-if="isSubmitting" class="mr-2 h-4 w-4 animate-spin" />
          <Check v-else class="mr-2 h-4 w-4" />
          {{ isEditing ? 'Update Project' : 'Create Project' }}
        </Button>
      </SheetFooter>
    </SheetContent>
  </Sheet>
</template>
