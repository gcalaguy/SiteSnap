/**
 * One-off backfill: sync historical Documents-tab receipts into
 * Financials > Expenses (and the cost ledger).
 *
 * Receipts uploaded before the auto-sync feature existed never got an
 * expense record. This finds every project_documents row already
 * classified as "Receipt" that has no matching expense (by receiptObjectPath)
 * and re-runs analysis on it — re-analysis is required rather than reading
 * the stored extractedData directly, because older receipts predate the HST
 * extraction field and syncReceiptToExpense refuses to sync without HST.
 *
 * Safe to re-run: syncReceiptToExpense is idempotent on receiptObjectPath.
 *
 * Usage:
 *   pnpm --filter @workspace/api-server run backfill-receipt-expenses
 */
import { db, projectDocumentsTable, projectsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { getDocument } from "../repositories/documents.js";
import { runImageAnalysis, runPDFAnalysis, isImage, isPDF } from "../services/documents/analysisService.js";
import { findExpenseByReceiptPath } from "../services/expenseLedger.js";

let synced = 0;
let skippedNoTax = 0;
let skippedAlready = 0;
let skippedUnsupported = 0;

async function main() {
  const allReady = await db
    .select({
      id: projectDocumentsTable.id,
      projectId: projectDocumentsTable.projectId,
      companyId: projectsTable.companyId,
      objectPath: projectDocumentsTable.objectPath,
      fileType: projectDocumentsTable.fileType,
      filename: projectDocumentsTable.filename,
      extractedData: projectDocumentsTable.extractedData,
    })
    .from(projectDocumentsTable)
    .innerJoin(projectsTable, eq(projectsTable.id, projectDocumentsTable.projectId))
    .where(and(eq(projectDocumentsTable.status, "ready")));

  const rows = allReady.filter((row) => {
    const docType = (row.extractedData as Record<string, unknown> | null)?.documentType;
    return typeof docType === "string" && /receipt/i.test(docType);
  });

  console.log(`Found ${rows.length} document(s) classified as Receipt (of ${allReady.length} ready documents).`);

  for (const row of rows) {
    const already = await findExpenseByReceiptPath(row.projectId, row.objectPath);
    if (already) { skippedAlready++; continue; }

    const doc = await getDocument(row.id, row.projectId);
    if (!doc) { skippedUnsupported++; continue; }

    console.log(`Re-analyzing #${row.id} (${row.filename}, project ${row.projectId})...`);
    let result;
    if (isImage(row.fileType)) {
      result = await runImageAnalysis(doc, row.id, row.projectId, row.companyId);
    } else if (isPDF(row.fileType) || row.filename.toLowerCase().endsWith(".pdf")) {
      result = await runPDFAnalysis(doc, row.id, row.projectId, row.companyId);
    } else {
      console.log(`  skip: unsupported file type ${row.fileType}`);
      skippedUnsupported++;
      continue;
    }

    if (!result.ok) {
      console.log(`  analysis failed: ${result.error}`);
      continue;
    }

    const nowSynced = await findExpenseByReceiptPath(row.projectId, row.objectPath);
    if (nowSynced) {
      console.log(`  synced: $${nowSynced.amount} (HST $${nowSynced.taxAmount ?? "0.00"})`);
      synced++;
    } else {
      console.log(`  still no HST detected after re-analysis — left for manual "Re-analyze" in-app.`);
      skippedNoTax++;
    }
  }

  console.log(`\nDone. synced=${synced} skippedNoTax=${skippedNoTax} skippedAlready=${skippedAlready} skippedUnsupported=${skippedUnsupported}`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
