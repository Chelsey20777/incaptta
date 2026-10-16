import {
    collection,
    doc,
    getDoc,
    getDocs,
    addDoc,
    updateDoc,
    query,
    where,
    serverTimestamp,
    increment,
    writeBatch,
    deleteDoc,
    limit
} from 'firebase/firestore'
import { db, auth } from '@/lib/firebase'
import type { InventoryItem, InventoryFilter, StockLedgerEntry } from '@/features/inventory/types'

const COLLECTION_NAME = 'Agric-Material-Inventory'
const LEDGER_COLLECTION = 'agricStockLedger'

const normalizeInventoryItem = (snapshot: any): InventoryItem => {
    const data = snapshot.data();
    const purchasePrice = Number(data.purchasePrice ?? data.avgUnitCost ?? data.totalCost ?? 0);
    const freightDuty = Number(data.freightDuty ?? 0);
    const totalCost = Number(data.totalCost ?? (purchasePrice + freightDuty));
    const markupPercent = Number(data.markupPercent ?? 0);
    const sellingPrice = Number(data.sellingPrice ?? (totalCost * (1 + markupPercent / 100)));

    return {
        id: snapshot.id,
        sku: data.sku || '',
        name: data.name || data.itemName || '',
        uom: data.uom || 'PCS',
        onHand: Number(data.onHand ?? data.inStock ?? 0),
        isActive: data.isActive !== false,
        categoryId: data.categoryId || '',
        categoryName: data.categoryName || '',
        purchasePrice,
        freightDuty,
        totalCost,
        markupPercent,
        sellingPrice,
        location: data.location || '',
        notes: data.notes || data.description || '',
        updatedAt: data.updatedAt,
        updatedBy: data.updatedBy,
        createdAt: data.createdAt,
        createdBy: data.createdBy,
        reorderLevel: data.reorderLevel !== undefined ? Number(data.reorderLevel) : undefined
    } as InventoryItem
}

export const agricInventoryApi = {
    async listInventory(filters: InventoryFilter = {}) {
        try {
            const q = query(collection(db, COLLECTION_NAME))
            const snapshot = await getDocs(q)
            let items = snapshot.docs.map(normalizeInventoryItem)

            if (filters.isActive !== undefined) {
                items = items.filter(i => i.isActive === filters.isActive)
            }
            if (filters.search) {
                const s = filters.search.toLowerCase()
                items = items.filter(i =>
                    i.name.toLowerCase().includes(s) ||
                    i.sku.toLowerCase().includes(s)
                )
            }
            if (filters.lowStockOnly) {
                items = items.filter(i => (i.reorderLevel !== undefined && i.onHand <= i.reorderLevel))
            }

            items.sort((a, b) => {
                const dateA = a.updatedAt?.toMillis?.() || 0
                const dateB = b.updatedAt?.toMillis?.() || 0
                return dateB - dateA
            })

            return items
        } catch (error: any) {
            console.error('[AgricInventory] Error listInventory:', error)
            throw error
        }
    },

    async createInventoryItem(item: Omit<InventoryItem, 'id' | 'createdAt' | 'updatedAt'>, user: { uid: string, email: string }) {
        try {
            const q = query(collection(db, COLLECTION_NAME), where('sku', '==', item.sku), limit(1))
            const snap = await getDocs(q)
            if (!snap.empty) throw new Error(`SKU ${item.sku} already exists in Agric Inventory.`)

            const payload = {
                ...item,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
                createdBy: user,
                updatedBy: user
            }
            const docRef = await addDoc(collection(db, COLLECTION_NAME), payload)
            return docRef.id
        } catch (error: any) {
            console.error('[AgricInventory] Error createInventoryItem:', error)
            throw error
        }
    },

    async updateInventoryItem(id: string, patch: Partial<InventoryItem>, user: { uid: string, email: string }) {
        try {
            const docRef = doc(db, COLLECTION_NAME, id)
            const payload = {
                ...patch,
                updatedAt: serverTimestamp(),
                updatedBy: user
            }
            delete (payload as any).id
            await updateDoc(docRef, payload)
        } catch (error: any) {
            console.error('[AgricInventory] Error updateInventoryItem:', error)
            throw error
        }
    },

    async adjustStock(id: string, adjustment: {
        type: 'ADD' | 'REMOVE' | 'SET',
        qty: number,
        reason: string,
        reference?: string,
        unitCost?: number
    }) {
        const user = auth.currentUser
        if (!user) throw new Error('Authentication required')

        const itemRef = doc(db, COLLECTION_NAME, id)
        const ledgerRef = doc(collection(db, LEDGER_COLLECTION))
        const batch = writeBatch(db)

        let qtyChange = 0
        if (adjustment.type === 'ADD') qtyChange = adjustment.qty
        else if (adjustment.type === 'REMOVE') qtyChange = -adjustment.qty
        else if (adjustment.type === 'SET') {
             // For SET, we need a transaction or just updateDoc if we don't care about the ledger delta for now
             // Simpler: just update the field
             await updateDoc(itemRef, { onHand: adjustment.qty, updatedAt: serverTimestamp() })
             return
        }

        batch.update(itemRef, { onHand: increment(qtyChange), updatedAt: serverTimestamp() })
        batch.set(ledgerRef, {
            inventoryItemId: id,
            movementType: 'ADJUST',
            qty: qtyChange,
            reason: adjustment.reason,
            reference: adjustment.reference || 'Agric Manual Adjustment',
            unitCost: adjustment.unitCost || 0,
            totalCost: (adjustment.unitCost || 0) * qtyChange,
            postedAt: serverTimestamp(),
            postedByUid: user.uid
        })
        await batch.commit()
    }
}
