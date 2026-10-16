/**
 * useCrmAnalytics — CRM Domain Analytics Composable
 *
 * Computes CrmAnalyticsContext by reading:
 *   - crmStore.customers  → customer list (count and display only)
 *   - crmStore.quotes     → quote pipeline (grandTotal, status)
 *   - crmStore.invoices   → invoice status and outstanding balance
 *   - useLeadsStore.leads → lead pipeline (stage, value, source)
 *
 * periodDays is accepted for reactive-dependency tracking and future
 * period-scoped metrics. Current metrics are all-time (CRM pipeline
 * state does not have meaningful period-bounded semantics for dashboards).
 *
 * The caller is responsible for ensuring all stores are hydrated.
 * No Firestore writes occur here.
 */

import { computed, toValue } from 'vue'
import type { Ref } from 'vue'
import { useCrmStore } from '@/features/crm/store/crmStore'
import { useLeadsStore } from '@/features/crm/store/useLeadsStore'
import type {
  CrmAnalyticsContext,
  CrmCustomerRef,
  CrmQuoteAnalytics,
  CrmInvoiceAnalytics,
  CrmLeadAnalytics,
  CrmLeadBySource,
  CrmLargestOutstandingInvoice,
} from '../types/unified-context'

// ─── Composable ───────────────────────────────────────────────────────────────

export function useCrmAnalytics(periodDays: Ref<number>) {
  const crmStore = useCrmStore()
  const leadsStore = useLeadsStore()

  const context = computed<CrmAnalyticsContext>(() => {
    // Resolve periodDays to register it as a reactive dependency.
    // Currently unused — CRM metrics are all-time snapshots.
    void toValue(periodDays)

    // ── Customers ────────────────────────────────────────────────────────────
    // customers collection: { id, name, ... }
    const customers: CrmCustomerRef[] = (crmStore.customers as any[]).map(c => ({
      id: String(c.id ?? ''),
      name: String(c.name ?? ''),
    }))

    // ── Quotes ───────────────────────────────────────────────────────────────
    // crmQuotes collection: { id, status, grandTotal, ... }
    // status values observed: 'DRAFT', 'APPROVED'
    const allQuotes = crmStore.quotes as any[]
    let quoteTotalCount = 0
    let quoteApproved = 0
    let quoteDraft = 0
    let quoteTotalValue = 0

    for (const q of allQuotes) {
      quoteTotalCount++
      quoteTotalValue += Number(q.grandTotal) || 0
      const status = String(q.status ?? '').toUpperCase()
      if (status === 'APPROVED') quoteApproved++
      else if (status === 'DRAFT') quoteDraft++
    }

    const quotes: CrmQuoteAnalytics = {
      total: quoteTotalCount,
      approved: quoteApproved,
      draft: quoteDraft,
      totalValue: quoteTotalValue,
      ...(quoteTotalCount > 0
        ? { avgDealSize: Math.round((quoteTotalValue / quoteTotalCount) * 100) / 100 }
        : {}),
    }

    // ── Invoices ─────────────────────────────────────────────────────────────
    // crmInvoices collection: { id, status, grandTotal, amountPaid, customerName, ... }
    // status values: 'UNPAID' | 'PARTIAL' | 'PAID'
    // customerName is a plain string copied at invoice creation — NOT a FK reference.
    // NOTE: No dueDate field — invoice aging is not computable. See unified-context.ts.
    const allInvoices = crmStore.invoices as any[]
    let invTotal = 0
    let invPaid = 0
    let invUnpaid = 0
    let invPartial = 0
    let totalOutstanding = 0
    let largestOutstanding: CrmLargestOutstandingInvoice | undefined

    for (const inv of allInvoices) {
      invTotal++
      const status = String(inv.status ?? '').toUpperCase()
      const grandTotal = Number(inv.grandTotal) || 0
      const amountPaid = Number(inv.amountPaid) || 0
      const outstanding = Math.max(0, grandTotal - amountPaid)

      if (status === 'PAID') {
        invPaid++
      } else if (status === 'PARTIAL') {
        invPartial++
        totalOutstanding += outstanding
      } else {
        // UNPAID or any unrecognised status
        invUnpaid++
        totalOutstanding += outstanding
      }

      if (status !== 'PAID' && outstanding > 0) {
        if (
          largestOutstanding === undefined ||
          outstanding > (largestOutstanding.grandTotal - largestOutstanding.amountPaid)
        ) {
          largestOutstanding = {
            id: String(inv.id ?? ''),
            customerName: String(inv.customerName ?? ''),
            grandTotal,
            amountPaid,
          }
        }
      }
    }

    const invoices: CrmInvoiceAnalytics = {
      total: invTotal,
      paid: invPaid,
      unpaid: invUnpaid,
      partial: invPartial,
      totalOutstanding,
      ...(largestOutstanding !== undefined ? { largestOutstanding } : {}),
    }

    // ── Leads ────────────────────────────────────────────────────────────────
    // leads collection: { id, stage, value, source, ... }
    // stage values: 'New' | 'Contacted' | 'Qualified' | 'Proposal' | 'Negotiation' | 'Won' | 'Lost'
    const allLeads = leadsStore.leads
    const stageMap = new Map<string, number>()
    const sourceMap = new Map<string, { count: number; value: number }>()
    let pipelineValue = 0
    let wonCount = 0
    let lostCount = 0

    for (const lead of allLeads) {
      const stage = String(lead.stage ?? 'Unknown')
      stageMap.set(stage, (stageMap.get(stage) ?? 0) + 1)

      const val = Number(lead.value) || 0
      if (stage !== 'Lost') pipelineValue += val
      if (stage === 'Won') wonCount++
      if (stage === 'Lost') lostCount++

      const source = String(lead.source ?? 'Unknown')
      const cur = sourceMap.get(source) ?? { count: 0, value: 0 }
      sourceMap.set(source, { count: cur.count + 1, value: cur.value + val })
    }

    const bySource: CrmLeadBySource[] = Array.from(sourceMap.entries())
      .map(([source, { count, value }]) => ({ source, count, value }))
      .sort((a, b) => b.count - a.count)

    const leads: CrmLeadAnalytics = {
      total: allLeads.length,
      byStage: Object.fromEntries(stageMap.entries()),
      pipelineValue,
      wonCount,
      lostCount,
      bySource,
    }

    return {
      customers,
      customerCount: customers.length,
      quotes,
      invoices,
      leads,
    }
  })

  return {
    /**
     * Readonly reactive computed ref. Access via context.value.
     * Recomputes whenever crmStore or leadsStore updates.
     */
    context: context as Readonly<typeof context>,
  }
}
