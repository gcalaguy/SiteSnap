/**
 * Shared page/limit/offset parser. Consolidates the identical
 * `Math.max(1, parseInt(...))` / `Math.min(maxLimit, ...)` pair that was
 * copy-pasted across dashboard.ts, tasks.ts, safety.ts, invoices.ts, and
 * financials.ts, each with its own (sometimes differing) default/max limit.
 *
 * Preserves the original NaN-propagation behavior of `Math.max(1, NaN)` for
 * non-numeric query values rather than "fixing" it, since callers depend on
 * their existing (buggy-but-unchanged) behavior here.
 */
export function parsePagination(
  query: { page?: unknown; limit?: unknown },
  defaultLimit = 50,
  maxLimit = 200,
): { page: number; limit: number; offset: number } {
  const page = Math.max(1, parseInt(String(query.page ?? "1"), 10));
  const limit = Math.min(maxLimit, Math.max(1, parseInt(String(query.limit ?? String(defaultLimit)), 10)));
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}
