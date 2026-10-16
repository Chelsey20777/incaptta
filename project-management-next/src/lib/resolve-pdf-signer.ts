import { doc, getDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'

export type PdfSigner = {
  name?: string
  position?: string
  signatureUrl?: string
}

/**
 * Loads the creating user's name, position, and signature from users/{uid}
 * for PDF footers. Returns an empty object when uid is missing or the lookup fails.
 */
export async function resolvePdfSigner(uid?: string | null): Promise<PdfSigner> {
  if (!uid || typeof uid !== 'string') return {}

  try {
    const snap = await getDoc(doc(db, 'users', uid))
    if (!snap.exists()) return {}
    const data = snap.data()
    const name =
      (typeof data.name === 'string' && data.name.trim()) ||
      (typeof data.displayName === 'string' && data.displayName.trim()) ||
      undefined
    const position =
      typeof data.position === 'string' && data.position.trim()
        ? data.position.trim()
        : undefined
    const signatureUrl =
      typeof data.signatureUrl === 'string' && data.signatureUrl.trim()
        ? data.signatureUrl.trim()
        : undefined

    return { name, position, signatureUrl }
  } catch (err) {
    console.warn('[resolvePdfSigner] Failed to load user', uid, err)
    return {}
  }
}
