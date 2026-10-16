import { storage } from '@/lib/firebase'
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage'

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
