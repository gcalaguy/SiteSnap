import { pool } from "@workspace/db";
import { logger } from "./logger";
import { invalidateFeatureCache } from "./featureGate";

const CHANNEL = "feature_cache_invalidate";
const HEARTBEAT_MS = 30_000;
const INITIAL_RETRY_MS = 5_000;
const MAX_RETRY_MS = 60_000;

let retryDelayMs = INITIAL_RETRY_MS;

function backoff(): number {
  const current = retryDelayMs;
  retryDelayMs = Math.min(retryDelayMs * 2, MAX_RETRY_MS);
  return current;
}

function resetBackoff(): void {
  retryDelayMs = INITIAL_RETRY_MS;
}

type PgNotification = { channel: string; payload?: string };
type HeldClient = {
  query: (sql: string, params?: unknown[]) => Promise<unknown>;
  on: (event: string, handler: (...args: unknown[]) => void) => void;
  release: () => void;
};

let listenerClient: HeldClient | null = null;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

function clearTimers(): void {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

async function connect(): Promise<void> {
  try {
    const raw = await pool.connect();
    const client = raw as unknown as HeldClient;

    (raw as unknown as { on: (ev: string, fn: (e: unknown) => void) => void }).on("error", (err: unknown) => {
      logger.warn({ err }, "pgListener: client error — reconnecting");
      listenerClient = null;
      clearTimers();
      reconnectTimer = setTimeout(() => connect(), backoff()).unref() as unknown as ReturnType<typeof setTimeout>;
    });

    (raw as unknown as { on: (ev: string, fn: (msg: PgNotification) => void) => void }).on(
      "notification",
      (msg: PgNotification) => {
        if (msg.channel !== CHANNEL || !msg.payload) return;
        const companyId = parseInt(msg.payload, 10);
        if (!isNaN(companyId) && companyId > 0) {
          invalidateFeatureCache(companyId);
          logger.debug({ companyId }, "pgListener: feature cache invalidated via NOTIFY");
        }
      },
    );

    await client.query(`LISTEN "${CHANNEL}"`);
    listenerClient = client;
    resetBackoff();
    logger.info(`pgListener: listening on channel "${CHANNEL}"`);

    // Heartbeat to prevent idle timeout from cloud providers
    heartbeatTimer = setInterval(() => {
      client.query("SELECT 1").catch((err: unknown) => {
        logger.warn({ err }, "pgListener: heartbeat failed — connection likely dropped");
      });
    }, HEARTBEAT_MS);
  } catch (err: unknown) {
    logger.warn({ err }, "pgListener: failed to connect — retrying");
    clearTimers();
    reconnectTimer = setTimeout(() => connect(), backoff()).unref() as unknown as ReturnType<typeof setTimeout>;
  }
}

/** Release the listener connection and stop reconnecting. Call during graceful shutdown. */
export function stopPgListener(): void {
  clearTimers();
  if (listenerClient) {
    try { listenerClient.release(); } catch { /* ignore */ }
    listenerClient = null;
  }
}

export async function startPgListener(): Promise<void> {
  await connect();
}

/** Broadcast a cache invalidation to all API instances via Postgres NOTIFY. */
export async function notifyFeatureCacheInvalidate(companyId: number): Promise<void> {
  if (!listenerClient) return;
  try {
    await listenerClient.query(`SELECT pg_notify($1, $2)`, [CHANNEL, String(companyId)]);
  } catch (err: unknown) {
    logger.warn({ err, companyId }, "pgListener: failed to send NOTIFY — local invalidation still applied");
  }
}
