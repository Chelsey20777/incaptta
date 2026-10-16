export const computeTotalCost = (purchasePrice: number, freightDuty: number): number => {
  return Number((Number(purchasePrice || 0) + Number(freightDuty || 0)).toFixed(2));
};

export const computeSellingPrice = (totalCost: number, markupPercent: number): number => {
  const markup = 1 + Number(markupPercent || 0) / 100;
  return Number((Number(totalCost || 0) * markup).toFixed(2));
};

export const formatCurrency = (value: number | undefined): string => {
  if (value === undefined || isNaN(value)) return '$0.00';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(value);
};

export const formatPercent = (value: number | undefined): string => {
  if (value === undefined || isNaN(value)) return '0%';
  return `${value}%`;
};
