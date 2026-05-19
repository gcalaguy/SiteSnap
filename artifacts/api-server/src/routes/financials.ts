import { Router } from "express";
import { eq, and, desc, asc, inArray, sql, sum } from "drizzle-orm";
import {
  db,
  paymentsTable,
  changeOrdersTable,
  invoicesTable,
  builderEstimatesTable,
  builderEstimateItemsTable,
  proposalsTable,
  projectsTable,
  usersTable,
} from "@workspace/db";
import { requireAuth, requireCompany } from "../lib/auth";
import { requirePermission } from "../lib/permissionGate";
import { requireFeature } from "../lib/featureGate";

import { z } from "zod";

const router = Router();
router.use(requireFeature("Financials"));

// ── Financial Summary ─────────────────────────────────────────────────────────

router.get("/financials/summary", requireAuth, requireCompany, requirePermission("viewFinancials"), async (req, res) => {
  const companyId = req.companyId!;

  const invoices = await db
    .select({ status: invoicesTable.status, total: invoicesTable.total })
    .from(invoicesTable)
    .where(eq(invoicesTable.companyId, companyId));

  let outstanding = 0;
  let overdue = 0;
  let collected = 0;
  let totalInvoiced = 0;

  for (const inv of invoices) {
    const t = parseFloat(inv.total ?? "0");
    totalInvoiced += t;
    if (inv.status === "sent") outstanding += t;
    if (inv.status === "overdue") { outstanding += t; overdue += t; }
    if (inv.status === "paid") collected += t;
  }

  const allPayments = await db
    .select({ amount: paymentsTable.amount })
    .from(paymentsTable)
    .where(eq(paymentsTable.companyId, companyId));

  const totalPaymentsReceived = allPayments.reduce((s, p) => s + parseFloat(p.amount ?? "0"), 0);

  const changeOrders = await db
    .select({ status: changeOrdersTable.status, amount: changeOrdersTable.amount })
    .from(changeOrdersTable)
    .where(eq(changeOrdersTable.companyId, companyId));

  const pendingChangeOrders = changeOrders.filter((c) => c.status === "pending").length;
  const approvedChangeOrdersValue = changeOrders
    .filter((c) => c.status === "approved")
    .reduce((s, c) => s + parseFloat(c.amount ?? "0"), 0);

  const recentPayments = await db
    .select()
    .from(paymentsTable)
    .where(eq(paymentsTable.companyId, companyId))
    .orderBy(desc(paymentsTable.paidAt))
    .limit(8);

  res.json({
    outstanding: outstanding.toFixed(2),
    overdue: overdue.toFixed(2),
    collected: collected.toFixed(2),
    totalInvoiced: totalInvoiced.toFixed(2),
    totalPaymentsReceived: totalPaymentsReceived.toFixed(2),
    invoiceCount: invoices.length,
    pendingChangeOrders,
    approvedChangeOrdersValue: approvedChangeOrdersValue.toFixed(2),
    recentPayments,
  });
});

// ── Payments ──────────────────────────────────────────────────────────────────

// GET /payments — all payments for company
router.get("/payments", requireAuth, requireCompany, requirePermission("viewFinancials"), async (req, res) => {
  const payments = await db
    .select()
    .from(paymentsTable)
    .where(eq(paymentsTable.companyId, req.companyId!))
    .orderBy(desc(paymentsTable.paidAt));
  res.json(payments);
});

// GET /invoices/:id/payments — payments + balance for one invoice
router.get("/invoices/:id/payments", requireAuth, requireCompany, requirePermission("viewFinancials"), async (req, res) => {
  const invoiceId = parseInt(req.params.id as string);
  if (isNaN(invoiceId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [invoice] = await db
    .select({ id: invoicesTable.id, total: invoicesTable.total, status: invoicesTable.status })
    .from(invoicesTable)
    .where(and(eq(invoicesTable.id, invoiceId), eq(invoicesTable.companyId, req.companyId!)));
  if (!invoice) { res.status(404).json({ error: "Invoice not found" }); return; }

  const payments = await db
    .select()
    .from(paymentsTable)
    .where(and(eq(paymentsTable.invoiceId, invoiceId), eq(paymentsTable.companyId, req.companyId!)))
    .orderBy(asc(paymentsTable.paidAt));

  const totalPaid = payments.reduce((s, p) => s + parseFloat(p.amount ?? "0"), 0);
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
});

// POST /invoices/:id/payments — record a payment
const RecordPaymentBody = z.object({
  amount: z.coerce.number().positive(),
  method: z.enum(["cash", "cheque", "e-transfer", "credit_card", "other"]).default("other"),
  paidAt: z.string().optional(),
  notes: z.string().optional().nullable(),
});

router.post("/invoices/:id/payments", requireAuth, requireCompany, requirePermission("viewFinancials"), async (req, res) => {
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

  // Check if invoice is now fully paid
  const allPayments = await db
    .select({ amount: paymentsTable.amount })
    .from(paymentsTable)
    .where(and(eq(paymentsTable.invoiceId, invoiceId), eq(paymentsTable.companyId, req.companyId!)));

  const totalPaid = allPayments.reduce((s, p) => s + parseFloat(p.amount ?? "0"), 0);
  const invoiceTotal = parseFloat(invoice.total ?? "0");

  if (totalPaid >= invoiceTotal && invoice.status !== "paid") {
    await db
      .update(invoicesTable)
      .set({ status: "paid", paidAt: new Date(), updatedAt: new Date() })
      .where(eq(invoicesTable.id, invoiceId));
  }

  res.status(201).json(payment);
});

// DELETE /payments/:id
router.delete("/payments/:id", requireAuth, requireCompany, requirePermission("viewFinancials"), async (req, res) => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [deleted] = await db
    .delete(paymentsTable)
    .where(and(eq(paymentsTable.id, id), eq(paymentsTable.companyId, req.companyId!)))
    .returning();

  if (!deleted) { res.status(404).json({ error: "Payment not found" }); return; }
  res.status(204).send();
});

// ── Change Orders ─────────────────────────────────────────────────────────────

// GET /change-orders
router.get("/change-orders", requireAuth, requireCompany, async (req, res) => {
  const { projectId } = req.query;

  const conditions: any[] = [eq(changeOrdersTable.companyId, req.companyId!)];
  if (projectId) conditions.push(eq(changeOrdersTable.projectId, parseInt(projectId as string)));

  const orders = await db
    .select()
    .from(changeOrdersTable)
    .where(conditions.length === 1 ? conditions[0] : and(...conditions))
    .orderBy(desc(changeOrdersTable.createdAt));

  res.json(orders);
});

// GET /change-orders/:id
router.get("/change-orders/:id", requireAuth, requireCompany, async (req, res) => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [order] = await db
    .select()
    .from(changeOrdersTable)
    .where(and(eq(changeOrdersTable.id, id), eq(changeOrdersTable.companyId, req.companyId!)));

  if (!order) { res.status(404).json({ error: "Not found" }); return; }
  res.json(order);
});

// POST /change-orders
const CreateChangeOrderBody = z.object({
  projectId: z.coerce.number().int().positive(),
  title: z.string().min(1),
  description: z.string().optional().nullable(),
  amount: z.coerce.number().min(0),
  notes: z.string().optional().nullable(),
});

router.post("/change-orders", requireAuth, requireCompany, async (req, res) => {
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

  res.status(201).json(order);
});

// PATCH /change-orders/:id
const UpdateChangeOrderBody = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  amount: z.coerce.number().min(0).optional(),
  notes: z.string().optional().nullable(),
});

router.patch("/change-orders/:id", requireAuth, requireCompany, async (req, res) => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = UpdateChangeOrderBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (parsed.data.title !== undefined) updates.title = parsed.data.title;
  if (parsed.data.description !== undefined) updates.description = parsed.data.description;
  if (parsed.data.amount !== undefined) updates.amount = parsed.data.amount.toFixed(2);
  if (parsed.data.notes !== undefined) updates.notes = parsed.data.notes;

  const [updated] = await db
    .update(changeOrdersTable)
    .set(updates as any)
    .where(and(eq(changeOrdersTable.id, id), eq(changeOrdersTable.companyId, req.companyId!)))
    .returning();

  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  res.json(updated);
});

// POST /change-orders/:id/approve
router.post("/change-orders/:id/approve", requireAuth, requireCompany, async (req, res) => {
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
  res.json(updated);
});

// POST /change-orders/:id/reject
router.post("/change-orders/:id/reject", requireAuth, requireCompany, async (req, res) => {
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
  res.json(updated);
});

// DELETE /change-orders/:id
router.delete("/change-orders/:id", requireAuth, requireCompany, async (req, res) => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [deleted] = await db
    .delete(changeOrdersTable)
    .where(and(eq(changeOrdersTable.id, id), eq(changeOrdersTable.companyId, req.companyId!)))
    .returning();

  if (!deleted) { res.status(404).json({ error: "Not found" }); return; }
  res.status(204).send();
});

// ── Invoice from Proposal ─────────────────────────────────────────────────────

router.post("/invoices/from-proposal/:proposalId", requireAuth, requireCompany, async (req, res) => {
  const proposalId = parseInt(req.params.proposalId as string);
  if (isNaN(proposalId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [proposal] = await db
    .select()
    .from(proposalsTable)
    .where(and(eq(proposalsTable.id, proposalId), eq(proposalsTable.companyId, req.companyId!)));
  if (!proposal) { res.status(404).json({ error: "Proposal not found" }); return; }

  const estimate = await db
    .select()
    .from(builderEstimatesTable)
    .where(eq(builderEstimatesTable.id, proposal.builderEstimateId));

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

  // Get next invoice number
  const { count } = await import("drizzle-orm");
  const [{ cnt }] = await db
    .select({ cnt: count() })
    .from(invoicesTable)
    .where(eq(invoicesTable.companyId, req.companyId!));
  const invoiceNumber = `INV-${String((cnt ?? 0) + 1).padStart(4, "0")}`;

  const [invoice] = await db
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

  res.status(201).json(invoice);
});

export default router;
