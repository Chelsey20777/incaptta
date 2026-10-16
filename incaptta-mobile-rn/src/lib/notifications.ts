import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from './firebase';

// Configure notification handler
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

/**
 * Request notification permissions
 */
export async function requestNotificationPermissions(): Promise<boolean> {
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.error('Notification permissions not granted');
    return false;
  }

  return true;
}

/**
 * Get Expo push token
 */
export async function getExpoPushToken(): Promise<string | null> {
  try {
    const projectId = Constants?.expoConfig?.extra?.eas?.projectId;
    
    if (!projectId && Platform.OS === 'android') {
      console.warn('No project ID configured for push notifications');
      return null;
    }

    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
    return tokenData.data;
  } catch (error) {
    console.error('Error getting Expo push token:', error);
    return null;
  }
}

/**
 * Register push token in Firebase user document
 */
export async function registerPushToken(userId: string): Promise<void> {
  try {
    const token = await getExpoPushToken();
    if (!token) return;

    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, {
      expoPushToken: token,
      tokenUpdatedAt: new Date(),
    });

    console.log('Push token registered successfully');
  } catch (error) {
    console.error('Error registering push token:', error);
  }
}

/**
 * Initialize notifications for the current user
 */
export async function initializeNotifications(userId: string): Promise<void> {
  try {
    const hasPermission = await requestNotificationPermissions();
    if (!hasPermission) return;

    if (userId) {
      await registerPushToken(userId);
    }
  } catch (error) {
    console.error('Error initializing notifications:', error);
  }
}

/**
 * Send local notification (for testing or immediate alerts)
 */
export async function sendLocalNotification(
  title: string,
  body: string,
  data?: any
): Promise<void> {
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data,
        sound: true,
      },
      trigger: null, // Show immediately
    });
  } catch (error) {
    console.error('Error sending local notification:', error);
  }
}

/**
 * Add notification received listener
 */
export function addNotificationReceivedListener(
  callback: (notification: Notifications.Notification) => void
): Notifications.Subscription {
  return Notifications.addNotificationReceivedListener(callback);
}

/**
 * Add notification response listener (when user taps notification)
 */
export function addNotificationResponseListener(
  callback: (response: Notifications.NotificationResponse) => void
): Notifications.Subscription {
  return Notifications.addNotificationResponseReceivedListener(callback);
}
