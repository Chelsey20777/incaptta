/** Deterministic payroll document id: `{employeeId}_{year}_{month}`. */
export function payrollDocId(employeeId: string, year: number, month: number): string {
  return `${employeeId}_${year}_${month}`
}
