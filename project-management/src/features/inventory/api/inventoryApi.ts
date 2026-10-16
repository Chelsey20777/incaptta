import {
    collection,
    doc,
    getDoc,
    getDocs,
    addDoc,
    updateDoc,
    query,
    where,
    orderBy,
    serverTimestamp,
    increment,
    writeBatch,
    deleteDoc,
    limit
} from 'firebase/firestore'
import { db, auth } from '@/lib/firebase'
import type { InventoryItem, InventoryFilter, StockLedgerEntry } from '../types'

const COLLECTION_NAME = 'inventoryItems'
const LEDGER_COLLECTION = 'stockLedger'

/**
 * Normalizes a Firestore document into an InventoryItem.
 * Maps backend field names (e.g. inStock, totalCost) to frontend names (onHand, avgUnitCost).
 */
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

export const inventoryApi = {
    async listInventory(filters: InventoryFilter = {}) {
        try {
            // Simplified query to avoid composite index requirements
            const q = query(collection(db, COLLECTION_NAME))
            const snapshot = await getDocs(q)

            let items = snapshot.docs.map(normalizeInventoryItem)

            // Filter in memory for maximum flexibility without indexing
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

            if (filters.uom) {
                items = items.filter(i => i.uom === filters.uom)
            }

            // Sort in memory by updatedAt descending
            items.sort((a, b) => {
                const dateA = a.updatedAt?.toMillis?.() || 0
                const dateB = b.updatedAt?.toMillis?.() || 0
                return dateB - dateA
            })

            return items
        } catch (error: any) {
            console.error('Error in listInventory:', error)
            throw error
        }
    },

    async getInventoryItem(id: string) {
        try {
            const docRef = doc(db, COLLECTION_NAME, id)
            const snapshot = await getDoc(docRef)
            if (!snapshot.exists()) return null
            return normalizeInventoryItem(snapshot)
        } catch (error: any) {
            console.error('Error in getInventoryItem:', error)
            throw error
        }
    },

    async createInventoryItem(item: Omit<InventoryItem, 'id' | 'createdAt' | 'updatedAt'>, user: { uid: string, email: string }) {
        try {
            // Check SKU uniqueness
            const q = query(collection(db, COLLECTION_NAME), where('sku', '==', item.sku), limit(1))
            const snap = await getDocs(q)
            if (!snap.empty) {
                throw new Error(`SKU ${item.sku} already exists.`)
            }

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
            console.error('Error in createInventoryItem:', error)
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
            // Ensure no ID in patch
            delete (payload as any).id
            await updateDoc(docRef, payload)
        } catch (error: any) {
            console.error('Error in updateInventoryItem:', error)
            throw error
        }
    },

    async deleteInventoryItem(id: string) {
        try {
            const docRef = doc(db, COLLECTION_NAME, id)
            await deleteDoc(docRef)
        } catch (error: any) {
            console.error('Error in deleteInventoryItem:', error)
            throw error
        }
    },

    async bulkDeleteInventoryItems(ids: string[]) {
        try {
            const batch = writeBatch(db)
            ids.forEach(id => {
                const docRef = doc(db, COLLECTION_NAME, id)
                batch.delete(docRef)
            })
            await batch.commit()
        } catch (error: any) {
            console.error('Error in bulkDeleteInventoryItems:', error)
            throw error
        }
    },

    async adjustStock(id: string, adjustment: {
        type: 'ADD' | 'REMOVE' | 'SET',
        qty: number,
        reason: string,
        reference?: string,
        unitCost?: number,
        skipFinancials?: boolean
    }) {
        try {
            const user = auth.currentUser
            if (!user) throw new Error('Authentication required')

            const itemRef = doc(db, COLLECTION_NAME, id)
            const ledgerRef = doc(collection(db, LEDGER_COLLECTION))

            if (adjustment.type === 'SET') {
                // Must use a transaction to read current state and safely compute the delta
                const { runTransaction } = await import('firebase/firestore')
                await runTransaction(db, async (transaction) => {
                    const itemSnap = await transaction.get(itemRef)
                    if (!itemSnap.exists()) {
                        throw new Error(`Inventory item ${id} does not exist.`)
                    }
                    const data = itemSnap.data()
                    const currentOnHand = Number(data.onHand ?? data.inStock ?? 0)
                    const newOnHand = adjustment.qty
                    const qtyChange = newOnHand - currentOnHand

                    if (qtyChange !== 0) {
                        transaction.update(itemRef, {
                            onHand: newOnHand,
                            updatedAt: serverTimestamp()
                        })

                        transaction.set(ledgerRef, {
                            inventoryItemId: id,
                            movementType: 'ADJUST',
                            qty: qtyChange,
                            reason: adjustment.reason || 'Stock Take',
                            reference: adjustment.reference || 'Stock Take CSV Sync',
                            unitCost: adjustment.unitCost || 0,
                            totalCost: (adjustment.unitCost || 0) * qtyChange,
                            postedAt: serverTimestamp(),
                            postedByUid: user.uid
                        })
                    }
                })
            } else {
                // ADD or REMOVE now use a Transaction to enforce No-Overdraft
                const { runTransaction } = await import('firebase/firestore')
                await runTransaction(db, async (transaction) => {
                    const itemSnap = await transaction.get(itemRef)
                    if (!itemSnap.exists()) {
                        throw new Error(`Inventory item ${id} does not exist.`)
                    }

                    const data = itemSnap.data()
                    const currentOnHand = Number(data.onHand ?? data.inStock ?? 0)
                    
                    let qtyChange = 0
                    if (adjustment.type === 'ADD') qtyChange = adjustment.qty
                    else if (adjustment.type === 'REMOVE') qtyChange = -adjustment.qty

                    const newOnHand = currentOnHand + qtyChange

                    // ENFORCEMENT: Prevent negative stock only when REMOVING
                    if (adjustment.type === 'REMOVE' && newOnHand < 0) {
                        throw new Error(`Insufficient stock for ${data.name || data.itemName}. Available: ${currentOnHand}, Requested: ${adjustment.qty}`)
                    }

                    transaction.update(itemRef, {
                        onHand: newOnHand,
                        updatedAt: serverTimestamp()
                    })

                    if (!adjustment.skipFinancials) {
                        transaction.set(ledgerRef, {
                            inventoryItemId: id,
                            movementType: 'ADJUST',
                            qty: qtyChange,
                            reason: adjustment.reason,
                            reference: adjustment.reference || 'Manual Adjustment',
                            unitCost: adjustment.unitCost || 0,
                            totalCost: (adjustment.unitCost || 0) * qtyChange,
                            postedAt: serverTimestamp(),
                            postedByUid: user.uid
                        })
                    }

                    // AUTOMATION: If stock is removed (negative qtyChange), record as Cost of Sales in Ledger
                    if (qtyChange < 0 && !adjustment.skipFinancials) {
                        const cogsRef = doc(collection(db, 'operationalExpenses'))
                        const costAmount = Math.abs(qtyChange * (adjustment.unitCost || 0))
                        
                        if (costAmount > 0) {
                            transaction.set(cogsRef, {
                                type: 'COST_OF_SALES',
                                description: `COGS: ${adjustment.reason} (Ref: ${adjustment.reference || 'Manual'})`,
                                amount: costAmount,
                                status: 'APPROVED',
                                category: 'Cost of Sales',
                                paymentMethod: 'INVENTORY',
                                inventoryItemId: id,
                                reference: adjustment.reference || 'Manual',
                                createdAt: serverTimestamp(),
                                approvedAt: serverTimestamp()
                            })
                        }
                    }
                })
            }
        } catch (error: any) {
            console.error('Error in adjustStock:', error)
            throw error
        }
    },

    async getMovements(inventoryItemId: string) {
        try {
            const q = query(
                collection(db, LEDGER_COLLECTION),
                where('inventoryItemId', '==', inventoryItemId),
                orderBy('postedAt', 'desc')
            )
            const snapshot = await getDocs(q)
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as StockLedgerEntry))
        } catch (error: any) {
            console.error('Error in getMovements:', error)
            throw error
        }
    },

    async fetchCategories() {
        try {
            // Try inventoryCategories first
            let snapshot = await getDocs(collection(db, 'inventoryCategories'))
            if (snapshot.empty) {
                // Try jobCategories
                snapshot = await getDocs(collection(db, 'jobCategories'))
            }
            return snapshot.docs.map(d => ({ id: d.id, ...d.data() }))
        } catch (error: any) {
            console.error('Error in fetchCategories:', error)
            throw error
        }
    }
}
