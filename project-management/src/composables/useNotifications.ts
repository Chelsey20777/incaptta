import { messaging, auth } from '@/lib/firebase'
import { getToken, onMessage } from 'firebase/messaging'
import { useSession } from './useSession'
import { toast } from 'vue-sonner'

export function useNotifications() {
    const { user } = useSession()
    const VAPID_KEY = 'BIL4-OFhh42v2O15bAxeCh24eLU1QkLtqAfW589t6Hj6PzCdZQcaCkDTMKwRpkx1TYjs6z7hHYRbQwn9jQ679do'

    const requestPermission = async () => {
        if (!('Notification' in window)) {
            console.log('This browser does not support notifications.')
            return
        }

        try {
            const permission = await Notification.requestPermission()
            if (permission === 'granted') {
                console.log('Notification permission granted.')
                await registerToken()
            } else {
                console.log('Unable to get permission to notify.')
            }
        } catch (error) {
            console.error('Error requesting notification permission:', error)
        }
    }

    const registerToken = async () => {
        if (!user.value) return

        try {
            const token = await getToken(messaging, { vapidKey: VAPID_KEY })
            if (token) {
                console.log('FCM Token:', token)
                
                // Register token with backend
                const idToken = await auth.currentUser?.getIdToken()
                await fetch('/api/users/fcm/register', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${idToken}`
                    },
                    body: JSON.stringify({ token })
                })
            } else {
                console.log('No registration token available. Request permission to generate one.')
            }
        } catch (error) {
            console.error('An error occurred while retrieving token:', error)
        }
    }

    const initNotifications = () => {
        // Handle foreground messages
        onMessage(messaging, (payload) => {
            console.log('Message received. ', payload)
            
            // Show toast or browser notification
            if (payload.notification) {
                toast(payload.notification.title || 'Notification', {
                    description: payload.notification.body,
                    action: {
                        label: 'View',
                        onClick: () => {
                            // Handle navigation if needed
                        }
                    }
                })
            }
        })

        // On login, attempt to register token if permission is already granted
        if (Notification.permission === 'granted') {
            registerToken()
        }
    }

    return {
        requestPermission,
        initNotifications
    }
}
