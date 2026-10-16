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

export interface ProjectFormData {
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
  featured: boolean
  published: boolean
  sortOrder: number
}

export const PROJECT_CATEGORIES: { value: ProjectCategory; label: string }[] = [
  { value: 'fowlrun-construction', label: 'Fowlrun Construction' },
  { value: 'equipment-installation', label: 'Equipment Installation' },
  { value: 'climate-control', label: 'Climate Control' },
  { value: 'large-scale', label: 'Large Scale' },
  { value: 'government', label: 'Government' },
  { value: 'rehabilitation', label: 'Rehabilitation' }
]
