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
  where,
  orderBy,
  serverTimestamp,
  onSnapshot,
  runTransaction
} from 'firebase/firestore'

export interface Tool {
  id: string
  name: string
  toolId?: string
  brand?: string
  model?: string
  serialNumber?: string
  category?: string
  location?: string
  purchaseDate?: string
  purchasePrice?: number
  currentValue?: number
  status: 'ACTIVE' | 'IN_USE' | 'DAMAGED' | 'REPAIR' | 'RETIRED'
  notes?: string
  createdBy?: string
  createdAt?: unknown
  updatedAt?: unknown
}

export interface ToolCheckout {
  id: string
  toolId: string
  toolName?: string
  assignedTo: string
  assignedByName?: string
  site?: string
  checkoutDate?: string
  expectedReturnDate?: string
  actualReturnDate?: string | null
  conditionOnCheckout?: string
  conditionOnReturn?: string
  notes?: string
  createdBy?: string
  createdAt?: unknown
  allocationId?: string
  jobCardId?: string
  jobCardNumber?: string
  jobCardTitle?: string
}

export interface AllocatedTool {
  id: string
  toolId: string
  checkoutId?: string
  name: string
  serialNumber: string
  state: 'Allocated' | 'Returned' | 'Damaged'
  allocatedAt: string
  returnedAt: string | null
}

export interface ToolAllocationActor {
  uid?: string
  name?: string
}

export interface ToolRepair {
  id: string
  toolId: string
  toolName?: string
  description: string
  repairCost?: number
  repairVendor?: string
  repairDate?: string
  completedDate?: string | null
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED'
  notes?: string
  createdBy?: string
  createdAt?: unknown
}

interface ToolsState {
  tools: Tool[]
  checkouts: ToolCheckout[]
  repairs: ToolRepair[]
  loadingTools: boolean
  loadingCheckouts: boolean
  loadingRepairs: boolean

  subscriptions: (() => void)[]

  fetchTools: () => () => void
  addTool: (data: Omit<Partial<Tool>, 'id' | 'createdAt' | 'updatedAt'> & Pick<Tool, 'name' | 'status'>) => Promise<string>
  updateTool: (id: string, data: Omit<Partial<Tool>, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>
  deleteTool: (id: string) => Promise<void>

  fetchCheckouts: (toolId?: string) => Promise<void>
  addCheckout: (data: Omit<Partial<ToolCheckout>, 'id' | 'createdAt'> & Pick<ToolCheckout, 'toolId' | 'assignedTo'>) => Promise<string>
  returnTool: (id: string, actualReturnDate: string, conditionOnReturn: string, notes?: string) => Promise<void>

  fetchRepairs: (toolId?: string) => Promise<void>
  addRepair: (data: Omit<Partial<ToolRepair>, 'id' | 'createdAt'> & Pick<ToolRepair, 'toolId' | 'description' | 'status'>) => Promise<string>
  updateRepairStatus: (id: string, status: ToolRepair['status']) => Promise<void>

  allocateToolToJobCard: (jobCardId: string, toolId: string, actor?: ToolAllocationActor) => Promise<void>
  updateJobCardToolState: (jobCardId: string, allocationId: string, state: 'Returned' | 'Damaged', notes?: string) => Promise<void>
  removeToolFromJobCard: (jobCardId: string, allocationId: string, actor?: ToolAllocationActor) => Promise<void>

  cleanup: () => void
}

export const useToolsStore = create<ToolsState>((set, get) => ({
  tools: [],
  checkouts: [],
  repairs: [],
  loadingTools: false,
  loadingCheckouts: false,
  loadingRepairs: false,
  subscriptions: [],

  cleanup: () => {
    get().subscriptions.forEach(unsub => unsub())
    set({ subscriptions: [] })
  },

  fetchTools: () => {
    set({ loadingTools: true })
    const q = query(collection(db, 'companyTools'), orderBy('name', 'asc'))
    const unsub = onSnapshot(q, (snap) => {
      set({ tools: snap.docs.map(d => ({ id: d.id, ...d.data() } as Tool)), loadingTools: false })
    }, (err) => {
      console.error('Error fetching tools:', err)
      set({ loadingTools: false })
    })
    set((state) => ({ subscriptions: [...state.subscriptions, unsub] }))
    return unsub
  },

  addTool: async (data) => {
    const docRef = await addDoc(collection(db, 'companyTools'), {
      ...data,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    })
    return docRef.id
  },

  updateTool: async (id, data) => {
    await updateDoc(doc(db, 'companyTools', id), {
      ...data,
      updatedAt: serverTimestamp()
    })
  },

  deleteTool: async (id) => {
    await deleteDoc(doc(db, 'companyTools', id))
  },

  fetchCheckouts: async (toolId) => {
    set({ loadingCheckouts: true })
    try {
      let q = query(collection(db, 'toolCheckouts'), orderBy('checkoutDate', 'desc'))
      if (toolId) {
        q = query(q, where('toolId', '==', toolId))
      }
      const snapshot = await getDocs(q)
      set({ checkouts: snapshot.docs.map(d => ({ id: d.id, ...d.data() } as ToolCheckout)) })
    } catch (err: unknown) {
      console.error('Error fetching checkouts:', err)
    } finally {
      set({ loadingCheckouts: false })
    }
  },

  addCheckout: async (data) => {
    const docRef = await addDoc(collection(db, 'toolCheckouts'), {
      ...data,
      createdAt: serverTimestamp()
    })
    await updateDoc(doc(db, 'companyTools', data.toolId), {
      status: 'IN_USE',
      updatedAt: serverTimestamp()
    })
    await get().fetchCheckouts()
    return docRef.id
  },

  returnTool: async (id, actualReturnDate, conditionOnReturn, notes) => {
    await runTransaction(db, async (transaction) => {
      const checkoutRef = doc(db, 'toolCheckouts', id)
      const checkoutSnap = await transaction.get(checkoutRef)
      if (!checkoutSnap.exists()) throw new Error('Checkout record not found')

      const checkout = { id: checkoutSnap.id, ...checkoutSnap.data() } as ToolCheckout
      if (checkout.actualReturnDate) throw new Error('Tool has already been returned')

      const toolRef = doc(db, 'companyTools', checkout.toolId)
      const toolSnap = await transaction.get(toolRef)
      if (!toolSnap.exists()) throw new Error('Tool not found')

      const jobRef = checkout.jobCardId ? doc(db, 'jobCards', checkout.jobCardId) : null
      const jobSnap = jobRef ? await transaction.get(jobRef) : null
      const isGoodReturn = conditionOnReturn.toUpperCase() === 'GOOD'
      const newStatus: Tool['status'] = isGoodReturn ? 'ACTIVE' : 'DAMAGED'

      transaction.update(checkoutRef, {
        actualReturnDate,
        conditionOnReturn,
        notes: notes || checkout.notes || '',
        updatedAt: serverTimestamp()
      })
      transaction.update(toolRef, { status: newStatus, updatedAt: serverTimestamp() })

      if (jobRef && jobSnap?.exists()) {
        const allocations = (jobSnap.data().allocatedTools || []) as AllocatedTool[]
        const next = allocations.map((allocation) =>
          allocation.id === checkout.allocationId || allocation.checkoutId === id
            ? {
                ...allocation,
                state: isGoodReturn ? 'Returned' as const : 'Damaged' as const,
                returnedAt: new Date().toISOString(),
              }
            : allocation
        )
        transaction.update(jobRef, { allocatedTools: next, updatedAt: serverTimestamp() })
      }
    })

    await get().fetchCheckouts()
  },

  fetchRepairs: async (toolId) => {
    set({ loadingRepairs: true })
    try {
      let q = query(collection(db, 'toolRepairs'), orderBy('repairDate', 'desc'))
      if (toolId) {
        q = query(q, where('toolId', '==', toolId))
      }
      const snapshot = await getDocs(q)
      set({ repairs: snapshot.docs.map(d => ({ id: d.id, ...d.data() } as ToolRepair)) })
    } catch (err: unknown) {
      console.error('Error fetching repairs:', err)
    } finally {
      set({ loadingRepairs: false })
    }
  },

  addRepair: async (data) => {
    const docRef = await addDoc(collection(db, 'toolRepairs'), {
      ...data,
      createdAt: serverTimestamp()
    })
    await updateDoc(doc(db, 'companyTools', data.toolId), {
      status: 'REPAIR',
      updatedAt: serverTimestamp()
    })
    await get().fetchRepairs()
    return docRef.id
  },

  updateRepairStatus: async (id, status) => {
    const repair = get().repairs.find(r => r.id === id)
    if (!repair) throw new Error('Repair record not found')

    const updateData: Record<string, unknown> = { status, updatedAt: serverTimestamp() }
    if (status === 'COMPLETED') {
      updateData.completedDate = new Date().toISOString()
    }

    await updateDoc(doc(db, 'toolRepairs', id), updateData)

    if (status === 'COMPLETED') {
      await updateDoc(doc(db, 'companyTools', repair.toolId), {
        status: 'ACTIVE',
        updatedAt: serverTimestamp()
      })
    }

    await get().fetchRepairs()
  },

  allocateToolToJobCard: async (jobCardId, toolId, actor) => {
    const checkoutRef = doc(collection(db, 'toolCheckouts'))
    const allocationId = crypto.randomUUID()
    const now = new Date()

    await runTransaction(db, async (transaction) => {
      const toolRef = doc(db, 'companyTools', toolId)
      const jobRef = doc(db, 'jobCards', jobCardId)
      const [toolSnap, jobSnap] = await Promise.all([
        transaction.get(toolRef),
        transaction.get(jobRef),
      ])

      if (!toolSnap.exists()) throw new Error('Tool not found')
      if (!jobSnap.exists()) throw new Error('Job card not found')

      const tool = { id: toolSnap.id, ...toolSnap.data() } as Tool
      if (tool.status !== 'ACTIVE') throw new Error(`${tool.name} is no longer available`)

      const job = jobSnap.data()
      const allocations = (job.allocatedTools || []) as AllocatedTool[]
      if (allocations.some((allocation) => allocation.toolId === toolId && (!allocation.state || allocation.state === 'Allocated'))) {
        throw new Error(`${tool.name} is already allocated to this job card`)
      }

      const jobCardNumber = job.generalInfo?.jobNumber || job.jobNumber || jobCardId
      const jobCardTitle = job.generalInfo?.jobCardTitle || job.jobCardTitle || ''
      const allocation: AllocatedTool = {
        id: allocationId,
        toolId,
        checkoutId: checkoutRef.id,
        name: tool.name,
        serialNumber: tool.serialNumber || tool.toolId || 'N/A',
        state: 'Allocated',
        allocatedAt: now.toISOString(),
        returnedAt: null,
      }

      transaction.update(jobRef, {
        allocatedTools: [...allocations, allocation],
        updatedAt: serverTimestamp(),
      })
      transaction.set(checkoutRef, {
        allocationId,
        toolId,
        toolName: tool.name,
        assignedTo: jobCardNumber,
        assignedByName: actor?.name || '',
        site: job.generalInfo?.projectLocation || '',
        checkoutDate: now.toISOString().slice(0, 10),
        expectedReturnDate: '',
        actualReturnDate: null,
        conditionOnCheckout: 'GOOD',
        notes: `Allocated to job card ${jobCardNumber}`,
        jobCardId,
        jobCardNumber,
        jobCardTitle,
        createdBy: actor?.uid || '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
      transaction.update(toolRef, { status: 'IN_USE', updatedAt: serverTimestamp() })
    })
  },

  updateJobCardToolState: async (jobCardId, allocationId, state, notes) => {
    await runTransaction(db, async (transaction) => {
      const jobRef = doc(db, 'jobCards', jobCardId)
      const jobSnap = await transaction.get(jobRef)
      if (!jobSnap.exists()) throw new Error('Job card not found')

      const allocations = (jobSnap.data().allocatedTools || []) as AllocatedTool[]
      const allocation = allocations.find((item) => item.id === allocationId)
      if (!allocation) throw new Error('Tool allocation not found')
      if (allocation.state && allocation.state !== 'Allocated') {
        throw new Error(`Tool is already marked ${allocation.state}`)
      }

      const toolRef = doc(db, 'companyTools', allocation.toolId)
      const toolSnap = await transaction.get(toolRef)
      const checkoutRef = allocation.checkoutId ? doc(db, 'toolCheckouts', allocation.checkoutId) : null
      const checkoutSnap = checkoutRef ? await transaction.get(checkoutRef) : null
      const returnedAt = new Date().toISOString()
      const next = allocations.map((item) =>
        item.id === allocationId ? { ...item, state, returnedAt } : item
      )

      transaction.update(jobRef, { allocatedTools: next, updatedAt: serverTimestamp() })
      if (toolSnap.exists()) {
        transaction.update(toolRef, {
          status: state === 'Returned' ? 'ACTIVE' : 'DAMAGED',
          updatedAt: serverTimestamp(),
        })
      }
      if (checkoutRef && checkoutSnap?.exists() && !checkoutSnap.data().actualReturnDate) {
        transaction.update(checkoutRef, {
          actualReturnDate: returnedAt.slice(0, 10),
          conditionOnReturn: state === 'Returned' ? 'GOOD' : 'DAMAGED',
          notes: notes || checkoutSnap.data().notes || '',
          updatedAt: serverTimestamp(),
        })
      }
    })
  },

  removeToolFromJobCard: async (jobCardId, allocationId, actor) => {
    await runTransaction(db, async (transaction) => {
      const jobRef = doc(db, 'jobCards', jobCardId)
      const jobSnap = await transaction.get(jobRef)
      if (!jobSnap.exists()) throw new Error('Job card not found')

      const allocations = (jobSnap.data().allocatedTools || []) as AllocatedTool[]
      const allocation = allocations.find((item) => item.id === allocationId)
      if (!allocation) throw new Error('Tool allocation not found')

      const isActiveAllocation = !allocation.state || allocation.state === 'Allocated'
      const toolRef = isActiveAllocation ? doc(db, 'companyTools', allocation.toolId) : null
      const toolSnap = toolRef ? await transaction.get(toolRef) : null
      const checkoutRef = isActiveAllocation && allocation.checkoutId
        ? doc(db, 'toolCheckouts', allocation.checkoutId)
        : null
      const checkoutSnap = checkoutRef ? await transaction.get(checkoutRef) : null

      transaction.update(jobRef, {
        allocatedTools: allocations.filter((item) => item.id !== allocationId),
        updatedAt: serverTimestamp(),
      })

      if (toolRef && toolSnap?.exists()) {
        transaction.update(toolRef, { status: 'ACTIVE', updatedAt: serverTimestamp() })
      }
      if (checkoutRef && checkoutSnap?.exists() && !checkoutSnap.data().actualReturnDate) {
        transaction.update(checkoutRef, {
          actualReturnDate: new Date().toISOString().slice(0, 10),
          conditionOnReturn: 'GOOD',
          notes: `Returned while removed from job card by ${actor?.name || 'user'}`,
          updatedAt: serverTimestamp(),
        })
      }
    })
  }
}))
