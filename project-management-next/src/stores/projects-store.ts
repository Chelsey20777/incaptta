'use client'

import { create } from 'zustand'
import { db } from '@/lib/firebase'
import {
  collection,
  doc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  serverTimestamp,
  where
} from 'firebase/firestore'

export interface ProjectTask {
  id: string
  projectId: string
  title: string
  description: string
  assignee: string
  status: 'TODO' | 'IN_PROGRESS' | 'DONE' | 'BLOCKED'
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  startDate: string
  dueDate: string
  estimatedHours: number
  actualHours: number
  dependencies: string[]
  milestone: string
  createdBy: string
  createdAt: any
  updatedAt: any
}

export interface ProjectMilestone {
  id: string
  projectId: string
  title: string
  description: string
  dueDate: string
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'DELAYED'
  tasks: string[]
  completedAt: any | null
  createdBy: string
  createdAt: any
}

interface ProjectsState {
  tasks: ProjectTask[]
  milestones: ProjectMilestone[]
  loadingTasks: boolean
  loadingMilestones: boolean

  fetchTasks: (projectId?: string) => Promise<void>
  addTask: (data: Omit<ProjectTask, 'id' | 'createdAt' | 'updatedAt'>) => Promise<string>
  updateTask: (id: string, data: Partial<ProjectTask>) => Promise<void>
  deleteTask: (id: string) => Promise<void>

  fetchMilestones: (projectId: string) => Promise<void>
  addMilestone: (data: Omit<ProjectMilestone, 'id' | 'createdAt'>) => Promise<string>
  updateMilestone: (id: string, data: Partial<ProjectMilestone>) => Promise<void>
  deleteMilestone: (id: string) => Promise<void>
}

export const useProjectsStore = create<ProjectsState>((set, get) => ({
  tasks: [],
  milestones: [],
  loadingTasks: false,
  loadingMilestones: false,

  fetchTasks: async (projectId) => {
    set({ loadingTasks: true })
    try {
      let q = query(collection(db, 'projectTasks'), orderBy('dueDate', 'asc'))
      if (projectId) {
        q = query(q, where('projectId', '==', projectId))
      }
      const snapshot = await getDocs(q)
      set({ tasks: snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ProjectTask)) })
    } catch (err: any) {
      console.error('Error fetching tasks:', err)
    } finally {
      set({ loadingTasks: false })
    }
  },

  addTask: async (data) => {
    const docRef = await addDoc(collection(db, 'projectTasks'), {
      ...data,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    })
    await get().fetchTasks(data.projectId)
    return docRef.id
  },

  updateTask: async (id, data) => {
    await updateDoc(doc(db, 'projectTasks', id), {
      ...data,
      updatedAt: serverTimestamp()
    })
  },

  deleteTask: async (id) => {
    await deleteDoc(doc(db, 'projectTasks', id))
  },

  fetchMilestones: async (projectId) => {
    set({ loadingMilestones: true })
    try {
      const q = query(
        collection(db, 'projectMilestones'),
        where('projectId', '==', projectId),
        orderBy('dueDate', 'asc')
      )
      const snapshot = await getDocs(q)
      set({ milestones: snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ProjectMilestone)) })
    } catch (err: any) {
      console.error('Error fetching milestones:', err)
    } finally {
      set({ loadingMilestones: false })
    }
  },

  addMilestone: async (data) => {
    const docRef = await addDoc(collection(db, 'projectMilestones'), {
      ...data,
      createdAt: serverTimestamp()
    })
    await get().fetchMilestones(data.projectId)
    return docRef.id
  },

  updateMilestone: async (id, data) => {
    await updateDoc(doc(db, 'projectMilestones', id), {
      ...data,
      updatedAt: serverTimestamp()
    })
  },

  deleteMilestone: async (id) => {
    await deleteDoc(doc(db, 'projectMilestones', id))
  }
}))