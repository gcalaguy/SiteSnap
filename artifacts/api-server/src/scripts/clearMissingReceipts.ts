/**
 * One-off cleanup: null out expenses.receiptObjectPath for any receipt
 * whose underlying object storage file no longer exists.
 *
 * Root cause: the weekly orphan-cleanup cron (see cron.ts,
 * collectReferencedObjectPaths) deleted receipt files from object storage
 * because expensesTable.receiptObjectPath was never in its referenced-paths
 * allowlist. That gap is now fixed, but expenses uploaded before the fix
 * point at files that are already gone. This clears the dangling reference
 * so the web/mobile "View receipt" affordance (which only renders when
 * receiptObjectPath is set) stops appearing for receipts that no longer exist.
 *
 * Safe to re-run: only nulls rows whose file is confirmed missing.
 *
 * Usage:
 *   pnpm --filter @workspace/api-server run clear-missing-receipts
 */
import { db, expensesTable } from "@workspace/db";
import { eq, isNotNull } from "drizzle-orm";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage.js";

let checked = 0;
let missing = 0;
let stillPresent = 0;
let errors = 0;

async function main() {
  const objectStorageService = new ObjectStorageService();

  const rows = await db
    .select({ id: expensesTable.id, receiptObjectPath: expensesTable.receiptObjectPath })
    .from(expensesTable)
    .where(isNotNull(expensesTable.receiptObjectPath));

  console.log(`Found ${rows.length} expense(s) with a receipt attached.`);

  for (const row of rows) {
    const objectPath = row.receiptObjectPath;
    if (!objectPath) continue;
    checked++;

    try {
      await objectStorageService.getObjectEntityFile(objectPath);
      stillPresent++;
    } catch (err) {
      if (err instanceof ObjectNotFoundError) {
        await db.update(expensesTable).set({ receiptObjectPath: null }).where(eq(expensesTable.id, row.id));
        missing++;
        console.log(`  cleared: expense #${row.id} (${objectPath}) — file no longer exists`);
      } else {
        errors++;
        console.error(`  error checking expense #${row.id} (${objectPath}):`, err);
      }
    }
  }

  console.log(`\nDone. checked=${checked} cleared=${missing} stillPresent=${stillPresent} errors=${errors}`);
  process.exit(errors > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Cleanup failed:", err);
  process.exit(1);
});
