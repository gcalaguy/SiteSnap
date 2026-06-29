import { pool } from "./dbInstance";

// Guard against double-registration when the module is hot-reloaded in dev.
if (!(globalThis.__pgPool as any)?.__monitored) {
  // Crash-guard: unhandled pool errors (keepalive drops, SSL renegotiation)
  // otherwise emit an uncaught 'error' event and kill the process.
  pool.on("error", (err) => {
    console.error("[db] pg pool error", err);
  });

  // Log a warning whenever the pool is ≥ 80 % utilised so we can right-size
  // before users start hitting connectionTimeoutMillis errors.
  const POOL_MAX = 20;
  const poolMonitor = setInterval(() => {
    const used = pool.totalCount - pool.idleCount;
    const pct = used / POOL_MAX;
    if (pct >= 0.8) {
      console.warn("[db] pg pool high-watermark", {
        total: pool.totalCount,
        idle: pool.idleCount,
        waiting: pool.waitingCount,
        usedPct: Math.round(pct * 100),
      });
    }
  }, 60_000);
  poolMonitor.unref();

  (pool as any).__monitored = true;
}

export { pool };
// Re-export tenantDb as `db` so all consumers transparently get RLS-aware queries
// when inside a withTenantCtx() request scope; outside one it falls back to the
// raw pool — no behaviour change for code that doesn't use tenant context.
export { tenantDb as db } from "./tenantCtx";

async function shutdown(signal: string): Promise<void> {
  console.info(`[db] Received ${signal}. Draining connection pool…`);
  try {
    await pool.end();
    console.info("[db] Connection pool closed. Exiting.");
  } catch (err) {
    console.error("[db] Error closing connection pool:", err);
  }
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

export * from "./schema";
export * from "./helpers";
export * from "./queryNormalizer";
export * from "./vectorSearch";
export * from "./tenantCtx";
