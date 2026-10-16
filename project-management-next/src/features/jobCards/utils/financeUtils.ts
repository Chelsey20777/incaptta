import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage'
import { storage } from '@/lib/firebase'

/**
 * Upload an expense attachment to Firebase Storage with progress tracking
 */
export async function uploadExpenseAttachment(
  file: File, 
  pathPrefix: string = 'job-expenses',
  onProgress?: (progress: number) => void
): Promise<string> {
  const timestamp = Date.now()
  const safeName = `${timestamp}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
  const storageRef = ref(storage, `${pathPrefix}/${safeName}`)
  
  const uploadTask = uploadBytesResumable(storageRef, file)

  return new Promise((resolve, reject) => {
    uploadTask.on(
      'state_changed',
      (snapshot) => {
        const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100
        if (onProgress) onProgress(progress)
      },
      (error) => {
        reject(error)
      },
      async () => {
        const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref)
        resolve(downloadUrl)
      }
    )
  })
}

/** Resolve a Firebase Storage ref from a download URL or gs:// URL. */
function storageRefFromUrl(url: string) {
  if (url.startsWith('gs://')) {
    return ref(storage, url)
  }
  const match = url.match(/\/o\/([^?]+)/)
  if (!match?.[1]) {
    throw new Error('Invalid Firebase Storage URL')
  }
  return ref(storage, decodeURIComponent(match[1]))
}

/**
 * Best-effort delete of Firebase Storage objects by download URL.
 * Missing/already-deleted objects are ignored so callers can continue.
 */
export async function deleteStorageUrls(urls: (string | null | undefined)[]): Promise<void> {
  const unique = [...new Set((urls || []).filter((u): u is string => typeof u === 'string' && u.trim().length > 0))]
  await Promise.all(
    unique.map(async (url) => {
      try {
        await deleteObject(storageRefFromUrl(url))
      } catch (err: any) {
        const code = err?.code || ''
        if (
          code === 'storage/object-not-found' ||
          code === 'storage/invalid-argument' ||
          err?.message === 'Invalid Firebase Storage URL'
        ) {
          return
        }
        console.warn('[deleteStorageUrls] Failed to delete', url, err)
      }
    })
  )
}
