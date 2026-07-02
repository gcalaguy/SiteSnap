/**
 * Rate limiter for AI generation endpoints.
 *
 * Two limits per company (or per user for unauthenticated-company calls):
 *   1. Daily limit       — DB-backed, survives server restarts.
 *   2. Per-minute burst  — DB-backed (ai_minute_usage table), shared across
 *                          all server instances behind a load balancer.
 *
 * Both limits use a short in-memory cache to reduce DB reads per request.
 *
 * Configurable via env:
 *   AI_DAILY_RATE_LIMIT      — max AI calls per company per day    (default: 100)
 *   AI_PER_MINUTE_RATE_LIMIT — max AI calls per company per minute (default: 10)
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

// ── Shared helpers ───────────────────────────────────────────────────────────

function todayStr(): string {
  return new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD'
}

function currentMinuteStr(): string {
  return new Date().toISOString().slice(0, 16); // 'YYYY-MM-DDTHH:MM'
}

// ── Per-minute cache (reduces DB reads; TTL short so cross-instance drift ───
// stays within ~10 s).
const MINUTE_CACHE_TTL_MS = 10_000;
interface MinuteCacheEntry { count: number; cachedAt: number; minute: string }
const _minuteCache = new Map<string, MinuteCacheEntry>();

function getCachedMinuteCount(key: string): number | null {
  const entry = _minuteCache.get(key);
  if (!entry) return null;
  if (entry.minute !== currentMinuteStr() || Date.now() - entry.cachedAt > MINUTE_CACHE_TTL_MS) {
    _minuteCache.delete(key);
    return null;
  }
  return entry.count;
}

function setCachedMinuteCount(key: string, count: number): void {
  _minuteCache.set(key, { count, cachedAt: Date.now(), minute: currentMinuteStr() });
}

function invalidateCachedMinute(key: string): void {
  _minuteCache.delete(key);
}

// ── Daily cache (30 s TTL — short enough that plan upgrades propagate) ───────
const DAILY_CACHE_TTL_MS = 30_000;
interface DailyCacheEntry { count: number; cachedAt: number }
const _dailyCache = new Map<string, DailyCacheEntry>();

function getCachedDaily(key: string): number | null {
  const entry = _dailyCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.cachedAt > DAILY_CACHE_TTL_MS) {
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

// ── In-memory fallback for non-company (u:) keys ─────────────────────────────
// u: keys are dev/single-instance contexts; no cross-instance concern.
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

interface MinuteWindow { timestamps: number[] }
const _minuteWindows = new Map<string, MinuteWindow>();

function getMinuteWindow(key: string): MinuteWindow {
  const existing = _minuteWindows.get(key);
  if (existing) return existing;
  const fresh: MinuteWindow = { timestamps: [] };
  _minuteWindows.set(key, fresh);
  return fresh;
}

function pruneMinuteWindow(win: MinuteWindow): void {
  const cutoff = Date.now() - 60_000;
  win.timestamps = win.timestamps.filter((t) => t >= cutoff);
}

// ── DB helpers ───────────────────────────────────────────────────────────────

/**
 * Atomically increment and return the NEW daily count for a company key.
 * Falls back to in-memory for u: keys.
 */
async function dbIncrementDailyAndGet(key: string): Promise<number> {
  if (!key.startsWith("c:")) return incrementInMemory(key);
  const companyId = parseInt(key.slice(2), 10);
  const today = todayStr();
  try {
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
    logger.error({ err }, "aiRateLimiter: daily DB upsert failed, blocking request");
    return DAILY_LIMIT + 1; // Fail closed
  }
}

/**
 * Read the current minute count from DB for a company key (used on cache miss
 * in checkAiQuota so the check is cross-instance accurate).
 * Fails open (returns 0) — the daily limit is the safety net if DB is down.
 */
async function dbGetMinuteCount(key: string): Promise<number> {
  if (!key.startsWith("c:")) return 0;
  const companyId = parseInt(key.slice(2), 10);
  const minute = currentMinuteStr();
  try {
    const result = await pool.query<{ count: number }>(
      `SELECT count FROM ai_minute_usage WHERE company_id = $1 AND minute = $2`,
      [companyId, minute],
    );
    return result.rows[0]?.count ?? 0;
  } catch (err) {
    logger.error({ err }, "aiRateLimiter: minute DB read failed, failing open");
    return 0;
  }
}

/**
 * Atomically increment and return the NEW per-minute count.
 * Falls back to in-memory rolling window for u: keys.
 */
async function dbIncrementMinuteAndGet(key: string): Promise<number> {
  if (!key.startsWith("c:")) {
    const win = getMinuteWindow(key);
    pruneMinuteWindow(win);
    win.timestamps.push(Date.now());
    return win.timestamps.length;
  }
  const companyId = parseInt(key.slice(2), 10);
  const minute = currentMinuteStr();
  try {
    const result = await pool.query<{ count: number }>(
      `INSERT INTO ai_minute_usage (company_id, minute, count)
       VALUES ($1, $2, 1)
       ON CONFLICT (company_id, minute) DO UPDATE
         SET count = ai_minute_usage.count + 1
       RETURNING count`,
      [companyId, minute],
    );
    const count = result.rows[0]?.count ?? PER_MINUTE_LIMIT + 1;
    setCachedMinuteCount(key, count);
    return count;
  } catch (err) {
    logger.error({ err }, "aiRateLimiter: minute DB upsert failed, blocking request");
    return PER_MINUTE_LIMIT + 1; // Fail closed
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Check whether this key is within both limits WITHOUT incrementing.
 * Call before processing the request; call recordAiCall() after to commit.
 */
export async function checkAiQuota(key: string): Promise<{ allowed: true } | { allowed: false; reason: "daily" | "minute" }> {
  // Per-minute check — use DB on cache miss for cross-instance accuracy
  let minuteCount: number;
  if (key.startsWith("c:")) {
    const cached = getCachedMinuteCount(key);
    if (cached !== null) {
      minuteCount = cached;
    } else {
      minuteCount = await dbGetMinuteCount(key);
      setCachedMinuteCount(key, minuteCount);
    }
  } else {
    const win = getMinuteWindow(key);
    pruneMinuteWindow(win);
    minuteCount = win.timestamps.length;
  }

  if (minuteCount >= PER_MINUTE_LIMIT) {
    return { allowed: false, reason: "minute" };
  }

  // Daily check — use cache or in-memory fallback
  const dailyCount = getCachedDaily(key) ?? getInMemoryCount(key);
  if (dailyCount >= DAILY_LIMIT) {
    return { allowed: false, reason: "daily" };
  }

  return { allowed: true };
}

/**
 * Record one consumed AI call. Increments both the DB per-minute and daily
 * counters. Awaitable — callers should await so minute counts propagate to
 * the cache before the next request arrives on this instance.
 */
export async function recordAiCall(key: string): Promise<void> {
  invalidateCachedMinute(key);
  invalidateCachedDaily(key);
  await Promise.all([
    dbIncrementMinuteAndGet(key),
    dbIncrementDailyAndGet(key),
  ]);
}

/** Get remaining daily AI calls for this key (best-effort, from cache or in-memory). */
export function remainingAiCalls(key: string): number {
  const count = getCachedDaily(key) ?? getInMemoryCount(key);
  return Math.max(0, DAILY_LIMIT - count);
}
