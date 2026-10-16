import { defineStore } from 'pinia'
import { ref, computed, onUnmounted } from 'vue'
import { db } from '@/lib/firebase'
import { 
  collection, query, onSnapshot, addDoc, doc, updateDoc, 
  serverTimestamp, orderBy, deleteDoc
} from 'firebase/firestore'
import type { Task } from '../types'

export const useTasksStore = defineStore('tasks', () => {
  const tasks = ref<Task[]>([])
  const loading = ref(false)
  const currentTask = ref<Task | null>(null)
  const error = ref<string | null>(null)

  let unsubscribe: (() => void) | null = null

  const myTasks = computed(() => tasks.value)
  const completedTasks = computed(() => tasks.value.filter(t => t.status === 'COMPLETED'))
  const pendingTasks = computed(() => tasks.value.filter(t => t.status !== 'COMPLETED'))
  const highPriorityTasks = computed(() => 
    tasks.value.filter(t => ['HIGH', 'URGENT'].includes(t.priority) && t.status !== 'COMPLETED')
  )

  const fetchTasks = () => {
    loading.value = true
    const q = query(collection(db, 'projectTasks'), orderBy('createdAt', 'desc'))

    unsubscribe = onSnapshot(q, (snapshot) => {
      tasks.value = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Task[]
      loading.value = false
    }, (err) => {
      console.error('[TasksStore] Fetch error:', err)
      error.value = err.message
      loading.value = false
    })
  }

  const setCurrentTask = (task: Task | null) => {
    currentTask.value = task
  }

  const createTask = async (data: Partial<Task>, userId: string, userName: string) => {
    try {
      const payload = {
        ...data,
        status: 'TODO',
        createdBy: { uid: userId, name: userName },
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      }

      const docRef = await addDoc(collection(db, 'projectTasks'), payload)
      return docRef.id
    } catch (err) {
      console.error('[TasksStore] Error creating task:', err)
      throw err
    }
  }

  const updateTask = async (id: string, updates: Partial<Task>) => {
    try {
      const docRef = doc(db, 'projectTasks', id)
      await updateDoc(docRef, {
        ...updates,
        updatedAt: serverTimestamp()
      })
    } catch (err) {
      console.error('[TasksStore] Error updating task:', err)
      throw err
    }
  }

  const completeTask = async (id: string) => {
    try {
      const docRef = doc(db, 'projectTasks', id)
      await updateDoc(docRef, {
        status: 'COMPLETED',
        completedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      })
    } catch (err) {
      console.error('[TasksStore] Error completing task:', err)
      throw err
    }
  }

  const deleteTask = async (id: string) => {
    try {
      const docRef = doc(db, 'projectTasks', id)
      await deleteDoc(docRef)
    } catch (err) {
      console.error('[TasksStore] Error deleting task:', err)
      throw err
    }
  }

  const cleanup = () => {
    if (unsubscribe) {
      unsubscribe()
      unsubscribe = null
    }
  }

  onUnmounted(cleanup)

  return {
    tasks,
    loading,
    error,
    currentTask,
    myTasks,
    completedTasks,
    pendingTasks,
    highPriorityTasks,
    fetchTasks,
    setCurrentTask,
    createTask,
    updateTask,
    completeTask,
    deleteTask,
    cleanup
  }
})
