import { ref } from 'vue'
import {
  collection,
  doc,
  runTransaction,
  writeBatch,
  getDocs,
  query,
  where,
  serverTimestamp,
  orderBy,
  limit,
  onSnapshot
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { user as sessionUser } from '@/composables/useSession'
import type { FowlrunCalculation, BOQLineItem } from '../types/fowlrun.types'
import { agricInventoryApi } from '../api/agricInventoryApi'

// ─── Constants ───────────────────────────────────────────────────────────────
const JOB_CARD_COLLECTION = 'agricJobCards'
const COUNTER_DOC = 'agricJobCards' // in systemCounters

export interface AgricJobCard {
  id: string
  status: 'DRAFT' | 'APPROVED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED'
  jobNumber: string
  clientName: string
  siteLocation: string
  totalAmount: number
  paidAmount: number
  balance: number
  generalInfo: any
  fowlrunMeta: any
  requisitionSections: any[]
  requisitionItems: any[]
  totals: any
  createdAt: any
  updatedAt: any
  createdBy: any
}

export function useAgricJobCard() {
  const isProcessing = ref(false)
  const error = ref<string | null>(null)
  const jobCards = ref<AgricJobCard[]>([])
  const isListening = ref(false)
  let unsubscribe: (() => void) | null = null

  // ── 1. Generate AG- sequence number ─────────────────────────────────────────
  async function generateJobNumber(): Promise<string> {
    const currentYear = new Date().getFullYear()
    const counterRef = doc(db, 'systemCounters', COUNTER_DOC)

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
  }

  // ── 2. Create Job Card from Calculator ─────────────────────────────────────
  async function createFromCalculation(calc: FowlrunCalculation, options: any) {
    isProcessing.value = true
    error.value = null
    try {
      const user = sessionUser.value
      if (!user) throw new Error('Authentication required')

      const jobNumber = await generateJobNumber()
      const batch = writeBatch(db)
      const jcRef = doc(collection(db, JOB_CARD_COLLECTION))

      const { items: _unused, ...meta } = calc

      // Mapping logic similar to standard JC but tailored for Agric
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
          currency: 'USD'
        },
        fowlrunMeta: meta,
        requisitionSections: [], // Simplified for Agric
        requisitionItems: [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: { uid: user.uid, email: user.email, name: user.displayName || user.email }
      }

      // Add sections
      data.requisitionSections = [
        {
          id: crypto.randomUUID(),
          description: 'Structural Materials & Labour',
          qty: 1,
          items: calc.items.map(item => ({
            id: crypto.randomUUID(),
            description: item.description,
            itemName: item.description,
            qty: item.qty,
            uom: item.unit,
            irdSellingPrice: item.unitPrice,
            rowGrandTot: item.total,
            category: item.category
          }))
        }
      ]
      data.requisitionItems = data.requisitionSections[0].items

      batch.set(jcRef, data)
      await batch.commit()
      return { 
        jobCardId: jcRef.id, 
        jobNumber,
        matchedCount: calc.items.filter(i => i.category === 'material').length,
        unmatchedCount: 0 // In Agric module, we map directly to BOQ for now
      }
    } catch (err: any) {
      error.value = err.message
      throw err
    } finally {
      isProcessing.value = false
    }
  }

  // ── 3. Subscribe to Agric Job Cards (Real-time) ─────────────────────────────
  function subscribeJobCards() {
    if (isListening.value) return
    isProcessing.value = true
    
    const q = query(collection(db, JOB_CARD_COLLECTION), orderBy('createdAt', 'desc'))
    
    unsubscribe = onSnapshot(q, (snap: any) => {
      jobCards.value = snap.docs.map((d: any) => ({ id: d.id, ...d.data() } as AgricJobCard))
      isListening.value = true
      isProcessing.value = false
    }, (err: Error) => {
      console.error('[AgricJobCard] Subscription failed:', err)
      error.value = err.message
      isProcessing.value = false
    })
  }

  function cleanup() {
    if (unsubscribe) {
      unsubscribe()
      unsubscribe = null
      isListening.value = false
    }
  }

  // ── 4. List Agric Job Cards (Static / One-time) ────────────────────────────
  async function listJobCards() {
    if (isListening.value) return jobCards.value

    try {
      const q = query(collection(db, JOB_CARD_COLLECTION), orderBy('createdAt', 'desc'))
      const snap = await getDocs(q)
      return snap.docs.map(d => ({ id: d.id, ...d.data() } as AgricJobCard))
    } catch (err: any) {
      console.error('[AgricJobCard] List failed:', err)
      throw err
    }
  }

  return {
    isProcessing,
    error,
    jobCards,
    subscribeJobCards,
    cleanup,
    createFromCalculation,
    listJobCards
  }
}
