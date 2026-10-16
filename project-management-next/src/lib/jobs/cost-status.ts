const explicitApproved = (status?: string) =>
  status === 'APPROVED_MANAGER' || status === 'APPROVED_ACCOUNTANT' || status === 'APPROVED'

export function jobCostBuckets(job: {
  requisitionSections?: Array<{ items?: Array<{ qtyRequired?: number; irdSellingPrice?: number; approvalStatus?: string }> }>
  adHocExpenses?: Array<{ totalAmount?: number; approvalStatus?: string; opexId?: string | null }>
  subcontractWorks?: Array<{ totalAmount?: number; approvalStatus?: string; paidApprovedTotal?: number; contractValue?: number }>
  staffRates?: Array<{ jobRateAmount?: number; approvalStatus?: string; payrollPosted?: boolean }>
  inventoryReturns?: Array<{ qtyReturned?: number; costSnapshot?: number; approvalStatus?: string }>
}) {
  const materials = (job.requisitionSections || []).flatMap(section => section.items || [])
  const materialBudget = materials.reduce((sum, item) => sum + (Number(item.qtyRequired) || 0) * (Number(item.irdSellingPrice) || 0), 0)
  const materialCommitted = materials.filter(item => explicitApproved(item.approvalStatus)).reduce((sum, item) => sum + (Number(item.qtyRequired) || 0) * (Number(item.irdSellingPrice) || 0), 0)
  const expenses = job.adHocExpenses || []
  const expenseBudget = expenses.reduce((sum, item) => sum + (Number(item.totalAmount) || 0), 0)
  const expenseCommitted = expenses.filter(item => explicitApproved(item.approvalStatus)).reduce((sum, item) => sum + (Number(item.totalAmount) || 0), 0)
  const expensePaid = expenses.filter(item => item.opexId).reduce((sum, item) => sum + (Number(item.totalAmount) || 0), 0)
  const subs = job.subcontractWorks || []
  const subBudget = subs.reduce((sum, item) => sum + (Number(item.contractValue ?? item.totalAmount) || 0), 0)
  const subCommitted = subs.filter(item => explicitApproved(item.approvalStatus)).reduce((sum, item) => sum + (Number(item.totalAmount) || 0), 0)
  const subPaid = subs.reduce((sum, item) => sum + (Number(item.paidApprovedTotal) || 0), 0)
  const rates = job.staffRates || []
  const labourBudget = rates.reduce((sum, item) => sum + (Number(item.jobRateAmount) || 0), 0)
  const labourCommitted = rates.filter(item => explicitApproved(item.approvalStatus)).reduce((sum, item) => sum + (Number(item.jobRateAmount) || 0), 0)
  const labourPaid = rates.filter(item => item.payrollPosted).reduce((sum, item) => sum + (Number(item.jobRateAmount) || 0), 0)
  const returns = (job.inventoryReturns || []).filter(item => explicitApproved(item.approvalStatus))
    .reduce((sum, item) => sum + (Number(item.qtyReturned) || 0) * (Number(item.costSnapshot) || 0), 0)

  return {
    materials: { budget: materialBudget, committed: materialCommitted, actual: materialCommitted, paid: 0 },
    expenses: { budget: expenseBudget, committed: expenseCommitted, actual: expenseCommitted, paid: expensePaid },
    subcontract: { budget: subBudget, committed: subCommitted, actual: subCommitted, paid: subPaid },
    labour: { budget: labourBudget, committed: labourCommitted, actual: labourCommitted, paid: labourPaid },
    returns,
    missingStatusNotCountedAsApproved: true,
  }
}
