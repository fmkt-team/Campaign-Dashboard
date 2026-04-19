export function formatCurrencyM(value: number): string {
  if (value == null) return "--";
  return (value / 1000000).toLocaleString(undefined, { maximumFractionDigits: 1 }) + "M";
}

export function formatNumber(value: number): string {
  if (value == null) return "--";
  if (value >= 10000) {
    return (value / 10000).toLocaleString(undefined, { maximumFractionDigits: 1 }) + "만";
  }
  return value.toLocaleString();
}

export function getPercentageDiff(current: number, previous: number): number {
  if (!previous) return 0;
  return ((current - previous) / previous) * 100;
}
