import { defineStore } from 'pinia'
import { ref } from 'vue'
import { db } from '@/lib/firebase'
import {
  collection, onSnapshot, doc, updateDoc, deleteDoc,
  addDoc, getDocs, serverTimestamp, query, orderBy
} from 'firebase/firestore'
import { toast } from 'vue-sonner'
import { BOM_TEMPLATES, STRUCTURE_SIZES } from '@/features/jobCards/data/bomTemplates'

export interface BomTemplateRow {
  id: string
  name: string
  quantities: Record<string, number> // keyed by structure size e.g. "80x10m"
}

export interface BomTemplate {
  id: string
  name: string
  isActive: boolean
  jobCategoryId?: string
  categoryDescription?: string
  rows: BomTemplateRow[]
  createdAt?: any
  updatedAt?: any
}

export const useBomTemplateStore = defineStore('bomTemplates', () => {
  const templates = ref<BomTemplate[]>([])
  const loading = ref(false)
  let unsub: (() => void) | null = null

  function listen() {
    if (unsub) return
    unsub = onSnapshot(
      query(collection(db, 'bomTemplates'), orderBy('name')),
      (snap) => {
        templates.value = snap.docs.map(d => ({ id: d.id, ...d.data() } as BomTemplate))
      },
      (err) => console.error('[BomTemplateStore]', err)
    )
  }

  function cleanup() {
    if (unsub) { unsub(); unsub = null }
  }

  async function seedDefaults() {
    loading.value = true
    try {
      const snap = await getDocs(collection(db, 'bomTemplates'))
      if (!snap.empty) {
        toast.info('Templates already exist — skipping seed.')
        return
      }
      const toRows = (staticRows: typeof BOM_TEMPLATES.WATER_SYSTEM) =>
        staticRows.map(row => ({
          id: crypto.randomUUID(),
          name: row.name,
          quantities: Object.fromEntries(
            STRUCTURE_SIZES.map((size, i) => [size, parseFloat(row.quantities[i] ?? '0') || 0])
          )
        }))

      await addDoc(collection(db, 'bomTemplates'), {
        name: 'Water System',
        isActive: true,
        rows: toRows(BOM_TEMPLATES.WATER_SYSTEM),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      })
      await addDoc(collection(db, 'bomTemplates'), {
        name: 'Curtains',
        isActive: true,
        rows: toRows(BOM_TEMPLATES.CURTAINS),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      })
      toast.success('Default BOM templates seeded to database.')
    } catch (e: any) {
      toast.error('Seed Failed', { description: e.message })
    } finally {
      loading.value = false
    }
  }

  async function createTemplate(name: string) {
    try {
      await addDoc(collection(db, 'bomTemplates'), {
        name,
        isActive: true,
        jobCategoryId: '',
        categoryDescription: '',
        rows: [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      })
      toast.success('Template Created')
    } catch (e: any) {
      toast.error('Create Failed', { description: e.message })
    }
  }

  async function renameTemplate(id: string, name: string) {
    try {
      await updateDoc(doc(db, 'bomTemplates', id), { name, updatedAt: serverTimestamp() })
      toast.success('Template Renamed')
    } catch (e: any) {
      toast.error('Rename Failed', { description: e.message })
    }
  }

  async function deleteTemplate(id: string) {
    try {
      await deleteDoc(doc(db, 'bomTemplates', id))
      toast.success('Template Deleted')
    } catch (e: any) {
      toast.error('Delete Failed', { description: e.message })
    }
  }

  async function saveRows(templateId: string, rows: BomTemplateRow[]) {
    try {
      await updateDoc(doc(db, 'bomTemplates', templateId), { rows, updatedAt: serverTimestamp() })
    } catch (e: any) {
      toast.error('Save Failed', { description: e.message })
      throw e
    }
  }

  async function updateTemplateMeta(templateId: string, meta: { jobCategoryId: string, categoryDescription: string }) {
    try {
      await updateDoc(doc(db, 'bomTemplates', templateId), { 
        ...meta, 
        updatedAt: serverTimestamp() 
      })
      toast.success('Template Metadata Updated')
    } catch (e: any) {
      toast.error('Update Failed', { description: e.message })
    }
  }

  return {
    templates, loading,
    listen, cleanup,
    seedDefaults, createTemplate, renameTemplate, deleteTemplate, saveRows, updateTemplateMeta
  }
})
