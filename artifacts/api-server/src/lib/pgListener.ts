import { pool } from "@workspace/db";
import { logger } from "./logger";
import { invalidateFeatureCache } from "./featureGate";

const CHANNEL = "feature_cache_invalidate";

type PgNotification = { channel: string; payload?: string };
type HeldClient = {
  query: (sql: string, params?: unknown[]) => Promise<unknown>;
  on: (event: string, handler: (...args: unknown[]) => void) => void;
  release: () => void;
};

let listenerClient: HeldClient | null = null;

async function connect(): Promise<void> {
  try {
    const raw = await pool.connect();
    const client = raw as unknown as HeldClient;

    (raw as unknown as { on: (ev: string, fn: (e: unknown) => void) => void }).on("error", (err: unknown) => {
      logger.error({ err }, "pgListener: client error — reconnecting in 5s");
      listenerClient = null;
      setTimeout(() => connect(), 5_000);
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
    logger.info(`pgListener: listening on channel "${CHANNEL}"`);
  } catch (err: unknown) {
    logger.error({ err }, "pgListener: failed to connect — retrying in 5s");
    setTimeout(() => connect(), 5_000);
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
