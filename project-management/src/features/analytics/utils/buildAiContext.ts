/**
 * buildAiContext — AI Payload Slimming Utility
 *
 * Transforms a full UnifiedOperationalContext into a leaner AiSafeContext
 * before it is serialised and forwarded to an AI service.
 *
 * Goals:
 *   - Reduce token count by trimming long arrays that provide diminishing
 *     returns for AI reasoning (e.g. 180-day trend vs 30-day trend).
 *   - Drop the customer name list entirely — customerCount is sufficient for
 *     business-level reasoning and the list adds tokens without insight.
 *   - Preserve every numeric aggregate and computed total — AI reasoning
 *     depends on these more than on raw list depth.
 *
 * This file is intentionally framework-free (no Vue, no Pinia, no Firebase).
 * Both exported functions are pure — they have no side effects and do not
 * read from any store or global state.
 *
 * Usage:
 *   import { buildAiContext, estimateContextSize } from '../utils/buildAiContext'
 *
 *   const slim = buildAiContext(context.value)
 *   const bytes = estimateContextSize(slim)
 *   if (bytes > 150_000) console.warn('AI payload is large:', bytes, 'bytes')
 */

import type {
  UnifiedOperationalContext,
  OperationsAnalyticsContext,
  FinanceAnalyticsContext,
  CrmAnalyticsContext,
  HrAnalyticsContext,
  InventoryAnalyticsContext,
  InvStockMovement,
} from '../types/unified-context'

// ─── Slimming constants ────────────────────────────────────────────────────────
// All array-length limits live here. No magic numbers in function bodies.

/** Maximum overdue job card items kept in operations.jobCards.overdueOpenCards. */
const MAX_OVERDUE_ITEMS = 20

/**
 * Maximum number of daily trend data points kept in income and expense trends.
 * Applied as a trailing slice — most-recent days are preserved.
 */
const MAX_TREND_DAYS = 30

/** Maximum number of largest expense items kept in operations.expenses.largestItems. */
const MAX_EXPENSE_ITEMS = 10

/**
 * Maximum number of payroll months kept in finance.payroll.byMonth.
 * Applied as a trailing slice — most-recent months are preserved.
 */
const MAX_PAYROLL_MONTHS = 6

/**
 * Maximum low-stock item entries.
 * NOTE: InventoryAnalyticsContext exposes lowStockCount (a number), not an array.
 * This constant is reserved for future phases if the inventory context is extended
 * to include a lowStockItems array.
 */
const MAX_LOW_STOCK_ITEMS = 15 // eslint-disable-line @typescript-eslint/no-unused-vars

/** Maximum items in inventory.stockMovement.topConsumedItems. */
const MAX_CONSUMED_ITEMS = 10

/** Maximum number of granular job card summaries kept for deep-dive analysis. */
const MAX_CARD_SUMMARIES = 50

// ─── AiSafeContext ────────────────────────────────────────────────────────────

/**
 * A slimmed-down version of UnifiedOperationalContext safe for AI transmission.
 *
 * Structural contract:
 *   - Same shape as UnifiedOperationalContext — all field names and types are
 *     identical. Only array cardinalities differ (fewer items, same item type).
 *   - crm.customers is always [] — the name list is dropped; customerCount
 *     is retained for business-level reasoning.
 *   - inventory.stockMovement is omitted when undefined (not serialised as null).
 *
 * Consumers of AiSafeContext MUST NOT assume array lengths match the raw context.
 * Any code that needs the full arrays should read from UnifiedOperationalContext.
 */
export type AiSafeContext = UnifiedOperationalContext

// ─── buildAiContext ───────────────────────────────────────────────────────────

/**
 * Produces a slimmed AiSafeContext from a full UnifiedOperationalContext.
 *
 * Pure function — no side effects, no store access, no mutations.
 * All slimming is applied via array slicing; no values are mutated in place.
 *
 * Slimming rules applied:
 *   Operations:
 *     - overdueOpenCards  → capped at MAX_OVERDUE_ITEMS (already sorted desc by daysOpen)
 *     - expenses.trend    → trailing MAX_TREND_DAYS entries
 *     - expenses.largestItems → capped at MAX_EXPENSE_ITEMS
 *   Finance:
 *     - income.trend      → trailing MAX_TREND_DAYS entries
 *     - payroll.byMonth   → trailing MAX_PAYROLL_MONTHS entries (sorted chronologically)
 *   CRM:
 *     - customers array   → replaced with [] (customerCount is preserved)
 *   HR:
 *     - no changes (all fields are already aggregated scalars or small arrays)
 *   Inventory:
 *     - stockMovement.topConsumedItems → capped at MAX_CONSUMED_ITEMS
 *     - stockMovement omitted entirely if undefined
 */
export function buildAiContext(ctx: UnifiedOperationalContext): AiSafeContext {
  // ── Operations ──────────────────────────────────────────────────────────────
  const ops = ctx.operations
  const slimOps: OperationsAnalyticsContext = {
    ...ops,
    jobCards: {
      ...ops.jobCards,
      // overdueOpenCards is already sorted desc by daysOpen in useAnalyticsData
      overdueOpenCards: ops.jobCards.overdueOpenCards.slice(0, MAX_OVERDUE_ITEMS),
    },
    jobCardSummaries: ops.jobCardSummaries?.slice(0, MAX_CARD_SUMMARIES) || [],
    expenses: {
      ...ops.expenses,
      // Keep only the most-recent N days of the trend (trailing slice)
      trend: ops.expenses.trend.slice(-MAX_TREND_DAYS),
      largestItems: ops.expenses.largestItems.slice(0, MAX_EXPENSE_ITEMS),
    },
  }

  // ── Finance ────────────────────────────────────────────────────────────────
  const fin = ctx.finance
  const slimFin: FinanceAnalyticsContext = {
    income: {
      ...fin.income,
      trend: fin.income.trend.slice(-MAX_TREND_DAYS),
    },
    payroll: {
      ...fin.payroll,
      // byMonth is already sorted chronologically in useFinanceAnalytics
      byMonth: fin.payroll.byMonth.slice(-MAX_PAYROLL_MONTHS),
    },
  }

  // ── CRM ───────────────────────────────────────────────────────────────────
  // Drop the customer name array — customerCount is sufficient for AI reasoning.
  // The array is replaced with [] rather than being omitted so the shape remains
  // structurally identical (AiSafeContext = UnifiedOperationalContext).
  const crm = ctx.crm
  const slimCrm: CrmAnalyticsContext = {
    ...crm,
    customers: [], // name list dropped — customerCount retained above
  }

  // ── HR ────────────────────────────────────────────────────────────────────
  // No slimming needed — HR context is entirely aggregated scalars and small
  // arrays (byDepartment, byType). Pass through as-is.
  const slimHr: HrAnalyticsContext = ctx.hr

  // ── Inventory ─────────────────────────────────────────────────────────────
  const inv = ctx.inventory
  let slimStockMovement: InvStockMovement | undefined
  if (inv.stockMovement !== undefined) {
    slimStockMovement = {
      ...inv.stockMovement,
      topConsumedItems: inv.stockMovement.topConsumedItems.slice(0, MAX_CONSUMED_ITEMS),
    }
  }
  // Omit stockMovement entirely if undefined (avoids serialising a null/undefined field)
  const slimInv: InventoryAnalyticsContext = {
    totalItems: inv.totalItems,
    activeItems: inv.activeItems,
    lowStockCount: inv.lowStockCount,
    totalInventoryValue: inv.totalInventoryValue,
    ...(slimStockMovement !== undefined ? { stockMovement: slimStockMovement } : {}),
  }

  return {
    generatedAt: ctx.generatedAt,
    periodDays: ctx.periodDays,
    operations: slimOps,
    finance: slimFin,
    crm: slimCrm,
    hr: slimHr,
    inventory: slimInv,
  }
}

// ─── estimateContextSize ──────────────────────────────────────────────────────

/**
 * Returns the serialised byte length of an AiSafeContext object.
 *
 * Uses JSON.stringify — the same serialisation format used when sending
 * the payload to AI services. The result is the character count of the
 * JSON string, which equals the UTF-8 byte count for ASCII-only content.
 * Non-ASCII characters (e.g. business names with accents) will occupy
 * more bytes in actual UTF-8 encoding — this is a lower-bound estimate.
 *
 * Typical threshold: warn if result > 150,000 bytes.
 *
 * Pure function — no side effects.
 */
export function estimateContextSize(ctx: AiSafeContext): number {
  return JSON.stringify(ctx).length
}
