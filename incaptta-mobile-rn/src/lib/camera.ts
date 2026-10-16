import * as ImagePicker from 'expo-image-picker';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from './firebase';

export interface ReceiptUploadResult {
  url: string;
  fileName: string;
}

/**
 * Pick an image from the device gallery or camera
 */
export async function pickReceiptImage(): Promise<string | null> {
  try {
    // Request permission
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      alert('Sorry, we need camera roll permissions to make this work!');
      return null;
    }

    // Pick image
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
    });

    if (!result.canceled && result.assets && result.assets[0]) {
      return result.assets[0].uri;
    }

    return null;
  } catch (error) {
    console.error('Error picking image:', error);
    return null;
  }
}

/**
 * Take a photo with the camera
 */
export async function takeReceiptPhoto(): Promise<string | null> {
  try {
    // Request permission
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      alert('Sorry, we need camera permissions to make this work!');
      return null;
    }

    // Take photo
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
    });

    if (!result.canceled && result.assets && result.assets[0]) {
      return result.assets[0].uri;
    }

    return null;
  } catch (error) {
    console.error('Error taking photo:', error);
    return null;
  }
}

/**
 * Upload a receipt image to Firebase Storage
 */
export async function uploadReceiptToFirebase(
  uri: string,
  expenseId: string
): Promise<ReceiptUploadResult | null> {
  try {
    // Fetch the image as a blob
    const response = await fetch(uri);
    const blob = await response.blob();

    // Create a unique filename
    const fileName = `receipts/${expenseId}_${Date.now()}.jpg`;
    const storageRef = ref(storage, fileName);

    // Upload to Firebase Storage
    await uploadBytes(storageRef, blob);

    // Get download URL
    const downloadURL = await getDownloadURL(storageRef);

    return {
      url: downloadURL,
      fileName,
    };
  } catch (error) {
    console.error('Error uploading receipt:', error);
    return null;
  }
}

/**
 * Pick and upload receipt in one operation
 */
export async function pickAndUploadReceipt(
  expenseId: string
): Promise<ReceiptUploadResult | null> {
  const uri = await pickReceiptImage();
  if (!uri) return null;

  return uploadReceiptToFirebase(uri, expenseId);
}

/**
 * Take photo and upload receipt in one operation
 */
export async function takeAndUploadReceipt(
  expenseId: string
): Promise<ReceiptUploadResult | null> {
  const uri = await takeReceiptPhoto();
  if (!uri) return null;

  return uploadReceiptToFirebase(uri, expenseId);
}
