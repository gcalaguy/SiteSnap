import { eq, and, SQL, inArray } from "drizzle-orm";
import { PgTable, PgColumn } from "drizzle-orm/pg-core";

/**
 * A Drizzle table that participates in multi-tenant isolation via `companyId`.
 * Every production table in this schema must expose this column.
 */
export type TenantTable = PgTable & { companyId: PgColumn };

/**
 * Build a WHERE clause that enforces `companyId` tenant isolation.
 *
 * Combines `eq(table.companyId, companyId)` with any additional conditions
 * using `and()`. Undefined conditions are filtered out automatically by
 * Drizzle, so callers can safely spread optional filters.
 *
 * @example
 * // Simple tenant-scoped select
 * db.select().from(projectsTable).where(findTenantData(projectsTable, req.companyId!));
 *
 * @example
 * // With extra filters
 * db.select().from(projectsTable).where(
 *   findTenantData(projectsTable, req.companyId!, eq(projectsTable.status, "active"))
 * );
 *
 * @example
 * // With optional filter
 * const statusFilter = status ? eq(projectsTable.status, status) : undefined;
 * db.select().from(projectsTable).where(
 *   findTenantData(projectsTable, req.companyId!, statusFilter)
 * );
 */
export function findTenantData<T extends TenantTable>(
  table: T,
  companyId: number,
  ...additionalConditions: (SQL | undefined)[]
): SQL {
  return and(eq(table.companyId, companyId), ...additionalConditions)!;
}

/**
 * Build a tenant-scoped WHERE clause for UPDATE statements.
 * Semantically identical to `findTenantData`; provided as a named alias
 * so call-sites document intent (reads vs writes).
 */
export function updateTenantData<T extends TenantTable>(
  table: T,
  companyId: number,
  ...additionalConditions: (SQL | undefined)[]
): SQL {
  return and(eq(table.companyId, companyId), ...additionalConditions)!;
}

/**
 * Build a tenant-scoped WHERE clause for DELETE statements.
 * Semantically identical to `findTenantData`; provided as a named alias
 * so call-sites document intent.
 */
export function deleteTenantData<T extends TenantTable>(
  table: T,
  companyId: number,
  ...additionalConditions: (SQL | undefined)[]
): SQL {
  return and(eq(table.companyId, companyId), ...additionalConditions)!;
}

/**
 * Build a tenant-scoped batch lookup: `companyId = ? AND column IN (?)`.
 *
 * @example
 * db.select().from(projectsTable).where(
 *   tenantInArray(projectsTable, req.companyId!, projectsTable.id, [1, 2, 3])
 * );
 */
export function tenantInArray<T extends TenantTable, Col extends PgColumn>(
  table: T,
  companyId: number,
  column: Col,
  values: (Col["_"]["dataType"] extends "number" ? number : string)[] | number[] | string[]
): SQL {
  return and(eq(table.companyId, companyId), inArray(column, values as any))!;
}

/**
 * Merge `companyId` into an insert-values object.
 * Useful when the route handler builds the payload and must guarantee
 * the tenant column is set correctly.
 *
 * @example
 * await db.insert(projectsTable).values(
 *   withCompanyId(req.companyId!, { name: "New Site", status: "planning" })
 * );
 */
export function withCompanyId<T extends Record<string, unknown>>(
  companyId: number,
  values: T
): T & { companyId: number } {
  return { ...values, companyId };
}
