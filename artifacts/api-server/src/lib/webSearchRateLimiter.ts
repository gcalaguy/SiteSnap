/**
 * In-memory daily rate limiter for external web searches.
 * Per-company (tenant) limit resets at midnight local server time.
 * Suitable for pilot phase — a server restart resets counters, which is acceptable
 * for cost control during early testing.
 */

const DAILY_LIMIT = 20;

interface Counter {
  count: number;
  date: string; // YYYY-MM-DD
}

const _counters = new Map<number, Counter>();

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function getCounter(companyId: number): Counter {
  const cached = _counters.get(companyId);
  const today = todayStr();
  if (cached && cached.date === today) {
    return cached;
  }
  const fresh: Counter = { count: 0, date: today };
  _counters.set(companyId, fresh);
  return fresh;
}

/** Check whether this company still has quota left today. */
export function canSearchWeb(companyId: number): boolean {
  return getCounter(companyId).count < DAILY_LIMIT;
}

/** Record one consumed search for this company. */
export function recordWebSearch(companyId: number): void {
  getCounter(companyId).count++;
}

/** Get remaining searches for this company today (for UI / logging). */
export function remainingSearches(companyId: number): number {
  return Math.max(0, DAILY_LIMIT - getCounter(companyId).count);
}
