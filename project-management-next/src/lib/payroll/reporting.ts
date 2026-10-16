import { collection, getDocs } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { accrualPayrollEnabled } from './client'
import { payrollTotals, today, type Journal, type Settlement } from './core'
export async function fetchPayrollAccounting(asOf = today(), from = '2000-01-01') {
  if (!accrualPayrollEnabled) return { warnings: [] as string[], currencies: {}, journals: [] as Journal[], payments: [] as Settlement[] }
  const [j, p, records] = await Promise.all([getDocs(collection(db, 'payrollJournal')), getDocs(collection(db, 'payrollPayments')), getDocs(collection(db, 'payroll'))])
  const journals = j.docs.map(d => ({ ...d.data(), id: d.id } as Journal))
  const payments = p.docs.map(d => ({ ...d.data(), id: d.id } as Settlement))
  const legacy = records.docs.filter(d => d.data().schemaVersion !== 2)
  const unpaid = legacy.filter(d => d.data().status !== 'Paid')
  const currencies = [...new Set(journals.map(j => j.currency).filter(c => c !== 'USD'))]
  const warnings = [
    ...(legacy.length ? [`${legacy.length} legacy payroll records require reconciliation. Historical salary expenses retain their previous payment-based treatment; ${unpaid.length} unpaid legacy records are not included in the new salaries-payable control.`] : []),
    ...(currencies.length ? [`This statement is in USD. Payroll in ${currencies.join(', ')} is reported separately in HR arrears and is not converted here.`] : []),
  ]
  return { warnings, currencies: payrollTotals(journals, payments, asOf, from), journals, payments }
}
