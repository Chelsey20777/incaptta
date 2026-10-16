import { ref } from 'vue'
import { db } from '@/firebase'
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot
} from 'firebase/firestore'
import type { Timestamp } from 'firebase/firestore'

export type ProjectCategory =
  | 'fowlrun-construction'
  | 'equipment-installation'
  | 'climate-control'
  | 'large-scale'
  | 'government'
  | 'rehabilitation'

export interface ProjectImage {
  url: string
  caption: string | null
}

export interface IncapttaProject {
  id: string
  title: string
  client: string
  location: string
  year: string
  description: string
  category: ProjectCategory
  tags: string[]
  capacity: string | null
  structureSize: string | null
  services: string[]
  images: ProjectImage[]
  coverImageIndex: number
  featured: boolean
  published: boolean
  sortOrder: number
  createdAt: Timestamp
  updatedAt: Timestamp
}

const PROJECTS_LIMIT = 50
const FEATURED_LIMIT = 6

export function usePublicProjects() {
  const publishedProjects = ref<IncapttaProject[]>([])
  const featuredProjects = ref<IncapttaProject[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  let publishedUnsubscribe: (() => void) | null = null
  let featuredUnsubscribe: (() => void) | null = null

  // Fetch published projects
  function fetchPublishedProjects(): void {
    loading.value = true
    error.value = null

    if (publishedUnsubscribe) {
      publishedUnsubscribe()
      publishedUnsubscribe = null
    }

    try {
      const projectsRef = collection(db, 'projects')
      const q = query(
        projectsRef,
        where('published', '==', true),
        orderBy('sortOrder', 'asc'),
        limit(PROJECTS_LIMIT)
      )

      publishedUnsubscribe = onSnapshot(q, (snapshot) => {
        publishedProjects.value = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        } as IncapttaProject))
        loading.value = false
      }, (err) => {
        console.error('Error fetching published projects:', err)
        error.value = err.message || 'Failed to fetch projects'
        loading.value = false
      })
    } catch (err: any) {
      console.error('Error setting up published projects listener:', err)
      error.value = err.message || 'Failed to fetch projects'
      loading.value = false
    }
  }

  // Fetch featured projects
  function fetchFeaturedProjects(): void {
    loading.value = true
    error.value = null

    if (featuredUnsubscribe) {
      featuredUnsubscribe()
      featuredUnsubscribe = null
    }

    try {
      const projectsRef = collection(db, 'projects')
      const q = query(
        projectsRef,
        where('published', '==', true),
        where('featured', '==', true),
        orderBy('sortOrder', 'asc'),
        limit(FEATURED_LIMIT)
      )

      featuredUnsubscribe = onSnapshot(q, (snapshot) => {
        featuredProjects.value = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        } as IncapttaProject))
        loading.value = false
      }, (err) => {
        console.error('Error fetching featured projects:', err)
        error.value = err.message || 'Failed to fetch featured projects'
        loading.value = false
      })
    } catch (err: any) {
      console.error('Error setting up featured projects listener:', err)
      error.value = err.message || 'Failed to fetch featured projects'
      loading.value = false
    }
  }

  // Cleanup listeners
  function cleanup(): void {
    if (publishedUnsubscribe) {
      publishedUnsubscribe()
      publishedUnsubscribe = null
    }
    if (featuredUnsubscribe) {
      featuredUnsubscribe()
      featuredUnsubscribe = null
    }
  }

  return {
    publishedProjects,
    featuredProjects,
    loading,
    error,
    fetchPublishedProjects,
    fetchFeaturedProjects,
    cleanup
  }
}
