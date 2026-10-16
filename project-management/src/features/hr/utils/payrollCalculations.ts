/**
 * Payroll Calculation Utility
 * Based on 2025 USD Tax Tables from Excel Template
 */

export interface PayrollDeductions {
  paye: number;
  aidsLevy: number;
  nssa: number;
  zimdef: number;
  wcif: number;
  totalDeductions: number;
}

export function calculatePayrollDeductions(grossPay: number): PayrollDeductions {
  // Statutory deductions temporarily reinstated to $0.00 per user request
  // until official tax implementation begins (100% Gross Salary payout).
  return {
    paye: 0,
    aidsLevy: 0,
    nssa: 0,
    zimdef: 0,
    wcif: 0,
    totalDeductions: 0
  };
}
