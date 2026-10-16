export type StockDraft = { value: string; requestId?: string; error?: string }

export function stockQuantity(value: string): number {
  if (!value.trim()) return 0
  const quantity = Number(value)
  if (!Number.isFinite(quantity) || quantity < 0) throw new Error('Enter a positive quantity or leave blank.')
  return quantity
}

export async function submitStockAdditions(
  drafts: Record<string, StockDraft>,
  submit: (id: string, quantity: number, requestId: string) => Promise<void>,
  requestId: () => string,
): Promise<Record<string, StockDraft>> {
  const pending: Record<string, StockDraft> = {}
  // Validate the entire set before applying any entries.
  for (const draft of Object.values(drafts)) stockQuantity(draft.value)
  for (const [id, draft] of Object.entries(drafts)) {
    const quantity = stockQuantity(draft.value)
    if (!quantity) continue
    const key = draft.requestId || requestId()
    try { await submit(id, quantity, key) }
    catch (error) {
      pending[id] = { ...draft, requestId: key, error: error instanceof Error ? error.message : 'Unable to save. Retry this entry.' }
    }
  }
  return pending
}
