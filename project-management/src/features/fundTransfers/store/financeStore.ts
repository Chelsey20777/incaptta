import { defineStore } from 'pinia'
import { ref, onUnmounted } from 'vue'
import { db } from '@/lib/firebase'
import { collection, query, onSnapshot, addDoc, serverTimestamp, orderBy } from 'firebase/firestore'

export const useFinanceStore = defineStore('finance', () => {
    const expenses = ref<any[]>([])
    const transfers = ref<any[]>([])
    const jobPayments = ref<any[]>([]) // NEW: Reactive state for client incoming payments
    const ledger = ref<any[]>([])
    const topUps = ref<any[]>([]) // NEW: External capital injections
    const salariesTransactions = ref<any[]>([]) // NEW: For payroll payment outflows
    const finalBalances = ref<Record<string, number>>({
        BANK: 0,
        CASH: 0,
        ECOCASH: 0,
        IRD: 0,
        SALARIES: 0,
        CREDIT: 0,
        INVENTORY: 0
    })
    const historicalInventoryCost = ref(0)
    const loading = ref(false)
    const error = ref<string | null>(null)

    // Accounts that represent liquid cash flow
    const LIQUID_ACCOUNTS = ['BANK', 'CASH', 'ECOCASH', 'IRD', 'SALARIES']

    let unsubExpenses: (() => void) | null = null
    let unsubTransfers: (() => void) | null = null
    let unsubPayments: (() => void) | null = null
    let unsubTopUps: (() => void) | null = null
    let unsubSalaries: (() => void) | null = null

    function fetchExpenses() {
        loading.value = true
        const q = query(collection(db, 'operationalExpenses'), orderBy('createdAt', 'desc'))
        unsubExpenses = onSnapshot(q, (snapshot) => {
            expenses.value = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
            updateLedger()
        })
    }

    function fetchTransfers() {
        loading.value = true
        const q = query(collection(db, 'fundTransfers'), orderBy('createdAt', 'desc'))
        unsubTransfers = onSnapshot(q, (snapshot) => {
            transfers.value = snapshot.docs.map(doc => {
                const data = doc.data()
                return {
                    id: doc.id,
                    ...data,
                    date: data.createdAt?.toDate?.()?.toLocaleDateString() || new Date().toLocaleDateString(),
                    status: data.status || 'COMPLETED' // Default if not set
                }
            })
            updateLedger()
        })
    }

    function fetchJobPayments() {
        loading.value = true
        const q = query(collection(db, 'jobPayments'), orderBy('createdAt', 'desc'))
        unsubPayments = onSnapshot(q, (snapshot) => {
            jobPayments.value = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
            updateLedger()
        })
    }
    function fetchTopUps() {
        loading.value = true
        const q = query(collection(db, 'ledgerTopUps'), orderBy('createdAt', 'desc'))
        unsubTopUps = onSnapshot(q, (snapshot) => {
            topUps.value = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
            updateLedger()
        })
    }

    function fetchSalariesTransactions() {
        loading.value = true
        const q = query(collection(db, 'salariesAccountTransactions'), orderBy('createdAt', 'desc'))
        unsubSalaries = onSnapshot(q, (snapshot) => {
            salariesTransactions.value = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
            updateLedger()
        })
    }

    async function fetchHistoricalInventoryConsumption() {
        try {
            const { getDocs, query, collection } = await import('firebase/firestore')
            // This mimics reportStore.generateInventoryReport but just for the total balance
            const q = query(collection(db, 'jobCards'))
            const snap = await getDocs(q)
            let total = 0
            snap.docs.forEach(doc => {
                const data = doc.data()
                // 1. Sections
                const sections = data.requisitionSections || []
                sections.forEach((s: any) => {
                    (s.items || []).forEach((i: any) => {
                        if (i.inventoryItemId && i.approvalStatus === 'APPROVED_MANAGER') {
                            const qty = Number(i.qtyRequired || i.quantity || 0)
                            const price = Number(i.irdSellingPrice || i.unitCost || i.costSnapshot || 0)
                            total += qty * price
                        }
                    })
                })
                // 2. Flat items (avoiding duplicates if already processed in sections)
                const flatItems = data.requisitionItems || []
                flatItems.forEach((i: any) => {
                    if (i.inventoryItemId && i.approvalStatus === 'APPROVED_MANAGER') {
                        const alreadyInSections = sections.some((s: any) => (s.items || []).some((si: any) => si.id === i.id))
                        if (!alreadyInSections) {
                            const qty = Number(i.qtyRequired || i.quantity || 0)
                            const price = Number(i.irdSellingPrice || i.unitCost || i.costSnapshot || 0)
                            total += qty * price
                        }
                    }
                })
            })
            historicalInventoryCost.value = total
        } catch (err) {
            console.error('[FinanceStore] Historical fetch failed:', err)
        }
        updateLedger()
    }

    function updateLedger() {
        // Merged view of expenses, transfers, and incoming payments for the ledger
        const items = [
            ...expenses.value.filter(e => ['APPROVED', 'APPROVED_FOR_PAYMENT', 'PAYMENT_PROCESSED'].includes(e.status)).map(e => ({
                ...e,
                type: 'EXPENSE',
                amount: -Math.abs(Number(e.amount || 0)), // Force negative
                account: e.paymentMethod ? e.paymentMethod.toUpperCase() : 'UNKNOWN',
                description: e.description || e.title || e.category || 'Operational Expense',
                date: e.createdAt?.toDate?.()?.toLocaleDateString() || new Date().toLocaleDateString()
            })),
            ...transfers.value.filter(t => t.status === 'COMPLETED').flatMap(t => [
                {
                    ...t,
                    id: `${t.id}_out`,
                    type: 'TRANSFER',
                    amount: -Math.abs(Number(t.amount || 0)), // Negative for source
                    account: t.fromAccount ? t.fromAccount.toUpperCase() : 'UNKNOWN',
                    description: `Transfer to ${t.toAccount ? t.toAccount.toUpperCase() : 'UNKNOWN'} ${t.reference ? '- ' + t.reference : ''}`,
                    date: t.date || new Date().toLocaleDateString()
                },
                {
                    ...t,
                    id: `${t.id}_in`,
                    type: 'TRANSFER',
                    amount: Math.abs(Number(t.amount || 0)), // Positive for destination
                    account: t.toAccount ? t.toAccount.toUpperCase() : 'UNKNOWN',
                    description: `Transfer from ${t.fromAccount ? t.fromAccount.toUpperCase() : 'UNKNOWN'} ${t.reference ? '- ' + t.reference : ''}`,
                    date: t.date || new Date().toLocaleDateString()
                }
            ]),
            ...jobPayments.value.map(p => ({
                ...p,
                type: 'INCOME',
                amount: Math.abs(Number(p.amount || 0)), // Force positive
                account: p.paymentMethod ? p.paymentMethod.toUpperCase() : 'UNKNOWN',
                date: p.createdAt?.toDate?.()?.toLocaleDateString() || new Date().toLocaleDateString()
            })),
            ...topUps.value.filter(t => t.status === 'COMPLETED').map(t => ({
                ...t,
                type: 'TOPUP',
                amount: Math.abs(Number(t.amount || 0)), // Force positive
                account: t.account ? t.account.toUpperCase() : 'UNKNOWN',
                description: `${t.description || 'Top-up'} [Req: ${t.requestedBy || 'N/A'}]`,
                date: t.createdAt?.toDate?.()?.toLocaleDateString() || new Date().toLocaleDateString()
            }))
        ]

        // Sort ascending to calculate running balance accurately from the beginning of time
        items.sort((a, b) => {
            const dateA = a.createdAt?.toDate?.() || new Date(0)
            const dateB = b.createdAt?.toDate?.() || new Date(0)
            return dateA.getTime() - dateB.getTime()
        })

        const accountBalances: Record<string, number> = {
            BANK: 0,
            CASH: 0,
            ECOCASH: 0,
            IRD: 0,
            SALARIES: 0,
            CREDIT: 0,
            INVENTORY: -historicalInventoryCost.value // Start with historical consumption
        }
        const LIQUID_SET = new Set(LIQUID_ACCOUNTS)
        let totalBusinessBalance = 0

        const ledgerWithBalances = items.map(item => {
            const acc = item.account as string
            if (accountBalances[acc] === undefined) {
                accountBalances[acc] = 0
            }

            const amount = item.amount || 0
            accountBalances[acc] += amount
            
            // Only include liquid accounts in the total treasury balance
            if (LIQUID_SET.has(acc)) {
                totalBusinessBalance += amount
            }

            return {
                ...item,
                accountBalance: accountBalances[acc],
                globalBalance: totalBusinessBalance
            }
        })

        // Reverse to show the newest entries at the top of the table
        ledger.value = ledgerWithBalances.reverse()
        finalBalances.value = accountBalances
        loading.value = false
    }

    async function recordExpense(data: any) {
        await addDoc(collection(db, 'operationalExpenses'), {
            ...data,
            status: data.status || 'PENDING_ACCOUNTANT',
            pdfGenerated: data.pdfGenerated || false,
            createdAt: serverTimestamp()
        })
    }

    async function lockExpensePdf(id: string) {
        const { doc, updateDoc } = await import('firebase/firestore')
        await updateDoc(doc(db, 'operationalExpenses', id), {
            pdfGenerated: true,
            pdfLockedAt: serverTimestamp()
        })
    }

    async function unlockExpensePdf(id: string) {
        const { doc, updateDoc } = await import('firebase/firestore')
        await updateDoc(doc(db, 'operationalExpenses', id), {
            pdfGenerated: false,
            pdfUnlockedAt: serverTimestamp()
        })
    }

    // Step 1: Accountant approves
    async function approveExpenseByAccountant(id: string, approvedBy: { name?: string; email?: string }) {
        const { doc, updateDoc } = await import('firebase/firestore')
        
        // Check amount for auto-approval rule (< $300)
        const expense = expenses.value.find(e => e.id === id)
        const amount = Number(expense?.amount || 0)
        const isAutoApproved = amount < 300
        
        const updateData: any = {
            status: isAutoApproved ? 'APPROVED_FOR_PAYMENT' : 'APPROVED_ACCOUNTANT',
            accountantApprovedAt: serverTimestamp(),
            accountantApprovedBy: approvedBy.name || approvedBy.email || 'Accountant'
        }

        // If auto-approved, add system manager approval metadata
        if (isAutoApproved) {
            updateData.managerApprovedAt = serverTimestamp()
            updateData.managerApprovedBy = 'System (Auto-approved < $300)'
        }

        await updateDoc(doc(db, 'operationalExpenses', id), updateData)
    }

    // Step 2: Manager gives final approval — ledger posts automatically
    async function approveExpenseByManager(id: string, approvedBy: { name?: string; email?: string }, comment?: string) {
        const { doc, updateDoc } = await import('firebase/firestore')
        await updateDoc(doc(db, 'operationalExpenses', id), {
            status: 'APPROVED_FOR_PAYMENT',
            managerApprovedAt: serverTimestamp(),
            managerApprovedBy: approvedBy.name || approvedBy.email || 'Manager',
            ...(comment ? { managerComment: comment } : {})
        })
    }

    async function rejectExpenseByAccountant(id: string, rejectedBy: { name?: string; email?: string }, comment: string) {
        const { doc, updateDoc } = await import('firebase/firestore')
        await updateDoc(doc(db, 'operationalExpenses', id), {
            status: 'REJECTED_ACCOUNTANT',
            accountantRejectedAt: serverTimestamp(),
            accountantRejectedBy: rejectedBy.name || rejectedBy.email || 'Accountant',
            accountantComment: comment
        })
    }

    async function rejectExpenseByManager(id: string, rejectedBy: { name?: string; email?: string }, comment: string) {
        const { doc, updateDoc } = await import('firebase/firestore')
        await updateDoc(doc(db, 'operationalExpenses', id), {
            status: 'REJECTED_MANAGER',
            managerRejectedAt: serverTimestamp(),
            managerRejectedBy: rejectedBy.name || rejectedBy.email || 'Manager',
            managerComment: comment
        })
    }

    async function processExpensePayment(id: string, processedBy: { name?: string; email?: string }, paymentData: {
        paymentMethod: string
        ledgerAccount: string
        transactionDate: string | undefined
        referenceNumber: string
        notes?: string
    }) {
        const { doc, getDoc, writeBatch, collection } = await import('firebase/firestore')

        const expenseRef = doc(db, 'operationalExpenses', id)
        const expenseSnap = await getDoc(expenseRef)
        if (!expenseSnap.exists()) {
            throw new Error('Expense not found')
        }
        const expense = { id: expenseSnap.id, ...expenseSnap.data() } as any

        // Check for sufficient funds
        const amount = Number(expense.amount || 0)
        const account = (paymentData.paymentMethod || '').toUpperCase()
        const currentBalance = finalBalances.value[account] || 0
        if (currentBalance < amount) {
            throw new Error(`Insufficient funds in ${account}. Available: $${currentBalance.toFixed(2)}, Required: $${amount.toFixed(2)}`)
        }

        const batch = writeBatch(db)

        batch.update(expenseRef, {
            status: 'PAYMENT_PROCESSED',
            paymentProcessedAt: serverTimestamp(),
            paymentProcessedBy: processedBy.name || processedBy.email || 'Finance',
            paymentDetails: paymentData
        })

        // If this is a Net Salary payment, atomically complete the HR payroll document and process linked advances
        if (expense && expense.type === 'PAYROLL_NET' && expense.payrollId) {
            const payrollRef = doc(db, 'payroll', expense.payrollId)
            const payrollSnap = await getDoc(payrollRef)
            if (payrollSnap.exists()) {
                const payrollData = payrollSnap.data()

                // 1. Mark payroll as Paid
                batch.update(payrollRef, {
                    status: 'Paid',
                    paymentMethod: paymentData.paymentMethod,
                    updatedAt: serverTimestamp()
                })

                // 2. Mark linked advances as Processed
                const linkedAdvanceIds = payrollData.linkedAdvanceIds || []
                linkedAdvanceIds.forEach((advId: string) => {
                    batch.update(doc(db, 'salaryAdvances', advId), {
                        status: 'Processed',
                        payrollId: expense.payrollId,
                        updatedAt: serverTimestamp()
                    })
                })

                // 3. Record in Salaries Account Transactions if paid via SALARIES
                if (paymentData.paymentMethod.toUpperCase() === 'SALARIES') {
                    const salariesTxRef = doc(collection(db, 'salariesAccountTransactions'))
                    batch.set(salariesTxRef, {
                        type: 'PAYMENT',
                        source: 'PAYROLL_NET',
                        amount: Number(expense.amount),
                        month: payrollData.month,
                        year: payrollData.year,
                        description: `Salary Payment: ${payrollData.employeeName}`,
                        referenceId: expense.payrollId,
                        createdAt: serverTimestamp()
                    })
                }
            }
        }

        await batch.commit()
    }

    async function deleteExpense(id: string) {
        const { doc, deleteDoc, getDoc, collection, query, where, getDocs, writeBatch } = await import('firebase/firestore')
        
        const batch = writeBatch(db)
        const expenseRef = doc(db, 'operationalExpenses', id)
        const expenseSnap = await getDoc(expenseRef)
        
        if (expenseSnap.exists()) {
            const data = expenseSnap.data()
            // 1. Clean up verification token if exists
            if (data.verificationToken) {
                batch.delete(doc(db, 'docVerifications', data.verificationToken))
            }
            
            // 2. Delete the expense itself
            batch.delete(expenseRef)
            
            await batch.commit()
        }
    }

    async function deleteTransfer(id: string) {
        const { doc, deleteDoc } = await import('firebase/firestore')
        await deleteDoc(doc(db, 'fundTransfers', id))
    }

    async function deleteIncome(id: string) {
        const { doc, getDoc, updateDoc, deleteDoc } = await import('firebase/firestore')
        const paymentRef = doc(db, 'jobPayments', id)
        const paymentSnap = await getDoc(paymentRef)
        
        if (paymentSnap.exists()) {
            const data = paymentSnap.data()
            const jobCardId = data.jobCardId
            const amount = Number(data.amount) || 0
            
            await deleteDoc(paymentRef)
            
            if (jobCardId) {
                const jobCardRef = doc(db, 'jobCards', jobCardId)
                const jobSnap = await getDoc(jobCardRef)
                if (jobSnap.exists()) {
                    const currentTotal = jobSnap.data().totalPaid || 0
                    const newTotal = Math.max(0, currentTotal - amount)
                    await updateDoc(jobCardRef, { totalPaid: newTotal })
                }
            }
        }
    }

    async function deleteTopUp(id: string) {
        const { doc, deleteDoc } = await import('firebase/firestore')
        await deleteDoc(doc(db, 'ledgerTopUps', id))
    }

    // Direct approval for system-generated expenses (payroll, etc.) — bypasses two-step flow
    async function approveExpense(id: string) {
        const { doc, updateDoc } = await import('firebase/firestore')
        const expenseRef = doc(db, 'operationalExpenses', id)
        await updateDoc(expenseRef, {
            status: 'APPROVED',
            approvedAt: serverTimestamp()
        })
    }

    async function initiateTransfer(data: any, initiatedBy?: { name?: string; email?: string }, autoApprove: boolean = false) {
        // Check for sufficient funds
        const amount = Number(data.amount || 0)
        const account = (data.fromAccount || '').toUpperCase()
        const hasLedgerLoaded = expenses.value.length > 0 || jobPayments.value.length > 0
        if (hasLedgerLoaded) {
            const currentBalance = finalBalances.value[account] || 0
            if (currentBalance < amount) {
                throw new Error(`Insufficient funds in ${account}. Available: $${currentBalance.toFixed(2)}, Required: $${amount.toFixed(2)}`)
            }
        }

        await addDoc(collection(db, 'fundTransfers'), {
            ...data,
            status: autoApprove ? 'COMPLETED' : 'PENDING_ACCOUNTANT',
            initiatedBy: initiatedBy?.name || initiatedBy?.email || 'Unknown',
            initiatedByEmail: initiatedBy?.email || '',
            ...(autoApprove ? {
                managerApprovedBy: initiatedBy?.name || initiatedBy?.email || 'System',
                managerApprovedAt: serverTimestamp()
            } : {}),
            createdAt: serverTimestamp()
        })
    }

    // Step 1: Accountant initials — transfer moves to manager queue
    async function accountantInitialTransfer(id: string, by: { name?: string; email?: string }) {
        const { doc, updateDoc } = await import('firebase/firestore')
        await updateDoc(doc(db, 'fundTransfers', id), {
            status: 'PENDING_MANAGER',
            accountantInitialedBy: by.name || by.email || 'Accountant',
            accountantInitialedAt: serverTimestamp()
        })
    }

    // Step 2: Manager final approval — recorded in ledger
    async function approveTransfer(id: string, by?: { name?: string; email?: string }) {
        const { doc, updateDoc } = await import('firebase/firestore')

        // Check for sufficient funds
        const transfer = transfers.value.find(t => t.id === id)
        if (transfer) {
            const amount = Number(transfer.amount || 0)
            const account = (transfer.fromAccount || '').toUpperCase()
            const hasLedgerLoaded = expenses.value.length > 0 || jobPayments.value.length > 0
            if (hasLedgerLoaded) {
                const currentBalance = finalBalances.value[account] || 0
                if (currentBalance < amount) {
                    throw new Error(`Insufficient funds in ${account} to approve this transfer. Available: $${currentBalance.toFixed(2)}, Required: $${amount.toFixed(2)}`)
                }
            }
        }

        await updateDoc(doc(db, 'fundTransfers', id), {
            status: 'COMPLETED',
            managerApprovedBy: by?.name || by?.email || 'Manager',
            managerApprovedAt: serverTimestamp()
        })

        // NEW: Record in Salaries Account if applicable
        if (transfer && transfer.toAccount && transfer.toAccount.toUpperCase() === 'SALARIES') {
            try {
                await addDoc(collection(db, 'salariesAccountTransactions'), {
                    type: 'TRANSFER',
                    source: 'FUND_TRANSFER',
                    amount: Number(transfer.amount),
                    month: new Date().getMonth() + 1,
                    year: new Date().getFullYear(),
                    description: `Transfer from ${transfer.fromAccount}`,
                    referenceId: id,
                    createdAt: serverTimestamp()
                })
            } catch (err) {
                console.error('Failed to record Salaries Account transfer:', err)
            }
        }
    }

    async function rejectTransfer(id: string, by?: { name?: string; email?: string }) {
        const { doc, updateDoc } = await import('firebase/firestore')
        await updateDoc(doc(db, 'fundTransfers', id), {
            status: 'REJECTED',
            rejectedBy: by?.name || by?.email || 'Unknown',
            rejectedAt: serverTimestamp()
        })
    }

    async function cancelTransfer(id: string, by?: { name?: string; email?: string }) {
        const { doc, updateDoc } = await import('firebase/firestore')
        await updateDoc(doc(db, 'fundTransfers', id), {
            status: 'CANCELLED',
            cancelledBy: by?.name || by?.email || 'Unknown',
            cancelledByEmail: by?.email || '',
            cancelledAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        })
    }

    async function recordIncome(data: any) {
        const { doc, updateDoc, getDoc } = await import('firebase/firestore')
        await addDoc(collection(db, 'jobPayments'), {
            ...data,
            createdAt: serverTimestamp()
        })

        if (data.jobCardId) {
            const jobCardRef = doc(db, 'jobCards', data.jobCardId)
            const jobSnap = await getDoc(jobCardRef)
            if (jobSnap.exists()) {
                const currentTotal = jobSnap.data().totalPaid || 0
                const newTotal = currentTotal + (Number(data.amount) || 0)
                await updateDoc(jobCardRef, { totalPaid: newTotal })
            }
        }
    }

    async function recordTopUp(data: any) {
        await addDoc(collection(db, 'ledgerTopUps'), {
            ...data,
            status: 'PENDING_ACCOUNTANT',
            createdAt: serverTimestamp()
        })
    }

    async function accountantInitialTopUp(id: string, by: { name?: string; email?: string }) {
        const { doc, updateDoc } = await import('firebase/firestore')
        await updateDoc(doc(db, 'ledgerTopUps', id), {
            status: 'PENDING_MANAGER',
            accountantInitialedBy: by.name || by.email || 'Accountant',
            accountantInitialedAt: serverTimestamp()
        })
    }

    async function approveTopUp(id: string, by?: { name?: string; email?: string }) {
        const { doc, updateDoc } = await import('firebase/firestore')
        await updateDoc(doc(db, 'ledgerTopUps', id), {
            status: 'COMPLETED',
            managerApprovedBy: by?.name || by?.email || 'Manager',
            managerApprovedAt: serverTimestamp()
        })
    }

    async function rejectTopUp(id: string, by?: { name?: string; email?: string }) {
        const { doc, updateDoc } = await import('firebase/firestore')
        await updateDoc(doc(db, 'ledgerTopUps', id), {
            status: 'REJECTED',
            rejectedBy: by?.name || by?.email || 'Unknown',
            rejectedAt: serverTimestamp()
        })
    }

    function cleanup() {
        unsubExpenses?.()
        unsubTransfers?.()
        unsubPayments?.()
        unsubTopUps?.()
        unsubSalaries?.()
    }

    return {
        expenses,
        transfers,
        jobPayments,
        topUps,
        ledger,
        finalBalances,
        loading,
        error,
        fetchExpenses,
        fetchTransfers,
        fetchJobPayments,
        fetchTopUps,
        fetchSalariesTransactions,
        fetchHistoricalInventoryConsumption,
        recordExpense,
        lockExpensePdf,
        unlockExpensePdf,
        initiateTransfer,
        accountantInitialTransfer,
        approveTransfer,
        rejectTransfer,
        cancelTransfer,
        recordIncome,
        recordTopUp,
        accountantInitialTopUp,
        approveTopUp,
        rejectTopUp,
        approveExpense,
        approveExpenseByAccountant,
        approveExpenseByManager,
        rejectExpenseByAccountant,
        rejectExpenseByManager,
        processExpensePayment,
        deleteExpense,
        deleteTransfer,
        deleteIncome,
        deleteTopUp,
        cleanup,
        LIQUID_ACCOUNTS
    }
})
