import { Router } from "express";
import { eq, and, desc, asc, sql } from "drizzle-orm";
import {
  db,
  paymentsTable,
  changeOrdersTable,
  invoicesTable,
  builderEstimateItemsTable,
  proposalsTable,
  projectsTable,
  expensesTable,
  usersTable,
} from "@workspace/db";
import { requireAuth, requireCompany, requireTenantCtx, requireOwnerOrForeman } from "../lib/auth";
import { asyncHandler } from "../lib/asyncHandler";
import { requirePermission } from "../lib/permissionGate";
import { requireFeature } from "../lib/featureGate";
import { invalidateDashboardMetricsCache } from "../services/dashboardMetrics";
import { allocateInvoiceNumber } from "./invoices";
import { parsePagination } from "../lib/pagination";

import { z } from "zod";

const router = Router();
router.use(requireFeature("FINANCIALS"));

// ── Financial Summary ─────────────────────────────────────────────────────────

router.get("/financials/summary", requireAuth, requireCompany, requireTenantCtx, requirePermission("viewFinancials"), asyncHandler(async (req, res) => {
  const companyId = req.companyId!;

  // Use SQL aggregates — avoids loading all rows into Node memory.
  const [invoiceSums, paymentSum, changeOrderSums, recentPayments] = await Promise.all([
    db
      .select({
        status: invoicesTable.status,
        total: sql<string>`COALESCE(SUM(${invoicesTable.total}::numeric), 0)`,
        count: sql<string>`COUNT(*)`,
      })
      .from(invoicesTable)
      .where(eq(invoicesTable.companyId, companyId))
      .groupBy(invoicesTable.status),
    db
      .select({ total: sql<string>`COALESCE(SUM(${paymentsTable.amount}::numeric), 0)` })
      .from(paymentsTable)
      .where(eq(paymentsTable.companyId, companyId)),
    db
      .select({
        status: changeOrdersTable.status,
        total: sql<string>`COALESCE(SUM(${changeOrdersTable.amount}::numeric), 0)`,
        count: sql<string>`COUNT(*)`,
      })
      .from(changeOrdersTable)
      .where(eq(changeOrdersTable.companyId, companyId))
      .groupBy(changeOrdersTable.status),
    db
      .select()
      .from(paymentsTable)
      .where(eq(paymentsTable.companyId, companyId))
      .orderBy(desc(paymentsTable.paidAt))
      .limit(8),
  ]);

  let outstanding = 0, overdue = 0, collected = 0, totalInvoiced = 0, invoiceCount = 0;
  for (const row of invoiceSums) {
    const t = parseFloat(row.total);
    const c = parseInt(row.count);
    totalInvoiced += t;
    invoiceCount += c;
    if (row.status === "sent") outstanding += t;
    if (row.status === "overdue") { outstanding += t; overdue += t; }
    if (row.status === "paid") collected += t;
  }

  const totalPaymentsReceived = parseFloat(paymentSum[0]?.total ?? "0");

  let pendingChangeOrders = 0, approvedChangeOrdersValue = 0;
  for (const row of changeOrderSums) {
    if (row.status === "pending") pendingChangeOrders = parseInt(row.count);
    if (row.status === "approved") approvedChangeOrdersValue = parseFloat(row.total);
  }

  res.json({
    outstanding: outstanding.toFixed(2),
    overdue: overdue.toFixed(2),
    collected: collected.toFixed(2),
    totalInvoiced: totalInvoiced.toFixed(2),
    totalPaymentsReceived: totalPaymentsReceived.toFixed(2),
    invoiceCount,
    pendingChangeOrders,
    approvedChangeOrdersValue: approvedChangeOrdersValue.toFixed(2),
    recentPayments,
  });
}))

// ── Expenses (company-wide, for the Accounting hub) ───────────────────────────

// GET /financials/expenses — every expense across all projects, with receipt + status,
// for the macro-level accounting/bookkeeping view. Project-level access is not needed
// here since this is explicitly the owner/foreman company-wide financial rollup.
router.get("/financials/expenses", requireAuth, requireCompany, requireTenantCtx, requirePermission("viewFinancials"), asyncHandler(async (req, res) => {
  const { limit, offset } = parsePagination(req.query, 50, 200);

  const rows = await db
    .select({
      expense: expensesTable,
      projectName: projectsTable.name,
      submittedByFirstName: usersTable.firstName,
      submittedByLastName: usersTable.lastName,
    })
    .from(expensesTable)
    .leftJoin(projectsTable, eq(projectsTable.id, expensesTable.projectId))
    .leftJoin(usersTable, eq(usersTable.id, expensesTable.submittedByUserId))
    .where(eq(expensesTable.companyId, req.companyId!))
    .orderBy(desc(expensesTable.createdAt))
    .limit(limit)
    .offset(offset);

  res.json(rows.map((r) => ({
    ...r.expense,
    projectName: r.projectName ?? "Unknown project",
    submittedByName: r.submittedByFirstName && r.submittedByLastName
      ? `${r.submittedByFirstName} ${r.submittedByLastName}`
      : "Unknown",
  })));
}))

// ── Payments ──────────────────────────────────────────────────────────────────

// GET /payments — paginated payments for company (?page=1&limit=50)
router.get("/payments", requireAuth, requireCompany, requireTenantCtx, requirePermission("viewFinancials"), asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));
  const offset = (page - 1) * limit;

  const payments = await db
    .select()
    .from(paymentsTable)
    .where(eq(paymentsTable.companyId, req.companyId!))
    .orderBy(desc(paymentsTable.paidAt))
    .limit(limit)
    .offset(offset);
  res.json(payments);
}))

// GET /invoices/:id/payments — payments + balance for one invoice
router.get("/invoices/:id/payments", requireAuth, requireCompany, requireTenantCtx, requirePermission("viewFinancials"), asyncHandler(async (req, res) => {
  const invoiceId = parseInt(req.params.id as string);
  if (isNaN(invoiceId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [invoice] = await db
    .select({ id: invoicesTable.id, total: invoicesTable.total, status: invoicesTable.status })
    .from(invoicesTable)
    .where(and(eq(invoicesTable.id, invoiceId), eq(invoicesTable.companyId, req.companyId!)));
  if (!invoice) { res.status(404).json({ error: "Invoice not found" }); return; }

  const [payments, sumRow] = await Promise.all([
    db
      .select()
      .from(paymentsTable)
      .where(and(eq(paymentsTable.invoiceId, invoiceId), eq(paymentsTable.companyId, req.companyId!)))
      .orderBy(asc(paymentsTable.paidAt)),
    db
      .select({ totalPaid: sql<string>`COALESCE(SUM(${paymentsTable.amount}::numeric), 0)` })
      .from(paymentsTable)
      .where(and(eq(paymentsTable.invoiceId, invoiceId), eq(paymentsTable.companyId, req.companyId!))),
  ]);

  const totalPaid = parseFloat(sumRow[0]?.totalPaid ?? "0");
  const invoiceTotal = parseFloat(invoice.total ?? "0");
  const balance = Math.max(0, invoiceTotal - totalPaid);

  res.json({
    invoiceId,
    invoiceTotal: invoiceTotal.toFixed(2),
    totalPaid: totalPaid.toFixed(2),
    balance: balance.toFixed(2),
    status: invoice.status,
    payments,
  });
}))

// POST /invoices/:id/payments — record a payment
const RecordPaymentBody = z.object({
  amount: z.coerce.number().positive(),
  method: z.enum(["cash", "cheque", "e-transfer", "credit_card", "other"]).default("other"),
  paidAt: z.string().optional(),
  notes: z.string().optional().nullable(),
});

router.post("/invoices/:id/payments", requireAuth, requireCompany, requireTenantCtx, requirePermission("viewFinancials"), asyncHandler(async (req, res) => {
  const invoiceId = parseInt(req.params.id as string);
  if (isNaN(invoiceId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = RecordPaymentBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

  const [invoice] = await db
    .select()
    .from(invoicesTable)
    .where(and(eq(invoicesTable.id, invoiceId), eq(invoicesTable.companyId, req.companyId!)));
  if (!invoice) { res.status(404).json({ error: "Invoice not found" }); return; }

  const { amount, method, paidAt, notes } = parsed.data;

  const [payment] = await db
    .insert(paymentsTable)
    .values({
      companyId: req.companyId!,
      invoiceId,
      amount: amount.toFixed(2),
      method,
      paidAt: paidAt ? new Date(paidAt) : new Date(),
      notes: notes ?? null,
    })
    .returning();

  // Check if invoice is now fully paid — use a SUM aggregate instead of fetching all rows.
  const [sumRow] = await db
    .select({ totalPaid: sql<string>`COALESCE(SUM(${paymentsTable.amount}::numeric), 0)` })
    .from(paymentsTable)
    .where(and(eq(paymentsTable.invoiceId, invoiceId), eq(paymentsTable.companyId, req.companyId!)));

  const totalPaid = parseFloat(sumRow?.totalPaid ?? "0");
  const invoiceTotal = parseFloat(invoice.total ?? "0");

  if (totalPaid >= invoiceTotal && invoice.status !== "paid") {
    await db
      .update(invoicesTable)
      .set({ status: "paid", paidAt: new Date(), updatedAt: new Date() })
      .where(and(eq(invoicesTable.id, invoiceId), eq(invoicesTable.companyId, req.companyId!)));
  }

  invalidateDashboardMetricsCache(String(req.companyId!));
  res.status(201).json(payment);
}))

// DELETE /payments/:id
router.delete("/payments/:id", requireAuth, requireCompany, requireTenantCtx, requirePermission("viewFinancials"), asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [deleted] = await db
    .delete(paymentsTable)
    .where(and(eq(paymentsTable.id, id), eq(paymentsTable.companyId, req.companyId!)))
    .returning();

  if (!deleted) { res.status(404).json({ error: "Payment not found" }); return; }
  invalidateDashboardMetricsCache(String(req.companyId!));
  res.status(204).send();
}))

// ── Change Orders ─────────────────────────────────────────────────────────────

// GET /change-orders
router.get("/change-orders", requireAuth, requireCompany, requireTenantCtx, requireOwnerOrForeman, asyncHandler(async (req, res) => {
  const { projectId } = req.query;
  const { limit, offset } = parsePagination(req.query, 50, 100);

  const conditions: any[] = [eq(changeOrdersTable.companyId, req.companyId!)];
  if (projectId) {
    const pid = parseInt(projectId as string);
    if (isNaN(pid)) { res.status(400).json({ error: "Invalid projectId" }); return; }
    conditions.push(eq(changeOrdersTable.projectId, pid));
  }

  const orders = await db
    .select()
    .from(changeOrdersTable)
    .where(conditions.length === 1 ? conditions[0] : and(...conditions))
    .orderBy(desc(changeOrdersTable.createdAt))
    .limit(limit)
    .offset(offset);

  res.json(orders);
}))

// GET /change-orders/:id
router.get("/change-orders/:id", requireAuth, requireCompany, requireTenantCtx, requireOwnerOrForeman, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [order] = await db
    .select()
    .from(changeOrdersTable)
    .where(and(eq(changeOrdersTable.id, id), eq(changeOrdersTable.companyId, req.companyId!)));

  if (!order) { res.status(404).json({ error: "Not found" }); return; }
  res.json(order);
}))

// POST /change-orders
const CreateChangeOrderBody = z.object({
  projectId: z.coerce.number().int().positive(),
  title: z.string().min(1),
  description: z.string().optional().nullable(),
  amount: z.coerce.number().min(0),
  notes: z.string().optional().nullable(),
});

router.post("/change-orders", requireAuth, requireCompany, requireTenantCtx, requireOwnerOrForeman, asyncHandler(async (req, res) => {
  const parsed = CreateChangeOrderBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

  const [project] = await db
    .select({ id: projectsTable.id })
    .from(projectsTable)
    .where(and(eq(projectsTable.id, parsed.data.projectId), eq(projectsTable.companyId, req.companyId!)));
  if (!project) { res.status(404).json({ error: "Project not found" }); return; }

  const [order] = await db
    .insert(changeOrdersTable)
    .values({
      companyId: req.companyId!,
      projectId: parsed.data.projectId,
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      amount: parsed.data.amount.toFixed(2),
      notes: parsed.data.notes ?? null,
      status: "pending",
      requestedByUserId: req.userId!,
    })
    .returning();

  invalidateDashboardMetricsCache(String(req.companyId!));
  res.status(201).json(order);
}))

// PATCH /change-orders/:id
const UpdateChangeOrderBody = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  amount: z.coerce.number().min(0).optional(),
  notes: z.string().optional().nullable(),
  clientSignatureData: z.string().optional().nullable(),
  signedAt: z.string().datetime().optional().nullable(),
});

router.patch("/change-orders/:id", requireAuth, requireCompany, requireTenantCtx, requireOwnerOrForeman, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = UpdateChangeOrderBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (parsed.data.title !== undefined) updates.title = parsed.data.title;
  if (parsed.data.description !== undefined) updates.description = parsed.data.description;
  if (parsed.data.amount !== undefined) updates.amount = parsed.data.amount.toFixed(2);
  if (parsed.data.notes !== undefined) updates.notes = parsed.data.notes;
  if (parsed.data.clientSignatureData !== undefined) updates.clientSignatureData = parsed.data.clientSignatureData;
  if (parsed.data.signedAt !== undefined) updates.signedAt = parsed.data.signedAt ? new Date(parsed.data.signedAt) : null;

  const [updated] = await db
    .update(changeOrdersTable)
    .set(updates as any)
    .where(and(eq(changeOrdersTable.id, id), eq(changeOrdersTable.companyId, req.companyId!)))
    .returning();

  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  invalidateDashboardMetricsCache(String(req.companyId!));
  res.json(updated);
}))

// POST /change-orders/:id/approve
router.post("/change-orders/:id/approve", requireAuth, requireCompany, requireTenantCtx, asyncHandler(async (req, res) => {
  if (req.userRole !== "owner" && req.userRole !== "foreman") {
    res.status(403).json({ error: "Owner or foreman required to approve" }); return;
  }

  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [updated] = await db
    .update(changeOrdersTable)
    .set({ status: "approved", approvedByUserId: req.userId!, approvedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(changeOrdersTable.id, id), eq(changeOrdersTable.companyId, req.companyId!)))
    .returning();

  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  invalidateDashboardMetricsCache(String(req.companyId!));
  res.json(updated);
}))

// POST /change-orders/:id/reject
router.post("/change-orders/:id/reject", requireAuth, requireCompany, requireTenantCtx, asyncHandler(async (req, res) => {
  if (req.userRole !== "owner" && req.userRole !== "foreman") {
    res.status(403).json({ error: "Owner or foreman required to reject" }); return;
  }

  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [updated] = await db
    .update(changeOrdersTable)
    .set({ status: "rejected", updatedAt: new Date() })
    .where(and(eq(changeOrdersTable.id, id), eq(changeOrdersTable.companyId, req.companyId!)))
    .returning();

  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  invalidateDashboardMetricsCache(String(req.companyId!));
  res.json(updated);
}))

// POST /change-orders/:id/revert-to-draft
router.post("/change-orders/:id/revert-to-draft", requireAuth, requireCompany, requireTenantCtx, asyncHandler(async (req, res) => {
  if (req.userRole !== "owner" && req.userRole !== "foreman") {
    res.status(403).json({ error: "Owner or foreman required to revert" }); return;
  }

  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [existing] = await db
    .select()
    .from(changeOrdersTable)
    .where(and(eq(changeOrdersTable.id, id), eq(changeOrdersTable.companyId, req.companyId!)))
    .limit(1);
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  if (existing.signedAt) {
    res.status(409).json({ error: "Cannot revert a signed change order to draft" }); return;
  }
  if (existing.status !== "approved" && existing.status !== "rejected") {
    res.status(409).json({ error: "Only approved or rejected change orders can be reverted to draft" }); return;
  }

  const [updated] = await db
    .update(changeOrdersTable)
    .set({ status: "pending", approvedByUserId: null, approvedAt: null, updatedAt: new Date() })
    .where(and(eq(changeOrdersTable.id, id), eq(changeOrdersTable.companyId, req.companyId!)))
    .returning();

  invalidateDashboardMetricsCache(String(req.companyId!));
  res.json(updated);
}))

// GET /projects/:projectId/approved-change-orders — for invoice line-item integration
router.get("/projects/:projectId/approved-change-orders", requireAuth, requireCompany, requireTenantCtx, asyncHandler(async (req, res) => {
  const projectId = parseInt(req.params.projectId as string);
  if (isNaN(projectId)) { res.status(400).json({ error: "Invalid projectId" }); return; }

  const [project] = await db
    .select({ id: projectsTable.id, name: projectsTable.name, address: projectsTable.address })
    .from(projectsTable)
    .where(and(eq(projectsTable.id, projectId), eq(projectsTable.companyId, req.companyId!)))
    .limit(1);
  if (!project) { res.status(404).json({ error: "Project not found" }); return; }

  const orders = await db
    .select()
    .from(changeOrdersTable)
    .where(
      and(
        eq(changeOrdersTable.projectId, projectId),
        eq(changeOrdersTable.companyId, req.companyId!),
        eq(changeOrdersTable.status, "approved"),
      ),
    )
    .orderBy(desc(changeOrdersTable.createdAt));

  res.json({ project, changeOrders: orders });
}))

// DELETE /change-orders/:id
router.delete("/change-orders/:id", requireAuth, requireCompany, requireTenantCtx, requireOwnerOrForeman, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [deleted] = await db
    .delete(changeOrdersTable)
    .where(and(eq(changeOrdersTable.id, id), eq(changeOrdersTable.companyId, req.companyId!)))
    .returning();

  if (!deleted) { res.status(404).json({ error: "Not found" }); return; }
  invalidateDashboardMetricsCache(String(req.companyId!));
  res.status(204).send();
}))

// ── Invoice from Proposal ─────────────────────────────────────────────────────

router.post("/invoices/from-proposal/:proposalId", requireAuth, requireCompany, requireTenantCtx, asyncHandler(async (req, res) => {
  const proposalId = parseInt(req.params.proposalId as string);
  if (isNaN(proposalId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [proposal] = await db
    .select()
    .from(proposalsTable)
    .where(and(eq(proposalsTable.id, proposalId), eq(proposalsTable.companyId, req.companyId!)));
  if (!proposal) { res.status(404).json({ error: "Proposal not found" }); return; }

  const items = await db
    .select()
    .from(builderEstimateItemsTable)
    .where(eq(builderEstimateItemsTable.estimateId, proposal.builderEstimateId))
    .orderBy(asc(builderEstimateItemsTable.sortOrder));

  // Build invoice line items from estimate (use revenue price per unit)
  const lineItems = items.map((item) => {
    const qty = parseFloat(item.quantity ?? "1");
    const unitCost = parseFloat(item.unitCost ?? "0");
    const margin = parseFloat(item.margin ?? "0");
    const revenuePerUnit = unitCost * (1 + margin / 100);
    return {
      description: item.name,
      quantity: qty,
      unitPrice: parseFloat(revenuePerUnit.toFixed(2)),
      total: parseFloat((qty * revenuePerUnit).toFixed(2)),
    };
  });

  const subtotal = lineItems.reduce((s, i) => s + i.total, 0);
  const taxRate = 0.13;
  const taxAmount = Math.round(subtotal * taxRate * 100) / 100;
  const total = Math.round((subtotal + taxAmount) * 100) / 100;

  // Use the same atomic counter allocator as POST /invoices to prevent duplicate numbers
  // under concurrent requests.
  const [invoice] = await db.transaction(async (tx) => {
    const invoiceNumber = await allocateInvoiceNumber(tx, req.companyId!);
    return tx
      .insert(invoicesTable)
      .values({
        companyId: req.companyId!,
        title: proposal.title,
        clientName: proposal.clientName ?? "Client",
        clientEmail: proposal.clientEmail ?? null,
        lineItems: lineItems as any,
        subtotal: subtotal.toFixed(2),
        taxRate: taxRate.toFixed(4),
        taxAmount: taxAmount.toFixed(2),
        total: total.toFixed(2),
        notes: proposal.notes ?? null,
        invoiceNumber,
        status: "draft",
        createdByUserId: req.userId!,
      } as any)
      .returning();
  });

  invalidateDashboardMetricsCache(String(req.companyId!));
  res.status(201).json(invoice);
}))

export default router;
