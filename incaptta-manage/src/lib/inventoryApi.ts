import {
    collection,
    doc,
    serverTimestamp
} from 'firebase/firestore'
import { db, auth } from '@/lib/firebase'

const COLLECTION_NAME = 'inventoryItems'
const LEDGER_COLLECTION = 'stockLedger'

export const inventoryApi = {
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
                            reference: adjustment.reference || 'Stock Take Sync',
                            unitCost: adjustment.unitCost || 0,
                            totalCost: (adjustment.unitCost || 0) * qtyChange,
                            postedAt: serverTimestamp(),
                            postedByUid: user.uid
                        })
                    }
                })
            } else {
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

                    // ENFORCEMENT: Prevent negative stock when REMOVING
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

                    // AUTOMATION: If stock is removed, record as Cost of Sales in Ledger
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
    }
}
