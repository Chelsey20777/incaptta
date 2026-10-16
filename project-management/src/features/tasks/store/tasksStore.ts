import { defineStore } from 'pinia'
import { ref } from 'vue'
import { db } from '@/lib/firebase'
import {
    collection, query, orderBy, onSnapshot, addDoc, updateDoc,
    doc, serverTimestamp, deleteDoc, where
} from 'firebase/firestore'

export type TaskStatus = 'Todo' | 'In Progress' | 'Review' | 'Done'
export type TaskPriority = 'Low' | 'Medium' | 'High' | 'Urgent'

export interface ProjectTask {
    id: string
    title: string
    description: string
    status: TaskStatus
    priority: TaskPriority
    assignedTo: string
    assignedToUid: string
    dueDate: string
    tags: string[]
    createdBy: { uid: string; name: string }
    createdAt: any
    updatedAt: any
}

export const useTasksStore = defineStore('projectTasks', () => {
    const tasks = ref<ProjectTask[]>([])
    const loading = ref(false)
    const unsubscribers: (() => void)[] = []

    function fetchTasks() {
        loading.value = true
        unsubscribers.forEach(u => u())
        unsubscribers.length = 0
        const q = query(collection(db, 'projectTasks'), orderBy('createdAt', 'desc'))
        const unsub = onSnapshot(q, (snap) => {
            tasks.value = snap.docs.map(d => ({ id: d.id, ...d.data() } as ProjectTask))
            loading.value = false
        }, () => { loading.value = false })
        unsubscribers.push(unsub)
    }

    async function createTask(data: Omit<ProjectTask, 'id' | 'createdAt' | 'updatedAt'>) {
        await addDoc(collection(db, 'projectTasks'), {
            ...data,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        })
    }

    async function updateTask(id: string, data: Partial<ProjectTask>) {
        await updateDoc(doc(db, 'projectTasks', id), { ...data, updatedAt: serverTimestamp() })
    }

    async function deleteTask(id: string) {
        await deleteDoc(doc(db, 'projectTasks', id))
    }

    function cleanup() {
        unsubscribers.forEach(u => u())
        unsubscribers.length = 0
    }

    return { tasks, loading, fetchTasks, createTask, updateTask, deleteTask, cleanup }
})
