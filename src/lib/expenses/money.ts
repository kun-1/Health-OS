export function toCents(value: number | null | undefined): number {
  if (value === null || value === undefined || Number.isNaN(value)) return 0;
  return Math.round(value * 100);
}

export function fromCents(value: number): number {
  return Number((value / 100).toFixed(2));
}

export function formatMoney(value: number, currency = "CNY"): string {
  return new Intl.NumberFormat("zh-CN", { style: "currency", currency }).format(value);
}
