import { NextRequest, NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebase-admin'
import { runMbdiDueReminders } from '@/features/mbdi/utils/due-reminders'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false

  const auth = req.headers.get('authorization') || ''
  if (auth === `Bearer ${secret}`) return true

  const headerSecret = req.headers.get('x-cron-secret')
  if (headerSecret === secret) return true

  return false
}

async function handle(req: NextRequest) {
  if (process.env.ENABLE_SCHEDULED_JOBS !== 'true') {
    return NextResponse.json({ status: 'disabled_for_environment' }, { status: 503 })
  }

  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await runMbdiDueReminders(adminDb)
    return NextResponse.json({ success: true, ...result })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal Server Error'
    console.error('[cron/mbdi-due-reminders]', err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/** Cloud Scheduler may use GET or POST. */
export async function GET(req: NextRequest) {
  return handle(req)
}

export async function POST(req: NextRequest) {
  return handle(req)
}
