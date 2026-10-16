import { ref, computed } from 'vue'
import { db } from '@/lib/firebase'
import { storage } from '@/lib/firebase'
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  arrayUnion
} from 'firebase/firestore'
import { ref as storageRef, uploadBytesResumable, getDownloadURL } from 'firebase/storage'
import type { IncapttaProject, ProjectFormData, ProjectImage } from '../types/incapttaProject.types'

export function useIncapttaProjects() {
  const projects = ref<IncapttaProject[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  const uploadProgress = ref<number>(0)
  let unsubscribe: (() => void) | null = null

  // Real-time listener for projects
  async function fetchProjects(): Promise<void> {
    loading.value = true
    error.value = null

    if (unsubscribe) {
      unsubscribe()
      unsubscribe = null
    }

    try {
      const projectsRef = collection(db, 'projects')
      const q = query(projectsRef, orderBy('sortOrder', 'asc'))

      unsubscribe = onSnapshot(q, (snapshot) => {
        projects.value = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        } as IncapttaProject))
        loading.value = false
      }, (err) => {
        console.error('Error fetching projects:', err)
        error.value = err.message || 'Failed to fetch projects'
        loading.value = false
      })
    } catch (err: any) {
      console.error('Error setting up projects listener:', err)
      error.value = err.message || 'Failed to fetch projects'
      loading.value = false
    }
  }

  // Create new project
  async function createProject(data: ProjectFormData): Promise<string> {
    try {
      const projectsRef = collection(db, 'projects')
      const docRef = await addDoc(projectsRef, {
        ...data,
        images: [],
        coverImageIndex: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      })
      return docRef.id
    } catch (err: any) {
      console.error('Error creating project:', err)
      throw new Error(err.message || 'Failed to create project')
    }
  }

  // Update project
  async function updateProject(id: string, data: Partial<ProjectFormData>): Promise<void> {
    try {
      const projectRef = doc(db, 'projects', id)
      await updateDoc(projectRef, {
        ...data,
        updatedAt: serverTimestamp()
      })
    } catch (err: any) {
      console.error('Error updating project:', err)
      throw new Error(err.message || 'Failed to update project')
    }
  }

  // Delete project (only if unpublished)
  async function deleteProject(id: string): Promise<void> {
    try {
      const project = projects.value.find(p => p.id === id)
      if (project?.published) {
        throw new Error('Cannot delete a published project. Unpublish it first.')
      }
      await deleteDoc(doc(db, 'projects', id))
    } catch (err: any) {
      console.error('Error deleting project:', err)
      throw new Error(err.message || 'Failed to delete project')
    }
  }

  // Toggle published status
  async function togglePublished(id: string): Promise<void> {
    try {
      const project = projects.value.find(p => p.id === id)
      if (!project) throw new Error('Project not found')

      const projectRef = doc(db, 'projects', id)
      await updateDoc(projectRef, {
        published: !project.published,
        updatedAt: serverTimestamp()
      })
    } catch (err: any) {
      console.error('Error toggling published status:', err)
      throw new Error(err.message || 'Failed to update published status')
    }
  }

  // Toggle featured status
  async function toggleFeatured(id: string): Promise<void> {
    try {
      const project = projects.value.find(p => p.id === id)
      if (!project) throw new Error('Project not found')

      const projectRef = doc(db, 'projects', id)
      await updateDoc(projectRef, {
        featured: !project.featured,
        updatedAt: serverTimestamp()
      })
    } catch (err: any) {
      console.error('Error toggling featured status:', err)
      throw new Error(err.message || 'Failed to update featured status')
    }
  }

  // Upload project image
  async function uploadProjectImage(
    projectId: string,
    file: File,
    caption: string | null = null
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const filename = `${Date.now()}_${file.name}`
      const fileRef = storageRef(storage, `project-images/${projectId}/${filename}`)

      const uploadTask = uploadBytesResumable(fileRef, file)

      uploadTask.on(
        'state_changed',
        (snapshot) => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100
          uploadProgress.value = Math.round(progress)
        },
        (error) => {
          console.error('Upload error:', error)
          reject(new Error('Failed to upload image'))
        },
        async () => {
          try {
            const downloadURL = await getDownloadURL(uploadTask.snapshot.ref)

            // Add image to project's images array
            const projectRef = doc(db, 'projects', projectId)
            const imageData: ProjectImage = { url: downloadURL, caption }
            await updateDoc(projectRef, {
              images: arrayUnion(imageData),
              updatedAt: serverTimestamp()
            })

            uploadProgress.value = 0
            resolve(downloadURL)
          } catch (err: any) {
            reject(new Error(err.message || 'Failed to save image reference'))
          }
        }
      )
    })
  }

  // Set cover image
  async function setCoverImage(projectId: string, imageIndex: number): Promise<void> {
    try {
      const projectRef = doc(db, 'projects', projectId)
      await updateDoc(projectRef, {
        coverImageIndex: imageIndex,
        updatedAt: serverTimestamp()
      })
    } catch (err: any) {
      console.error('Error setting cover image:', err)
      throw new Error(err.message || 'Failed to set cover image')
    }
  }

  // Cleanup listener
  function cleanup(): void {
    if (unsubscribe) {
      unsubscribe()
      unsubscribe = null
    }
  }

  // Featured projects computed
  const featuredProjects = computed(() => {
    return projects.value.filter(p => p.featured && p.published)
  })

  // Published projects computed
  const publishedProjects = computed(() => {
    return projects.value.filter(p => p.published)
  })

  return {
    projects,
    loading,
    error,
    uploadProgress,
    featuredProjects,
    publishedProjects,
    fetchProjects,
    createProject,
    updateProject,
    deleteProject,
    togglePublished,
    toggleFeatured,
    uploadProjectImage,
    setCoverImage,
    cleanup
  }
}
