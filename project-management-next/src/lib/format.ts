/**
 * Standardizes formatting rules to prevent decimals drift across reports, layouts, and panels.
 */

export function formatCurrency(val: number): string {
  const isNegative = val < 0;
  const absVal = Math.abs(val);
  return `${isNegative ? '-' : ''}$${absVal.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** IRD wallet balance / legs are ZAR-native. */
export function formatZar(val: number): string {
  const isNegative = val < 0;
  const absVal = Math.abs(val);
  return `${isNegative ? '-' : ''}R${absVal.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatAccountMoney(account: string | undefined, val: number): string {
  return String(account || '').toUpperCase() === 'IRD' ? formatZar(val) : formatCurrency(val);
}

export function formatUnitPrice(val: number): string {
  // Round to 4 decimal places to prevent floating-point garbage storage artifacts
  const rounded = Math.round(val * 10000) / 10000;
  const isNegative = rounded < 0;
  const absVal = Math.abs(rounded);
  return `${isNegative ? '-' : ''}$${absVal.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  })}`;
}

export function formatPercent(val: number, decimals: number = 2): string {
  return `${val.toFixed(decimals)}%`;
}

export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return 'N/A';
  const d = new Date(date);
  if (isNaN(d.getTime())) return 'N/A';
  
  // Return formatted string with consistent explicit locale and options (e.g. "Jul 7, 2026, 2:28 PM")
  return d.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}
