import type { MbdiInitiative } from '../types'
import { MBDI_STATUS_LABELS, MBDI_TIERS } from '../types'

function csvEscape(value: string | number | undefined | null): string {
  const raw = value == null ? '' : String(value)
  if (/[",\n\r]/.test(raw)) return `"${raw.replace(/"/g, '""')}"`
  return raw
}

/** Build a CSV string from MBDI register rows (currently filtered list). */
export function buildMbdiRegisterCsv(initiatives: MbdiInitiative[]): string {
  const headers = [
    'MBDI No.',
    'Initiative',
    'Owner',
    'Owner Email',
    'Date Started',
    'Target End',
    'Tier',
    'Reward Amount',
    'Completion %',
    'Status',
    'Stage 2 Paid (50%)',
    'Stage 3 Paid (50%)',
    'Benefit Generated',
    'Estimated Cost',
    'Objective',
  ]

  const rows = initiatives.map((i) => [
    i.mbdiNo || 'Pending',
    i.title,
    i.ownerName,
    i.ownerEmail,
    i.startDate || '',
    i.endDate || '',
    i.tier ? MBDI_TIERS[i.tier].label : '',
    typeof i.rewardAmount === 'number' ? i.rewardAmount : '',
    i.completionPercent,
    MBDI_STATUS_LABELS[i.status] || i.status,
    i.stage2Payment?.amount ?? '',
    i.stage3Payment?.amount ?? '',
    i.benefitGenerated || '',
    i.estimatedCost ?? '',
    i.objective,
  ])

  return [headers, ...rows].map((row) => row.map(csvEscape).join(',')).join('\r\n')
}

/** Trigger a browser download of the MBDI register CSV. */
export function downloadMbdiRegisterCsv(initiatives: MbdiInitiative[], filename?: string): void {
  const csv = buildMbdiRegisterCsv(initiatives)
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const stamp = new Date().toISOString().slice(0, 10)
  const a = document.createElement('a')
  a.href = url
  a.download = filename || `MBDI-Register-${stamp}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
