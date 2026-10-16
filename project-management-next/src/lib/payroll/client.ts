import { auth } from '@/lib/firebase'
export const accrualPayrollEnabled = process.env.NEXT_PUBLIC_DEPLOYMENT_ENV === 'staging' && process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID === 'incaptta-pro-staging'
export async function payrollRequest(body?: Record<string, unknown>, query = '') {
  if (!accrualPayrollEnabled) throw new Error('Accrual payroll is available only in isolated staging')
  const token = await auth.currentUser?.getIdToken()
  if (!token) throw new Error('Sign in to use payroll')
  const response = await fetch(`/api/hr/payroll${query}`, { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || 'Payroll request failed')
  return data
}
