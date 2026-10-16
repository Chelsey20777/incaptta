'use client'

import { create } from 'zustand'
import { db } from '@/lib/firebase'
import {
  collection,
  onSnapshot,
  doc,
  updateDoc,
  deleteDoc,
  addDoc,
  getDocs,
  serverTimestamp,
  query,
  orderBy
} from 'firebase/firestore'
import { toast } from 'sonner'
import { BOM_TEMPLATES, STRUCTURE_SIZES } from '@/features/jobCards/constants/bomTemplates'

export interface BomTemplateRow {
  id: string
  name: string
  quantities: Record<string, number> // keyed by structure size, e.g. "80x10m"
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

interface BomTemplatesState {
  templates: BomTemplate[]
  loading: boolean
  error: string | null
  unsub: (() => void) | null
  
  listen: () => void
  cleanup: () => void
  seedDefaults: () => Promise<void>
  createTemplate: (name: string) => Promise<void>
  renameTemplate: (id: string, name: string) => Promise<void>
  deleteTemplate: (id: string) => Promise<void>
  saveRows: (templateId: string, rows: BomTemplateRow[]) => Promise<void>
  updateTemplateMeta: (templateId: string, meta: { jobCategoryId: string; categoryDescription: string }) => Promise<void>
}

export const useBomTemplateStore = create<BomTemplatesState>((set, get) => ({
  templates: [],
  loading: false,
  error: null,
  unsub: null,

  listen: () => {
    if (get().unsub) return
    const q = query(collection(db, 'bomTemplates'), orderBy('name'))
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const templates = snap.docs.map(d => ({ id: d.id, ...d.data() } as BomTemplate))
        set({ templates })
      },
      (err) => {
        console.error('[BomTemplateStore]', err)
        set({ error: err.message })
      }
    )
    set({ unsub: unsubscribe })
  },

  cleanup: () => {
    const unsub = get().unsub
    if (unsub) {
      unsub()
      set({ unsub: null })
    }
  },

  seedDefaults: async () => {
    set({ loading: true })
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
      toast.error('Seed Failed: ' + e.message)
    } finally {
      set({ loading: false })
    }
  },

  createTemplate: async (name) => {
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
      toast.error('Create Failed: ' + e.message)
    }
  },

  renameTemplate: async (id, name) => {
    try {
      await updateDoc(doc(db, 'bomTemplates', id), { name, updatedAt: serverTimestamp() })
      toast.success('Template Renamed')
    } catch (e: any) {
      toast.error('Rename Failed: ' + e.message)
    }
  },

  deleteTemplate: async (id) => {
    try {
      await deleteDoc(doc(db, 'bomTemplates', id))
      toast.success('Template Deleted')
    } catch (e: any) {
      toast.error('Delete Failed: ' + e.message)
    }
  },

  saveRows: async (templateId, rows) => {
    try {
      await updateDoc(doc(db, 'bomTemplates', templateId), { rows, updatedAt: serverTimestamp() })
    } catch (e: any) {
      toast.error('Save Failed: ' + e.message)
      throw e
    }
  },

  updateTemplateMeta: async (templateId, meta) => {
    try {
      await updateDoc(doc(db, 'bomTemplates', templateId), {
        ...meta,
        updatedAt: serverTimestamp()
      })
      toast.success('Template Metadata Updated')
    } catch (e: any) {
      toast.error('Update Failed: ' + e.message)
    }
  }
}))
