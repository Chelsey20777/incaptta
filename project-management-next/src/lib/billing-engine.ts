import { InvoiceBreakdown } from '@/types/equipment-hire'

export function calculateFinalRentalInvoice(
  contract: any,
  preInspection: any,
  postInspection: any
): InvoiceBreakdown {
  const start = new Date(contract.startDate)
  const end = new Date(contract.endDate)
  
  // Calculate calendar days (inclusive)
  const diffTime = Math.abs(end.getTime() - start.getTime())
  const totalDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1

  // Filter approved standby days that fall within the contract range
  const standbyDaysCount = (contract.standbyDays || []).filter((dateStr: string) => {
    const d = new Date(dateStr)
    return d >= start && d <= end
  }).length

  const billableDaysCount = Math.max(0, totalDays - standbyDaysCount)

  // 1. Base Time Cost Calculation
  const normalRateCost = billableDaysCount * (contract.baseDailyRate || 0)
  const standbyRateCost = standbyDaysCount * (contract.baseDailyRate || 0) * (contract.standbyRatePercentage || 0.5)
  const baseTimeCost = normalRateCost + standbyRateCost

  // 2. Allowed engine hours (standby days tally 0 hours allowance)
  const allowedHours = billableDaysCount * (contract.includedDailyHours || 8.0)

  // 3. Actual engine hours utilized
  const initialHours = preInspection?.engineHoursRecorded || 0
  const finalHours = postInspection?.engineHoursRecorded || initialHours
  const actualHours = Math.max(0, finalHours - initialHours)

  // 4. Excess hours calculation
  const excessHours = Math.max(0, actualHours - allowedHours)
  const excessCost = excessHours * (contract.excessHourRate || 0)

  // 5. Grand Total
  const totalInvoiceCost = baseTimeCost + excessCost

  return {
    totalDays,
    standbyDaysCount,
    billableDaysCount,
    baseTimeCost,
    allowedHours,
    actualHours,
    excessHours,
    excessCost,
    totalInvoiceCost
  }
}
