import { db, expensesTable, costAnalysesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

// Rolls a submitted expense's amount into the project's current-month cost
// breakdown (costAnalysesTable) under "materials" so project-level financials
// reflect it immediately, without requiring a separate manual cost-analysis entry.
export async function syncExpenseToCostLedger(projectId: number, amount: number) {
  const periodLabel = new Date().toISOString().slice(0, 7); // "YYYY-MM"

  const [existing] = await db
    .select()
    .from(costAnalysesTable)
    .where(and(eq(costAnalysesTable.projectId, projectId), eq(costAnalysesTable.periodLabel, periodLabel)))
    .limit(1);

  if (existing) {
    const materialsCost = parseFloat(existing.materialsCost) + amount;
    const totalCost = materialsCost + parseFloat(existing.labourCost) + parseFloat(existing.equipmentCost) + parseFloat(existing.otherCost);
    await db
      .update(costAnalysesTable)
      .set({ materialsCost: materialsCost.toFixed(2), totalCost: totalCost.toFixed(2) })
      .where(eq(costAnalysesTable.id, existing.id));
  } else {
    await db.insert(costAnalysesTable).values({
      projectId,
      periodLabel,
      labourCost: "0.00",
      materialsCost: amount.toFixed(2),
      equipmentCost: "0.00",
      otherCost: "0.00",
      totalCost: amount.toFixed(2),
      notes: "Auto-generated from submitted expenses",
    });
  }
}

export async function findExpenseByReceiptPath(projectId: number, receiptObjectPath: string) {
  const [existing] = await db
    .select()
    .from(expensesTable)
    .where(and(eq(expensesTable.projectId, projectId), eq(expensesTable.receiptObjectPath, receiptObjectPath)))
    .limit(1);
  return existing ?? null;
}

export type SyncReceiptInput = {
  companyId: number;
  projectId: number;
  submittedByUserId: number;
  amount: number; // grand total, HST included
  tax: number | null;
  vendor: string | null;
  date: string | null; // YYYY-MM-DD
  receiptObjectPath: string;
  filename: string;
};

// Auto-syncs a Documents-tab receipt into Financials > Expenses (and the cost
// ledger), mirroring what happens when a user manually submits an expense.
// Idempotent on receiptObjectPath so re-analysis and backfills can't double-book.
export async function syncReceiptToExpense(input: SyncReceiptInput): Promise<{ created: boolean }> {
  const existing = await findExpenseByReceiptPath(input.projectId, input.receiptObjectPath);
  if (existing) return { created: false };

  const description = input.vendor
    ? `${input.vendor} — receipt scanned in Documents`
    : `Receipt scanned in Documents (${input.filename})`;

  await db.insert(expensesTable).values({
    companyId: input.companyId,
    projectId: input.projectId,
    submittedByUserId: input.submittedByUserId,
    amount: input.amount.toFixed(2),
    description: description.slice(0, 2000),
    receiptObjectPath: input.receiptObjectPath,
    vendorName: input.vendor,
    taxAmount: input.tax != null ? input.tax.toFixed(2) : null,
    expenseDate: input.date,
    status: "submitted",
  });

  await syncExpenseToCostLedger(input.projectId, input.amount);
  return { created: true };
}
