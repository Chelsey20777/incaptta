/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { adminAuth, adminDb } from '@/lib/firebase-admin'
import { LIQUID_ACCOUNTS, normalizeAccountKey } from '@/lib/account-keys'
import { getAccountBalanceInTransaction } from '@/lib/server/account-balance'

const ACCOUNTANT_ROLES = new Set(['ACCOUNTANT', 'ADMIN', 'SUPER_ADMIN'])
const MANAGER_ROLES = new Set(['MANAGER', 'DIRECTOR', 'ADMIN', 'SUPER_ADMIN'])
const TARGETS = new Set(['APPROVED_ACCOUNTANT', 'APPROVED_MANAGER', 'REJECTED'])

const rolesFromClaims = (claims: Record<string, unknown>): string[] =>
  (Array.isArray(claims.roles) ? claims.roles : claims.roles ? [claims.roles] : []).map(String)

const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ paymentId: string }> }
) {
  try {
    const authHeader = request.headers.get('authorization') || ''
    if (!authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }
    const claims = await adminAuth.verifyIdToken(authHeader.slice(7), true)
    if (claims.isActive !== true) {
      return NextResponse.json({ error: 'Active user account required' }, { status: 403 })
    }
    const roles = rolesFromClaims(claims)
    const isAccountant = roles.some((role) => ACCOUNTANT_ROLES.has(role))
    const isManager = roles.some((role) => MANAGER_ROLES.has(role))
    const body = await request.json().catch(() => ({}))
    const targetStatus = String(body.targetStatus || '')
    const comment = typeof body.comment === 'string' ? body.comment.trim() : ''
    if (!TARGETS.has(targetStatus)) {
      return NextResponse.json({ error: 'Invalid approval transition' }, { status: 400 })
    }
    const { paymentId } = await context.params
    const actor = {
      uid: claims.uid,
      displayName: claims.name || claims.email || claims.uid,
      email: claims.email || null,
      actorType: 'USER',
      actionType: 'MANUAL_APPROVAL',
    }
    const now = new Date().toISOString()

    const result = await adminDb.runTransaction(async (transaction) => {
      const paymentRef = adminDb.collection('subcontractorJobPayments').doc(paymentId)
      const paymentSnap = await transaction.get(paymentRef)
      if (!paymentSnap.exists) throw new Error('Payment not found')
      const payment: any = paymentSnap.data()
      const amount = Number(payment.amount || 0)
      if (!(amount > 0)) throw new Error('Payment amount must be greater than zero')

      if (targetStatus === 'REJECTED') {
        if (!isAccountant && !isManager) throw new Error('Not authorized to reject this payment')
        if (payment.approvalStatus === 'APPROVED_MANAGER') throw new Error('A posted payment cannot be rejected')
        if (payment.approvalStatus === 'REJECTED') {
          return { approvalStatus: 'REJECTED', idempotent: true }
        }
        transaction.update(paymentRef, {
          approvalStatus: 'REJECTED',
          rejectedAt: now,
          rejectedBy: actor,
          ...(comment ? { rejectionComment: comment } : {}),
          updatedAt: FieldValue.serverTimestamp(),
        })
        return { approvalStatus: 'REJECTED', idempotent: false }
      }

      if (targetStatus === 'APPROVED_ACCOUNTANT') {
        if (!isAccountant) throw new Error('Accountant approval is required')
        if (payment.approvalStatus === 'APPROVED_ACCOUNTANT') {
          return { approvalStatus: 'APPROVED_ACCOUNTANT', idempotent: true }
        }
        if (payment.approvalStatus !== 'PENDING') {
          throw new Error(`Cannot accountant-approve from status ${payment.approvalStatus}`)
        }
        transaction.update(paymentRef, {
          approvalStatus: 'APPROVED_ACCOUNTANT',
          accountantApprovedAt: now,
          accountantApprovedBy: actor,
          ...(comment ? { accountantComment: comment } : {}),
          updatedAt: FieldValue.serverTimestamp(),
        })
        return { approvalStatus: 'APPROVED_ACCOUNTANT', idempotent: false }
      }

      if (targetStatus === 'APPROVED_MANAGER' && !isManager) {
        throw new Error('Manager approval is required')
      }
      if (payment.approvalStatus !== 'APPROVED_ACCOUNTANT' && payment.approvalStatus !== 'APPROVED_MANAGER') {
        throw new Error('Accountant approval is required before manager approval')
      }

      const paymentKind = payment.paymentKind || 'SCN'
      const isDirect = paymentKind === 'DIRECT'
      const opexDocId = isDirect ? `sc-direct-${paymentId}` : `jc-adhoc-${paymentId}`
      const opexRef = adminDb.collection('operationalExpenses').doc(opexDocId)
      const vendorPaymentRef = adminDb.collection('subcontractorTransactions').doc(`scn-payment-${paymentId}`)
      const [opexSnap, vendorPaymentSnap] = await Promise.all([
        transaction.get(opexRef),
        transaction.get(vendorPaymentRef),
      ])

      if (payment.approvalStatus === 'APPROVED_MANAGER') {
        if (!opexSnap.exists || !vendorPaymentSnap.exists) {
          throw new Error('Approved payment has incomplete posting records; reconciliation is required')
        }
        return {
          approvalStatus: 'APPROVED_MANAGER',
          opexId: opexRef.id,
          transactionPaymentId: vendorPaymentRef.id,
          idempotent: true,
        }
      }

      if (opexSnap.exists || vendorPaymentSnap.exists) {
        throw new Error('Partial posting already exists; reconciliation is required')
      }

      const account = normalizeAccountKey(payment.paymentMethod)
      if (account === 'UNKNOWN' || !LIQUID_ACCOUNTS.includes(account)) {
        throw new Error('Select a valid payment account before approval')
      }

      let jobRef: FirebaseFirestore.DocumentReference | null = null
      let job: any = null
      let newPaid = 0
      let contractValue = 0
      let completed = false
      let nextStatus: string | null = null
      let jobCardRef: FirebaseFirestore.DocumentReference | null = null
      let projectedWorks: any[] | null = null

      if (!isDirect) {
        jobRef = adminDb.collection('subcontractorJobs').doc(String(payment.subcontractorJobId || ''))
        const jobSnap = await transaction.get(jobRef)
        if (!jobSnap.exists) throw new Error('SCN contract not found')
        job = jobSnap.data()
        if (job.status === 'CANCELLED') throw new Error('Cannot approve payment on a cancelled contract')
        if (job.status === 'COMPLETED') throw new Error('Contract is already completed')

        const paymentsSnap = await transaction.get(
          adminDb.collection('subcontractorJobPayments').where('subcontractorJobId', '==', jobRef.id)
        )
        const approvedBefore = paymentsSnap.docs
          .filter((doc) => doc.id !== paymentId && doc.data().approvalStatus === 'APPROVED_MANAGER')
          .reduce((sum, doc) => sum + Number(doc.data().amount || 0), 0)
        newPaid = roundMoney(approvedBefore + amount)
        contractValue = Number(job.contractValue || 0)
        if (newPaid > contractValue + 0.001) {
          throw new Error(`Payment would exceed contract value of $${contractValue.toFixed(2)}`)
        }
        completed = newPaid >= contractValue - 0.001
        nextStatus = completed ? 'COMPLETED' : job.status === 'DRAFT' ? 'ACTIVE' : job.status

        if (job.jobCardId) {
          jobCardRef = adminDb.collection('jobCards').doc(String(job.jobCardId))
          const jobCardSnap = await transaction.get(jobCardRef)
          if (!jobCardSnap.exists) throw new Error('Linked job card not found')
          const jobCard: any = jobCardSnap.data()
          projectedWorks = [...(jobCard.subcontractWorks || [])]
          const index = projectedWorks.findIndex(
            (work: any) => work.subcontractorJobId === jobRef!.id || (work.isScnLink && work.id === jobRef!.id)
          )
          const projection = {
            id: jobRef.id,
            subcontractorId: job.subcontractorId,
            subcontractorName: job.subcontractorName,
            description: job.description || job.contractNumber,
            quantity: 1,
            unitPrice: contractValue,
            totalAmount: contractValue,
            paymentMethod: 'PENDING',
            paymentRef: '',
            attachmentUrl: null,
            attachmentUrls: job.attachmentUrls || [],
            createdAt: typeof job.createdAt === 'string' ? job.createdAt : now,
            approvalStatus: completed ? 'APPROVED_MANAGER' : 'PENDING',
            isScnLink: true,
            subcontractorJobId: jobRef.id,
            contractNumber: job.contractNumber,
            contractValue,
            paidApprovedTotal: newPaid,
            scnStatus: nextStatus,
            transactionChargeId: job.transactionChargeId || null,
          }
          if (index === -1) projectedWorks.push(projection)
          else projectedWorks[index] = { ...projectedWorks[index], ...projection }
        }
      }

      const guardRef = adminDb.collection('accountPostingGuards').doc(account)
      const guardSnap = await transaction.get(guardRef)
      const balanceBefore = await getAccountBalanceInTransaction(transaction, account)
      if (balanceBefore < amount) {
        throw new Error(
          `Insufficient funds in ${account}. Available: $${balanceBefore.toFixed(2)}, Required: $${amount.toFixed(2)}`
        )
      }
      const balanceAfter = roundMoney(balanceBefore - amount)

      const opexDescription = isDirect
        ? `${payment.description || 'Direct payment'} (${payment.subcontractorName})`
        : `${payment.contractNumber} — ${payment.description || 'Subcontractor payment'} (${payment.subcontractorName})`

      const vendorDescription = isDirect
        ? payment.description || 'Direct payment'
        : `${payment.contractNumber} — ${payment.description || 'Payment'}`

      transaction.set(guardRef, {
        version: Number(guardSnap.data()?.version || 0) + 1,
        lastPostingId: opexRef.id,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true })
      transaction.create(opexRef, {
        category: 'Subcontractor Expense',
        amount,
        paymentMethod: account,
        originalPaymentMethod: payment.paymentMethod,
        description: opexDescription,
        attachmentUrls: payment.attachmentUrls || [],
        status: 'APPROVED',
        subcontractorId: payment.subcontractorId,
        subcontractorName: payment.subcontractorName,
        subcontractorJobId: isDirect ? null : payment.subcontractorJobId,
        subcontractorPaymentId: paymentId,
        sourceJobId: payment.jobCardId || null,
        sourceItemId: paymentId,
        accountantApprovedBy: payment.accountantApprovedBy || actor,
        accountantApprovedAt: payment.accountantApprovedAt || now,
        managerApprovedBy: actor,
        managerApprovedAt: now,
        postingAudit: { account, amount, balanceBefore, balanceAfter, actor, approvedAt: now },
        pdfGenerated: false,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      })
      transaction.create(vendorPaymentRef, {
        subcontractorId: payment.subcontractorId,
        subcontractorName: payment.subcontractorName,
        type: 'PAYMENT',
        amount,
        description: vendorDescription,
        jobCardId: payment.jobCardId || null,
        jobCardNumber: payment.jobCardNumber || null,
        sourceItemId: paymentId,
        subcontractorJobId: isDirect ? null : payment.subcontractorJobId,
        contractNumber: isDirect ? null : payment.contractNumber,
        opexId: opexRef.id,
        paymentMethod: account,
        paymentRef: payment.paymentRef || null,
        attachmentUrls: payment.attachmentUrls || [],
        createdBy: actor.uid,
        createdByName: actor.displayName,
        createdAt: FieldValue.serverTimestamp(),
      })
      transaction.update(paymentRef, {
        approvalStatus: 'APPROVED_MANAGER',
        accountantApprovedAt: payment.accountantApprovedAt || now,
        accountantApprovedBy: payment.accountantApprovedBy || actor,
        approvedAt: now,
        approvedBy: actor,
        managerApprovedAt: now,
        managerApprovedBy: actor,
        ...(comment ? { managerComment: comment } : {}),
        opexId: opexRef.id,
        transactionPaymentId: vendorPaymentRef.id,
        paymentMethod: account,
        jobCardId: payment.jobCardId || null,
        jobCardNumber: payment.jobCardNumber || null,
        updatedAt: FieldValue.serverTimestamp(),
      })

      if (!isDirect && jobRef && job) {
        transaction.update(jobRef, {
          paidApprovedTotal: newPaid,
          status: nextStatus,
          ...(completed ? { completedAt: FieldValue.serverTimestamp() } : {}),
          updatedAt: FieldValue.serverTimestamp(),
        })
        if (jobCardRef && projectedWorks) {
          transaction.update(jobCardRef, {
            subcontractWorks: projectedWorks,
            updatedAt: FieldValue.serverTimestamp(),
          })
        }
      }

      return {
        approvalStatus: 'APPROVED_MANAGER',
        opexId: opexRef.id,
        transactionPaymentId: vendorPaymentRef.id,
        account,
        amount,
        balanceBefore,
        balanceAfter,
        idempotent: false,
      }
    })
    return NextResponse.json(result)
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Subcontractor payment approval failed' }, { status: 400 })
  }
}
