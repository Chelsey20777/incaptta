import { Resend } from 'resend'

let client: Resend | null = null

export function isResendConfigured(): boolean {
  return !!process.env.RESEND_API_KEY
}

/** Returns null when the key is absent so a build can load routes that only send mail later. */
export function getResend(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return null
  if (!client) client = new Resend(apiKey)
  return client
}
