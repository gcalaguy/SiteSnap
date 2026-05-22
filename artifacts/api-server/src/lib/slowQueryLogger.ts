import { logger } from "./logger.js";

/**
 * Instruments a pg.Pool to emit a warning log whenever a query exceeds the
 * slow-query threshold.
 *
 * Behaviour is NODE_ENV-aware:
 *  - development : threshold defaults to 200 ms so bottlenecks surface early.
 *  - production  : threshold defaults to 500 ms; only genuinely slow queries
 *                  are logged, keeping production logs quiet.
 *
 * Both thresholds can be overridden with the SLOW_QUERY_THRESHOLD_MS env var.
 *
 * The log line includes:
 *   - duration (ms)
 *   - table    — best-effort extraction from the SQL text
 *   - query    — full SQL text in development only (redacted in production to
 *                avoid accidentally leaking sensitive data)
 */

const DEFAULT_THRESHOLD_MS =
  process.env.NODE_ENV === "production" ? 500 : 200;

const SLOW_QUERY_THRESHOLD_MS = process.env.SLOW_QUERY_THRESHOLD_MS
  ? parseInt(process.env.SLOW_QUERY_THRESHOLD_MS, 10)
  : DEFAULT_THRESHOLD_MS;

const IS_DEV = process.env.NODE_ENV !== "production";

/** Minimal shape of a pg.Pool that we need to wrap. */
interface PgPool {
  query: (...args: unknown[]) => Promise<unknown>;
}

/**
 * Extract a best-effort table name from a SQL string.
 * Matches the first occurrence of FROM, INTO, UPDATE, or JOIN followed by
 * an optional schema qualifier and the table name.
 */
function extractTable(sql: string): string {
  const match = sql.match(
    /\b(?:FROM|INTO|UPDATE|JOIN)\s+(?:"?\w+"?\s*\.\s*)?"?(\w+)"?/i,
  );
  return match?.[1] ?? "unknown";
}

/**
 * Monkey-patches pool.query so every executed query is timed.
 * A warn log is emitted for any query that exceeds SLOW_QUERY_THRESHOLD_MS.
 */
export function instrumentPool(pool: PgPool): void {
  const originalQuery = pool.query.bind(pool);

  pool.query = function timedQuery(...args: unknown[]): Promise<unknown> {
    const start = Date.now();
    const queryArg = args[0];
    const sql =
      typeof queryArg === "string"
        ? queryArg
        : queryArg !== null &&
            typeof queryArg === "object" &&
            "text" in queryArg
          ? String((queryArg as { text: unknown }).text)
          : "";

    const promise = originalQuery(...args);

    promise
      .then(() => {
        const duration = Date.now() - start;
        if (duration >= SLOW_QUERY_THRESHOLD_MS) {
          logger.warn(
            {
              duration,
              table: extractTable(sql),
              ...(IS_DEV ? { query: sql } : {}),
            },
            `slow query detected (${duration} ms)`,
          );
        }
      })
      .catch(() => {
        // Query errors are already handled by the caller; don't double-log.
      });

    return promise;
  };

  logger.info(
    {
      thresholdMs: SLOW_QUERY_THRESHOLD_MS,
      env: process.env.NODE_ENV ?? "development",
    },
    "Slow query logger active",
  );
}
