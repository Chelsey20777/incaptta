import { storage } from '@/lib/firebase'
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage'

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
