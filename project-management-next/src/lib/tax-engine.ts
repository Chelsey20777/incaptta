/**
 * ZIMRA Tax Engine for ITF12C Compliance
 *
 * Logic for calculating Corporate Tax, AIDS Levy, and Capital Allowances
 * based on Zimbabwe Revenue Authority (ZIMRA) standards.
 */

export interface Asset {
  id: string
  name: string
  purchaseDate: string | Date
  cost: number
  assetType: 'MACHINERY' | 'MOTOR_VEHICLE' | 'FURNITURE' | 'COMPUTER' | 'BUILDING'
  depreciationRate?: number
}

export const ZIMRA_RATES = {
  CORPORATE_TAX: 0.24,
  AIDS_LEVY: 0.03,
  CAPITAL_ALLOWANCE: {
    MACHINERY: 0.25,
    MOTOR_VEHICLE: 0.25,
    FURNITURE: 0.10,
    COMPUTER: 0.333,
    BUILDING: 0.05,
  },
}

/**
 * Calculates the Capital Allowance (Wear & Tear) for a specific year
 */
export function calculateCapitalAllowance(asset: Asset, fiscalYear: number): number {
  const purchaseDate = new Date(asset.purchaseDate)
  const purchaseYear = purchaseDate.getFullYear()

  if (purchaseYear > fiscalYear) return 0

  const rate =
    asset.depreciationRate || ZIMRA_RATES.CAPITAL_ALLOWANCE[asset.assetType] || 0.25

  return asset.cost * rate
}

/**
 * Calculates the total tax liability
 */
export function calculateTaxLiability(taxableIncome: number) {
  if (taxableIncome <= 0) {
    return { corporateTax: 0, aidsLevy: 0, total: 0 }
  }

  const corporateTax = taxableIncome * ZIMRA_RATES.CORPORATE_TAX
  const aidsLevy = corporateTax * ZIMRA_RATES.AIDS_LEVY

  return {
    corporateTax,
    aidsLevy,
    total: corporateTax + aidsLevy,
  }
}
