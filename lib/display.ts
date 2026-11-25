export const baht = (v: number) =>
  new Intl.NumberFormat("en-TH", {
    style: "currency",
    currency: "THB",
    currencyDisplay: "narrowSymbol",
    maximumFractionDigits: v % 100 ? 2 : 0,
    minimumFractionDigits: v % 100 ? 2 : 0,
  }).format(v / 100);
export const localDate = (v: string | Date) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(v));
export function pageNumber(raw?: string) {
  return Math.max(1, Math.min(100000, parseInt(raw || "1", 10) || 1));
}
