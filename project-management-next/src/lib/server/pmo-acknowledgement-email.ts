export const PMO_ACKNOWLEDGEMENT_EMAIL = 'inv-incaptta@deltorkesmak.co.zw'

const CAT_TIME_ZONE = 'Africa/Harare'

/** Central Africa Time (Africa/Harare, UTC+2, no daylight saving). Unparseable values stay as given. */
export function formatIssuedAtCat(issuedAt: string): string {
  const date = new Date(issuedAt)
  if (Number.isNaN(date.getTime())) return issuedAt
  const formatted = new Intl.DateTimeFormat('en-GB', {
    timeZone: CAT_TIME_ZONE,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date)
  return `${formatted} CAT`
}

export interface AcknowledgementEmailLine {
  name: string
  sku?: string | null
  quantity: number
}

export interface AcknowledgementEmailInput {
  jobNumber: string
  recipient: string
  issuedBy: string
  issuedAt: string
  lines: AcknowledgementEmailLine[]
}

export function buildPmoAcknowledgementEmail(input: AcknowledgementEmailInput) {
  const jobNumber = input.jobNumber.trim() || 'Job card'
  const lines = input.lines.map(line => {
    const name = line.name.trim() || 'Inventory item'
    const sku = line.sku?.trim()
    const label = sku ? `${name} (${sku})` : name
    return `- ${label} × ${line.quantity}`
  })
  const text = [
    `Stock was issued on ${jobNumber}.`,
    '',
    `Job: ${jobNumber}`,
    `Recipient: ${input.recipient.trim() || '—'}`,
    `Issued by: ${input.issuedBy.trim() || '—'}`,
    `At: ${formatIssuedAtCat(input.issuedAt)}`,
    '',
    'Issued lines:',
    ...(lines.length ? lines : ['- None']),
  ].join('\n')

  return {
    to: PMO_ACKNOWLEDGEMENT_EMAIL,
    subject: `Stock issued ${jobNumber}`,
    text,
  }
}

export interface ReceiptEmailInput {
  itemName: string
  sku?: string | null
  quantity: number
  uom?: string | null
  reference: string
  note?: string | null
  submittedBy: string
  submittedAt: string
}

export function buildPmoReceiptEmail(input: ReceiptEmailInput) {
  const name = input.itemName.trim() || 'Inventory item'
  const sku = input.sku?.trim()
  const label = sku ? `${name} (${sku})` : name
  const unit = input.uom?.trim()
  const quantity = unit ? `${input.quantity} ${unit}` : String(input.quantity)
  const text = [
    'A warehouse receipt is waiting for PMO approval. Stock has not changed.',
    '',
    `Item: ${label}`,
    `Quantity: ${quantity}`,
    `Reference: ${input.reference.trim() || '—'}`,
    `Note: ${input.note?.trim() || '—'}`,
    `Submitted by: ${input.submittedBy.trim() || '—'}`,
    `At: ${formatIssuedAtCat(input.submittedAt)}`,
  ].join('\n')

  return {
    to: PMO_ACKNOWLEDGEMENT_EMAIL,
    subject: 'Stock receipt awaiting approval',
    text,
  }
}

export interface PostedReceiptEmailInput {
  itemName: string
  sku?: string | null
  quantity: number
  uom?: string | null
  reference: string
  note?: string | null
  submittedBy: string
  pmoApprovedBy: string
  approvedBy: string
  approvedAt: string
  qtyBefore: number
  qtyAfter: number
}

export interface EmailAttachment {
  filename: string
  content: string
}

export function receiptEntryPdfFilename(reference: string) {
  const safe = String(reference || 'entry').replace(/[^A-Za-z0-9_-]+/g, '_').slice(0, 40) || 'entry'
  return `New_inventory_entry_${safe}.pdf`
}

export function buildPmoReceiptPostedEmail(input: PostedReceiptEmailInput & { attachment: EmailAttachment }) {
  const name = input.itemName.trim() || 'Inventory item'
  const sku = input.sku?.trim()
  const label = sku ? `${name} (${sku})` : name
  const unit = input.uom?.trim()
  const quantity = unit ? `${input.quantity} ${unit}` : String(input.quantity)
  const reference = input.reference.trim() || 'receipt'
  const text = [
    'A new inventory entry has been approved. Stock has been updated.',
    '',
    `Item: ${label}`,
    `Quantity: ${quantity}`,
    `Stock before: ${input.qtyBefore}`,
    `Stock after: ${input.qtyAfter}`,
    `Reference: ${reference}`,
    `Note: ${input.note?.trim() || '—'}`,
    `Submitted by: ${input.submittedBy.trim() || '—'}`,
    `PMO approved by: ${input.pmoApprovedBy.trim() || '—'}`,
    `Approved by: ${input.approvedBy.trim() || '—'}`,
    `At: ${formatIssuedAtCat(input.approvedAt)}`,
    '',
    'The new inventory entry PDF is attached.',
  ].join('\n')

  return {
    to: PMO_ACKNOWLEDGEMENT_EMAIL,
    subject: `New inventory entry ${reference}`,
    text,
    attachments: [input.attachment],
  }
}

/** Never throws. A skipped or failed send leaves the receipt in place. */
export async function reportReceiptEmail(
  input: ReceiptEmailInput,
  send: (message: { to: string; subject: string; text: string }) => Promise<{ success: boolean; error?: string }>,
): Promise<{ sent: boolean; error?: string }> {
  try {
    const result = await send(buildPmoReceiptEmail(input))
    if (!result.success) return { sent: false, error: result.error || 'Email was not sent' }
    return { sent: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Email was not sent'
    return { sent: false, error: message }
  }
}

/** Never throws. A skipped or failed send leaves the posted stock in place. */
export async function reportPostedReceiptEmail(
  input: PostedReceiptEmailInput & { attachment: EmailAttachment },
  send: (message: { to: string; subject: string; text: string; attachments: EmailAttachment[] }) => Promise<{ success: boolean; error?: string }>,
): Promise<{ sent: boolean; error?: string }> {
  try {
    const result = await send(buildPmoReceiptPostedEmail(input))
    if (!result.success) return { sent: false, error: result.error || 'Email was not sent' }
    return { sent: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Email was not sent'
    return { sent: false, error: message }
  }
}

/** Never throws. A skipped or failed send leaves the acknowledgement in place. */
export async function reportAcknowledgementEmail(
  input: AcknowledgementEmailInput,
  send: (message: { to: string; subject: string; text: string }) => Promise<{ success: boolean; error?: string }>,
): Promise<{ sent: boolean; error?: string }> {
  try {
    const result = await send(buildPmoAcknowledgementEmail(input))
    if (!result.success) return { sent: false, error: result.error || 'Email was not sent' }
    return { sent: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Email was not sent'
    return { sent: false, error: message }
  }
}
