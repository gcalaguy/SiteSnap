/**
 * Read-only diagnostic: find duplicate tenants (companies) created at enrollment.
 *
 * Root cause (now fixed): POST /companies was not idempotent, so a retried or
 * concurrent request created a second company + owner membership for the same
 * user. This script surfaces the wreckage so it can be merged/removed BEFORE the
 * uniq_owner_membership_per_user index (migration 0055) is applied — that index
 * will refuse to build while duplicate owner memberships still exist.
 *
 * It reports three things, most-actionable first:
 *   1. Users who OWN more than one company (the direct duplicate signal), with
 *      each company's activity counts so you can tell the real one from the stray.
 *   2. Orphan companies with NO memberships (left behind by the old, pre-
 *      transaction failure path) — safe deletion candidates.
 *   3. Companies sharing an identical name (secondary heuristic; may be legit).
 *
 * This script makes NO writes.
 *
 * Usage:
 *   pnpm --filter @workspace/api-server run identify-duplicate-tenants
 */
import {
  db,
  companiesTable,
  usersTable,
  userMembershipsTable,
  projectsTable,
  invoicesTable,
  expensesTable,
} from "@workspace/db";
import { eq, inArray, sql, isNull } from "drizzle-orm";

function fmt(d: Date | string | null): string {
  if (!d) return "—";
  const dt = d instanceof Date ? d : new Date(d);
  return dt.toISOString().replace("T", " ").slice(0, 19);
}

// Returns companyId -> row-count for a table filtered to the given company ids.
async function countByCompany(
  table: typeof projectsTable | typeof invoicesTable | typeof expensesTable,
  companyIds: number[],
): Promise<Map<number, number>> {
  const map = new Map<number, number>();
  if (companyIds.length === 0) return map;
  const rows = await db
    .select({ companyId: (table as any).companyId, n: sql<number>`count(*)::int` })
    .from(table as any)
    .where(inArray((table as any).companyId, companyIds))
    .groupBy((table as any).companyId);
  for (const r of rows as Array<{ companyId: number; n: number }>) {
    map.set(r.companyId, r.n);
  }
  return map;
}

async function main() {
  // ── 1. Users owning more than one company ─────────────────────────────────
  const ownerMemberships = await db
    .select({
      userId: userMembershipsTable.userId,
      companyId: userMembershipsTable.companyId,
      since: userMembershipsTable.createdAt,
    })
    .from(userMembershipsTable)
    .where(eq(userMembershipsTable.role, "owner"));

  const byUser = new Map<number, { companyId: number; since: Date | string }[]>();
  for (const m of ownerMemberships) {
    const list = byUser.get(m.userId) ?? [];
    list.push({ companyId: m.companyId, since: m.since });
    byUser.set(m.userId, list);
  }

  const dupOwners = [...byUser.entries()].filter(([, list]) => list.length > 1);
  const dupCompanyIds = [...new Set(dupOwners.flatMap(([, list]) => list.map((c) => c.companyId)))];

  // Batch-load the details we need to make each duplicate legible.
  const companyRows = dupCompanyIds.length
    ? await db
        .select({
          id: companiesTable.id,
          name: companiesTable.name,
          province: companiesTable.province,
          city: companiesTable.city,
          createdAt: companiesTable.createdAt,
        })
        .from(companiesTable)
        .where(inArray(companiesTable.id, dupCompanyIds))
    : [];
  const companyById = new Map(companyRows.map((c) => [c.id, c]));

  const userIds = dupOwners.map(([userId]) => userId);
  const userRows = userIds.length
    ? await db
        .select({
          id: usersTable.id,
          email: usersTable.email,
          firstName: usersTable.firstName,
          lastName: usersTable.lastName,
        })
        .from(usersTable)
        .where(inArray(usersTable.id, userIds))
    : [];
  const userById = new Map(userRows.map((u) => [u.id, u]));

  const [projCounts, invCounts, expCounts, memberCountsRows] = await Promise.all([
    countByCompany(projectsTable, dupCompanyIds),
    countByCompany(invoicesTable, dupCompanyIds),
    countByCompany(expensesTable, dupCompanyIds),
    dupCompanyIds.length
      ? db
          .select({ companyId: userMembershipsTable.companyId, n: sql<number>`count(*)::int` })
          .from(userMembershipsTable)
          .where(inArray(userMembershipsTable.companyId, dupCompanyIds))
          .groupBy(userMembershipsTable.companyId)
      : Promise.resolve([] as Array<{ companyId: number; n: number }>),
  ]);
  const memberCounts = new Map(memberCountsRows.map((r) => [r.companyId, r.n]));

  console.log("═══════════════════════════════════════════════════════════════");
  console.log(" 1. USERS OWNING MULTIPLE COMPANIES (duplicate tenants)");
  console.log("═══════════════════════════════════════════════════════════════");
  if (dupOwners.length === 0) {
    console.log("  none — no user owns more than one company. ✅");
  } else {
    for (const [userId, list] of dupOwners) {
      const u = userById.get(userId);
      console.log(
        `\n  user #${userId}  ${u ? `${u.firstName} ${u.lastName} <${u.email}>` : "(unknown)"}  — owns ${list.length} companies:`,
      );
      // Oldest first: the oldest is usually the one to KEEP; newer ones are the strays.
      const sorted = list
        .map((c) => ({ ...c, company: companyById.get(c.companyId) }))
        .sort((a, b) => new Date(a.company?.createdAt ?? a.since).getTime() - new Date(b.company?.createdAt ?? b.since).getTime());
      for (const c of sorted) {
        const co = c.company;
        const activity =
          (projCounts.get(c.companyId) ?? 0) +
          (invCounts.get(c.companyId) ?? 0) +
          (expCounts.get(c.companyId) ?? 0);
        console.log(
          `      company #${c.companyId}  "${co?.name ?? "?"}" (${co?.city ?? "?"}, ${co?.province ?? "?"})  created ${fmt(co?.createdAt ?? null)}`,
        );
        console.log(
          `          members=${memberCounts.get(c.companyId) ?? 0}  projects=${projCounts.get(c.companyId) ?? 0}  invoices=${invCounts.get(c.companyId) ?? 0}  expenses=${expCounts.get(c.companyId) ?? 0}  → total activity=${activity}`,
        );
      }
    }
    console.log(
      `\n  ${dupOwners.length} user(s) affected, spanning ${dupCompanyIds.length} companies.`,
    );
    console.log(
      "  Guidance: keep the company with real activity (usually the oldest / highest activity),",
    );
    console.log(
      "  migrate any data off the stray(s), remove the stray owner membership + company, THEN apply migration 0055.",
    );
  }

  // ── 2. Orphan companies (no memberships at all) ────────────────────────────
  const orphans = await db
    .select({
      id: companiesTable.id,
      name: companiesTable.name,
      createdAt: companiesTable.createdAt,
    })
    .from(companiesTable)
    .leftJoin(userMembershipsTable, eq(userMembershipsTable.companyId, companiesTable.id))
    .where(isNull(userMembershipsTable.companyId));

  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log(" 2. ORPHAN COMPANIES (no members — likely failed provisioning)");
  console.log("═══════════════════════════════════════════════════════════════");
  if (orphans.length === 0) {
    console.log("  none. ✅");
  } else {
    for (const o of orphans) {
      console.log(`  company #${o.id}  "${o.name}"  created ${fmt(o.createdAt)}`);
    }
    console.log(`\n  ${orphans.length} orphan company/companies — safe deletion candidates.`);
  }

  // ── 3. Companies with identical names (secondary heuristic) ────────────────
  const nameDupes = await db
    .select({
      name: companiesTable.name,
      n: sql<number>`count(*)::int`,
      ids: sql<string>`string_agg(${companiesTable.id}::text, ', ' order by ${companiesTable.id})`,
    })
    .from(companiesTable)
    .groupBy(companiesTable.name)
    .having(sql`count(*) > 1`);

  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log(" 3. COMPANIES SHARING AN IDENTICAL NAME (may be legitimate)");
  console.log("═══════════════════════════════════════════════════════════════");
  if (nameDupes.length === 0) {
    console.log("  none. ✅");
  } else {
    for (const g of nameDupes) {
      console.log(`  "${g.name}"  ×${g.n}  → company ids: ${g.ids}`);
    }
  }

  console.log("\nDone (read-only; no changes were made).");
  process.exit(0);
}

main().catch((err) => {
  console.error("identify-duplicate-tenants failed:", err);
  process.exit(1);
});
