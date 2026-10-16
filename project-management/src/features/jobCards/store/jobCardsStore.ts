import { defineStore } from 'pinia'
import { ref, onUnmounted } from 'vue'
import { db } from '@/lib/firebase'
import { collection, query, onSnapshot, addDoc, doc, updateDoc, serverTimestamp, orderBy, runTransaction, writeBatch, getDocs, where, getDoc } from 'firebase/firestore'
import { computeFinancials } from '@shared/financialEngine'

export const useJobCardsStore = defineStore('jobCards', () => {
    const jobCards = ref<any[]>([])
    const loading = ref(false)
    const error = ref<string | null>(null)

    let unsubscribe: (() => void) | null = null

    function fetchJobCards() {
        loading.value = true
        const q = query(collection(db, 'jobCards'), orderBy('createdAt', 'desc'))

        unsubscribe = onSnapshot(q, (snapshot) => {
            jobCards.value = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }))
            loading.value = false
        }, (err) => {
            console.error('Error fetching job cards:', err)
            error.value = err.message
            loading.value = false
        })
    }

    async function createJobCard(data: any) {
        try {
            console.log('Attempting to create Job Card with data:', data)
            const docRef = await addDoc(collection(db, 'jobCards'), {
                ...data,
                status: 'DRAFT',
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            })

            // Sync to Leads Pipeline as 'Won'
            try {
                const { useLeadsStore } = await import('@/features/crm/store/useLeadsStore')
                const leadsStore = useLeadsStore()
                const contactName = data.generalInfo?.recipientName || ''
                const value = data.summary?.grandTotal || data.totals?.grandTotal || 0
                await leadsStore.syncLeadStage(contactName, '', '', 'Won', value)
            } catch (leadErr) {
                console.warn('Failed to sync lead stage for job card:', leadErr)
            }

            return docRef.id
        } catch (err: any) {
            console.error('Store: Error creating job card:', err)
            throw err
        }
    }

    async function generateJobNumber() {
        try {
            const currentYear = new Date().getFullYear()
            const counterRef = doc(db, 'systemCounters', 'jobCards') // Collection: systemCounters, Doc: jobCards

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
                    lastUpdatedAt: serverTimestamp()
                })
                return seq
            })

            const sequenceStr = String(nextNumber).padStart(4, '0')
            return `JC-${currentYear}-${sequenceStr}`
        } catch (err: any) {
            console.error('Error generating job number:', err)
            throw err
        }
    }

    async function updateJobCardStatus(id: string, status: string, approvalEvent?: { user: string, role: string, status?: string, comment?: string }) {
        try {
            const docRef = doc(db, 'jobCards', id)
            const updateData: any = {
                status,
                updatedAt: serverTimestamp()
            }

            if (approvalEvent) {
                const { arrayUnion } = await import('firebase/firestore')
                updateData.approvalTimeline = arrayUnion({
                    ...approvalEvent,
                    date: new Date().toISOString()
                })
            }

            await updateDoc(docRef, updateData)
        } catch (err: any) {
            console.error('Error updating status:', err)
            throw err
        }
    }

    async function approveJobCard(id: string, currentStatus: string, role: string, userName: string) {
        const isSuper = role === 'SUPER_ADMIN' || role === 'ADMIN'
        const now = new Date().toISOString()

        // Handle the dual-log transition for Accountant approval
        if (currentStatus === 'APPROVAL_PENDING_ACCOUNTANT' && (isSuper || role === 'ACCOUNTANT')) {
            // First transition: Approved by Accountant
            await updateJobCardStatus(id, 'APPROVED_ACCOUNTANT', {
                user: userName,
                role,
                status: 'Approved by Accountant'
            })
            // Second transition (automatic): Pending Manager Approval
            await updateJobCardStatus(id, 'APPROVAL_PENDING_MANAGER', {
                user: 'System',
                role: 'SYSTEM',
                status: 'Pending Manager Approval'
            })
            return // Exit early since we handled the transition
        }

        let nextStatus = currentStatus

        // Strict Workflow Logic for other stages
        if (currentStatus === 'DRAFT') {
            nextStatus = 'SUBMITTED' // Requesters/Sales "Submit"
        } else if (currentStatus === 'SUBMITTED' && (isSuper || role === 'ACCOUNTANT')) {
            nextStatus = 'APPROVAL_PENDING_ACCOUNTANT'
        } else if (currentStatus === 'APPROVAL_PENDING_MANAGER' && (isSuper || role === 'MANAGER')) {
            nextStatus = 'APPROVED_MANAGER'
        } else if (currentStatus === 'APPROVED_MANAGER' && (isSuper || role === 'MANAGER')) {
            nextStatus = 'COMPLETED'
        } else if (currentStatus === 'COMPLETED' && (isSuper || role === 'MANAGER')) {
            nextStatus = 'CLOSED'
        }

        if (nextStatus === currentStatus) {
            throw new Error(`Invalid transition or insufficient permissions for role ${role} at state ${currentStatus}`)
        }

        // Lock Total Invoice Value and Implementation Cost at the point of manager approval so they never drift
        if (nextStatus === 'APPROVED_MANAGER') {
            const jobData = jobCards.value.find(j => j.id === id)
            if (jobData) {
                // Check if already deducted to prevent double-deduction during status updates
                if (!jobData.inventoryDeducted) {
                    const { inventoryApi } = await import('@/features/inventory/api/inventoryApi')
                    const deductedItemIds = new Set<string>()
                    
                    // 1. Process Flat Items
                    const flatItems = jobData.requisitionItems || []
                    for (const item of flatItems) {
                        const isApproved = item.approvalStatus === 'APPROVED_ACCOUNTANT' || item.approvalStatus === 'APPROVED_MANAGER'
                        if (isApproved && item.inventoryItemId && !item.inventoryDeducted && Number(item.quantity || item.qtyRequired || 0) > 0) {
                            try {
                                await inventoryApi.adjustStock(item.inventoryItemId, {
                                    type: 'REMOVE',
                                    qty: Number(item.quantity || item.qtyRequired || 0),
                                    reason: `Job Card Approval: ${jobData.generalInfo?.jobNumber || id}`,
                                    reference: jobData.generalInfo?.jobNumber || id,
                                    unitCost: Number(item.unitCost || item.costPrice || item.costSnapshot || 0)
                                })
                                deductedItemIds.add(item.id)
                            } catch (err) {
                                console.error(`Failed to deduct inventory for item ${item.inventoryItemId}:`, err)
                            }
                        }
                    }

                    // 2. Process Nested Section Items
                    const sections = jobData.requisitionSections || []
                    for (const section of sections) {
                        const items = section.items || []
                        for (const item of items) {
                            const isApproved = item.approvalStatus === 'APPROVED_ACCOUNTANT' || item.approvalStatus === 'APPROVED_MANAGER'
                            if (isApproved && item.inventoryItemId && !item.inventoryDeducted && Number(item.quantity || item.qtyRequired || 0) > 0) {
                                try {
                                    await inventoryApi.adjustStock(item.inventoryItemId, {
                                        type: 'REMOVE',
                                        qty: Number(item.quantity || item.qtyRequired || 0),
                                        reason: `Job Card Approval: ${jobData.generalInfo?.jobNumber || id}`,
                                        reference: jobData.generalInfo?.jobNumber || id,
                                        unitCost: Number(item.unitCost || item.costPrice || item.costSnapshot || 0)
                                    })
                                    deductedItemIds.add(item.id)
                                } catch (err) {
                                    console.error(`Failed to deduct inventory for item ${item.inventoryItemId}:`, err)
                                }
                            }
                        }
                    }

                    // 3. Update Line Item Deduction Statuses (Keep existing approval statuses)
                    const updatedRequisitionItems = (jobData.requisitionItems || []).map((i: any) => {
                        let item = { ...i }
                        if (deductedItemIds.has(i.id)) item.inventoryDeducted = true
                        return item
                    })

                    const updatedSections = (jobData.requisitionSections || []).map((s: any) => ({
                        ...s,
                        items: (s.items || []).map((i: any) => {
                            let item = { ...i }
                            if (deductedItemIds.has(i.id)) item.inventoryDeducted = true
                            return item
                        })
                    }))

                    // Ad-hoc expenses and staff rates are NOT automatically approved anymore.
                    // This forces the user to use the "Approve All" buttons which correctly record ledger entries.
                    const updatedAdHoc = jobData.adHocExpenses || []
                    const updatedStaffRates = jobData.staffRates || []

                    await updateDoc(doc(db, 'jobCards', id), {
                        requisitionItems: updatedRequisitionItems,
                        requisitionSections: updatedSections,
                        adHocExpenses: updatedAdHoc,
                        staffRates: updatedStaffRates,
                        inventoryDeducted: true, // Mark that a deduction pass was attempted
                        updatedAt: serverTimestamp()
                    })
                }
            }
        }

        // Lock Total Invoice Value and Implementation Cost ONLY AT CLOSURE
        if (nextStatus === 'CLOSED') {
            const jobData = jobCards.value.find(j => j.id === id)
            if (jobData) {
                const updatedSections = jobData.requisitionSections || []
                const updatedAdHoc = jobData.adHocExpenses || []
                const updatedStaffRates = (jobData.staffRates || []).map((r: any) => {
                        if (r.approvalStatus === 'APPROVED_ACCOUNTANT' || !r.approvalStatus) {
                            return { ...r, approvalStatus: 'APPROVED_MANAGER', approvedAt: r.approvedAt || now }
                        }
                        return r
                    })
                const financials = computeFinancials(updatedSections, updatedAdHoc, jobData.inventoryReturns || [], updatedStaffRates, jobData.generalInfo?.referrers || [], nextStatus)
                const adHocTotal = updatedAdHoc.reduce((sum: number, e: any) => sum + (e.totalAmount || 0), 0)
                const staffRatesTotal = updatedStaffRates.reduce((sum: number, r: any) => sum + (r.jobRateAmount || 0), 0)
                const implementationCost = adHocTotal + staffRatesTotal

                await updateDoc(doc(db, 'jobCards', id), {
                    lockedTotalInvoiceValue: financials.totalInvoiceValue,
                    lockedImplementationCost: implementationCost,
                    closedAt: serverTimestamp(),
                    closedBy: userName,
                    updatedAt: serverTimestamp()
                })
            }
        }


        await updateJobCardStatus(id, nextStatus, {
            user: userName,
            role,
            status: `Approved -> ${nextStatus}`
        })

    }

    async function rejectJobCard(id: string, role: string, userName: string, reason: string) {
        await updateJobCardStatus(id, 'REJECTED', {
            user: userName,
            role,
            status: 'Rejected',
            comment: reason
        })
    }

    async function updateJobCardArray(jobId: string, arrayField: 'requisitionItems' | 'adHocExpenses' | 'inventoryReturns' | 'staffRates' | 'allocatedTools', updatedArray: any[]) {
        const ref = doc(db, 'jobCards', jobId)
        await updateDoc(ref, {
            [arrayField]: updatedArray,
            updatedAt: serverTimestamp()
        })
    }

    async function approveAdHocExpenseFromFinance(jobId: string, itemId: string, financeStoreRecordFn: Function) {
        const job = jobCards.value.find(j => j.id === jobId)
        if (!job) throw new Error('Job not found')

        const clonedArray = [...(job.adHocExpenses || [])]
        const itemIndex = clonedArray.findIndex((i: any) => i.id === itemId)
        if (itemIndex === -1) throw new Error('Item not found')

        clonedArray[itemIndex].approvalStatus = 'APPROVED_MANAGER'

        await updateJobCardArray(jobId, 'adHocExpenses', clonedArray)

        const expenseItem = clonedArray[itemIndex]
        const jobIdentifier = job.generalInfo?.jobNumber || job.id.substring(0, 8)

        await financeStoreRecordFn({
            category: 'job-card-expense',
            amount: Number(expenseItem.totalAmount || 0),
            paymentMethod: (expenseItem.paymentMethod || 'cash').toLowerCase(),
            description: `Job Card ${jobIdentifier} - ${expenseItem.description || 'Ad-hoc expense'}`,
            attachmentUrl: expenseItem.attachmentUrl || null,
            attachmentUrls: expenseItem.attachmentUrls || (expenseItem.attachmentUrl ? [expenseItem.attachmentUrl] : []),
            status: 'APPROVED',
            sourceJobId: jobId,
            sourceItemId: itemId
        })
    }

    async function updateFullJobCard(id: string, payload: any) {
        try {
            const docRef = doc(db, 'jobCards', id)
            const updateData: any = {
                updatedAt: serverTimestamp()
            }

            // Dynamically build the update object to avoid 'undefined' errors and support partials
            const fields = [
                'generalInfo',
                'requisitionItems',
                'requisitionSections',
                'adHocExpenses',
                'inventoryReturns',
                'staffRates',
                'allocatedTools',
                'totals',
                'summary',
                'status'
            ]

            fields.forEach(field => {
                if (payload[field] !== undefined) {
                    updateData[field] = payload[field]
                }
            })

            await updateDoc(docRef, updateData)
        } catch (err: any) {
            console.error('Error updating full job card:', err)
            throw err
        }
    }

    async function deleteJobCardCascade(id: string, currentStatus: string, isAdmin: boolean = false) {
        if (!isAdmin && (currentStatus === 'APPROVED_MANAGER' || currentStatus === 'COMPLETED')) {
            throw new Error('Cannot delete a fully approved Job Card. It must be voided to maintain ledger integrity.')
        }

        try {
            const batch = writeBatch(db)

            // 1. Delete items subcollection
            const itemsSnap = await getDocs(collection(db, 'jobCards', id, 'items'))
            itemsSnap.forEach(docSnap => batch.delete(docSnap.ref))

            // 2. Delete expenses subcollection
            const expensesSnap = await getDocs(collection(db, 'jobCards', id, 'expenses'))
            expensesSnap.forEach(docSnap => batch.delete(docSnap.ref))

            // 3. Delete jobPayments linked to this job card
            const paymentsQ = query(collection(db, 'jobPayments'), where('jobCardId', '==', id))
            const paymentsSnap = await getDocs(paymentsQ)
            paymentsSnap.forEach(docSnap => batch.delete(docSnap.ref))

            // 4. Delete operationalExpenses linked to this job card via sourceJobId
            const opexQ = query(collection(db, 'operationalExpenses'), where('sourceJobId', '==', id))
            const opexSnap = await getDocs(opexQ)
            opexSnap.forEach(docSnap => batch.delete(docSnap.ref))

            // 5. Delete the main Job Card Document
            batch.delete(doc(db, 'jobCards', id))

            // Commit atomic deletion
            await batch.commit()

            // Remove from local reactive state to prevent flashing
            jobCards.value = jobCards.value.filter(j => j.id !== id)
        } catch (err: any) {
            console.error('Error deleting job card cascade:', err)
            throw err
        }
    }

    async function lockApprovedItems(id: string, type: 'inventory' | 'expenses') {
        try {
            const docRef = doc(db, 'jobCards', id)
            const docSnap = await getDocs(query(collection(db, 'jobCards'), where('__name__', '==', id)))
            if (docSnap.empty) throw new Error('Job Card not found')

            const snapDoc = docSnap.docs[0]
            if (!snapDoc) throw new Error('Job Card document not found')
            const data = snapDoc.data()
            const updateData: any = { updatedAt: serverTimestamp() }

            if (type === 'inventory') {
                const sections = data.requisitionSections || []
                const items = data.requisitionItems || []

                updateData.requisitionSections = sections.map((s: any) => ({
                    ...s,
                    items: s.items.map((i: any) => i.approvalStatus === 'APPROVED_MANAGER' ? { ...i, isLockedAgainstPdf: true } : i)
                }))
                updateData.requisitionItems = items.map((i: any) => i.approvalStatus === 'APPROVED_MANAGER' ? { ...i, isLockedAgainstPdf: true } : i)
            } else {
                const expenses = data.adHocExpenses || []
                updateData.adHocExpenses = expenses.map((e: any) => e.approvalStatus === 'APPROVED_MANAGER' ? { ...e, isLockedAgainstPdf: true } : e)
            }

            await updateDoc(docRef, updateData)

            // If locking expenses, also lock corresponding OPEX docs to enforce single-download globally
            if (type === 'expenses') {
                try {
                    const q = query(collection(db, 'operationalExpenses'), where('sourceJobId', '==', id))
                    const opexSnap = await getDocs(q)
                    const batch = writeBatch(db)
                    let count = 0
                    
                    opexSnap.forEach(d => {
                        const opexData = d.data()
                        // If it has a sourceItemId, verify it's one of the ones we just locked
                        if (opexData.sourceItemId) {
                           const isRecentlyLocked = updateData.adHocExpenses.some((e: any) => e.id === opexData.sourceItemId && e.isLockedAgainstPdf)
                           if (isRecentlyLocked) {
                               batch.update(d.ref, { pdfGenerated: true, pdfLockedAt: serverTimestamp() })
                               count++
                           }
                        }
                    })
                    
                    if (count > 0) await batch.commit()
                } catch (err) {
                    console.warn('Cross-module locking partially failed:', err)
                }
            }
        } catch (err: any) {
            console.error(`Error locking ${type}:`, err)
            throw err
        }
    }

    async function duplicateJobCard(sourceId: string, submittedBy: { uid: string; email: string; name: string }) {
        const sourceSnap = await getDoc(doc(db, 'jobCards', sourceId))
        if (!sourceSnap.exists()) throw new Error('Source job card not found')
        const src = sourceSnap.data()

        const newJobNumber = await generateJobNumber()

        // Copy generalInfo but clear client-specific fields
        const generalInfo = {
            ...(src.generalInfo || {}),
            jobNumber: newJobNumber,
            recipientName: '',
            recipientAddress: '',
            recipientPhone: '',
            receiptNumber: '',
            ecocashOrBankAccount: '',
            referrers: (src.generalInfo?.referrers || []).map((ref: any) => ({
                id: `ref_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
                name: ref.name || '',
                amount: Number(ref.amount) || 0,
                paymentMethod: ref.paymentMethod || 'CASH',
                approvalStatus: 'PENDING',
                createdAt: new Date().toISOString()
            }))
        }

        // Fetch latest inventory costs to heal any zero costSnapshots during duplication
        const inventoryMap = new Map()
        try {
            const invSnap = await getDocs(collection(db, 'inventoryItems'))
            invSnap.docs.forEach(d => {
                const data = d.data()
                const cost = Number(data.totalCost ?? (Number(data.purchasePrice ?? 0) + Number(data.freightDuty ?? 0)))
                inventoryMap.set(d.id, cost)
            })
        } catch (err) {
            console.warn('Could not fetch inventory items for cost healing on duplication:', err)
        }

        // Copy sections, stripping approval/lock state per item
        const requisitionSections = (src.requisitionSections || []).map((s: any) => ({
            ...s,
            id: crypto.randomUUID(),
            items: (s.items || []).map((item: any) => {
                const { approvalStatus, isLockedAgainstPdf, ...rest } = item
                let resolvedCost = Number(item.costSnapshot || 0)
                if (item.inventoryItemId && resolvedCost === 0) {
                    resolvedCost = inventoryMap.get(item.inventoryItemId) || 0
                }
                return { ...rest, id: crypto.randomUUID(), approvalStatus: 'PENDING', costSnapshot: resolvedCost }
            })
        }))

        const requisitionItems = requisitionSections.flatMap((s: any) =>
            (s.items || []).map((item: any) => ({ ...item, jobCategoryId: s.jobCategoryId || '' }))
        )

        // Copy expenses, stripping approval/lock state
        const adHocExpenses = (src.adHocExpenses || []).map((e: any) => {
            const { approvalStatus, isLockedAgainstPdf, ...rest } = e
            return { ...rest, id: crypto.randomUUID(), approvalStatus: 'PENDING' }
        })

        // Copy staff rates, stripping approval/lock state
        const staffRates = (src.staffRates || []).map((r: any) => {
            const { approvalStatus, isLockedAgainstPdf, ...rest } = r
            return { ...rest, id: crypto.randomUUID(), approvalStatus: 'PENDING' }
        })

        const newRef = doc(collection(db, 'jobCards'))
        await writeBatch(db).set(newRef, {
            status: 'SUBMITTED',
            generalInfo,
            submittedBy,
            requisitionSections,
            requisitionItems,
            adHocExpenses,
            staffRates,
            allocatedTools: [],
            inventoryReturns: [],
            totals: src.totals || {},
            summary: src.summary || {},
            duplicatedFrom: sourceId,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
        }).commit()

        return newRef.id
    }

    function cleanup() {
        if (unsubscribe) {
            unsubscribe()
            unsubscribe = null
        }
    }

    async function updateJobCardItemPrLink(jobId: string, itemId: string, prId: string, prNumber: string, poId: string) {
        const docRef = doc(db, 'jobCards', jobId)
        const snap = await getDoc(docRef)
        if (!snap.exists()) throw new Error('Job Card not found')

        const data = snap.data()
        const updateData: any = { updatedAt: serverTimestamp() }

        if (data.requisitionSections) {
            updateData.requisitionSections = data.requisitionSections.map((s: any) => ({
                ...s,
                items: (s.items || []).map((i: any) =>
                    i.id === itemId || i.inventoryItemId === itemId
                        ? { ...i, linkedPrId: prId, linkedPrNumber: prNumber, linkedPoId: poId }
                        : i
                )
            }))
        }

        if (data.requisitionItems) {
            updateData.requisitionItems = data.requisitionItems.map((i: any) =>
                i.id === itemId || i.inventoryItemId === itemId
                    ? { ...i, linkedPrId: prId, linkedPrNumber: prNumber, linkedPoId: poId }
                    : i
            )
        }

        await updateDoc(docRef, updateData)
    }

    async function syncAdHocProcurementToJobCard(jobId: string, item: any, metadata: any) {
        const docRef = doc(db, 'jobCards', jobId)
        const snap = await getDoc(docRef)
        if (!snap.exists()) throw new Error('Job Card not found')

        const data = snap.data()
        const adHocExpenses = [...(data.adHocExpenses || [])]

        adHocExpenses.push({
            id: crypto.randomUUID(),
            description: item.description,
            quantity: item.quantity,
            unitAmount: item.unitPrice,
            totalAmount: (item.quantity || 0) * (item.unitPrice || 0),
            approvalStatus: 'APPROVED_MANAGER',
            source: 'PROCUREMENT',
            linkedGrnId: metadata.grnId,
            linkedGrnNumber: metadata.grnNumber,
            linkedPoId: metadata.poId,
            linkedPoNumber: metadata.poNumber,
            createdAt: new Date().toISOString()
        })

        await updateDoc(docRef, { adHocExpenses, updatedAt: serverTimestamp() })
    }

    async function syncInventoryBacklog() {
        loading.value = true
        try {
            const q = query(collection(db, 'jobCards'))
            const snap = await getDocs(q)
            console.log(`[Sync] Found ${snap.docs.length} candidate job cards for sync.`)
            const { inventoryApi } = await import('@/features/inventory/api/inventoryApi')
            
            let count = 0
            for (const d of snap.docs) {
                const jobData = d.data()
                const jobId = jobData.generalInfo?.jobNumber || d.id
                let jobChanged = false
                const processedItemKeys = new Set<string>()

                // 1. Process Flat Items
                const flatItems = [...(jobData.requisitionItems || [])]
                for (const [index, item] of flatItems.entries()) {
                    const isApproved = item.approvalStatus === 'APPROVED_MANAGER'
                    const alreadyDeducted = item.inventoryDeducted || jobData.inventoryDeducted
                    const qty = Number(item.quantity || item.qtyRequired || item.qty || 0)
                    const itemKey = item.inventoryItemId || `${index}`
                    
                    if (isApproved && !alreadyDeducted && item.inventoryItemId && qty > 0) {
                        try {
                            await inventoryApi.adjustStock(item.inventoryItemId, {
                                type: 'REMOVE',
                                qty: qty,
                                reason: `Backlog Sync: ${jobId}`,
                                reference: jobId,
                                unitCost: Number(item.unitCost || item.costPrice || item.costSnapshot || 0),
                                skipFinancials: true
                            })
                            item.inventoryDeducted = true
                            jobChanged = true
                            processedItemKeys.add(itemKey)
                        } catch (err) {
                            console.error(`[Sync] Failed sync for item ${item.inventoryItemId}:`, err)
                        }
                    } else if (isApproved && !alreadyDeducted) {
                      console.log(`[Sync] Skipping item ${item.itemName || item.name} in ${jobId}: Missing qty or ID. Qty: ${qty}, ID: ${item.inventoryItemId}`)
                    }
                }

                // 2. Process Nested Section Items
                const sections = [...(jobData.requisitionSections || [])]
                for (const section of sections) {
                    const items = section.items || []
                    for (const item of items) {
                        const isApproved = item.approvalStatus === 'APPROVED_MANAGER'
                        const alreadyDeducted = item.inventoryDeducted || jobData.inventoryDeducted
                        const qty = Number(item.quantity || item.qtyRequired || item.qty || 0)
                        const itemKey = item.inventoryItemId

                        // Skip if we already processed this item in the flat list
                        if (itemKey && processedItemKeys.has(itemKey)) continue

                        if (isApproved && !alreadyDeducted && item.inventoryItemId && qty > 0) {
                            try {
                                await inventoryApi.adjustStock(item.inventoryItemId, {
                                    type: 'REMOVE',
                                    qty: qty,
                                    reason: `Backlog Sync: ${jobId}`,
                                    reference: jobId,
                                    unitCost: Number(item.unitCost || item.costPrice || item.costSnapshot || 0),
                                    skipFinancials: true
                                })
                                item.inventoryDeducted = true
                                jobChanged = true
                            } catch (err) {
                                console.error(`[Sync] Failed sync for nested item ${item.inventoryItemId}:`, err)
                            }
                        } else if (isApproved && !alreadyDeducted) {
                           console.log(`[Sync] Skipping nested item ${item.itemName || item.name} in ${jobId}: Missing qty or ID. Qty: ${qty}, ID: ${item.inventoryItemId}`)
                        }
                    }
                }

                if (jobChanged) {
                    console.log(`[Sync] Successfully updated items for ${jobId}.`)
                    const now = new Date().toISOString()
                    // Set timestamps if missing
                    const updatedFlat = flatItems.map((i: any) => i.approvalStatus === 'APPROVED_MANAGER' && !i.approvedAt ? { ...i, approvedAt: now } : i)
                    const updatedSections = sections.map((s: any) => ({
                        ...s,
                        items: (s.items || []).map((i: any) => i.approvalStatus === 'APPROVED_MANAGER' && !i.approvedAt ? { ...i, approvedAt: now } : i)
                    }))

                    await updateDoc(d.ref, { 
                        requisitionItems: updatedFlat,
                        requisitionSections: updatedSections
                    })
                    count++
                }
            }
            return count
        } catch (err) {
            console.error('[Sync] Error during backlog sync:', err)
            throw err
        } finally {
            loading.value = false
        }
    }

    async function updateToolReturnChecklist(jobId: string, checklist: any[]) {
        try {
            const ref = doc(db, 'jobCards', jobId)
            await updateDoc(ref, {
                toolReturnChecklist: checklist,
                updatedAt: serverTimestamp()
            })
        } catch (err: any) {
            console.error('Error updating tool return checklist:', err)
            throw err
        }
    }

    return {
        jobCards,
        loading,
        error,
        fetchJobCards,
        createJobCard,
        updateJobCardStatus,
        updateJobCardArray,
        updateFullJobCard,
        approveJobCard,
        rejectJobCard,
        approveAdHocExpenseFromFinance,
        generateJobNumber,
        deleteJobCardCascade,
        lockApprovedItems,
        duplicateJobCard,
        updateJobCardItemPrLink,
        syncAdHocProcurementToJobCard,
        syncInventoryBacklog,
        updateToolReturnChecklist,
        cleanup
    }
})
