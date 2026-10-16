import * as admin from 'firebase-admin';
import { UserService } from './user.service';

export const NotificationService = {
    /**
     * Send a notification to a specific user
     */
    async sendToUser(uid: string, title: string, body: string, data?: any) {
        const user = await UserService.getById(uid);
        if (!user || !user.fcmTokens || user.fcmTokens.length === 0) {
            console.log(`[NotificationService] No tokens found for user ${uid}`);
            return;
        }

        const message: admin.messaging.MulticastMessage = {
            tokens: user.fcmTokens,
            notification: {
                title,
                body,
            },
            data: data || {},
            android: {
                notification: {
                    icon: 'stock_ticker_update',
                    color: '#0f172a',
                },
            },
            apns: {
                payload: {
                    aps: {
                        badge: 1,
                    },
                },
            },
            webpush: {
                notification: {
                    icon: '/pwa-192x192.png',
                    badge: '/pwa-96x96.png',
                },
            },
        };

        try {
            const response = await admin.messaging().sendEachForMulticast(message);
            console.log(`[NotificationService] Sent to ${uid}: ${response.successCount} success, ${response.failureCount} failure`);
            
            // Cleanup invalid tokens if any
            if (response.failureCount > 0) {
                const tokensToRemove: string[] = [];
                response.responses.forEach((resp, idx) => {
                    if (!resp.success) {
                        const errorCode = resp.error?.code;
                        if (errorCode === 'messaging/invalid-registration-token' || 
                            errorCode === 'messaging/registration-token-not-registered') {
                            tokensToRemove.push(user.fcmTokens![idx]);
                        }
                    }
                });

                for (const token of tokensToRemove) {
                    await UserService.unregisterFcmToken(uid, token);
                }
            }
        } catch (error) {
            console.error('[NotificationService] Error sending to user:', error);
        }
    },

    /**
     * Send a notification to all users with a specific role
     */
    async sendToRole(role: string, title: string, body: string, data?: any) {
        const users = await UserService.getUsersByRole(role);
        const promises = users.map(user => this.sendToUser(user.uid, title, body, data));
        await Promise.all(promises);
    }
};
