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

/**
 * Abbreviated currency for compact displays ($1.5M, $12K, $850). Consolidates
 * the near-identical K/M abbreviation logic duplicated in the leads and
 * projects pages.
 */
export function formatCompactCurrency(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${Math.round(n).toLocaleString()}`;
}

/**
 * Shared short-date formatter ("Jul 4, 2026"). Consolidates the near-identical
 * `fmtDate` implementations copy-pasted across the ai-compliance-monitor,
 * auditor-portal, and client-portal pages.
 */
export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  try {
    return new Date(dateStr).toLocaleDateString("en-CA", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return dateStr;
  }
}

/**
 * Shared date+time formatter ("Jul 4, 2026, 9:00 p.m.").
 */
export function formatDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleString("en-CA", { dateStyle: "medium", timeStyle: "short" });
}

/**
 * Shared file-size formatter. Consolidates the identical `formatSize`/`fmtSize`/
 * `fmtBytes` implementations copy-pasted across DocumentsTab, FileAttachments,
 * cor-compliance, and the client portal.
 */
export function formatFileSize(bytes: number | null | undefined): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
