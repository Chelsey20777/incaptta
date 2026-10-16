import { defineStore } from 'pinia'
import { ref } from 'vue'
import { db, storage } from '@/lib/firebase'
import {
    collection, doc, setDoc, getDoc, addDoc, query,
    onSnapshot, updateDoc, serverTimestamp, orderBy, where
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

// ── Store ──────────────────────────────────────────────────────────────────

/**
 * REQUIRED FIRESTORE SECURITY RULES:
 *
 * match /docVerifications/{token} {
 *   allow read: if true;                          // Public: QR scan verification
 *   allow write: if request.auth != null;
 *   match /auditLog/{logId} {
 *     allow read: if request.auth != null;
 *     allow create: if true;                      // Allow unauthenticated audit entries
 *   }
 * }
 * match /paymentSubmissions/{id} {
 *   allow read: if request.auth != null;
 *   allow create: if true                         // Public submission from verify page
 *     && request.resource.data.status == 'PENDING_REVIEW';
 *   allow update: if request.auth != null;        // Admin review only
 * }
 *
 * REQUIRED FIREBASE STORAGE RULES:
 *
 * match /payment-proofs/{token}/{fileName} {
 *   allow read: if request.auth != null;
 *   allow write: if request.resource.size < 5 * 1024 * 1024  // 5MB limit
 *     && (request.resource.contentType.matches('image/.*')
 *         || request.resource.contentType == 'application/pdf');
 * }
 */

export const useVerificationStore = defineStore('verification', () => {
    const submissions = ref<PaymentSubmission[]>([])
    let unsubSubmissions: (() => void) | null = null

    // ── Token management ────────────────────────────────────────────────────

    /**
     * Ensures a stable verification token exists for an OPEX expense.
     * If the expense already has a token, reuses it.
     * Otherwise creates a new token and writes it to both collections.
     */
    async function ensureVerificationToken(
        docId: string,
        docType: string,
        docRef: string,
        docTitle: string
    ): Promise<string> {
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
        const token = crypto.randomUUID()

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
    }

    // ── Public verification (no auth required) ──────────────────────────────

    async function fetchVerificationByToken(token: string): Promise<DocVerification | null> {
        const snap = await getDoc(doc(db, 'docVerifications', token))
        if (!snap.exists()) return null
        return { token: snap.id, ...snap.data() } as DocVerification
    }

    async function fetchExpenseByDocId(docId: string): Promise<any | null> {
        const snap = await getDoc(doc(db, 'operationalExpenses', docId))
        if (!snap.exists()) return null
        return { id: snap.id, ...snap.data() }
    }

    async function getSubmissionsForToken(token: string): Promise<PaymentSubmission[]> {
        return new Promise((resolve) => {
            const q = query(
                collection(db, 'paymentSubmissions'),
                where('token', '==', token)
            )
            const unsub = onSnapshot(q, (snap) => {
                unsub()
                resolve(snap.docs.map(d => ({ id: d.id, ...d.data() }) as PaymentSubmission))
            })
        })
    }

    // ── Audit logging ───────────────────────────────────────────────────────

    async function logScan(token: string): Promise<void> {
        try {
            await addDoc(collection(db, 'docVerifications', token, 'auditLog'), {
                action: 'QR_SCANNED',
                userAgent: navigator.userAgent,
                timestamp: serverTimestamp()
            })
        } catch {
            // Non-critical — silent fail
        }
    }

    // ── Payment submission (public) ─────────────────────────────────────────

    const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
    const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5 MB

    function validateProofFile(file: File): string | null {
        if (!ALLOWED_TYPES.includes(file.type)) return 'File must be JPG, PNG, WebP, or PDF.'
        if (file.size > MAX_FILE_SIZE) return 'File must be under 5 MB.'
        return null
    }

    async function submitPaymentProof(
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
    ): Promise<void> {
        const validationError = validateProofFile(proofFile)
        if (validationError) throw new Error(validationError)

        // Upload proof file
        const ext = proofFile.name.split('.').pop()
        const safeName = `${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${ext}`
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
    }

    // ── Admin review ────────────────────────────────────────────────────────

    function fetchSubmissions(): void {
        const q = query(collection(db, 'paymentSubmissions'), orderBy('submittedAt', 'desc'))
        unsubSubmissions = onSnapshot(q, (snap) => {
            submissions.value = snap.docs.map(d => ({ id: d.id, ...d.data() }) as PaymentSubmission)
        })
    }

    async function confirmPayment(
        submissionId: string,
        reviewerName: string,
        token: string,
        docId: string
    ): Promise<void> {
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
    }

    async function rejectPayment(
        submissionId: string,
        reviewerName: string,
        rejectionReason: string,
        token: string,
        docId: string
    ): Promise<void> {
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

    function unsubscribeAll(): void {
        unsubSubmissions?.()
    }

    return {
        submissions,
        ensureVerificationToken,
        fetchVerificationByToken,
        fetchExpenseByDocId,
        getSubmissionsForToken,
        logScan,
        validateProofFile,
        submitPaymentProof,
        fetchSubmissions,
        confirmPayment,
        rejectPayment,
        unsubscribeAll
    }
})
