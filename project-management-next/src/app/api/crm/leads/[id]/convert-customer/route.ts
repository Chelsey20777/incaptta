import { NextRequest, NextResponse } from 'next/server'
import { verifyActiveUser } from '@/lib/session-service'
import { convertLeadToCustomer, requireCrmStaff } from '@/lib/server/customer-profile'

type Context = { params: Promise<{ id: string }> }

export async function POST(request: NextRequest, context: Context) {
  try {
    const actor = await verifyActiveUser(request.headers.get('authorization'))
    requireCrmStaff(actor.roles)
    const { id } = await context.params
    const body = await request.json().catch(() => ({})) as {
      existingCustomerId?: string
      address?: string
      siteAddress?: string
      taxId?: string
      registrationNumber?: string
      creditLimit?: number
      notes?: string
      name?: string
      email?: string
      phone?: string
      primaryContactName?: string
      customerType?: string
    }
    const { existingCustomerId, ...profile } = body
    const result = await convertLeadToCustomer({
      leadId: id,
      actorUid: actor.uid,
      existingCustomerId,
      profile,
    })
    return NextResponse.json(result, { status: result.alreadyConverted || result.linked ? 200 : 201 })
  } catch (error: unknown) {
    const err = error as Error & { status?: number; code?: string }
    return NextResponse.json({ error: err.message || 'Could not convert enquiry to customer' }, {
      status: err.status || (err.code?.startsWith('auth/') ? 401 : 400),
    })
  }
}
