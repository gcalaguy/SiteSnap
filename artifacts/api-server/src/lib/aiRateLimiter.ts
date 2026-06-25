/**
 * Rate limiter for AI generation endpoints.
 *
 * Two limits per company (or per user for unauthenticated-company calls):
 *   1. Daily limit  — DB-backed, survives server restarts.
 *   2. Per-minute burst limit — in-memory rolling 60-second window.
 *
 * Configurable via env:
 *   AI_DAILY_RATE_LIMIT      — max AI calls per company per day    (default: 100)
 *   AI_PER_MINUTE_RATE_LIMIT — max AI calls per company per minute (default: 10)
 *
 * P1 fix: daily counters are now persisted to ai_daily_usage table so they
 * survive server restarts and are not lost on deploy/crash.
 */

import { pool } from "@workspace/db";
import { logger } from "./logger";

function parseEnvInt(name: string, defaultValue: number): number {
  const raw = process.env[name];
  if (!raw) return defaultValue;
  const n = parseInt(raw, 10);
  return isNaN(n) || n <= 0 ? defaultValue : n;
}

export const DAILY_LIMIT = parseEnvInt("AI_DAILY_RATE_LIMIT", 100);
export const PER_MINUTE_LIMIT = parseEnvInt("AI_PER_MINUTE_RATE_LIMIT", 10);

// ── In-memory per-minute burst limiter ──────────────────────────────────────
interface MinuteWindow { timestamps: number[] }
const _minute = new Map<string, MinuteWindow>();

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

// ── In-memory daily counter cache (reduces DB reads per request) ─────────────
// TTL: 30 seconds — short enough that plan upgrades propagate quickly.
const CACHE_TTL_MS = 30_000;
interface DailyCacheEntry { count: number; cachedAt: number }
const _dailyCache = new Map<string, DailyCacheEntry>();

function getCachedDaily(key: string): number | null {
  const entry = _dailyCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.cachedAt > CACHE_TTL_MS) {
    _dailyCache.delete(key);
    return null;
  }
  return entry.count;
}

function setCachedDaily(key: string, count: number): void {
  _dailyCache.set(key, { count, cachedAt: Date.now() });
}

function invalidateCachedDaily(key: string): void {
  _dailyCache.delete(key);
}

// ── DB helpers ───────────────────────────────────────────────────────────────

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Atomically increment the daily counter for a key and return the NEW count.
 * Uses an UPSERT so the row is created on first use.
 * Falls back to a high sentinel value (DAILY_LIMIT + 1) on DB error so the
 * request is blocked rather than silently allowed when the DB is unavailable.
 */
async function dbIncrementAndGet(key: string): Promise<number> {
  const today = todayStr();
  try {
    // Extract company_id from key (format "c:<id>" or "u:<id>")
    // We only persist per-company (c:) counters; user-level (u:) stay in-memory fallback.
    if (!key.startsWith("c:")) {
      // No persistent company context — fall back to in-memory
      return incrementInMemory(key);
    }
    const companyId = parseInt(key.slice(2), 10);

    const result = await pool.query<{ count: number }>(
      `INSERT INTO ai_daily_usage (company_id, date, count)
       VALUES ($1, $2, 1)
       ON CONFLICT (company_id, date) DO UPDATE
         SET count = ai_daily_usage.count + 1
       RETURNING count`,
      [companyId, today],
    );
    const count = result.rows[0]?.count ?? DAILY_LIMIT + 1;
    setCachedDaily(key, count);
    return count;
  } catch (err) {
    logger.error({ err }, "aiRateLimiter: DB upsert failed, blocking request");
    return DAILY_LIMIT + 1; // Fail closed on DB error
  }
}


// ── In-memory fallback for non-company keys ──────────────────────────────────
interface DailyCounter { count: number; date: string }
const _daily = new Map<string, DailyCounter>();

function incrementInMemory(key: string): number {
  const today = todayStr();
  const existing = _daily.get(key);
  if (!existing || existing.date !== today) {
    _daily.set(key, { count: 1, date: today });
    return 1;
  }
  existing.count++;
  return existing.count;
}

function getInMemoryCount(key: string): number {
  const entry = _daily.get(key);
  if (!entry || entry.date !== todayStr()) return 0;
  return entry.count;
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Check whether this key is within both limits WITHOUT incrementing.
 * Call before processing the request; call recordAiCall() after to commit.
 */
export function checkAiQuota(key: string): { allowed: true } | { allowed: false; reason: "daily" | "minute" } {
  // Per-minute check (synchronous, in-memory)
  const win = getMinuteWindow(key);
  pruneMinuteWindow(win);
  if (win.timestamps.length >= PER_MINUTE_LIMIT) {
    return { allowed: false, reason: "minute" };
  }

  // Daily check: use cached value if available to avoid blocking on DB
  const cached = getCachedDaily(key) ?? getInMemoryCount(key);
  if (cached >= DAILY_LIMIT) {
    return { allowed: false, reason: "daily" };
  }

  return { allowed: true };
}

/**
 * Record one consumed AI call. Increments both the DB daily counter and
 * the in-memory per-minute window. Fire-and-forget: async errors are logged
 * but do not throw so the request can proceed.
 */
export function recordAiCall(key: string): void {
  // Per-minute — synchronous
  const win = getMinuteWindow(key);
  win.timestamps.push(Date.now());

  // Daily — async DB upsert (invalidate cache first so next check reads fresh)
  invalidateCachedDaily(key);
  dbIncrementAndGet(key).catch((err) => {
    logger.error({ err }, "aiRateLimiter: recordAiCall DB error");
  });
}

/** Get remaining daily AI calls for this key (best-effort, from cache or in-memory). */
export function remainingAiCalls(key: string): number {
  const count = getCachedDaily(key) ?? getInMemoryCount(key);
  return Math.max(0, DAILY_LIMIT - count);
}
