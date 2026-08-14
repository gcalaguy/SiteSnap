// Sales-tax rate used when previewing a not-yet-created quote/invoice, or as
// a fallback when a record has no persisted taxRate. Once a quote/invoice
// exists, always prefer its own taxRate over this default.
export const DEFAULT_TAX_RATE = 0.13;

export function computeTax(subtotal: number, taxRate: number = DEFAULT_TAX_RATE): number {
  return Math.round(subtotal * taxRate * 100) / 100;
}
