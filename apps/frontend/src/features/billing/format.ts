/** 19900 paise → "₹199". */
export function formatPrice(amountPaise: number, currency: string): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    minimumFractionDigits: amountPaise % 100 === 0 ? 0 : 2,
  }).format(amountPaise / 100);
}

/** "24 Oct 2026" */
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
