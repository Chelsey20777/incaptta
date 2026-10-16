import { ref } from 'vue'
import { db } from '@/lib/firebase'
import { collection, doc, addDoc, serverTimestamp, runTransaction } from 'firebase/firestore'
import { toast } from 'vue-sonner'

export function useAgricPayments() {
  const isProcessing = ref(false)

  async function collectPayment(jobCard: any, amount: number, account: 'CASH' | 'BANK' | 'ECOCASH', notes?: string) {
    if (amount <= 0) throw new Error('Amount must be greater than 0')
    isProcessing.value = true

    try {
      await runTransaction(db, async (transaction) => {
        const jcRef = doc(db, 'agricJobCards', jobCard.id)
        const jcSnap = await transaction.get(jcRef)
        
        if (!jcSnap.exists()) throw new Error('Job Card not found')
        
        const data = jcSnap.data()
        const currentPaid = data.paidAmount || 0
        const total = data.totalAmount || 0
        const newPaid = currentPaid + amount
        const newBalance = total - newPaid

        if (newPaid > total + 0.01) {
           throw new Error(`Payment exceeds balance. Current balance: $${(total - currentPaid).toFixed(2)}`)
        }

        // 1. Update Job Card
        transaction.update(jcRef, {
          paidAmount: parseFloat(newPaid.toFixed(2)),
          balance: parseFloat(newBalance.toFixed(2)),
          status: newBalance <= 0 ? 'PAID' : (data.status === 'DRAFT' ? 'APPROVED' : data.status),
          updatedAt: serverTimestamp()
        })

        // 2. Create Ledger Record (Incoming Payment)
        const paymentRef = doc(collection(db, 'jobPayments'))
        transaction.set(paymentRef, {
          jobCardId: jobCard.id,
          jobCardNumber: jobCard.jobNumber,
          clientName: jobCard.clientName || 'Agric Client',
          amount: parseFloat(amount.toFixed(2)),
          paymentMethod: account,
          description: `Payment for Agric Project ${jobCard.jobNumber}${notes ? ' - ' + notes : ''}`,
          source: 'agric-structure',
          createdAt: serverTimestamp()
        })
      })

      toast.success(`Payment of $${amount.toFixed(2)} recorded to ${account}`)
    } catch (err: any) {
      console.error('[AgricPayments] Collection failed:', err)
      toast.error(err.message || 'Payment collection failed')
      throw err
    } finally {
      isProcessing.value = false
    }
  }

  return {
    isProcessing,
    collectPayment
  }
}
