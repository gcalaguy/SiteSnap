import { Router } from "express";
import { z } from "zod/v4";
import { db, expensesTable, usersTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth, requireCompany } from "../lib/auth";
import { requirePermission } from "../lib/permissionGate";
import { canAccessProject, assertProjectInCompany as verifyProjectAccess } from "../lib/projectAccess";
import { asyncHandler } from "../lib/asyncHandler";

const CreateExpenseBody = z.object({
  amount: z.number().positive(),
  description: z.string().min(1).max(2000),
  receiptObjectPath: z.string().optional(),
});

const router = Router({ mergeParams: true });

// GET /projects/:projectId/expenses — workers see only their own; owner/foreman see all
router.get("/", requireAuth, requireCompany, requirePermission("submitExpenses"), asyncHandler(async (req, res) => {
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
router.post("/", requireAuth, requireCompany, requirePermission("submitExpenses"), asyncHandler(async (req, res) => {
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

  const [expense] = await db
    .insert(expensesTable)
    .values({
      companyId: req.companyId!,
      projectId,
      submittedByUserId: req.userId!,
      amount: parsed.data.amount.toString(),
      description: parsed.data.description,
      receiptObjectPath: parsed.data.receiptObjectPath ?? null,
    })
    .returning();

  res.status(201).json(expense);
}));

// DELETE /projects/:projectId/expenses/:expenseId — submitter can delete their own; owner/foreman can delete any
router.delete("/:expenseId", requireAuth, requireCompany, requirePermission("submitExpenses"), asyncHandler(async (req, res) => {
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
