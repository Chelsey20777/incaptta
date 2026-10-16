'use client'

import { create } from 'zustand'
import { db, storage } from '@/lib/firebase'
import {
  collection,
  doc,
  setDoc,
  getDoc,
  addDoc,
  query,
  onSnapshot,
  updateDoc,
  serverTimestamp,
  orderBy,
  where
} from 'firebase/firestore'
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage'

// ── Types ──────────────────────────────────────────────────────────────────

export interface DocVerification {
  token: string
  docId: string
  docType: string
  docRef: string
  docTitle: string
  isVoid: boolean
  createdAt: any
}

export interface PaymentSubmission {
  id?: string
  token: string
  docId: string
  docRef: string
  payerName: string
  amount: number
  paymentMethod: string
  referenceNumber: string
  proofFileUrl: string
  proofFileName: string
  proofFileType: string
  note: string
  status: 'PENDING_REVIEW' | 'CONFIRMED' | 'REJECTED'
  submittedAt: any
  reviewedBy?: string
  reviewedAt?: any
  rejectionReason?: string
}

interface VerificationState {
  submissions: PaymentSubmission[]
  loading: boolean
  ensureVerificationToken: (
    docId: string,
    docType: string,
    docRef: string,
    docTitle: string
  ) => Promise<string>
  fetchVerificationByToken: (token: string) => Promise<DocVerification | null>
  fetchExpenseByDocId: (docId: string) => Promise<any | null>
  getSubmissionsForToken: (token: string) => Promise<PaymentSubmission[]>
  logScan: (token: string) => Promise<void>
  submitPaymentProof: (
    token: string,
    docId: string,
    docRef: string,
    formData: {
      payerName: string
      amount: number
      paymentMethod: string
      referenceNumber: string
      note?: string
    },
    proofFile: File
  ) => Promise<void>
  fetchSubmissions: () => () => void
  confirmPayment: (
    submissionId: string,
    reviewerName: string,
    token: string,
    docId: string
  ) => Promise<void>
  rejectPayment: (
    submissionId: string,
    reviewerName: string,
    rejectionReason: string,
    token: string,
    docId: string
  ) => Promise<void>
}

// ── Helper ─────────────────────────────────────────────────────────────────

const generateUUID = (): string => {
  if (typeof window !== 'undefined' && window.crypto && window.crypto.randomUUID) {
    return window.crypto.randomUUID()
  }
  // Fallback for non-supported or non-secure contexts
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

// ── Store ──────────────────────────────────────────────────────────────────

export const useVerificationStore = create<VerificationState>((set, get) => {
  let unsubSubmissions: (() => void) | null = null

  return {
    submissions: [],
    loading: false,

    // ── Token management ────────────────────────────────────────────────────
    ensureVerificationToken: async (docId, docType, docRef, docTitle) => {
      const expenseRef = doc(db, 'operationalExpenses', docId)
      const expenseSnap = await getDoc(expenseRef)

      if (expenseSnap.exists()) {
        const data = expenseSnap.data()
        if (data.verificationToken) {
          // Make sure the docVerifications record exists (idempotent)
          const verRef = doc(db, 'docVerifications', data.verificationToken)
          const verSnap = await getDoc(verRef)
          if (!verSnap.exists()) {
            await setDoc(verRef, {
              token: data.verificationToken,
              docId,
              docType,
              docRef,
              docTitle,
              isVoid: false,
              createdAt: serverTimestamp()
            })
          }
          return data.verificationToken
        }
      }

      // Generate new token
      const token = generateUUID()

      await setDoc(doc(db, 'docVerifications', token), {
        token,
        docId,
        docType,
        docRef,
        docTitle,
        isVoid: false,
        createdAt: serverTimestamp()
      })

      await updateDoc(expenseRef, { verificationToken: token })

      return token
    },

    // ── Public verification (no auth required) ──────────────────────────────
    fetchVerificationByToken: async (token) => {
      const snap = await getDoc(doc(db, 'docVerifications', token))
      if (!snap.exists()) return null
      return { token: snap.id, ...snap.data() } as DocVerification
    },

    fetchExpenseByDocId: async (docId) => {
      const snap = await getDoc(doc(db, 'operationalExpenses', docId))
      if (!snap.exists()) return null
      return { id: snap.id, ...snap.data() }
    },

    getSubmissionsForToken: async (token) => {
      return new Promise<PaymentSubmission[]>((resolve) => {
        const q = query(
          collection(db, 'paymentSubmissions'),
          where('token', '==', token)
        )
        const unsub = onSnapshot(q, (snap) => {
          unsub()
          resolve(
            snap.docs.map(
              (d) => ({ id: d.id, ...d.data() }) as PaymentSubmission
            )
          )
        })
      })
    },

    // ── Audit logging ───────────────────────────────────────────────────────
    logScan: async (token) => {
      try {
        await addDoc(collection(db, 'docVerifications', token, 'auditLog'), {
          action: 'QR_SCANNED',
          userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'Server',
          timestamp: serverTimestamp()
        })
      } catch {
        // Non-critical — silent fail
      }
    },

    // ── Payment submission (public) ─────────────────────────────────────────
    submitPaymentProof: async (token, docId, docRef, formData, proofFile) => {
      // Client-side Rate Limit check using localStorage (abuse prevention)
      if (typeof window !== 'undefined') {
        const lastSubmit = localStorage.getItem(`payment_submit_${token}`)
        if (lastSubmit) {
          const timeSince = Date.now() - Number(lastSubmit)
          const COOLDOWN = 60 * 1000 // 1 minute cooldown per token
          if (timeSince < COOLDOWN) {
            const waitSec = Math.ceil((COOLDOWN - timeSince) / 1000)
            throw new Error(`Too many submissions. Please wait ${waitSec} seconds before submitting again.`)
          }
        }
      }

      // Validate file
      const ALLOWED_TYPES = [
        'image/jpeg',
        'image/png',
        'image/webp',
        'application/pdf'
      ]
      const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5 MB

      if (!ALLOWED_TYPES.includes(proofFile.type)) {
        throw new Error('File must be JPG, PNG, WebP, or PDF.')
      }
      if (proofFile.size > MAX_FILE_SIZE) {
        throw new Error('File must be under 5 MB.')
      }

      // Upload proof file
      const ext = proofFile.name.split('.').pop()
      const safeName = `${Date.now()}_${Math.random()
        .toString(36)
        .substring(2, 7)}.${ext}`
      const fileRef = storageRef(storage, `payment-proofs/${token}/${safeName}`)
      await uploadBytes(fileRef, proofFile, { contentType: proofFile.type })
      const proofFileUrl = await getDownloadURL(fileRef)

      // Write payment submission
      const submRef = await addDoc(collection(db, 'paymentSubmissions'), {
        token,
        docId,
        docRef,
        payerName: formData.payerName,
        amount: Number(formData.amount),
        paymentMethod: formData.paymentMethod,
        referenceNumber: formData.referenceNumber,
        note: formData.note || '',
        proofFileUrl,
        proofFileName: proofFile.name,
        proofFileType: proofFile.type,
        status: 'PENDING_REVIEW',
        submittedAt: serverTimestamp()
      })

      // Update expense payment proof status
      await updateDoc(doc(db, 'operationalExpenses', docId), {
        paymentProofStatus: 'PENDING_REVIEW',
        lastPaymentProofAt: serverTimestamp()
      })

      // Audit log
      await addDoc(collection(db, 'docVerifications', token, 'auditLog'), {
        action: 'PAYMENT_PROOF_SUBMITTED',
        submissionId: submRef.id,
        payerName: formData.payerName,
        amount: formData.amount,
        timestamp: serverTimestamp()
      })

      if (typeof window !== 'undefined') {
        localStorage.setItem(`payment_submit_${token}`, Date.now().toString())
      }
    },

    // ── Admin review ────────────────────────────────────────────────────────
    fetchSubmissions: () => {
      if (unsubSubmissions) unsubSubmissions()

      const q = query(
        collection(db, 'paymentSubmissions'),
        orderBy('submittedAt', 'desc')
      )
      unsubSubmissions = onSnapshot(q, (snap) => {
        set({
          submissions: snap.docs.map(
            (d) => ({ id: d.id, ...d.data() }) as PaymentSubmission
          )
        })
      })

      return () => {
        if (unsubSubmissions) {
          unsubSubmissions()
          unsubSubmissions = null
        }
      }
    },

    confirmPayment: async (submissionId, reviewerName, token, docId) => {
      await updateDoc(doc(db, 'paymentSubmissions', submissionId), {
        status: 'CONFIRMED',
        reviewedBy: reviewerName,
        reviewedAt: serverTimestamp()
      })
      await updateDoc(doc(db, 'operationalExpenses', docId), {
        paymentProofStatus: 'CONFIRMED',
        paymentConfirmedAt: serverTimestamp(),
        paymentConfirmedBy: reviewerName
      })
      await addDoc(collection(db, 'docVerifications', token, 'auditLog'), {
        action: 'PAYMENT_CONFIRMED',
        submissionId,
        reviewedBy: reviewerName,
        timestamp: serverTimestamp()
      })
    },

    rejectPayment: async (submissionId, reviewerName, rejectionReason, token, docId) => {
      await updateDoc(doc(db, 'paymentSubmissions', submissionId), {
        status: 'REJECTED',
        reviewedBy: reviewerName,
        reviewedAt: serverTimestamp(),
        rejectionReason
      })
      await updateDoc(doc(db, 'operationalExpenses', docId), {
        paymentProofStatus: 'REJECTED'
      })
      await addDoc(collection(db, 'docVerifications', token, 'auditLog'), {
        action: 'PAYMENT_REJECTED',
        submissionId,
        reviewedBy: reviewerName,
        reason: rejectionReason,
        timestamp: serverTimestamp()
      })
    }
  }
})
