import { NextRequest, NextResponse } from 'next/server'
import { verifyActiveUser } from '@/lib/session-service'
import { saveInvoiceWithCreditControl } from '@/lib/server/customer-credit'

function errorResponse(error: unknown) {
  const err = error as Error & { status?: number; code?: string; details?: unknown }
  return NextResponse.json(
    { error: err.message || 'Invoice request failed', code: err.code, details: err.details },
    { status: err.status || 500 },
  )
}

export async function POST(request: NextRequest) {
  try {
    const actor = await verifyActiveUser(request.headers.get('authorization'))
    const body = await request.json()
    const { overrideCreditLimit, overrideReason, ...input } = body
    const result = await saveInvoiceWithCreditControl({
      input,
      actor,
      override: { overrideCreditLimit, overrideReason },
    })
    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    return errorResponse(error)
  }
}
