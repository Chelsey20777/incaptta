import { db } from '@/lib/firebase'
import { collection, query, where, getDocs, addDoc, updateDoc, serverTimestamp, doc } from 'firebase/firestore'

export interface JobCardPayrollPosting {
  id?: string
  jobCardId: string
  jobNumber: string
  employeeId: string
  employeeName: string
  nationalId: string
  month: number
  year: number
  amount: number
  postedAt: any
  payrollId?: string
}

export interface PayrollPostResult {
  employeeName: string
  amount: number
  month: number
  year: number
}

/**
 * Post job earnings from approved staff rates to payroll.
 * Called when a staff rate item is individually approved to APPROVED_MANAGER.
 * Returns a summary of each successful posting for toast feedback.
 */
export async function postJobEarningsToPayroll(
  jobCardId: string,
  jobNumber: string,
  staffRates: any[],
  jobDate: Date
): Promise<PayrollPostResult[]> {
  // Filter only approved staff rates
  const approvedRates = staffRates.filter(rate => rate.approvalStatus === 'APPROVED_MANAGER')

  if (approvedRates.length === 0) {
    return []
  }

  // Determine target month/year from job date
  const targetMonth = jobDate.getMonth() + 1 // 1-12
  const targetYear = jobDate.getFullYear()

  // Fetch employee details from HR
  const employeesSnap = await getDocs(collection(db, 'employees'))
  const employees = employeesSnap.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }))

  const results: PayrollPostResult[] = []

  for (const rate of approvedRates) {
    // Find employee details
    const employee = employees.find((e: any) => e.id === rate.employeeId)

    if (!employee) {
      console.warn(`Employee ${rate.employeeId} not found, skipping payroll posting`)
      continue
    }

    // Check if payroll record exists for this employee/month/year
    const payrollQuery = query(
      collection(db, 'payroll'),
      where('employeeId', '==', rate.employeeId),
      where('month', '==', targetMonth),
      where('year', '==', targetYear)
    )
    const payrollSnap = await getDocs(payrollQuery)

    if (payrollSnap.empty) {
      // Create new payroll record with job earnings
      const newPayroll = {
        employeeId: rate.employeeId,
        employeeName: (employee as any).fullName,
        nationalId: (employee as any).nationalId,
        month: targetMonth,
        year: targetYear,
        basicSalary: 0,
        allowances: rate.jobRateAmount,
        deductions: 0,
        netPay: rate.jobRateAmount,
        status: 'Unpaid',
        generatedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        jobCardEarnings: rate.jobRateAmount,
        jobCardReferences: [jobNumber]
      }

      const payrollRef = await addDoc(collection(db, 'payroll'), newPayroll)

      // Log the posting
      await logJobCardPayrollPosting({
        jobCardId,
        jobNumber,
        employeeId: rate.employeeId,
        employeeName: (employee as any).fullName,
        nationalId: (employee as any).nationalId,
        month: targetMonth,
        year: targetYear,
        amount: rate.jobRateAmount,
        postedAt: serverTimestamp(),
        payrollId: payrollRef.id
      })
    } else {
      // Update existing payroll record
      const payrollDoc = payrollSnap.docs[0]!
      const payrollData = payrollDoc.data()

      const newJobEarnings = (payrollData.jobCardEarnings || 0) + rate.jobRateAmount
      const currentAllowances = typeof payrollData.allowances === 'number' ? payrollData.allowances : 0
      const newAllowances = currentAllowances + rate.jobRateAmount
      const updatedNetPay = (payrollData.basicSalary || 0) + newAllowances - (payrollData.deductions || 0)

      const existingRefs = payrollData.jobCardReferences || []
      const updatedRefs = existingRefs.includes(jobNumber) ? existingRefs : [...existingRefs, jobNumber]

      await updateDoc(doc(db, 'payroll', payrollDoc.id), {
        allowances: newAllowances,
        jobCardEarnings: newJobEarnings,
        netPay: updatedNetPay,
        updatedAt: serverTimestamp(),
        jobCardReferences: updatedRefs
      })

      // Log the posting
      await logJobCardPayrollPosting({
        jobCardId,
        jobNumber,
        employeeId: rate.employeeId,
        employeeName: (employee as any).fullName,
        nationalId: (employee as any).nationalId,
        month: targetMonth,
        year: targetYear,
        amount: rate.jobRateAmount,
        postedAt: serverTimestamp(),
        payrollId: payrollDoc.id
      })
    }

    // Accumulate in Salaries Account
    try {
        await addDoc(collection(db, 'salariesAccountTransactions'), {
            type: 'ACCUMULATION',
            source: 'STAFF_RATE',
            amount: rate.jobRateAmount,
            month: targetMonth,
            year: targetYear,
            description: `Staff Rate Approved: ${(employee as any).fullName} - Job ${jobNumber}`,
            referenceId: jobCardId,
            createdAt: serverTimestamp()
        })
    } catch (err) {
        console.error('Failed to accumulate staff rate in Salaries Account:', err)
    }

    results.push({
      employeeName: (employee as any).fullName,
      amount: rate.jobRateAmount,
      month: targetMonth,
      year: targetYear
    })
  }

  return results
}

/**
 * Log a job card payroll posting for audit trail
 */
async function logJobCardPayrollPosting(posting: Omit<JobCardPayrollPosting, 'id'>): Promise<void> {
  try {
    await addDoc(collection(db, 'jobCardPayrollPostings'), {
      ...posting,
      createdAt: serverTimestamp()
    })
  } catch (err) {
    console.error('Failed to log job card payroll posting:', err)
  }
}
