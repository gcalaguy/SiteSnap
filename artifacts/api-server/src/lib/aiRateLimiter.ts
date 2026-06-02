/**
 * In-memory rate limiter for AI generation endpoints.
 *
 * Two limits are enforced per company (or per user for unauthenticated-company calls):
 *   1. Daily limit  — resets at midnight server time.
 *   2. Per-minute burst limit — rolling 60-second window.
 *
 * Both limits are configurable via environment variables:
 *   AI_DAILY_RATE_LIMIT      — max AI calls per company per day    (default: 100)
 *   AI_PER_MINUTE_RATE_LIMIT — max AI calls per company per minute (default: 10)
 *
 * Suitable for pilot phase — a server restart resets counters, which is acceptable
 * for cost control during early testing.
 */

function parseEnvInt(name: string, defaultValue: number): number {
  const raw = process.env[name];
  if (!raw) return defaultValue;
  const n = parseInt(raw, 10);
  return isNaN(n) || n <= 0 ? defaultValue : n;
}

const DAILY_LIMIT = parseEnvInt("AI_DAILY_RATE_LIMIT", 100);
const PER_MINUTE_LIMIT = parseEnvInt("AI_PER_MINUTE_RATE_LIMIT", 10);

interface DailyCounter {
  count: number;
  date: string;
}

interface MinuteWindow {
  timestamps: number[];
}

const _daily = new Map<string, DailyCounter>();
const _minute = new Map<string, MinuteWindow>();

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function getDailyCounter(key: string): DailyCounter {
  const cached = _daily.get(key);
  const today = todayStr();
  if (cached && cached.date === today) return cached;
  const fresh: DailyCounter = { count: 0, date: today };
  _daily.set(key, fresh);
  return fresh;
}

function getMinuteWindow(key: string): MinuteWindow {
  const existing = _minute.get(key);
  if (existing) return existing;
  const fresh: MinuteWindow = { timestamps: [] };
  _minute.set(key, fresh);
  return fresh;
}

function pruneMinuteWindow(win: MinuteWindow): void {
  const cutoff = Date.now() - 60_000;
  win.timestamps = win.timestamps.filter((t) => t >= cutoff);
}

/**
 * Check whether this key (companyId or userId) is within both limits.
 * Returns { allowed: true } or { allowed: false, reason: "daily" | "minute" }.
 */
export function checkAiQuota(key: string): { allowed: true } | { allowed: false; reason: "daily" | "minute" } {
  const win = getMinuteWindow(key);
  pruneMinuteWindow(win);
  if (win.timestamps.length >= PER_MINUTE_LIMIT) {
    return { allowed: false, reason: "minute" };
  }

  const daily = getDailyCounter(key);
  if (daily.count >= DAILY_LIMIT) {
    return { allowed: false, reason: "daily" };
  }

  return { allowed: true };
}

/** Record one consumed AI call for this key. Must be called after checkAiQuota returns allowed. */
export function recordAiCall(key: string): void {
  getDailyCounter(key).count++;
  const win = getMinuteWindow(key);
  win.timestamps.push(Date.now());
}

/** Get remaining daily AI calls for this key (for debugging / response headers). */
export function remainingAiCalls(key: string): number {
  return Math.max(0, DAILY_LIMIT - getDailyCounter(key).count);
}

export { DAILY_LIMIT, PER_MINUTE_LIMIT };
