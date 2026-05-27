import {
  db,
  projectsTable,
  changeOrdersTable,
  invoicesTable,
  paymentsTable,
  quotesTable,
} from "@workspace/db";
import { eq, and, inArray, isNotNull, sql } from "drizzle-orm";
import { logger } from "../lib/logger";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ProjectFinancials {
  approvedChangeOrderTotal: number;
  totalInvoiced: number;
  totalPaid: number;
  openQuotesTotal: number;
  /**
   * Ratio of total paid against the project's estimated budget.
   * `null` when no budget is set for the project.
   */
  burnVelocity: number | null;
}

export interface TenantFinancialSummary {
  projectId: number;
  financials: ProjectFinancials;
}

// ── In-memory TTL cache ───────────────────────────────────────────────────────

interface CacheEntry {
  data: TenantFinancialSummary[];
  expiresAt: number;
}

const _cache = new Map<string, CacheEntry>();
const TTL_MS = 5 * 60 * 1_000; // 5 minutes

function _cacheKey(tenantId: string): string {
  return `dashboard:metrics:tenant_${tenantId}`;
}

/**
 * Mechanical invalidation hook — call whenever a change order, invoice,
 * payment, quote, or project status mutation succeeds for this tenant.
 */
export function invalidateDashboardMetricsCache(tenantId: string): void {
  _cache.delete(_cacheKey(tenantId));
}

// ── Public entry point ────────────────────────────────────────────────────────

export async function getTenantFinancialSummaries(
  tenantId: string,
): Promise<TenantFinancialSummary[]> {
  const key = _cacheKey(tenantId);
  const now = Date.now();
  const hit = _cache.get(key);

  if (hit && hit.expiresAt > now) {
    return hit.data;
  }

  const data = await _computeFinancialSummaries(tenantId);
  _cache.set(key, { data, expiresAt: now + TTL_MS });
  return data;
}

// ── Aggregation logic ─────────────────────────────────────────────────────────

async function _computeFinancialSummaries(
  tenantId: string,
): Promise<TenantFinancialSummary[]> {
  const companyId = parseInt(tenantId, 10);
  if (isNaN(companyId)) return [];

  // Fetch active projects only (completed/cancelled have no operational value here)
  const projects = await db
    .select({ id: projectsTable.id, budget: projectsTable.budget })
    .from(projectsTable)
    .where(
      and(
        eq(projectsTable.companyId, companyId),
        sql`${projectsTable.status} NOT IN ('completed', 'cancelled')`,
      ),
    );

  if (projects.length === 0) return [];

  const projectIds = projects.map((p) => p.id);
  const budgetMap = new Map(
    projects.map((p) => [p.id, p.budget != null ? parseFloat(p.budget) : null]),
  );

  // 1. Approved change orders — summed per project
  const coRows = await db
    .select({
      projectId: changeOrdersTable.projectId,
      total: sql<string>`coalesce(sum(${changeOrdersTable.amount}), 0)`,
    })
    .from(changeOrdersTable)
    .where(
      and(
        eq(changeOrdersTable.companyId, companyId),
        inArray(changeOrdersTable.projectId, projectIds),
        sql`${changeOrdersTable.status} = 'approved'`,
      ),
    )
    .groupBy(changeOrdersTable.projectId);

  const coMap = new Map(coRows.map((r) => [r.projectId, parseFloat(r.total)]));

  // 2. Issued invoices (sent / paid / overdue) — summed per project
  const invRows = await db
    .select({
      projectId: invoicesTable.projectId,
      total: sql<string>`coalesce(sum(${invoicesTable.total}), 0)`,
    })
    .from(invoicesTable)
    .where(
      and(
        eq(invoicesTable.companyId, companyId),
        isNotNull(invoicesTable.projectId),
        inArray(invoicesTable.projectId, projectIds),
        sql`${invoicesTable.status} IN ('sent', 'paid', 'overdue')`,
      ),
    )
    .groupBy(invoicesTable.projectId);

  const invMap = new Map(
    invRows.map((r) => [r.projectId as number, parseFloat(r.total)]),
  );

  // 3. Paid payments — joined through invoices to resolve the per-project total
  const paidRows = await db
    .select({
      projectId: invoicesTable.projectId,
      total: sql<string>`coalesce(sum(${paymentsTable.amount}), 0)`,
    })
    .from(paymentsTable)
    .innerJoin(invoicesTable, eq(paymentsTable.invoiceId, invoicesTable.id))
    .where(
      and(
        eq(paymentsTable.companyId, companyId),
        isNotNull(invoicesTable.projectId),
        inArray(invoicesTable.projectId, projectIds),
      ),
    )
    .groupBy(invoicesTable.projectId);

  const paidMap = new Map(
    paidRows.map((r) => [r.projectId as number, parseFloat(r.total)]),
  );

  // 4. Open quotes (draft / pending_approval / approved) — summed per project
  const quoteRows = await db
    .select({
      projectId: quotesTable.projectId,
      total: sql<string>`coalesce(sum(${quotesTable.total}), 0)`,
    })
    .from(quotesTable)
    .where(
      and(
        eq(quotesTable.companyId, companyId),
        isNotNull(quotesTable.projectId),
        inArray(quotesTable.projectId, projectIds),
        sql`${quotesTable.status} IN ('draft', 'pending_approval', 'approved')`,
      ),
    )
    .groupBy(quotesTable.projectId);

  const quoteMap = new Map(
    quoteRows.map((r) => [r.projectId as number, parseFloat(r.total)]),
  );

  return projectIds.map((pid) => {
    const budget = budgetMap.get(pid) ?? null;
    const totalPaid = paidMap.get(pid) ?? 0;
    const burnVelocity =
      budget != null && budget > 0 ? totalPaid / budget : null;

    return {
      projectId: pid,
      financials: {
        approvedChangeOrderTotal: coMap.get(pid) ?? 0,
        totalInvoiced: invMap.get(pid) ?? 0,
        totalPaid,
        openQuotesTotal: quoteMap.get(pid) ?? 0,
        burnVelocity,
      },
    };
  });
}

logger.debug("dashboardMetrics service loaded");
