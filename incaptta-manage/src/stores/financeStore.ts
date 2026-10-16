import { defineStore } from 'pinia'
import { ref } from 'vue'
import { db } from '@/lib/firebase'
import { collection, query, onSnapshot, orderBy, getDocs, addDoc, serverTimestamp } from 'firebase/firestore'

export const useFinanceStore = defineStore('finance', () => {
    const expenses = ref<any[]>([])
    const transfers = ref<any[]>([])
    const jobPayments = ref<any[]>([])
    const ledger = ref<any[]>([])
    const topUps = ref<any[]>([])
    const salariesTransactions = ref<any[]>([])
    const historicalInventoryCost = ref(0)
    const finalBalances = ref<Record<string, number>>({
        BANK: 0,
        CASH: 0,
        ECOCASH: 0,
        IRD: 0,
        SALARIES: 0,
        CREDIT: 0,
        INVENTORY: 0
    })
    const totalBusinessBalance = ref(0)
    const loading = ref(false)
    const error = ref<string | null>(null)

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
        }, (e) => handleError(e, 'Fetch Expenses'))
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
                    status: data.status || 'COMPLETED'
                }
            })
            updateLedger()
        }, (e) => handleError(e, 'Fetch Transfers'))
    }

    function fetchJobPayments() {
        loading.value = true
        const q = query(collection(db, 'jobPayments'), orderBy('createdAt', 'desc'))
        unsubPayments = onSnapshot(q, (snapshot) => {
            jobPayments.value = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
            updateLedger()
        }, (e) => handleError(e, 'Fetch Job Payments'))
    }

    function fetchTopUps() {
        loading.value = true
        const q = query(collection(db, 'ledgerTopUps'), orderBy('createdAt', 'desc'))
        unsubTopUps = onSnapshot(q, (snapshot) => {
            topUps.value = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
            updateLedger()
        }, (e) => handleError(e, 'Fetch Top-Ups'))
    }

    function fetchSalariesTransactions() {
        loading.value = true
        const q = query(collection(db, 'salariesAccountTransactions'), orderBy('createdAt', 'desc'))
        unsubSalaries = onSnapshot(q, (snapshot) => {
            salariesTransactions.value = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
            updateLedger()
        }, (e) => handleError(e, 'Fetch Salaries Transactions'))
    }

    async function fetchHistoricalInventoryConsumption() {
        try {
            const snap = await getDocs(query(collection(db, 'jobCards')))
            let total = 0
            snap.docs.forEach(doc => {
                const data = doc.data()
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

    function handleError(err: any, context: string) {
        error.value = err.message
        console.error(`[FinanceStore] Error in ${context}:`, err)
    }

    function updateLedger() {
        const items = [
            ...expenses.value.filter(e => ['APPROVED', 'APPROVED_FOR_PAYMENT', 'PAYMENT_PROCESSED'].includes(e.status)).map(e => ({
                ...e,
                type: 'EXPENSE',
                amount: -Math.abs(Number(e.amount || 0)),
                account: e.paymentMethod ? e.paymentMethod.toUpperCase() : 'UNKNOWN',
                description: e.description || e.title || e.category || 'Operational Expense',
                createdAt: e.createdAt,
                date: e.createdAt?.toDate?.()?.toLocaleDateString() || new Date().toLocaleDateString()
            })),
            ...transfers.value.filter(t => t.status === 'COMPLETED').flatMap(t => [
                {
                    ...t,
                    id: `${t.id}_out`,
                    type: 'TRANSFER',
                    amount: -Math.abs(Number(t.amount || 0)),
                    account: t.fromAccount ? t.fromAccount.toUpperCase() : 'UNKNOWN',
                    description: `Transfer to ${t.toAccount ? t.toAccount.toUpperCase() : 'UNKNOWN'}`,
                    date: t.date || new Date().toLocaleDateString()
                },
                {
                    ...t,
                    id: `${t.id}_in`,
                    type: 'TRANSFER',
                    amount: Math.abs(Number(t.amount || 0)),
                    account: t.toAccount ? t.toAccount.toUpperCase() : 'UNKNOWN',
                    description: `Transfer from ${t.fromAccount ? t.fromAccount.toUpperCase() : 'UNKNOWN'}`,
                    date: t.date || new Date().toLocaleDateString()
                }
            ]),
            ...jobPayments.value.map(p => ({
                ...p,
                type: 'INCOME',
                amount: Math.abs(Number(p.amount || 0)),
                account: p.paymentMethod ? p.paymentMethod.toUpperCase() : 'UNKNOWN',
                createdAt: p.createdAt,
                date: p.createdAt?.toDate?.()?.toLocaleDateString() || new Date().toLocaleDateString()
            })),
            ...topUps.value.filter(t => t.status === 'COMPLETED').map(t => ({
                ...t,
                type: 'TOPUP',
                amount: Math.abs(Number(t.amount || 0)),
                account: t.account ? t.account.toUpperCase() : 'UNKNOWN',
                createdAt: t.createdAt,
                date: t.createdAt?.toDate?.()?.toLocaleDateString() || new Date().toLocaleDateString()
            })),
            ...salariesTransactions.value.filter(t => t.type === 'PAYMENT').map(t => ({
                ...t,
                type: 'SALARY_PAYMENT',
                amount: -Math.abs(Number(t.amount || 0)),
                account: 'SALARIES',
                description: t.description || 'Salary Payment',
                createdAt: t.createdAt,
                date: t.createdAt?.toDate?.()?.toLocaleDateString() || new Date().toLocaleDateString()
            }))
        ]

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
            INVENTORY: -historicalInventoryCost.value
        }
        const liquidSet = new Set(LIQUID_ACCOUNTS)
        let totalLiquidBalance = 0

        const ledgerWithBalances = items.map(item => {
            const acc = item.account as string
            if (accountBalances[acc] === undefined) {
                accountBalances[acc] = 0
            }

            const amount = item.amount || 0
            accountBalances[acc] += amount
            
            if (liquidSet.has(acc)) {
                totalLiquidBalance += amount
            }

            return {
                ...item,
                accountBalance: accountBalances[acc],
                globalBalance: totalLiquidBalance
            }
        })

        ledger.value = ledgerWithBalances.reverse()
        finalBalances.value = accountBalances
        totalBusinessBalance.value = totalLiquidBalance
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
        salariesTransactions,
        historicalInventoryCost,
        ledger,
        finalBalances,
        totalBusinessBalance,
        LIQUID_ACCOUNTS,
        loading,
        error,
        fetchExpenses,
        fetchTransfers,
        fetchJobPayments,
        fetchTopUps,
        fetchSalariesTransactions,
        fetchHistoricalInventoryConsumption,
        recordExpense,
        cleanup
    }
})

