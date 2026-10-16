import { NextResponse } from 'next/server'
import { getApps, initializeApp, cert } from 'firebase-admin/app'
import { getFirestore, FieldPath } from 'firebase-admin/firestore'
import { getMessaging, MulticastMessage } from 'firebase-admin/messaging'

if (getApps().length === 0) {
  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY
    ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY)
    : null

  if (serviceAccount) {
    initializeApp({
      credential: cert(serviceAccount)
    })
  } else {
    initializeApp()
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { chatId, messageText, senderName, senderId, mentions } = body

    if (!chatId || !messageText || !senderName || !senderId) {
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 })
    }

    const db = getFirestore()
    const messaging = getMessaging()

    const chatDoc = await db.collection('chats').doc(chatId).get()
    if (!chatDoc.exists) {
      return NextResponse.json({ error: 'Chat not found' }, { status: 404 })
    }

    const chatData = chatDoc.data()
    if (!chatData) {
      return NextResponse.json({ error: 'Chat data is empty' }, { status: 400 })
    }

    const participants = chatData.participants || []
    const recipients = participants.filter((pId: string) => pId !== senderId)

    if (recipients.length === 0) {
      return NextResponse.json({ success: true, message: 'No other recipients in this chat' })
    }

    const mentionUids = Array.isArray(mentions) ? mentions.map((m: any) => m.uid) : []

    const mentionTokens: string[] = []
    const standardTokens: string[] = []

    // Fetch user FCM tokens
    const usersSnap = await db.collection('users')
      .where(FieldPath.documentId(), 'in', recipients)
      .get()

    usersSnap.forEach(uDoc => {
      const uId = uDoc.id
      const uData = uDoc.data()
      if (uData && Array.isArray(uData.fcmTokens)) {
        if (mentionUids.includes(uId)) {
          mentionTokens.push(...uData.fcmTokens)
        } else {
          standardTokens.push(...uData.fcmTokens)
        }
      }
    })

    const cleanText = messageText.length > 100 ? `${messageText.slice(0, 97)}...` : messageText

    // Send mentions notifications
    if (mentionTokens.length > 0) {
      const mentionMessage: MulticastMessage = {
        tokens: mentionTokens,
        notification: {
          title: `You were mentioned`,
          body: `${senderName} mentioned you: "${cleanText}"`
        },
        data: { chatId },
        webpush: {
          notification: {
            icon: '/icons/icon-192-maskable.png',
            badge: '/icons/icon-192-maskable.png'
          }
        }
      }
      await messaging.sendEachForMulticast(mentionMessage)
    }

    // Send standard message notifications
    if (standardTokens.length > 0) {
      const title = chatData.isGroup 
        ? (chatData.groupName || 'Group Chat')
        : senderName

      const notificationBody = chatData.isGroup
        ? `${senderName}: ${cleanText}`
        : cleanText

      const standardMessage: MulticastMessage = {
        tokens: standardTokens,
        notification: {
          title,
          body: notificationBody
        },
        data: { chatId },
        webpush: {
          notification: {
            icon: '/icons/icon-192-maskable.png',
            badge: '/icons/icon-192-maskable.png'
          }
        }
      }
      await messaging.sendEachForMulticast(standardMessage)
    }

    return NextResponse.json({ success: true, recipientsCount: recipients.length })
  } catch (error: any) {
    console.error('Failed to send push notification:', error)
    return NextResponse.json({ error: error.message || 'Internal error' }, { status: 500 })
  }
}
