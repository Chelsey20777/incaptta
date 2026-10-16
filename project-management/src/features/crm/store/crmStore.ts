import { defineStore } from 'pinia'
import { ref } from 'vue'
import { db } from '@/lib/firebase'
import { collection, query, onSnapshot, addDoc, updateDoc, doc, serverTimestamp, orderBy, getDoc, getDocs, where, runTransaction, increment } from 'firebase/firestore'

export const useCrmStore = defineStore('crm', () => {
    const customers = ref<any[]>([])
    const quotes = ref<any[]>([])
    const invoices = ref<any[]>([])
    const loading = ref(false)
    const error = ref<string | null>(null)

    // ── Credit account state (keyed by customerId) ─────────────────────────────
    const creditAccounts = ref<Record<string, any>>({})
    const creditTransactions = ref<Record<string, any[]>>({})

    let unsubCustomers: (() => void) | null = null
    let unsubQuotes: (() => void) | null = null
    let unsubInvoices: (() => void) | null = null

    function fetchCustomers() {
        loading.value = true
        const q = query(collection(db, 'customers'), orderBy('createdAt', 'desc'))
        unsubCustomers = onSnapshot(q, (snapshot) => {
            customers.value = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
            loading.value = false
        }, (err) => {
            console.error('Error fetching customers:', err)
            error.value = err.message
            loading.value = false
        })
    }

    function fetchQuotes() {
        loading.value = true
        const q = query(collection(db, 'crmQuotes'), orderBy('createdAt', 'desc'))
        unsubQuotes = onSnapshot(q, (snapshot) => {
            quotes.value = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
            loading.value = false
        }, (err) => {
            console.error('Error fetching quotes:', err)
            error.value = err.message
            loading.value = false
        })
    }

    function fetchInvoices() {
        loading.value = true
        const q = query(collection(db, 'crmInvoices'), orderBy('createdAt', 'desc'))
        unsubInvoices = onSnapshot(q, (snapshot) => {
            invoices.value = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
            loading.value = false
        }, (err) => {
            console.error('Error fetching invoices:', err)
            error.value = err.message
            loading.value = false
        })
    }

    async function createCustomer(data: any) {
        try {
            const docRef = await addDoc(collection(db, 'customers'), {
                ...data,
                createdAt: serverTimestamp()
            })

            // Sync to Leads Pipeline as 'New'
            const { useLeadsStore } = await import('./useLeadsStore')
            const leadsStore = useLeadsStore()
            await leadsStore.syncLeadStage(data.name, data.email, data.company || '', 'New')

            return docRef.id
        } catch (err: any) {
            console.error('Error creating customer:', err)
            throw err
        }
    }

    async function updateCustomer(id: string, data: any) {
        try {
            const docRef = doc(db, 'customers', id)
            await updateDoc(docRef, { ...data })
        } catch (err: any) {
            console.error('Error updating customer:', err)
            throw err
        }
    }

    async function createQuote(quoteData: any) {
        try {
            const enriched = {
                ...quoteData, // Automatically grabs the advanced items array, summary object, and grandTotal
                createdAt: serverTimestamp()
            }
            await addDoc(collection(db, 'crmQuotes'), enriched)

            // Sync to Leads Pipeline as 'Negotiation'
            const { useLeadsStore } = await import('./useLeadsStore')
            const leadsStore = useLeadsStore()
            await leadsStore.syncLeadStage(quoteData.customerName, '', '', 'Negotiation', quoteData.grandTotal)
        } catch (err: any) {
            console.error('Error creating quote:', err)
            throw err
        }
    }

    async function approveQuoteToInvoice(quoteId: string) {
        try {
            const quoteRef = doc(db, 'crmQuotes', quoteId)
            const quoteSnap = await getDoc(quoteRef)

            if (!quoteSnap.exists()) throw new Error("Quote not found")
            const quoteData = quoteSnap.data()

            // Update Quote Status to APPROVED
            await updateDoc(quoteRef, { status: 'APPROVED' })

            // Generate an Invoice duplicate
            const invoiceData = {
                ...quoteData, // Copies items[], summary (Total IRD/Markup splits), grandTotal, and customer
                originalQuoteId: quoteId,
                status: 'UNPAID', // Initial binding invoice status
                payments: [],     // Array of { amount, method, reference, date }
                amountPaid: 0,
                createdAt: serverTimestamp()
            }

            // Clean up the inherited quote properties that shouldn't perfectly transfer
            delete (invoiceData as any).updatedAt

            await addDoc(collection(db, 'crmInvoices'), invoiceData)

        } catch (err: any) {
            console.error('Error approving quote:', err)
            throw err
        }
    }

    async function updateInvoiceStatus(invoiceId: string, updates: any) {
        try {
            const docRef = doc(db, 'crmInvoices', invoiceId)
            await updateDoc(docRef, { ...updates })
        } catch (err: any) {
            console.error('Error updating invoice:', err)
            throw err
        }
    }

    async function updateQuote(id: string, data: any) {
        try {
            const docRef = doc(db, 'crmQuotes', id)
            await updateDoc(docRef, { ...data, updatedAt: serverTimestamp() })
        } catch (err: any) {
            console.error('Error updating quote:', err)
            throw err
        }
    }

    async function updateInvoice(id: string, data: any) {
        try {
            const docRef = doc(db, 'crmInvoices', id)
            await updateDoc(docRef, { ...data, updatedAt: serverTimestamp() })
        } catch (err: any) {
            console.error('Error updating invoice:', err)
            throw err
        }
    }

    async function recordInvoicePayment(invoiceId: string, amount: number, paymentMethod: 'CASH' | 'BANK' | 'ECOCASH', referenceNote: string) {
        try {
            const invoiceRef = doc(db, 'crmInvoices', invoiceId)
            const invoiceSnap = await getDoc(invoiceRef)
            if (!invoiceSnap.exists()) throw new Error("Invoice not found")
            const invoiceData = invoiceSnap.data()

            const newTotalPaid = (invoiceData.amountPaid || 0) + amount
            const newStatus = newTotalPaid >= invoiceData.grandTotal ? 'PAID' : 'PARTIAL'

            const paymentObj = {
                amount,
                method: paymentMethod,
                reference: referenceNote,
                date: new Date().toISOString()
            }

            // Calculate new internal arrays
            const existingPayments = invoiceData.payments || []

            await updateDoc(invoiceRef, {
                amountPaid: newTotalPaid,
                status: newStatus,
                payments: [...existingPayments, paymentObj]
            })

            // Dynamically import FinanceStore to bypass circular dependency during setup
            const { useFinanceStore } = await import('@/features/fundTransfers/store/financeStore')
            const financeStore = useFinanceStore()

            await financeStore.recordIncome({
                amount,
                paymentMethod,
                jobCardId: `CRM-INV-${invoiceId.substring(0, 8)}`, // Proxy mapping for ledger
                customerName: invoiceData.customerName,
                referenceNote: `CRM Payment - ${referenceNote}`
            })

        } catch (err: any) {
            console.error('Error recording invoice payment:', err)
            throw err
        }
    }

    // ── Credit account methods ─────────────────────────────────────────────────

    async function fetchCreditAccount(customerId: string) {
        try {
            const snap = await getDoc(doc(db, 'clientCreditAccounts', customerId))
            if (snap.exists()) {
                creditAccounts.value[customerId] = { id: snap.id, ...snap.data() }
            } else {
                creditAccounts.value[customerId] = { balance: 0, totalDeposited: 0, totalApplied: 0 }
            }
        } catch (err: any) {
            console.error('Error fetching credit account:', err)
            creditAccounts.value[customerId] = { balance: 0, totalDeposited: 0, totalApplied: 0 }
        }
    }

    async function fetchCreditTransactions(customerId: string) {
        try {
            const q = query(
                collection(db, 'clientCreditTransactions'),
                where('clientId', '==', customerId),
                orderBy('createdAt', 'desc')
            )
            const snap = await getDocs(q)
            creditTransactions.value[customerId] = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        } catch (err: any) {
            console.error('Error fetching credit transactions:', err)
            creditTransactions.value[customerId] = []
        }
    }

    async function recordDeposit(depositData: {
        clientId: string
        clientName: string
        amount: number
        paymentMethod: 'BANK' | 'ECOCASH' | 'CASH'
        reference: string
        notes: string
        currency: string
        createdBy: string
        createdByName: string
    }) {
        const accountRef = doc(db, 'clientCreditAccounts', depositData.clientId)

        await runTransaction(db, async (tx) => {
            const accountSnap = await tx.get(accountRef)
            const current = accountSnap.exists() ? accountSnap.data() : { balance: 0, totalDeposited: 0, totalApplied: 0 }
            const balanceBefore = Number(current.balance ?? 0)
            const balanceAfter  = balanceBefore + depositData.amount

            // Upsert the credit account
            if (accountSnap.exists()) {
                tx.update(accountRef, {
                    balance: increment(depositData.amount),
                    totalDeposited: increment(depositData.amount),
                    updatedAt: serverTimestamp()
                })
            } else {
                tx.set(accountRef, {
                    clientId: depositData.clientId,
                    clientName: depositData.clientName,
                    balance: depositData.amount,
                    totalDeposited: depositData.amount,
                    totalApplied: 0,
                    currency: depositData.currency,
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp()
                })
            }

            // Append the transaction record
            const txRef = doc(collection(db, 'clientCreditTransactions'))
            tx.set(txRef, {
                clientId: depositData.clientId,
                clientName: depositData.clientName,
                type: 'DEPOSIT',
                amount: depositData.amount,
                balanceBefore,
                balanceAfter,
                paymentMethod: depositData.paymentMethod,
                reference: depositData.reference,
                notes: depositData.notes,
                currency: depositData.currency,
                createdBy: depositData.createdBy,
                createdByName: depositData.createdByName,
                createdAt: serverTimestamp()
            })
        })

        // Refresh local state
        await fetchCreditAccount(depositData.clientId)
        await fetchCreditTransactions(depositData.clientId)
    }

    async function deleteQuote(id: string) {
        const { doc, deleteDoc } = await import('firebase/firestore')
        await deleteDoc(doc(db, 'crmQuotes', id))
    }

    async function duplicateQuote(quoteId: string) {
        try {
            const quoteRef = doc(db, 'crmQuotes', quoteId)
            const quoteSnap = await getDoc(quoteRef)

            if (!quoteSnap.exists()) throw new Error("Quote not found")
            const quoteData = quoteSnap.data()

            const duplicatedData = {
                ...quoteData,
                status: 'DRAFT',
                quoteRef: `QT-${Date.now().toString().slice(-6)} (Copy)`,
                createdAt: serverTimestamp()
            }

            delete (duplicatedData as any).updatedAt

            const newDocRef = await addDoc(collection(db, 'crmQuotes'), duplicatedData)

            const { useLeadsStore } = await import('./useLeadsStore')
            const leadsStore = useLeadsStore()
            await leadsStore.syncLeadStage(quoteData.customerName, '', '', 'Negotiation', quoteData.grandTotal)

            return newDocRef.id
        } catch (err: any) {
            console.error('Error duplicating quote:', err)
            throw err
        }
    }

    async function deleteInvoice(id: string) {
        const { doc, deleteDoc } = await import('firebase/firestore')
        await deleteDoc(doc(db, 'crmInvoices', id))
    }

    function cleanup() {
        if (unsubCustomers) unsubCustomers()
        if (unsubQuotes) unsubQuotes()
        if (unsubInvoices) unsubInvoices()
    }

    return {
        customers,
        quotes,
        invoices,
        creditAccounts,
        creditTransactions,
        loading,
        error,
        fetchCustomers,
        fetchQuotes,
        fetchInvoices,
        createCustomer,
        updateCustomer,
        createQuote,
        updateQuote,
        approveQuoteToInvoice,
        updateInvoiceStatus,
        updateInvoice,
        recordInvoicePayment,
        fetchCreditAccount,
        fetchCreditTransactions,
        recordDeposit,
        deleteQuote,
        deleteInvoice,
        duplicateQuote,
        cleanup
    }
})
