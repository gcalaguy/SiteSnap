import { AsyncLocalStorage } from "node:async_hooks";
import { sql } from "drizzle-orm";
import { pool, drizzleDb } from "./dbInstance";

type Tx = Parameters<Parameters<typeof drizzleDb.transaction>[0]>[0];

// Stores the active tenant transaction for the duration of a withTenantCtx call.
// AsyncLocalStorage propagates context across async boundaries so all code within
// the same async chain (including downstream route handlers) sees the same tx.
const tenantLocal = new AsyncLocalStorage<Tx>();

/**
 * Drizzle proxy: within a withTenantCtx call this dispatches to the active
 * transaction (which has `app.company_id` set via SET LOCAL, activating RLS);
 * outside a tenant context it falls back to the pool-backed drizzleDb —
 * identical behaviour to the raw db for code that doesn't need RLS.
 *
 * This is re-exported as `db` from the package root so all route handlers
 * get RLS enforcement transparently without import changes.
 */
export const tenantDb: typeof drizzleDb = new Proxy(drizzleDb, {
  get(target, prop) {
    const tx = tenantLocal.getStore();
    const src = (tx ?? target) as any;
    const val = src[prop];
    return typeof val === "function" ? val.bind(src) : val;
  },
});

/**
 * Run a callback inside a transaction with `app.company_id` set for the duration.
 * All Drizzle queries executed through `tenantDb` (i.e. `db`) within the callback
 * will be subject to RLS tenant policies.
 */
export async function withTenantCtx<T>(
  companyId: number,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  return drizzleDb.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL app.company_id = ${companyId}`);
    return tenantLocal.run(tx, () => fn(tx));
  });
}

/**
 * Set the tenant context on a raw pool client for the duration of a single query.
 * Useful for raw SQL (pool.query) calls that must respect RLS.
 */
export async function withTenantCtxRaw<T>(
  companyId: number,
  fn: (client: typeof pool extends { connect(): Promise<infer C> } ? C : never) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL app.company_id = $1", [companyId]);
    const result = await fn(client as Parameters<typeof fn>[0]);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
