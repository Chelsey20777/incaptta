import { NextRequest, NextResponse } from 'next/server'
import { verifyActiveUser } from '@/lib/session-service'
import { saveInvoiceWithCreditControl } from '@/lib/server/customer-credit'

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await verifyActiveUser(request.headers.get('authorization'))
    const { id } = await context.params
    const body = await request.json()
    const { overrideCreditLimit, overrideReason, ...input } = body
    const result = await saveInvoiceWithCreditControl({
      invoiceId: id,
      input,
      actor,
      override: { overrideCreditLimit, overrideReason },
    })
    return NextResponse.json(result)
  } catch (error) {
    const err = error as Error & { status?: number; code?: string; details?: unknown }
    return NextResponse.json(
      { error: err.message || 'Invoice update failed', code: err.code, details: err.details },
      { status: err.status || 500 },
    )
  }
}
