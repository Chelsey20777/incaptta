'use server'

import { z } from 'zod'
import { getResend, isResendConfigured } from '@/lib/resend'

// ─── Input Validation ────────────────────────────────────────────────────────

const SendEmailSchema = z.object({
  to: z.union([z.string().email(), z.array(z.string().email()).min(1)]),
  subject: z.string().min(1, 'Subject is required'),
  text: z.string().optional(),
  html: z.string().optional(),
  from: z.string().optional(),
  attachments: z.array(z.object({
    filename: z.string().min(1),
    content: z.string().min(1),
  })).max(5).optional(),
})

export type SendEmailInput = z.infer<typeof SendEmailSchema>

export interface SendEmailResponse {
  success: boolean
  id?: string
  error?: string
}

// ─── Server Action ───────────────────────────────────────────────────────────

/**
 * Reusable Server Action to send outbound emails via Resend.
 * Validates input with Zod and checks Resend configuration before sending.
 */
export async function sendEmailAction(input: SendEmailInput): Promise<SendEmailResponse> {
  // 1. Validate input shape
  const parsed = SendEmailSchema.safeParse(input)
  if (!parsed.success) {
    const errorMsg = parsed.error.issues.map((e) => e.message).join(', ')
    console.error('❌ [sendEmailAction] Validation failed:', errorMsg)
    return { success: false, error: `Validation failed: ${errorMsg}` }
  }

  if (process.env.ALLOW_REAL_EMAIL !== 'true') {
    console.warn('🟡 [sendEmailAction] Outbound email is disabled for this environment.')
    return { success: false, error: 'Outbound email is disabled in this environment.' }
  }

  // 2. Check Resend is configured
  if (!isResendConfigured()) {
    console.error('❌ [sendEmailAction] RESEND_API_KEY is not configured.')
    return { success: false, error: 'Email service is not configured. Contact your administrator.' }
  }

  // 3. Send email
  try {
    const senderEmail =
      parsed.data.from ||
      process.env.RESEND_FROM_EMAIL ||
      'ERP Notifications <onboarding@resend.dev>'

    const recipients = Array.isArray(parsed.data.to)
      ? parsed.data.to
      : [parsed.data.to]

    console.log(
      `📤 [sendEmailAction] Sending to ${JSON.stringify(recipients)} | Subject: "${parsed.data.subject}"`
    )

    const resend = getResend()
    if (!resend) {
      return { success: false, error: 'Email service is not configured. Contact your administrator.' }
    }

    const { data, error } = await resend.emails.send({
      from: senderEmail,
      to: recipients,
      subject: parsed.data.subject,
      text: parsed.data.text || '',
      ...(parsed.data.html ? { html: parsed.data.html } : {}),
      ...(parsed.data.attachments?.length
        ? { attachments: parsed.data.attachments.map(file => ({ filename: file.filename, content: file.content })) }
        : {}),
    })

    if (error) {
      console.error('❌ [sendEmailAction] Resend API error:', error)
      return { success: false, error: error.message }
    }

    console.log(`✅ [sendEmailAction] Sent! Message ID: ${data?.id}`)
    return { success: true, id: data?.id }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unexpected email send failure'
    console.error('❌ [sendEmailAction] Unexpected error:', message)
    return { success: false, error: message }
  }
}
