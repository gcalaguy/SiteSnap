import { pool, db } from "./index";

/**
 * Run a callback inside a transaction with `app.company_id` set for the duration.
 * All Drizzle queries executed within the callback will be subject to RLS tenant
 * policies once those are activated (Phase 4).
 *
 * Usage:
 *   const result = await withTenantCtx(req.companyId!, async (tx) => {
 *     return tx.select().from(projectsTable).where(...);
 *   });
 */
export async function withTenantCtx<T>(
  companyId: number,
  fn: (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(`SET LOCAL app.company_id = ${companyId}`);
    return fn(tx);
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
