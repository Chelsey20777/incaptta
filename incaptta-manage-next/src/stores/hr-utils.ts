import { Employee } from './hr-types'

export const getEmpName = (emp?: Employee | null | any): string => {
  return emp ? (emp.fullName || emp.name || emp.displayName || 'Unnamed Employee') : '—'
}

export const fmt = (n?: number | null): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2
  }).format(n || 0)
}

export const daysBetween = (start: string, end: string): number => {
  const d = (new Date(end).getTime() - new Date(start).getTime()) / 86400000
  return isNaN(d) ? 0 : Math.round(d) + 1
}

export const calculateTaxDeductions = (gross: number) => {
  const nssa = Number((Math.min(gross, 700) * 0.045).toFixed(2))
  const taxable = gross - nssa

  let paye = 0
  if (taxable <= 100) {
    paye = 0
  } else if (taxable <= 300) {
    paye = (taxable * 0.20) - 20
  } else if (taxable <= 1000) {
    paye = (taxable * 0.25) - 35
  } else if (taxable <= 2000) {
    paye = (taxable * 0.30) - 85
  } else if (taxable <= 3000) {
    paye = (taxable * 0.35) - 185
  } else {
    paye = (taxable * 0.40) - 335
  }
  paye = Math.max(0, Number(paye.toFixed(2)))

  const aidsLevy = Number((paye * 0.03).toFixed(2))
  const zimdef = Number((gross * 0.01).toFixed(2))
  const wcif = Number((gross * 0.0125).toFixed(2))

  return { paye, aidsLevy, nssa, zimdef, wcif }
}
