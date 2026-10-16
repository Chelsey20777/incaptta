'use client'

import { create } from 'zustand'
import { db } from '@/lib/firebase'
import {
  collection,
  doc,
  query,
  orderBy,
  onSnapshot,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  addDoc,
  runTransaction,
  writeBatch,
  serverTimestamp,
  where,
  getDocs,
  limit,
} from 'firebase/firestore'
import { useAuthStore } from './auth-store'
import { toast } from 'sonner'
import type {
  AgricRates,
  TemplateItem,
  AgricJobCard,
  AgricInventoryItem,
  AgricPayment,
  FowlrunCalculation,
  BOQLineItem,
} from '@/features/agric-structures/types'
import {
  DEFAULT_RATES,
  DEFAULT_TEMPLATE_ITEMS,
} from '@/features/agric-structures/constants/defaults'

interface AgricStructuresState {
  // ─── Data ──────────────────────────────────────────────────────────────────
  jobCards: AgricJobCard[]
  inventoryItems: AgricInventoryItem[]
  rates: AgricRates
  templateItems: TemplateItem[]

  // ─── Loading ───────────────────────────────────────────────────────────────
  loadingJobCards: boolean
  loadingInventory: boolean
  loadingRates: boolean
  loadingTemplate: boolean
  isProcessing: boolean
  error: string | null

  // ─── Unsubscribe handles ───────────────────────────────────────────────────
  _unsubJobCards: (() => void) | null
  _unsubInventory: (() => void) | null

  // ─── Real-time Listeners ───────────────────────────────────────────────────
  fetchJobCards: () => () => void
  fetchInventory: () => () => void

  // ─── Rates CRUD ──────────────────────────────────────────────────────────
  fetchRates: () => Promise<void>
  updateRates: (newRates: Partial<AgricRates>) => Promise<void>

  // ─── Template CRUD ───────────────────────────────────────────────────────
  fetchTemplate: () => Promise<void>
  saveTemplate: (newItems: TemplateItem[]) => Promise<void>

  // ─── Job Card CRUD ───────────────────────────────────────────────────────
  generateJobNumber: () => Promise<string>
  createJobCardFromCalculation: (
    calc: FowlrunCalculation,
    options: { clientName: string; siteLocation: string }
  ) => Promise<{ jobCardId: string; jobNumber: string }>
  updateJobCard: (id: string, payload: Partial<AgricJobCard>) => Promise<void>
  deleteJobCard: (id: string) => Promise<void>

  // ─── Payments ─────────────────────────────────────────────────────────────
  collectPayment: (
    jobCard: AgricJobCard,
    amount: number,
    method: 'CASH' | 'BANK' | 'ECOCASH',
    notes?: string
  ) => Promise<void>

  // ─── Inventory ─────────────────────────────────────────────────────────────
  addInventoryItem: (item: Omit<AgricInventoryItem, 'id'>) => Promise<string>
  updateInventoryItem: (id: string, payload: Partial<AgricInventoryItem>) => Promise<void>
  deleteInventoryItem: (id: string) => Promise<void>
  adjustStock: (
    id: string,
    adjustment: { qty: number; reason: string }
  ) => Promise<void>

  // ─── Clone to System Job Card ──────────────────────────────────────────────
  cloneToSystemJobCard: (agricJC: AgricJobCard) => Promise<string>

  // ─── Cleanup ──────────────────────────────────────────────────────────────
  cleanup: () => void
}

export const useAgricStructuresStore = create<AgricStructuresState>(
  (set, get) => ({
    // ─── Initial State ───────────────────────────────────────────────────────
    jobCards: [],
    inventoryItems: [],
    rates: { ...DEFAULT_RATES },
    templateItems: [],
    loadingJobCards: false,
    loadingInventory: false,
    loadingRates: false,
    loadingTemplate: false,
    isProcessing: false,
    error: null,
    _unsubJobCards: null,
    _unsubInventory: null,

    // ─── Listeners ───────────────────────────────────────────────────────────
    fetchJobCards: () => {
      set({ loadingJobCards: true })
      const q = query(
        collection(db, 'agricJobCards'),
        orderBy('createdAt', 'desc')
      )
      const unsub = onSnapshot(
        q,
        (snap) => {
          set({
            jobCards: snap.docs.map(
              (d) => ({ id: d.id, ...d.data() } as AgricJobCard)
            ),
            loadingJobCards: false,
          })
        },
        (err) => {
          console.error('[AgricStructures] Job cards listener error:', err)
          set({ error: err.message, loadingJobCards: false })
        }
      )
      set({ _unsubJobCards: unsub })
      return unsub
    },

    fetchInventory: () => {
      set({ loadingInventory: true })
      const q = query(
        collection(db, 'Agric-Material-Inventory'),
        orderBy('name', 'asc')
      )
      const unsub = onSnapshot(
        q,
        (snap) => {
          set({
            inventoryItems: snap.docs.map(
              (d) => ({ id: d.id, ...d.data() } as AgricInventoryItem)
            ),
            loadingInventory: false,
          })
        },
        (err) => {
          console.error('[AgricStructures] Inventory listener error:', err)
          set({ error: err.message, loadingInventory: false })
        }
      )
      set({ _unsubInventory: unsub })
      return unsub
    },

    // ─── Rates ───────────────────────────────────────────────────────────────
    fetchRates: async () => {
      set({ loadingRates: true })
      try {
        const docRef = doc(db, 'agricStructureSettings', 'rates')
        const snap = await getDoc(docRef)
        if (snap.exists()) {
          set({
            rates: { ...DEFAULT_RATES, ...snap.data() } as AgricRates,
            loadingRates: false,
          })
        } else {
          await setDoc(docRef, {
            ...DEFAULT_RATES,
            createdAt: serverTimestamp(),
          })
          set({ rates: { ...DEFAULT_RATES }, loadingRates: false })
        }
      } catch (err: any) {
        console.error('[AgricStructures] Fetch rates failed:', err)
        set({ error: err.message, loadingRates: false })
      }
    },

    updateRates: async (newRates) => {
      set({ isProcessing: true })
      try {
        const docRef = doc(db, 'agricStructureSettings', 'rates')
        const merged = { ...get().rates, ...newRates, updatedAt: serverTimestamp() }
        await setDoc(docRef, merged, { merge: true })
        set({ rates: merged, isProcessing: false })
        toast.success('Construction rates updated')
      } catch (err: any) {
        console.error('[AgricStructures] Update rates failed:', err)
        set({ isProcessing: false })
        toast.error('Failed to update rates')
        throw err
      }
    },

    // ─── Template ─────────────────────────────────────────────────────────────
    fetchTemplate: async () => {
      set({ loadingTemplate: true })
      try {
        const docRef = doc(db, 'agricStructureSettings', 'template')
        const snap = await getDoc(docRef)
        if (snap.exists()) {
          const existingItems: TemplateItem[] = snap.data().items || []
          const missingItems = DEFAULT_TEMPLATE_ITEMS.filter(
            (def) => !existingItems.some((ex) => ex.id === def.id)
          )
          if (missingItems.length > 0) {
            const merged = [...existingItems, ...missingItems]
            await setDoc(
              docRef,
              { items: merged, updatedAt: serverTimestamp() },
              { merge: true }
            )
            set({ templateItems: merged, loadingTemplate: false })
          } else {
            set({ templateItems: existingItems, loadingTemplate: false })
          }
        } else {
          await setDoc(docRef, {
            items: [...DEFAULT_TEMPLATE_ITEMS],
            createdAt: serverTimestamp(),
          })
          set({ templateItems: [...DEFAULT_TEMPLATE_ITEMS], loadingTemplate: false })
        }
      } catch (err: any) {
        console.error('[AgricStructures] Fetch template failed:', err)
        set({ error: err.message, loadingTemplate: false })
      }
    },

    saveTemplate: async (newItems) => {
      set({ isProcessing: true })
      try {
        const docRef = doc(db, 'agricStructureSettings', 'template')
        await setDoc(docRef, {
          items: newItems,
          updatedAt: serverTimestamp(),
        })
        set({ templateItems: [...newItems], isProcessing: false })
        toast.success('BOQ template updated')
      } catch (err: any) {
        console.error('[AgricStructures] Save template failed:', err)
        set({ isProcessing: false })
        toast.error('Failed to update BOQ template')
        throw err
      }
    },

    // ─── Job Number Generation ────────────────────────────────────────────────
    generateJobNumber: async () => {
      const currentYear = new Date().getFullYear()
      const counterRef = doc(db, 'systemCounters', 'agricJobCards')

      const nextNumber = await runTransaction(db, async (transaction) => {
        const counterSnap = await transaction.get(counterRef)
        let seq = 1
        if (counterSnap.exists()) {
          const data = counterSnap.data()
          if (data.currentYear === currentYear) {
            seq = (data.sequence || 0) + 1
          }
        }
        transaction.set(counterRef, {
          currentYear,
          sequence: seq,
          lastUpdatedAt: serverTimestamp(),
        })
        return seq
      })

      return `AG-${currentYear}-${String(nextNumber).padStart(4, '0')}`
    },

    // ─── Create Job Card ─────────────────────────────────────────────────────
    createJobCardFromCalculation: async (calc, options) => {
      set({ isProcessing: true })
      try {
        const user = useAuthStore.getState().user
        if (!user) throw new Error('Authentication required')

        const jobNumber = await get().generateJobNumber()
        const batch = writeBatch(db)
        const jcRef = doc(collection(db, 'agricJobCards'))

        const { items, ...meta } = calc

        const data: any = {
          status: 'DRAFT',
          jobNumber,
          clientName: options.clientName,
          siteLocation: options.siteLocation,
          totalAmount: calc.grandTotal,
          paidAmount: 0,
          balance: calc.grandTotal,
          generalInfo: {
            jobTitle: `${calc.size.label} Fowlrun Construction — ${options.clientName}`,
            projectLocation: options.siteLocation,
            jobNumber,
            totalAmount: calc.grandTotal,
            recipientName: options.clientName,
            dimensionsOfStructure: calc.size.label,
            currency: 'USD',
          },
          fowlrunMeta: meta,
          requisitionSections: [
            {
              id: crypto.randomUUID(),
              description: 'Structural Materials & Labour',
              qty: 1,
              items: calc.items.map((item) => ({
                id: crypto.randomUUID(),
                description: item.description,
                itemName: item.description,
                qty: item.qty,
                uom: item.unit,
                irdSellingPrice: item.unitPrice,
                rowGrandTot: item.total,
                category: item.category,
              })),
            },
          ],
          requisitionItems: [],
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          createdBy: {
            uid: user.uid,
            email: user.email,
            name: user.displayName || user.email || 'Unknown',
          },
        }

        data.requisitionItems = data.requisitionSections[0].items

        batch.set(jcRef, data)
        await batch.commit()

        set({ isProcessing: false })
        toast.success(`Quote ${jobNumber} created`)
        return { jobCardId: jcRef.id, jobNumber }
      } catch (err: any) {
        console.error('[AgricStructures] Create job card failed:', err)
        set({ isProcessing: false, error: err.message })
        toast.error(err.message || 'Failed to create quote')
        throw err
      }
    },

    updateJobCard: async (id, payload) => {
      set({ isProcessing: true })
      try {
        const docRef = doc(db, 'agricJobCards', id)
        await updateDoc(docRef, { ...payload, updatedAt: serverTimestamp() })
        set({ isProcessing: false })
        toast.success('Job card updated')
      } catch (err: any) {
        console.error('[AgricStructures] Update job card failed:', err)
        set({ isProcessing: false })
        toast.error(err.message || 'Failed to update')
        throw err
      }
    },

    deleteJobCard: async (id) => {
      set({ isProcessing: true })
      try {
        const docRef = doc(db, 'agricJobCards', id)
        const snap = await getDoc(docRef)
        if (!snap.exists()) throw new Error('Job card not found')
        const data = snap.data()
        if (data.status !== 'DRAFT') {
          throw new Error('Only DRAFT quotes can be deleted')
        }
        await deleteDoc(docRef)
        set({ isProcessing: false })
        toast.success('Quote deleted')
      } catch (err: any) {
        console.error('[AgricStructures] Delete job card failed:', err)
        set({ isProcessing: false })
        toast.error(err.message || 'Failed to delete')
        throw err
      }
    },

    // ─── Payments ─────────────────────────────────────────────────────────────
    collectPayment: async (jobCard, amount, method, notes) => {
      if (amount <= 0) throw new Error('Amount must be greater than 0')
      set({ isProcessing: true })
      try {
        await runTransaction(db, async (transaction) => {
          const jcRef = doc(db, 'agricJobCards', jobCard.id)
          const jcSnap = await transaction.get(jcRef)
          if (!jcSnap.exists()) throw new Error('Job Card not found')

          const data = jcSnap.data()
          const currentPaid = data.paidAmount || 0
          const total = data.totalAmount || 0
          const newPaid = currentPaid + amount
          const newBalance = total - newPaid

          if (newPaid > total + 0.01) {
            throw new Error(
              `Payment exceeds balance. Current balance: $${(
                total - currentPaid
              ).toFixed(2)}`
            )
          }

          transaction.update(jcRef, {
            paidAmount: parseFloat(newPaid.toFixed(2)),
            balance: parseFloat(newBalance.toFixed(2)),
            status:
              newBalance <= 0
                ? 'PAID'
                : data.status === 'DRAFT'
                  ? 'APPROVED'
                  : data.status,
            updatedAt: serverTimestamp(),
          })

          const paymentRef = doc(collection(db, 'jobPayments'))
          transaction.set(paymentRef, {
            jobCardId: jobCard.id,
            jobCardNumber: jobCard.jobNumber,
            clientName: jobCard.clientName || 'Agric Client',
            amount: parseFloat(amount.toFixed(2)),
            paymentMethod: method,
            description: `Payment for Agric Project ${jobCard.jobNumber}${notes ? ' - ' + notes : ''}`,
            source: 'agric-structure',
            createdAt: serverTimestamp(),
          })
        })

        set({ isProcessing: false })
        toast.success(
          `Payment of $${amount.toFixed(2)} recorded to ${method}`
        )
      } catch (err: any) {
        console.error('[AgricStructures] Payment failed:', err)
        set({ isProcessing: false })
        toast.error(err.message || 'Payment collection failed')
        throw err
      }
    },

    // ─── Inventory ────────────────────────────────────────────────────────────
    addInventoryItem: async (item) => {
      set({ isProcessing: true })
      try {
        const docRef = await addDoc(
          collection(db, 'Agric-Material-Inventory'),
          {
            ...item,
            totalCost: (item.purchasePrice || 0) + (item.freightDuty || 0),
            sellingPrice:
              ((item.purchasePrice || 0) + (item.freightDuty || 0)) *
              (1 + (item.markupPercent || 0) / 100),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          }
        )
        set({ isProcessing: false })
        toast.success('Inventory item added')
        return docRef.id
      } catch (err: any) {
        console.error('[AgricStructures] Add inventory failed:', err)
        set({ isProcessing: false })
        toast.error(err.message || 'Failed to add item')
        throw err
      }
    },

    updateInventoryItem: async (id, payload) => {
      set({ isProcessing: true })
      try {
        const docRef = doc(db, 'Agric-Material-Inventory', id)
        const updateData: any = { ...payload, updatedAt: serverTimestamp() }
        // Recalculate derived fields if pricing changed
        const purchasePrice =
          payload.purchasePrice ?? get().inventoryItems.find((i) => i.id === id)?.purchasePrice ?? 0
        const freightDuty =
          payload.freightDuty ?? get().inventoryItems.find((i) => i.id === id)?.freightDuty ?? 0
        const markupPercent =
          payload.markupPercent ?? get().inventoryItems.find((i) => i.id === id)?.markupPercent ?? 0
        if (
          payload.purchasePrice !== undefined ||
          payload.freightDuty !== undefined
        ) {
          updateData.totalCost = purchasePrice + freightDuty
        }
        if (
          payload.purchasePrice !== undefined ||
          payload.freightDuty !== undefined ||
          payload.markupPercent !== undefined
        ) {
          const tc = payload.purchasePrice !== undefined || payload.freightDuty !== undefined
            ? purchasePrice + freightDuty
            : get().inventoryItems.find((i) => i.id === id)?.totalCost ?? 0
          updateData.sellingPrice = tc * (1 + markupPercent / 100)
        }
        await updateDoc(docRef, updateData)
        set({ isProcessing: false })
      } catch (err: any) {
        console.error('[AgricStructures] Update inventory failed:', err)
        set({ isProcessing: false })
        toast.error(err.message || 'Failed to update item')
        throw err
      }
    },

    deleteInventoryItem: async (id) => {
      set({ isProcessing: true })
      try {
        await deleteDoc(doc(db, 'Agric-Material-Inventory', id))
        set({ isProcessing: false })
        toast.success('Inventory item deleted')
      } catch (err: any) {
        console.error('[AgricStructures] Delete inventory failed:', err)
        set({ isProcessing: false })
        toast.error(err.message || 'Failed to delete item')
        throw err
      }
    },

    adjustStock: async (id, adjustment) => {
      set({ isProcessing: true })
      try {
        const user = useAuthStore.getState().user
        if (!user) throw new Error('Authentication required')

        const docRef = doc(db, 'Agric-Material-Inventory', id)
        const snap = await getDoc(docRef)
        if (!snap.exists()) throw new Error('Inventory item not found')

        const item = snap.data() as AgricInventoryItem
        const newOnHand = (item.onHand || 0) + adjustment.qty

        await updateDoc(docRef, {
          onHand: newOnHand,
          updatedAt: serverTimestamp(),
        })

        // Add ledger entry
        await addDoc(collection(db, 'agricStockLedger'), {
          inventoryItemId: id,
          movementType: 'ADJUST',
          qty: adjustment.qty,
          reason: adjustment.reason,
          reference: adjustment.reason,
          unitCost: item.purchasePrice || 0,
          totalCost: (item.purchasePrice || 0) * Math.abs(adjustment.qty),
          postedAt: serverTimestamp(),
          postedByUid: user.uid,
        })

        set({ isProcessing: false })
        toast.success(
          `Stock adjusted: ${adjustment.qty > 0 ? '+' : ''}${adjustment.qty}`
        )
      } catch (err: any) {
        console.error('[AgricStructures] Stock adjustment failed:', err)
        set({ isProcessing: false })
        toast.error(err.message || 'Stock adjustment failed')
        throw err
      }
    },

    // ─── Clone to System Job Card ─────────────────────────────────────────────
    cloneToSystemJobCard: async (agricJC) => {
      set({ isProcessing: true })
      try {
        const user = useAuthStore.getState().user
        if (!user) throw new Error('Authentication required')

        // Resolve Agric department ID
        let departmentId = ''
        let departmentName = 'Agric'
        try {
          const deptsSnap = await getDocs(collection(db, 'departments'))
          const agricDept = deptsSnap.docs
            .map((d) => ({ id: d.id, ...d.data() as any }))
            .find((d) => d.name?.toLowerCase().includes('agric'))
          if (agricDept) {
            departmentId = agricDept.id
            departmentName = agricDept.name
          }
        } catch (err) {
          console.warn('[AgricStructures] Failed to resolve department:', err)
        }

        // Resolve Fowlrun job category ID
        let jobCategoryId = ''
        let jobCategoryName = 'Fowlrun Construction'
        try {
          const catsSnap = await getDocs(collection(db, 'jobCategories'))
          const fowlrunCat = catsSnap.docs
            .map((d) => ({ id: d.id, ...d.data() as any }))
            .find((d) => d.name?.toLowerCase().includes('fowl'))
          if (fowlrunCat) {
            jobCategoryId = fowlrunCat.id
            jobCategoryName = fowlrunCat.name
          }
        } catch (err) {
          console.warn('[AgricStructures] Failed to resolve job category:', err)
        }

        // Generate standard job card number via the job-cards-store's pattern
        const currentYear = new Date().getFullYear()
        const counterRef = doc(db, 'systemCounters', 'jobCards')
        const nextNumber = await runTransaction(db, async (transaction) => {
          const counterSnap = await transaction.get(counterRef)
          let seq = 1
          if (counterSnap.exists()) {
            const data = counterSnap.data()
            if (data.currentYear === currentYear) {
              seq = (data.sequence || 0) + 1
            }
          }
          transaction.set(counterRef, {
            currentYear,
            sequence: seq,
            lastUpdatedAt: serverTimestamp(),
          })
          return seq
        })
        const sysJobNumber = `JC-${currentYear}-${String(nextNumber).padStart(4, '0')}`

        // Map agric BOQ items to standard job card requisition format with inventory auto-matching
        const mappedItems = await Promise.all(
          (agricJC.requisitionItems || []).map(async (item) => {
            const isMaterial = item.category === 'material'
            let matchedItemId = ''
            let matchedItemName = item.description || item.itemName
            let costSnapshot = item.irdSellingPrice || 0
            let twidMarkupPercent = 0
            let onHand = 0
            let matchStatus: 'MATCHED' | 'UNMATCHED' = 'UNMATCHED'
            let stockStatus: 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK' | 'NOT_CHECKED' = 'NOT_CHECKED'

            if (isMaterial) {
              try {
                const itemsRef = collection(db, 'inventoryItems')
                const exactQ = query(
                  itemsRef,
                  where('name', '==', item.description || item.itemName),
                  where('isActive', '==', true)
                )
                let snap = await getDocs(exactQ)

                if (snap.empty) {
                  const name = item.description || item.itemName
                  const end = name.slice(0, -1) + String.fromCharCode(name.charCodeAt(name.length - 1) + 1)
                  const prefixQ = query(
                    itemsRef,
                    where('name', '>=', name),
                    where('name', '<', end),
                    where('isActive', '==', true)
                  )
                  snap = await getDocs(prefixQ)
                }

                if (!snap.empty && snap.docs[0]) {
                  const invDoc = snap.docs[0]
                  const inv = invDoc.data() as any
                  matchedItemId = invDoc.id
                  matchedItemName = inv.name ?? matchedItemName
                  costSnapshot = Number(inv.totalCost || (Number(inv.purchasePrice || 0) + Number(inv.freightDuty || 0)) || costSnapshot)
                  twidMarkupPercent = inv.markupPercent ?? 0
                  onHand = inv.onHand ?? 0
                  matchStatus = 'MATCHED'
                  stockStatus = onHand === 0 ? 'OUT_OF_STOCK' : onHand < item.qty ? 'LOW_STOCK' : 'IN_STOCK'
                }
              } catch (err) {
                console.warn(`[AgricStructures] Inventory match failed for "${item.description || item.itemName}":`, err)
              }
            }

            const rowIRDTot = item.qty * item.irdSellingPrice
            const rowMUTot = rowIRDTot * (twidMarkupPercent / 100)
            const rowGrandTot = rowIRDTot + rowMUTot

            return {
              id: crypto.randomUUID(),
              inventoryItemId: matchedItemId,
              itemName: matchedItemName,
              description: item.description || item.itemName,
              qtyRequired: item.qty || 0,
              qty: item.qty || 0,
              irdSellingPrice: item.irdSellingPrice || 0,
              costSnapshot: parseFloat(costSnapshot.toFixed(2)),
              twidMarkupPercent,
              impCostPercent: 0,
              rowIRDTot: parseFloat(rowIRDTot.toFixed(2)),
              rowMUTot: parseFloat(rowMUTot.toFixed(2)),
              rowImpCostTot: 0,
              rowGrandTot: parseFloat(rowGrandTot.toFixed(2)),
              boqCategory: item.category || 'material',
              category: item.category || 'material',
              inventoryMatchStatus: matchStatus,
              stockStatus,
              stockAtSnapshot: onHand,
              approvalStatus: 'PENDING',
            }
          })
        )

        // Partition items into distinct sections
        const materialItems = mappedItems.filter((i) => i.boqCategory === 'material')
        const labourItems = mappedItems.filter((i) => i.boqCategory === 'labour')
        const transportItems = mappedItems.filter((i) => i.boqCategory === 'transport')

        const sections = []
        if (materialItems.length > 0) {
          sections.push({
            id: crypto.randomUUID(),
            jobCategoryId,
            description: 'Brickwork & Foundation Materials',
            qty: 1,
            items: materialItems,
          })
        }
        if (labourItems.length > 0) {
          sections.push({
            id: crypto.randomUUID(),
            jobCategoryId,
            description: 'Labour',
            qty: 1,
            items: labourItems,
          })
        }
        if (transportItems.length > 0) {
          sections.push({
            id: crypto.randomUUID(),
            jobCategoryId,
            description: 'Transport & Logistics',
            qty: 1,
            items: transportItems,
          })
        }

        // Calculate totals
        const inventoryIRDTotal = mappedItems.reduce((s, i) => s + i.rowIRDTot, 0)
        const inventoryMUTotal = mappedItems.reduce((s, i) => s + i.rowMUTot, 0)
        const inventoryIMPCostTotal = mappedItems.reduce((s, i) => s + i.rowImpCostTot, 0)
        const grandTotal = mappedItems.reduce((s, i) => s + i.rowGrandTot, 0)

        const totals = {
          inventoryIRDTotal: parseFloat(inventoryIRDTotal.toFixed(2)),
          inventoryMUTotal: parseFloat(inventoryMUTotal.toFixed(2)),
          inventoryIMPCostTotal: parseFloat(inventoryIMPCostTotal.toFixed(2)),
          adHocTotal: 0,
          grandTotal: parseFloat(grandTotal.toFixed(2)),
        }

        const dimensionsOfStructure = agricJC.fowlrunMeta?.size?.label || agricJC.generalInfo?.dimensionsOfStructure || ''

        const sysDocRef = doc(collection(db, 'jobCards'))
        const batch = writeBatch(db)
        batch.set(sysDocRef, {
          status: 'DRAFT',
          generalInfo: {
            jobTitle: `${dimensionsOfStructure} Fowlrun Construction — ${agricJC.clientName}`,
            projectDescription: `Agric-Structures fowlrun construction project. Structure: ${dimensionsOfStructure}. Capacity: ${agricJC.fowlrunMeta?.birdCapacityMin?.toLocaleString() || 0}–${agricJC.fowlrunMeta?.birdCapacityMax?.toLocaleString() || 0} birds.`,
            requestingDepartmentId: departmentId,
            requestingDepartmentName: departmentName,
            jobCategoryId: jobCategoryId,
            jobCategoryName: jobCategoryName,
            jobNumber: sysJobNumber,
            jobInvoiceValue: totals.grandTotal,
            projectLocation: agricJC.siteLocation || '',
            recipientName: agricJC.clientName || '',
            dimensionsOfStructure,
            currency: 'USD',
            totalAmount: totals.grandTotal,
            linkedAgricJobCardId: agricJC.id,
            linkedAgricJobNumber: agricJC.jobNumber,
          },
          fowlrunMeta: {
            structureLength: agricJC.fowlrunMeta?.size?.length || 0,
            structureWidth: agricJC.fowlrunMeta?.size?.width || 0,
            floorArea: agricJC.fowlrunMeta?.area || 0,
            bays: agricJC.fowlrunMeta?.bays || 0,
            birdCapacityMin: agricJC.fowlrunMeta?.birdCapacityMin || 0,
            birdCapacityMax: agricJC.fowlrunMeta?.birdCapacityMax || 0,
            linkedCalculationId: agricJC.fowlrunMeta?.linkedCalculationId || null,
            linkedQuoteId: agricJC.id,
            source: 'fowlrun-calculator',
          },
          requisitionSections: sections,
          requisitionItems: mappedItems,
          totals,
          summary: {
            ...totals,
            expensesByMethod: { CASH: 0, ECOCASH: 0, BANK: 0 },
            itemCount: mappedItems.length,
            lastUpdatedAt: serverTimestamp(),
          },
          adHocExpenses: [],
          submittedBy: {
            uid: user.uid,
            email: user.email,
            name: user.displayName || user.email || 'Unknown',
          },
          createdBy: {
            uid: user.uid,
            name: user.displayName || user.email || 'Unknown',
          },
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })

        // Write flat items to the nested items sub-collection
        mappedItems.forEach((item) => {
          const itemRef = doc(collection(db, 'jobCards', sysDocRef.id, 'items'))
          batch.set(itemRef, {
            ...item,
            createdAt: serverTimestamp(),
          })
        })

        await batch.commit()

        // Link back to agric job card
        const agricRef = doc(db, 'agricJobCards', agricJC.id)
        await updateDoc(agricRef, {
          linkedSystemJobCardId: sysDocRef.id,
          linkedSystemJobCardNumber: sysJobNumber,
          updatedAt: serverTimestamp(),
        })

        set({ isProcessing: false })
        toast.success(`System Job Card ${sysJobNumber} created`)
        return sysDocRef.id
      } catch (err: any) {
        console.error(
          '[AgricStructures] Clone to system job card failed:',
          err
        )
        set({ isProcessing: false })
        toast.error(err.message || 'Failed to create system job card')
        throw err
      }
    },

    // ─── Cleanup ──────────────────────────────────────────────────────────────
    cleanup: () => {
      const { _unsubJobCards, _unsubInventory } = get()
      if (_unsubJobCards) _unsubJobCards()
      if (_unsubInventory) _unsubInventory()
      set({ _unsubJobCards: null, _unsubInventory: null })
    },
  })
)