import { db, auth } from '@/lib/firebase'
import { collection, addDoc, doc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore'

export async function debugPermissions() {
    const results: any = {}
    const user = auth.currentUser
    
    if (!user) {
        console.error('[Debug] No user logged in')
        return { error: 'No user' }
    }

    const testCollections = [
        'inventoryItems',
        'stockLedger',
        'operationalExpenses',
        'jobCards'
    ]

    console.log('[Debug] Starting permission test for user:', user.uid)

    for (const coll of testCollections) {
        try {
            console.log(`[Debug] Testing ${coll}...`)
            // Try to add a temporary test doc
            const docRef = await addDoc(collection(db, coll), {
                _isTest: true,
                testBy: user.uid,
                timestamp: new Date().toISOString()
            })
            results[coll] = 'SUCCESS (Write)'
            
            // Cleanup
            try {
                await deleteDoc(docRef)
                results[coll] += ' & DELETE'
            } catch (e) {
                results[coll] += ' (Delete Failed)'
            }
        } catch (error: any) {
            results[coll] = `FAILED: ${error.message}`
        }
    }

    console.table(results)
    return results
}
