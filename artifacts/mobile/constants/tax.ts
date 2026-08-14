// Sales-tax rate used when previewing a not-yet-created quote, or as a
// fallback when a quote has no persisted taxRate. Once a quote exists,
// always prefer its own quote.taxRate over this default.
export const DEFAULT_TAX_RATE = 0.13;

export function computeTax(subtotal: number, taxRate: number = DEFAULT_TAX_RATE): number {
  return Math.round(subtotal * taxRate * 100) / 100;
}
