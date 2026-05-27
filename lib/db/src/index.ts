import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

declare global {
  // eslint-disable-next-line no-var
  var __pgPool: pg.Pool | undefined;
}

const pool: pg.Pool =
  globalThis.__pgPool ??
  (globalThis.__pgPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === "production"
      ? { rejectUnauthorized: true }
      : { rejectUnauthorized: false },
    max: 20,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 2_000,
  }));

export { pool };
export const db = drizzle(pool, { schema });

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
