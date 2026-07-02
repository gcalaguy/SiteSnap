/**
 * Shared CAD currency formatter. Consolidates the ~13 near-identical local
 * `fmtCAD`/`cad`/`fmt` wrappers around `Intl.NumberFormat("en-CA", { style:
 * "currency", currency: "CAD" })` that were copy-pasted across invoice,
 * quote, and timesheet pages.
 */
export function formatCurrency(
  amount: string | number,
  options?: Intl.NumberFormatOptions,
): string {
  return new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", ...options }).format(
    Number(amount),
  );
}

/**
 * Same as formatCurrency, but returns "—" for null/undefined instead of
 * formatting them — matches the null-guarded call sites (client-portal,
 * estimates, timesheets) that expect a dash placeholder rather than "$0.00".
 */
export function formatCurrencyOrDash(
  amount: string | number | null | undefined,
  options?: Intl.NumberFormatOptions,
): string {
  if (amount === null || amount === undefined || amount === "") return "—";
  return formatCurrency(amount, options);
}
