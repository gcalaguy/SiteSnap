/**
 * One-off cleanup: hard-delete the expense rows whose receipt file was
 * destroyed by the pre-fix orphan-cleanup cron (see clearMissingReceipts.ts,
 * which already nulled their receiptObjectPath). These specific expenses
 * were created directly through the Expenses "attach receipt" flow, never
 * synced from the Documents tab, and their OCR-derived vendor/tax/date
 * fields have no surviving source image to back them — so the rows are
 * removed outright rather than partially cleared.
 *
 * Targets an explicit id list (not "any expense missing a receipt") because
 * plenty of legitimate expenses never had a receipt attached in the first
 * place; those must not be touched.
 *
 * Usage:
 *   pnpm --filter @workspace/api-server run delete-orphaned-receipt-expenses
 */
import { db, expensesTable } from "@workspace/db";
import { inArray } from "drizzle-orm";

const TARGET_IDS = [9, 12, 13, 14, 15, 16, 17, 18, 51, 52, 53, 54];

async function main() {
  const rows = await db
    .select()
    .from(expensesTable)
    .where(inArray(expensesTable.id, TARGET_IDS));

  const missingIds = TARGET_IDS.filter((id) => !rows.some((r) => r.id === id));
  if (missingIds.length > 0) {
    console.error(`Refusing to run: expected ${TARGET_IDS.length} rows, missing ids: ${missingIds.join(", ")}`);
    process.exit(1);
  }

  const notCleared = rows.filter((r) => r.receiptObjectPath !== null);
  if (notCleared.length > 0) {
    console.error(
      `Refusing to run: ${notCleared.length} target row(s) still have a non-null receiptObjectPath ` +
        `(ids: ${notCleared.map((r) => r.id).join(", ")}) — re-run clearMissingReceipts.ts first.`,
    );
    process.exit(1);
  }

  console.log(`Deleting ${rows.length} orphaned-receipt expense row(s):`);
  for (const r of rows) {
    console.log(`  #${r.id} — ${r.vendorName ?? "(no vendor)"} — $${r.amount} — ${r.description}`);
  }

  const deleted = await db
    .delete(expensesTable)
    .where(inArray(expensesTable.id, TARGET_IDS))
    .returning({ id: expensesTable.id });

  console.log(`\nDone. Deleted ${deleted.length} row(s).`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Delete failed:", err);
  process.exit(1);
});
