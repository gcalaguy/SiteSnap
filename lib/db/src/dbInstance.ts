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

export const pool: pg.Pool =
  globalThis.__pgPool ??
  (globalThis.__pgPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === "production"
      ? { rejectUnauthorized: true }
      : { rejectUnauthorized: false },
    max: 20,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 2_000,
    options: "-c statement_timeout=30000",
  }));

// Raw Drizzle instance backed directly by the pool.
// Application code should import `db` from the package root (index.ts), which
// re-exports `tenantDb` — a proxy that transparently routes queries through
// the active RLS transaction when inside a withTenantCtx() call.
// This symbol is intentionally NOT re-exported from index.ts to prevent
// accidental bypass of the tenant context.
export const drizzleDb = drizzle(pool, { schema });
