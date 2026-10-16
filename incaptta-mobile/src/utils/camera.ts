import { Camera, CameraResultType, CameraSource } from '@capacitor/camera'
import { storage } from '@/lib/firebase'
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage'

export async function takePhotoAndUpload(path: string): Promise<string> {
  try {
    const photo = await Camera.getPhoto({
      quality: 90,
      allowEditing: false,
      resultType: CameraResultType.Base64,
      source: CameraSource.Prompt
    })

    if (!photo.base64String) throw new Error('Photo capture failed')

    // Convert base64 to blob
    const byteCharacters = atob(photo.base64String)
    const byteNumbers = new Array(byteCharacters.length)
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i)
    }
    const byteArray = new Uint8Array(byteNumbers)
    const blob = new Blob([byteArray], { type: `image/${photo.format}` })

    // Create a unique filename
    const filename = `${path}/${Date.now()}.${photo.format}`
    const fileRef = storageRef(storage, filename)

    // Upload
    await uploadBytes(fileRef, blob)

    // Get URL
    const downloadUrl = await getDownloadURL(fileRef)
    return downloadUrl
  } catch (err) {
    console.error('[CameraUtil] Error:', err)
    throw err
  }
}
