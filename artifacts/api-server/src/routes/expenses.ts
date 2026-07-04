import { Router } from "express";
import { z } from "zod/v4";
import { db, expensesTable, usersTable, costAnalysesTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { openai } from "@workspace/integrations-openai-ai-server";
import { ObjectStorageService } from "../lib/objectStorage.js";
import { requireAuth, requireCompany, requireTenantCtx } from "../lib/auth";
import { requirePermission } from "../lib/permissionGate";
import { requireAiQuota } from "../middlewares/requireAiQuota.js";
import { canAccessProject, assertProjectInCompany as verifyProjectAccess } from "../lib/projectAccess";
import { asyncHandler } from "../lib/asyncHandler";

const objectStorageService = new ObjectStorageService();

const CreateExpenseBody = z.object({
  amount: z.number().positive(),
  description: z.string().min(1).max(2000),
  receiptObjectPath: z.string().optional(),
  vendorName: z.string().max(255).optional(),
  taxAmount: z.number().nonnegative().optional(),
  expenseDate: z.string().optional(),
  viaOcr: z.boolean().optional().default(false),
});

const OcrExpenseBody = z.object({
  objectPath: z.string().min(1),
});

const router = Router({ mergeParams: true });

// Rolls a submitted expense's amount into the project's current-month cost
// breakdown (costAnalysesTable) under "materials" so project-level financials
// reflect it immediately, without requiring a separate manual cost-analysis entry.
async function syncExpenseToCostLedger(projectId: number, amount: number) {
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

// GET /projects/:projectId/expenses — workers see only their own; owner/foreman see all
router.get("/", requireAuth, requireCompany, requireTenantCtx, requirePermission("submitExpenses"), asyncHandler(async (req, res) => {
  const projectId = parseInt(req.params.projectId as string);
  const project = await verifyProjectAccess(projectId, req.companyId!);
  if (!project) { res.status(404).json({ error: "Project not found" }); return; }
  if (!(await canAccessProject(req.companyId!, req.userId!, req.userRole ?? "worker", projectId))) {
    res.status(403).json({ error: "You are not assigned to this project" });
    return;
  }

  const isPrivileged = req.userRole === "owner" || req.userRole === "foreman";
  const conditions = [eq(expensesTable.projectId, projectId)];
  if (!isPrivileged) conditions.push(eq(expensesTable.submittedByUserId, req.userId!));

  const rows = await db
    .select({
      expense: expensesTable,
      submittedByFirstName: usersTable.firstName,
      submittedByLastName: usersTable.lastName,
    })
    .from(expensesTable)
    .leftJoin(usersTable, eq(usersTable.id, expensesTable.submittedByUserId))
    .where(and(...conditions))
    .orderBy(desc(expensesTable.createdAt));

  res.json(rows.map((r) => ({
    ...r.expense,
    submittedByName: r.submittedByFirstName && r.submittedByLastName
      ? `${r.submittedByFirstName} ${r.submittedByLastName}`
      : "Unknown",
  })));
}));

// POST /projects/:projectId/expenses — submit an expense (optionally with a receipt)
router.post("/", requireAuth, requireCompany, requireTenantCtx, requirePermission("submitExpenses"), asyncHandler(async (req, res) => {
  const projectId = parseInt(req.params.projectId as string);
  const project = await verifyProjectAccess(projectId, req.companyId!);
  if (!project) { res.status(404).json({ error: "Project not found" }); return; }
  if (!(await canAccessProject(req.companyId!, req.userId!, req.userRole ?? "worker", projectId))) {
    res.status(403).json({ error: "You are not assigned to this project" });
    return;
  }

  const parsed = CreateExpenseBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body", details: parsed.error });
    return;
  }

  // Expenses submitted from the OCR quick-review flow are marked "processed" since a
  // human already confirmed the extracted values; plain manual entries stay "submitted"
  // (shown to accounting as "Pending Review") until someone reviews them.
  const status = parsed.data.viaOcr ? "processed" : "submitted";

  const [expense] = await db
    .insert(expensesTable)
    .values({
      companyId: req.companyId!,
      projectId,
      submittedByUserId: req.userId!,
      amount: parsed.data.amount.toString(),
      description: parsed.data.description,
      receiptObjectPath: parsed.data.receiptObjectPath ?? null,
      vendorName: parsed.data.vendorName ?? null,
      taxAmount: parsed.data.taxAmount != null ? parsed.data.taxAmount.toString() : null,
      expenseDate: parsed.data.expenseDate ?? null,
      status,
    })
    .returning();

  // Link the cost to the project's financial ledger immediately.
  await syncExpenseToCostLedger(projectId, parsed.data.amount);

  res.status(201).json(expense);
}));

// POST /projects/:projectId/expenses/ocr — scan an already-uploaded receipt image and
// return extracted { vendor, amount, tax, date } for the quick-review confirmation step.
// Does not create an expense — the client still calls POST / to submit after review.
router.post("/ocr", requireAuth, requireCompany, requireTenantCtx, requirePermission("submitExpenses"), requireAiQuota, asyncHandler(async (req, res) => {
  const projectId = parseInt(req.params.projectId as string);
  const project = await verifyProjectAccess(projectId, req.companyId!);
  if (!project) { res.status(404).json({ error: "Project not found" }); return; }
  if (!(await canAccessProject(req.companyId!, req.userId!, req.userRole ?? "worker", projectId))) {
    res.status(403).json({ error: "You are not assigned to this project" });
    return;
  }

  const parsed = OcrExpenseBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body", details: parsed.error });
    return;
  }

  try {
    const objectFile = await objectStorageService.getObjectEntityFile(parsed.data.objectPath);
    const [fileContent] = await objectFile.download();
    const [metadata] = await objectFile.getMetadata();
    const mimeType = (metadata.contentType as string) || "image/jpeg";
    const base64 = fileContent.toString("base64");

    const prompt = `You are an OCR assistant extracting structured data from a receipt photo for a Canadian construction company's expense-tracking system.

Analyze this receipt image and return ONLY a JSON object with this exact shape:
- vendor: string | null (the merchant/store name)
- amount: number | null (the TOTAL amount paid, in dollars, no currency symbol)
- tax: number | null (the tax amount shown on the receipt, in dollars; null if not visible)
- date: string | null (the transaction date, ISO format YYYY-MM-DD)
- confidence: "high" | "medium" | "low"

Respond with ONLY the JSON object. No markdown. No explanation.`;

    const response = await openai.chat.completions.create({
      model: "gpt-5.4",
      max_completion_tokens: 1024,
      messages: [{
        role: "user",
        content: [
          { type: "text", text: prompt },
          { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64}`, detail: "high" } },
        ],
      }],
    });

    const content = response.choices[0]?.message?.content ?? "{}";
    let parsedResult: Record<string, unknown>;
    try { parsedResult = JSON.parse(content); } catch { parsedResult = {}; }

    res.json({
      vendor: typeof parsedResult.vendor === "string" ? parsedResult.vendor : null,
      amount: typeof parsedResult.amount === "number" ? parsedResult.amount : null,
      tax: typeof parsedResult.tax === "number" ? parsedResult.tax : null,
      date: typeof parsedResult.date === "string" ? parsedResult.date : null,
      confidence: typeof parsedResult.confidence === "string" ? parsedResult.confidence : "low",
    });
  } catch (err) {
    req.log.error({ err }, "Receipt OCR failed");
    res.status(500).json({ error: "Failed to scan receipt" });
  }
}));

// DELETE /projects/:projectId/expenses/:expenseId — submitter can delete their own; owner/foreman can delete any
router.delete("/:expenseId", requireAuth, requireCompany, requireTenantCtx, requirePermission("submitExpenses"), asyncHandler(async (req, res) => {
  const projectId = parseInt(req.params.projectId as string);
  const expenseId = parseInt(req.params.expenseId as string);

  const [existing] = await db
    .select()
    .from(expensesTable)
    .where(and(eq(expensesTable.id, expenseId), eq(expensesTable.projectId, projectId), eq(expensesTable.companyId, req.companyId!)))
    .limit(1);
  if (!existing) { res.status(404).json({ error: "Expense not found" }); return; }

  const isPrivileged = req.userRole === "owner" || req.userRole === "foreman";
  if (!isPrivileged && existing.submittedByUserId !== req.userId) {
    res.status(403).json({ error: "Not authorized" });
    return;
  }

  await db.delete(expensesTable).where(eq(expensesTable.id, expenseId));
  res.json({ ok: true });
}));

export default router;
