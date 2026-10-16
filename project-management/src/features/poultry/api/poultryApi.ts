import { db } from '@/lib/firebase'
import {
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  runTransaction
} from 'firebase/firestore'
import type { PoultryFlock, PoultryInventoryItem, PoultryDailyLog, PoultrySale } from '../types'

const flocksRef = collection(db, 'poultryFlocks')
const inventoryRef = collection(db, 'poultryInventory')
const logsRef = collection(db, 'poultryDailyLogs')
const salesRef = collection(db, 'poultrySales')

export const poultryApi = {
  // --- Flocks ---
  async getFlocks(): Promise<PoultryFlock[]> {
    const q = query(flocksRef, orderBy('createdAt', 'desc'))
    const snapshot = await getDocs(q)
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PoultryFlock))
  },

  async getFlock(id: string): Promise<PoultryFlock | null> {
    const docSnap = await getDoc(doc(db, 'poultryFlocks', id))
    if (!docSnap.exists()) return null
    return { id: docSnap.id, ...docSnap.data() } as PoultryFlock
  },

  async createFlock(data: Omit<PoultryFlock, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    const docRef = await addDoc(flocksRef, {
      ...data,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    })
    return docRef.id
  },

  async updateFlock(id: string, data: Partial<PoultryFlock>): Promise<void> {
    const docRef = doc(db, 'poultryFlocks', id)
    await updateDoc(docRef, { ...data, updatedAt: serverTimestamp() })
  },

  // --- Inventory ---
  async getInventory(): Promise<PoultryInventoryItem[]> {
    const snapshot = await getDocs(inventoryRef)
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PoultryInventoryItem))
  },

  async addInventoryItem(data: Omit<PoultryInventoryItem, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    const docRef = await addDoc(inventoryRef, {
      ...data,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    })
    return docRef.id
  },

  async updateInventoryItem(id: string, data: Partial<PoultryInventoryItem>): Promise<void> {
    const docRef = doc(db, 'poultryInventory', id)
    await updateDoc(docRef, { ...data, updatedAt: serverTimestamp() })
  },

  async deleteInventoryItem(id: string): Promise<void> {
    const docRef = doc(db, 'poultryInventory', id)
    await deleteDoc(docRef)
  },

  // --- Daily Logs ---
  async getLogsByFlock(flockId: string): Promise<PoultryDailyLog[]> {
    const q = query(logsRef, where('flockId', '==', flockId), orderBy('date', 'desc'))
    const snapshot = await getDocs(q)
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PoultryDailyLog))
  },

  async createDailyLog(data: Omit<PoultryDailyLog, 'id' | 'createdAt'>): Promise<string> {
    let logId = ''
    await runTransaction(db, async (transaction) => {
      // 1. Reduce flock currentQuantity if there is mortality
      if (data.mortality && data.mortality > 0) {
        const flockDocRef = doc(db, 'poultryFlocks', data.flockId)
        const flockDoc = await transaction.get(flockDocRef)
        if (flockDoc.exists()) {
          const currentQty = flockDoc.data().currentQuantity
          const newQty = Math.max(0, currentQty - data.mortality)
          transaction.update(flockDocRef, { currentQuantity: newQty, updatedAt: serverTimestamp() })
        }
      }

      // 2. Reduce inventory if feed was consumed
      if (data.feedItemId && data.feedConsumed && data.feedConsumed > 0) {
        const invDocRef = doc(db, 'poultryInventory', data.feedItemId)
        const invDoc = await transaction.get(invDocRef)
        if (invDoc.exists()) {
          const currentStock = invDoc.data().quantity
          const newStock = Math.max(0, currentStock - data.feedConsumed)
          transaction.update(invDocRef, { quantity: newStock, updatedAt: serverTimestamp() })
        }
      }

      // 3. Create the log
      const newLogRef = doc(logsRef)
      transaction.set(newLogRef, {
        ...data,
        createdAt: serverTimestamp()
      })
      logId = newLogRef.id
    })
    return logId
  },

  // --- Sales ---
  async getSalesByFlock(flockId: string): Promise<PoultrySale[]> {
    const q = query(salesRef, where('flockId', '==', flockId), orderBy('date', 'desc'))
    const snapshot = await getDocs(q)
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PoultrySale))
  },

  async recordSale(data: Omit<PoultrySale, 'id' | 'createdAt'>): Promise<string> {
    let saleId = ''
    await runTransaction(db, async (transaction) => {
      const flockDocRef = doc(db, 'poultryFlocks', data.flockId)
      const flockDoc = await transaction.get(flockDocRef)
      
      if (!flockDoc.exists()) {
        throw new Error("Flock not found")
      }

      const currentQty = flockDoc.data().currentQuantity
      const newQty = Math.max(0, currentQty - data.quantitySold)
      
      let newStatus = flockDoc.data().status
      if (newQty === 0) {
        newStatus = 'CLOSED'
      } else if (newStatus === 'ACTIVE') {
        newStatus = 'ON_MARKET'
      }

      // 1. Update flock quantity and potentially status
      transaction.update(flockDocRef, { 
        currentQuantity: newQty, 
        status: newStatus,
        updatedAt: serverTimestamp() 
      })

      // 2. Create the sale record
      const newSaleRef = doc(salesRef)
      transaction.set(newSaleRef, {
        ...data,
        createdAt: serverTimestamp()
      })
      saleId = newSaleRef.id
    })
    return saleId
  }
}
