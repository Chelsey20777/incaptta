import { defineStore } from 'pinia'
import { ref, computed, onUnmounted } from 'vue'
import { db } from '@/lib/firebase'
import {
  collection, query, onSnapshot, addDoc, doc, updateDoc, getDoc,
  serverTimestamp, orderBy, runTransaction, arrayUnion
} from 'firebase/firestore'
import type { JobCard, JobCardFormData } from '../types'
import { computeFinancials } from '@/utils/financialEngine'

export const useJobCardsStore = defineStore('jobCards', () => {
  const jobCards = ref<JobCard[]>([])
  const loading = ref(false)
  const currentJobCard = ref<JobCard | null>(null)
  const error = ref<string | null>(null)

  let unsubscribe: (() => void) | null = null

  const activeJobCards = computed(() => 
    jobCards.value.filter(jc => !['COMPLETED', 'CANCELLED', 'REJECTED'].includes(jc.status))
  )

  const pendingApprovals = computed(() =>
    jobCards.value.filter(jc => [
      'SUBMITTED', 
      'APPROVAL_PENDING_ACCOUNTANT', 
      'APPROVAL_PENDING_MANAGER'
    ].includes(jc.status))
  )

  const completedJobCards = computed(() =>
    jobCards.value.filter(jc => jc.status === 'COMPLETED')
  )

  const fetchJobCards = () => {
    loading.value = true
    const q = query(collection(db, 'jobCards'), orderBy('createdAt', 'desc'))

    unsubscribe = onSnapshot(q, (snapshot) => {
      jobCards.value = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as JobCard[]
      loading.value = false
    }, (err) => {
      console.error('[JobCardsStore] Fetch error:', err)
      error.value = err.message
      loading.value = false
    })
  }

  const setCurrentJobCard = (card: JobCard | null) => {
    currentJobCard.value = card
  }

  const generateJobNumber = async () => {
    const currentYear = new Date().getFullYear()
    const counterRef = doc(db, 'systemCounters', 'jobCards')

    try {
      const seq = await runTransaction(db, async (transaction) => {
        const counterSnap = await transaction.get(counterRef)
        let sequence = 1

        if (counterSnap.exists()) {
          const data = counterSnap.data()
          if (data.currentYear === currentYear) {
            sequence = (data.sequence || 0) + 1
          }
        }

        transaction.set(counterRef, {
          currentYear,
          sequence,
          updatedAt: serverTimestamp()
        })
        return sequence
      })

      const sequenceStr = String(seq).padStart(4, '0')
      return `JC-${currentYear}-${sequenceStr}`
    } catch (err) {
      console.error('[JobCardsStore] Error generating job number:', err)
      throw err
    }
  }

  const createJobCard = async (data: JobCardFormData, userId: string, userEmail: string) => {
    try {
      const jobNumber = await generateJobNumber()
      
      const financials = computeFinancials(
        data.requisitionSections || [],
        data.adHocExpenses || [],
        data.inventoryReturns || [],
        data.staffRates || [],
        (data as any).commissionPercentage || 0,
        'DRAFT'
      )

      const payload = {
        ...data,
        jobNumber, // Keep legacy at top for redundancy
        generalInfo: {
          jobTitle: data.jobTitle || 'Untitled',
          recipientName: data.customerName || 'N/A',
          recipientAddress: data.customerAddress || 'N/A',
          recipientPhone: data.customerPhone || 'N/A',
          projectDescription: data.description || '',
          requestingDepartmentId: data.department || '',
          jobNumber,
          startDate: (data.startDate as any) || '',
          priority: data.priority || 'MEDIUM',
          commissionPercentage: (data as any).commissionPercentage || 0
        },
        financialSummary: financials,
        status: 'DRAFT',
        createdBy: userId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        approvalTimeline: [{
          user: userEmail,
          status: 'Created',
          date: new Date().toISOString()
        }]
      }

      const docRef = await addDoc(collection(db, 'jobCards'), payload)
      return docRef.id
    } catch (err) {
      console.error('[JobCardsStore] Error creating job card:', err)
      throw err
    }
  }

  const updateJobCard = async (id: string, updates: any) => {
    try {
      const docRef = doc(db, 'jobCards', id)
      
      // Fetch current data if needed for calculation
      const snap = await getDoc(docRef)
      if (!snap.exists()) throw new Error('Job Card not found')
      const current = snap.data() as JobCard

      // Map legacy fields to generalInfo if they exist in updates
      if (updates.jobTitle || updates.customerName || updates.description || updates.department || updates.priority || updates.siteAddress) {
        const gen = (current.generalInfo || {}) as any
        updates.generalInfo = {
          ...gen,
          jobTitle: updates.jobTitle || gen.jobTitle || current.jobTitle || 'Untitled',
          recipientName: updates.customerName || gen.recipientName || current.customerName || 'N/A',
          recipientAddress: updates.customerAddress || gen.recipientAddress || (current as any).customerAddress || 'N/A',
          recipientPhone: updates.customerPhone || gen.recipientPhone || (current as any).customerPhone || 'N/A',
          projectDescription: updates.description || gen.projectDescription || current.description || '',
          requestingDepartmentId: updates.department || gen.requestingDepartmentId || current.department || '',
          projectLocation: updates.siteAddress || gen.projectLocation || current.siteAddress || 'N/A',
          priority: updates.priority || gen.priority || current.priority || 'MEDIUM'
        }
      }

      // Recalculate financials if relevant data changed
      const sections = updates.requisitionSections || current.requisitionSections || []
      const adhoc = updates.adHocExpenses || current.adHocExpenses || []
      const returns = updates.inventoryReturns || current.inventoryReturns || []
      const staff = updates.staffRates || current.staffRates || []

      if (updates.requisitionSections || updates.adHocExpenses || updates.inventoryReturns || updates.staffRates) {
        const financials = computeFinancials(
          sections, 
          adhoc, 
          returns, 
          staff, 
          current.commissionPercentage || 0, 
          updates.status || current.status
        )
        updates.financialSummary = financials
      }

      await updateDoc(docRef, {
        ...updates,
        updatedAt: serverTimestamp()
      })
    } catch (err) {
      console.error('[JobCardsStore] Error updating job card:', err)
      throw err
    }
  }

  const syncAdHocProcurementToJobCard = async (
    jobCardId: string, 
    item: { description: string, quantity: number, unitPrice: number }, 
    reference: { grnId: string, grnNumber: string, poId: string, poNumber: string }
  ) => {
    try {
      const docRef = doc(db, 'jobCards', jobCardId)
      await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(docRef)
        if (!snap.exists()) throw new Error('Job card not found')
        const data = snap.data() as JobCard

        const adHocExpenses = [...(data.adHocExpenses || [])]
        adHocExpenses.push({
          id: `PROC-${Date.now()}`,
          description: `Procured: ${item.description}`,
          totalAmount: item.quantity * item.unitPrice,
          isAdjustment: false,
          reference: `${reference.grnNumber} / ${reference.poNumber}`,
          sourceType: 'PROCUREMENT',
          sourceId: reference.grnId,
          createdAt: new Date().toISOString()
        } as any)

        const financials = computeFinancials(
          data.requisitionSections || [],
          adHocExpenses,
          data.inventoryReturns || [],
          data.staffRates || [],
          data.commissionPercentage || 0,
          data.status
        )

        transaction.update(docRef, {
          adHocExpenses,
          financialSummary: financials,
          updatedAt: serverTimestamp()
        })
      })
    } catch (err) {
      console.error('[JobCardsStore] Sync error:', err)
      throw err
    }
  }

  const handleApproval = async (id: string, currentStatus: string, role: string, userEmail: string, comment?: string) => {
    const docRef = doc(db, 'jobCards', id)
    const isSuper = role === 'SUPER_ADMIN' || role === 'ADMIN'

    // Handle Accountant Approval (Step 1 -> Step 2)
    if (currentStatus === 'SUBMITTED' && (isSuper || role === 'ACCOUNTANT')) {
      await updateDoc(docRef, {
        status: 'APPROVAL_PENDING_ACCOUNTANT',
        updatedAt: serverTimestamp(),
        approvalTimeline: arrayUnion({
          user: userEmail,
          role,
          status: 'Validated by Accountant',
          comment,
          date: new Date().toISOString()
        })
      })
      return
    }

    if (currentStatus === 'APPROVAL_PENDING_ACCOUNTANT' && (isSuper || role === 'ACCOUNTANT')) {
      // Automatic dual transition as seen in desktop
      await updateDoc(docRef, {
        status: 'APPROVAL_PENDING_MANAGER',
        updatedAt: serverTimestamp(),
        approvalTimeline: arrayUnion({
          user: userEmail,
          role,
          status: 'Approved by Accountant -> Pending Manager',
          comment,
          date: new Date().toISOString()
        })
      })
      return
    }

    // Handle Manager Approval (Step 2 -> Final)
    if (currentStatus === 'APPROVAL_PENDING_MANAGER' && (isSuper || role === 'MANAGER')) {
      const snap = await getDoc(docRef)
      if (snap.exists()) {
        const jobData = snap.data() as JobCard
        const financials = computeFinancials(
          jobData.requisitionSections || [],
          jobData.adHocExpenses || [],
          jobData.inventoryReturns || [],
          jobData.staffRates || [],
          jobData.commissionPercentage || 0,
          jobData.status
        )
        
        await updateDoc(docRef, {
          status: 'APPROVED_MANAGER',
          lockedTotalInvoiceValue: financials.totalInvoiceValue,
          lockedImplementationCost: financials.implementationCost,
          updatedAt: serverTimestamp(),
          approvalTimeline: arrayUnion({
            user: userEmail,
            role,
            status: 'Approved by Manager (Final)',
            comment,
            date: new Date().toISOString()
          })
        })
      }
    }
  }

  const handleRejection = async (id: string, role: string, userEmail: string, reason: string) => {
    const docRef = doc(db, 'jobCards', id)
    await updateDoc(docRef, {
      status: 'REJECTED',
      updatedAt: serverTimestamp(),
      approvalTimeline: arrayUnion({
        user: userEmail,
        role,
        status: 'Rejected',
        comment: reason,
        date: new Date().toISOString()
      })
    })
  }

  const submitForApproval = async (id: string, userId: string, userEmail: string) => {
    const docRef = doc(db, 'jobCards', id)
    await updateDoc(docRef, {
      status: 'SUBMITTED',
      updatedAt: serverTimestamp(),
      approvalTimeline: arrayUnion({
        user: userEmail,
        role: 'SUBMITTER',
        status: 'Submitted for Approval',
        date: new Date().toISOString()
      })
    })
  }

  const cleanup = () => {
    if (unsubscribe) {
      unsubscribe()
      unsubscribe = null
    }
  }

  onUnmounted(cleanup)

  return {
    jobCards,
    loading,
    error,
    currentJobCard,
    activeJobCards,
    pendingApprovals,
    completedJobCards,
    fetchJobCards,
    setCurrentJobCard,
    createJobCard,
    updateJobCard,
    handleApproval,
    handleRejection,
    submitForApproval,
    cleanup
  }
})
