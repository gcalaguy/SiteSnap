/**
 * Postgres-backed store for express-rate-limit.
 *
 * express-rate-limit's default MemoryStore keeps hit counts in a process-local
 * Map, so behind a load balancer each instance enforces its own independent
 * limit — a client can get N× the configured rate by spreading requests
 * across N instances. This store persists counts in the `rate_limit_hits`
 * table (migration 0052) so every instance shares one counter per key.
 *
 * `increment()` is a single atomic UPSERT: it resets the counter when the
 * previous window has elapsed and increments it otherwise, so concurrent
 * requests across instances never race on read-then-write.
 */

import type { Store, Options, ClientRateLimitInfo, IncrementResponse } from "express-rate-limit";
import { pool } from "@workspace/db";
import { logger } from "./logger";

// Opportunistic cleanup of long-expired rows — avoided on every call to keep
// the hot path to one query; a low-probability sweep is enough since expired
// rows are harmless (they're just overwritten on the next hit for that key).
const CLEANUP_PROBABILITY = 0.01;
const CLEANUP_GRACE_MS = 60 * 60 * 1000; // 1 hour past reset_time

export class PgRateLimitStore implements Store {
  private windowMs = 60_000;
  private readonly keyPrefix: string;

  constructor(keyPrefix: string) {
    this.keyPrefix = keyPrefix;
  }

  init(options: Options): void {
    this.windowMs = options.windowMs;
  }

  private prefixed(key: string): string {
    return `${this.keyPrefix}:${key}`;
  }

  private maybeCleanup(): void {
    if (Math.random() >= CLEANUP_PROBABILITY) return;
    pool
      .query(`DELETE FROM rate_limit_hits WHERE reset_time < now() - $1 * interval '1 millisecond'`, [CLEANUP_GRACE_MS])
      .catch((err) => logger.warn({ err }, "pgRateLimitStore: cleanup sweep failed"));
  }

  async increment(key: string): Promise<IncrementResponse> {
    this.maybeCleanup();
    const fullKey = this.prefixed(key);
    try {
      const { rows } = await pool.query<{ count: number; reset_time: Date }>(
        `INSERT INTO rate_limit_hits (key, count, reset_time)
         VALUES ($1, 1, now() + $2 * interval '1 millisecond')
         ON CONFLICT (key) DO UPDATE SET
           count = CASE WHEN rate_limit_hits.reset_time <= now() THEN 1 ELSE rate_limit_hits.count + 1 END,
           reset_time = CASE WHEN rate_limit_hits.reset_time <= now() THEN now() + $2 * interval '1 millisecond' ELSE rate_limit_hits.reset_time END
         RETURNING count, reset_time`,
        [fullKey, this.windowMs],
      );
      const row = rows[0];
      return { totalHits: row.count, resetTime: row.reset_time };
    } catch (err) {
      // Fail open — a DB hiccup should degrade to "not rate limited" rather
      // than block every request in the app.
      logger.error({ err }, "pgRateLimitStore: increment failed, failing open");
      return { totalHits: 0, resetTime: new Date(Date.now() + this.windowMs) };
    }
  }

  async decrement(key: string): Promise<void> {
    try {
      await pool.query(`UPDATE rate_limit_hits SET count = GREATEST(count - 1, 0) WHERE key = $1`, [this.prefixed(key)]);
    } catch (err) {
      logger.warn({ err }, "pgRateLimitStore: decrement failed");
    }
  }

  async resetKey(key: string): Promise<void> {
    try {
      await pool.query(`DELETE FROM rate_limit_hits WHERE key = $1`, [this.prefixed(key)]);
    } catch (err) {
      logger.warn({ err }, "pgRateLimitStore: resetKey failed");
    }
  }

  async resetAll(): Promise<void> {
    try {
      await pool.query(`DELETE FROM rate_limit_hits WHERE key LIKE $1`, [`${this.keyPrefix}:%`]);
    } catch (err) {
      logger.warn({ err }, "pgRateLimitStore: resetAll failed");
    }
  }

  async get(key: string): Promise<ClientRateLimitInfo | undefined> {
    try {
      const { rows } = await pool.query<{ count: number; reset_time: Date }>(
        `SELECT count, reset_time FROM rate_limit_hits WHERE key = $1 AND reset_time > now()`,
        [this.prefixed(key)],
      );
      const row = rows[0];
      if (!row) return undefined;
      return { totalHits: row.count, resetTime: row.reset_time };
    } catch (err) {
      logger.warn({ err }, "pgRateLimitStore: get failed");
      return undefined;
    }
  }

  // Counts are shared cross-instance via Postgres, not local to this process.
  readonly localKeys = false;
}
