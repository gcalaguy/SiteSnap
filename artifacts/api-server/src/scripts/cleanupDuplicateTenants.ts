/**
 * One-off cleanup: remove the specific duplicate/orphan companies surfaced by
 * `pnpm --filter @workspace/api-server run identify-duplicate-tenants` on
 * 2026-07-10, so migration 0055 (uniq_owner_membership_per_user) can be applied.
 *
 * Deletes company rows only. Memberships cascade via the company_id FK.
 * All four target companies were verified to have zero projects/invoices/
 * expenses before this script was written — no data migration needed.
 *
 * This script makes writes. Run once; safe to delete after use.
 */
import { db, companiesTable } from "@workspace/db";
import { inArray } from "drizzle-orm";

// #692 "Katano" (Richmond Hill) — stray retry of #691, kept as the original.
// #694 "69 Construction" (2nd)  — stray retry of #690, kept as the original.
// #693, #695 "Pending Setup"    — orphan companies with no memberships.
const STRAY_COMPANY_IDS = [692, 694, 693, 695];

async function main() {
  const deleted = await db
    .delete(companiesTable)
    .where(inArray(companiesTable.id, STRAY_COMPANY_IDS))
    .returning({ id: companiesTable.id, name: companiesTable.name });

  console.log(`Deleted ${deleted.length} companies:`);
  for (const c of deleted) {
    console.log(`  #${c.id}  "${c.name}"`);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error("cleanup-duplicate-tenants failed:", err);
  process.exit(1);
});
