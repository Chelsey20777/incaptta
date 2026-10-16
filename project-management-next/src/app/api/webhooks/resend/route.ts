import { NextRequest, NextResponse } from 'next/server'
import { Webhook } from 'svix'
import { adminDb } from '@/lib/firebase-admin'
import { FieldValue } from 'firebase-admin/firestore'

// ─── Resend Webhook Payload Types ────────────────────────────────────────────

interface ResendEmailData {
  id?: string
  from?: string
  to?: string[]
  subject?: string
  text?: string
  html?: string
  created_at?: string
}

interface ResendWebhookPayload {
  type?: string
  event?: string
  data?: ResendEmailData
}

// ─── Route Handler ───────────────────────────────────────────────────────────

/**
 * POST /api/webhooks/resend
 *
 * Public route handler for Resend inbound email webhooks.
 * Uses Firebase Admin SDK to bypass Firestore security rules (no auth context
 * available on external webhook calls).
 *
 * Security: Verifies svix cryptographic signature before JSON parsing.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.RESEND_WEBHOOK_SECRET

  // Capture raw payload as text before any JSON parsing (security requirement)
  const rawBody = await req.text()

  // ── 1. Signature Verification ──────────────────────────────────────────────
  if (secret) {
    const svixId = req.headers.get('svix-id')
    const svixTimestamp = req.headers.get('svix-timestamp')
    const svixSignature = req.headers.get('svix-signature')

    if (!svixId || !svixTimestamp || !svixSignature) {
      console.error('❌ [Resend Webhook] Missing svix security headers')
      return NextResponse.json(
        { error: 'Missing svix verification headers' },
        { status: 400 }
      )
    }

    try {
      const wh = new Webhook(secret)
      wh.verify(rawBody, {
        'svix-id': svixId,
        'svix-timestamp': svixTimestamp,
        'svix-signature': svixSignature,
      })
    } catch (verifyErr) {
      const message = verifyErr instanceof Error ? verifyErr.message : 'Unknown verification error'
      console.error('❌ [Resend Webhook] Cryptographic signature verification failed:', message)
      return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 400 })
    }
  } else {
    console.warn(
      '⚠️ [Resend Webhook] RESEND_WEBHOOK_SECRET not set. Skipping signature verification (development mode).'
    )
  }

  // ── 2. Parse Incoming Email Data ───────────────────────────────────────────
  let payload: ResendWebhookPayload
  try {
    payload = JSON.parse(rawBody) as ResendWebhookPayload
  } catch {
    console.error('❌ [Resend Webhook] Malformed JSON raw payload')
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  // Check event type — Resend emits "email.received" for inbound mail
  const eventType = payload.type || payload.event
  if (eventType && eventType !== 'email.received') {
    console.log(`ℹ️ [Resend Webhook] Ignored non-inbound event: ${eventType}`)
    return NextResponse.json({ status: 'ignored_event_type' }, { status: 200 })
  }

  const emailData = payload.data || (payload as unknown as ResendEmailData)
  const senderFull = emailData.from || ''
  const subject = emailData.subject || ''
  const textBody = emailData.text || ''
  const htmlBody = emailData.html || ''

  // Extract clean email address from format like "John Doe <john@example.com>"
  const emailMatch = senderFull.match(/<([^>]+)>/)
  const senderEmail = (emailMatch ? emailMatch[1] : senderFull).trim().toLowerCase()

  console.log(
    `📨 [Resend Webhook] Inbound email from: "${senderEmail}" | Subject: "${subject}"`
  )

  // ── 3. Extract Reference IDs (PROJ-1234, JC-0198, TASK-99) ────────────────
  const contentToScan = `${subject} ${textBody}`
  const projMatch = contentToScan.match(
    /(?:PROJ|PROJECT|JC|TASK)[-_:#\s]?([a-zA-Z0-9_-]+)/i
  )
  const extractedId = projMatch ? projMatch[1].toUpperCase() : null
  const targetProjectDocId = extractedId ? `PROJ-${extractedId}` : 'unassigned'

  // ── 4. Map Sender to Verified User via Admin Firestore ─────────────────────
  let linkedUserId: string | null = null
  let linkedUserName: string = senderFull

  try {
    const usersSnap = await adminDb
      .collection('users')
      .where('email', '==', senderEmail)
      .limit(1)
      .get()

    if (!usersSnap.empty) {
      const userDoc = usersSnap.docs[0]
      linkedUserId = userDoc.id
      const userData = userDoc.data()
      linkedUserName = userData.name || userData.displayName || senderFull
    }
  } catch (dbErr) {
    console.warn('⚠️ [Resend Webhook] Failed to query users collection:', dbErr)
  }

  // ── 5. Write Message to Firestore Sub-collection ───────────────────────────
  const messageDocument = {
    messageId: emailData.id || `msg_${Date.now()}`,
    sender: {
      email: senderEmail,
      raw: senderFull,
      userId: linkedUserId,
      name: linkedUserName,
    },
    subject,
    body: {
      text: textBody,
      html: htmlBody,
    },
    referenceId: extractedId || null,
    source: 'inbound_email_resend',
    receivedAt: emailData.created_at || new Date().toISOString(),
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }

  try {
    const docRef = await adminDb
      .collection('projects')
      .doc(targetProjectDocId)
      .collection('messages')
      .add(messageDocument)

    console.log(
      `✅ [Resend Webhook] Saved to /projects/${targetProjectDocId}/messages/${docRef.id}`
    )
  } catch (writeErr) {
    console.error('❌ [Resend Webhook] Firestore write failed:', writeErr)
    // Still return 200 to Resend so it doesn't retry indefinitely on db outage
  }

  // Quickly return HTTP 200 OK to Resend
  return NextResponse.json(
    { success: true, projectContext: targetProjectDocId },
    { status: 200 }
  )
}
