import { storage } from '@/lib/firebase'
import { ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage'

/**
 * Uploads a proof of payment attachment to Firebase Storage.
 * Generates a unique path based on JobId and current timestamp.
 * 
 * @param file The literal File or Blob from the HTML input
 * @param jobId The referencing Job Card ID ensuring clean organization
 * @param note Optional reference note to append to the filename
 * @returns {Promise<string>} The securely generated public-read download URL
 */
export async function uploadProofOfPayment(file: File, jobId: string, note: string = 'payment'): Promise<string> {
  if (!file) throw new Error('No file provided for upload.')

  try {
    const timestamp = Date.now()
    const sanitizedNote = note.replace(/[^a-z0-9]/gi, '_').substring(0, 20)
    const fileExtension = file.name.split('.').pop() || 'pdf'

    const fullPath = `payments/${jobId}/${timestamp}_${sanitizedNote}.${fileExtension}`
    const targetRef = storageRef(storage, fullPath)
    const snapshot = await uploadBytes(targetRef, file)
    const downloadUrl = await getDownloadURL(snapshot.ref)
    return downloadUrl
  } catch (err: any) {
    console.error('Firebase Storage Upload Failed:', err)
    throw new Error(err.message || 'Failed to upload document.')
  }
}

/**
 * Uploads an expense attachment (receipt/invoice) to Firebase Storage.
 * 
 * @param file The file to upload
 * @param folder The target folder (e.g., 'opex' or 'job-expenses')
 * @returns {Promise<string>} The download URL
 */
export async function uploadExpenseAttachment(file: File, folder: string = 'opex'): Promise<string> {
  if (!file) throw new Error('No file provided for upload.')

  try {
    const timestamp = Date.now()
    const fileName = `${timestamp}_${file.name.replace(/[^a-z0-9.]/gi, '_')}`
    const fullPath = `attachments/${folder}/${fileName}`

    const targetRef = storageRef(storage, fullPath)
    const snapshot = await uploadBytes(targetRef, file)
    const downloadUrl = await getDownloadURL(snapshot.ref)
    return downloadUrl
  } catch (err: any) {
    console.error('Expense Attachment Upload Failed:', err)
    throw new Error(err.message || 'Failed to upload expense attachment.')
  }
}

/**
 * Uploads an MBDI claim evidence file (contract, screenshot, report...)
 * to Firebase Storage under the initiative's folder.
 *
 * @param file The file to upload
 * @param initiativeId The MBDI initiative document ID
 * @returns {Promise<string>} The download URL
 */
export async function uploadMbdiEvidence(file: File, initiativeId: string): Promise<string> {
  if (!file) throw new Error('No file provided for upload.')

  try {
    const timestamp = Date.now()
    const fileName = `${timestamp}_${file.name.replace(/[^a-z0-9.]/gi, '_')}`
    const fullPath = `mbdi/${initiativeId}/${fileName}`

    const targetRef = storageRef(storage, fullPath)
    const snapshot = await uploadBytes(targetRef, file)
    const downloadUrl = await getDownloadURL(snapshot.ref)
    return downloadUrl
  } catch (err: any) {
    console.error('MBDI Evidence Upload Failed:', err)
    throw new Error(err.message || 'Failed to upload evidence file.')
  }
}

export interface MbdiCommentAttachmentUpload {
  name: string
  url: string
  contentType?: string
  size?: number
}

/**
 * Uploads a file attached to an MBDI initiative comment.
 * Path: mbdi/{initiativeId}/comments/{uid}/{timestamp}_{sanitizedName}
 */
export async function uploadMbdiCommentAttachment(
  file: File,
  initiativeId: string,
  uid: string
): Promise<MbdiCommentAttachmentUpload> {
  if (!file) throw new Error('No file provided for upload.')

  try {
    const timestamp = Date.now()
    const sanitized = file.name.replace(/[^a-z0-9.]/gi, '_')
    const fullPath = `mbdi/${initiativeId}/comments/${uid}/${timestamp}_${sanitized}`

    const targetRef = storageRef(storage, fullPath)
    const snapshot = await uploadBytes(targetRef, file)
    const downloadUrl = await getDownloadURL(snapshot.ref)
    return {
      name: file.name,
      url: downloadUrl,
      contentType: file.type || undefined,
      size: file.size,
    }
  } catch (err: any) {
    console.error('MBDI Comment Attachment Upload Failed:', err)
    throw new Error(err.message || 'Failed to upload comment attachment.')
  }
}

/**
 * Uploads a user profile avatar to Firebase Storage.
 * Path: avatars/{uid}/{timestamp}.{ext}
 */
export async function uploadUserAvatar(file: File, uid: string): Promise<string> {
  if (!file) throw new Error('No file provided for upload.')
  if (!uid) throw new Error('User id is required.')
  if (!file.type.startsWith('image/')) {
    throw new Error('Please choose an image file (JPEG, PNG, or WebP).')
  }
  if (file.size > 2 * 1024 * 1024) {
    throw new Error('Image must be smaller than 2 MB.')
  }

  try {
    const timestamp = Date.now()
    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
    const fullPath = `avatars/${uid}/${timestamp}.${ext}`
    const targetRef = storageRef(storage, fullPath)
    const snapshot = await uploadBytes(targetRef, file)
    return await getDownloadURL(snapshot.ref)
  } catch (err: any) {
    console.error('Avatar Upload Failed:', err)
    throw new Error(err.message || 'Failed to upload profile picture.')
  }
}

/**
 * Uploads a user signature image to Firebase Storage.
 * Path: signatures/{uid}/{timestamp}.{ext}
 */
export async function uploadUserSignature(file: File, uid: string): Promise<string> {
  if (!file) throw new Error('No file provided for upload.')
  if (!uid) throw new Error('User id is required.')
  if (!file.type.startsWith('image/')) {
    throw new Error('Please choose an image file (JPEG, PNG, or WebP).')
  }
  if (file.size > 2 * 1024 * 1024) {
    throw new Error('Image must be smaller than 2 MB.')
  }

  try {
    const timestamp = Date.now()
    const ext = file.name.split('.').pop()?.toLowerCase() || 'png'
    const fullPath = `signatures/${uid}/${timestamp}.${ext}`
    const targetRef = storageRef(storage, fullPath)
    const snapshot = await uploadBytes(targetRef, file)
    return await getDownloadURL(snapshot.ref)
  } catch (err: any) {
    console.error('Signature Upload Failed:', err)
    throw new Error(err.message || 'Failed to upload signature.')
  }
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
        let target
        if (url.startsWith('gs://')) {
          target = storageRef(storage, url)
        } else {
          const match = url.match(/\/o\/([^?]+)/)
          if (!match?.[1]) return
          target = storageRef(storage, decodeURIComponent(match[1]))
        }
        await deleteObject(target)
      } catch (err: any) {
        const code = err?.code || ''
        if (code === 'storage/object-not-found' || code === 'storage/invalid-argument') return
        console.warn('[deleteStorageUrls] Failed to delete', url, err)
      }
    })
  )
}
