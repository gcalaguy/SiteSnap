import { Router } from "express";
import { db, invoicesTable, quotesTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth, requireCompany } from "../lib/auth";
import { UpdateInvoiceBody } from "@workspace/api-zod";

const router = Router();

// GET /quotes — list all company quotes (flat, with optional status filter)
router.get("/quotes", requireAuth, requireCompany, async (req, res) => {
  const { status } = req.query;
  const where = status
    ? and(
        eq(quotesTable.companyId, req.companyId!),
        eq(quotesTable.status, status as "draft" | "pending_approval" | "approved" | "rejected" | "converted"),
      )
    : eq(quotesTable.companyId, req.companyId!);

  const quotes = await db
    .select()
    .from(quotesTable)
    .where(where)
    .orderBy(desc(quotesTable.createdAt));
  res.json(quotes);
});

// GET /invoices — list all invoices for company
router.get("/invoices", requireAuth, requireCompany, async (req, res) => {
  const { status } = req.query;
  const where = status
    ? and(
        eq(invoicesTable.companyId, req.companyId!),
        eq(invoicesTable.status, status as "draft" | "sent" | "paid" | "overdue" | "cancelled"),
      )
    : eq(invoicesTable.companyId, req.companyId!);

  const invoices = await db
    .select()
    .from(invoicesTable)
    .where(where)
    .orderBy(desc(invoicesTable.createdAt));
  res.json(invoices);
});

// GET /invoices/:invoiceId
router.get("/invoices/:invoiceId", requireAuth, requireCompany, async (req, res) => {
  const invoiceId = parseInt(req.params.invoiceId);
  const [invoice] = await db
    .select()
    .from(invoicesTable)
    .where(and(eq(invoicesTable.id, invoiceId), eq(invoicesTable.companyId, req.companyId!)))
    .limit(1);
  if (!invoice) { res.status(404).json({ error: "Invoice not found" }); return; }
  res.json(invoice);
});

// PUT /invoices/:invoiceId
router.put("/invoices/:invoiceId", requireAuth, requireCompany, async (req, res) => {
  const invoiceId = parseInt(req.params.invoiceId);
  const [existing] = await db
    .select()
    .from(invoicesTable)
    .where(and(eq(invoicesTable.id, invoiceId), eq(invoicesTable.companyId, req.companyId!)))
    .limit(1);
  if (!existing) { res.status(404).json({ error: "Invoice not found" }); return; }
  if (existing.status === "paid" || existing.status === "cancelled") {
    res.status(409).json({ error: "Cannot edit a paid or cancelled invoice" }); return;
  }

  const parsed = UpdateInvoiceBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid body", details: parsed.error }); return; }

  const { title, clientName, clientEmail, lineItems, subtotal, taxRate, taxAmount, total, notes, dueDate } = parsed.data;
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (title !== undefined) updates.title = title;
  if (clientName !== undefined) updates.clientName = clientName;
  if (clientEmail !== undefined) updates.clientEmail = clientEmail ?? null;
  if (notes !== undefined) updates.notes = notes ?? null;
  if (dueDate !== undefined) updates.dueDate = dueDate ?? null;
  if (lineItems !== undefined) updates.lineItems = lineItems;
  if (subtotal !== undefined) updates.subtotal = subtotal?.toFixed(2);
  if (taxRate !== undefined) updates.taxRate = taxRate?.toFixed(4);
  if (taxAmount !== undefined) updates.taxAmount = taxAmount?.toFixed(2);
  if (total !== undefined) updates.total = total?.toFixed(2);

  const [updated] = await db.update(invoicesTable).set(updates).where(eq(invoicesTable.id, invoiceId)).returning();
  res.json(updated);
});

// POST /invoices/:invoiceId/mark-sent
router.post("/invoices/:invoiceId/mark-sent", requireAuth, requireCompany, async (req, res) => {
  const invoiceId = parseInt(req.params.invoiceId);
  const [existing] = await db
    .select()
    .from(invoicesTable)
    .where(and(eq(invoicesTable.id, invoiceId), eq(invoicesTable.companyId, req.companyId!)))
    .limit(1);
  if (!existing) { res.status(404).json({ error: "Invoice not found" }); return; }
  if (existing.status !== "draft") {
    res.status(409).json({ error: "Only draft invoices can be marked as sent" }); return;
  }
  const now = new Date();
  const [updated] = await db.update(invoicesTable)
    .set({ status: "sent", sentAt: now, updatedAt: now })
    .where(eq(invoicesTable.id, invoiceId)).returning();
  res.json(updated);
});

// POST /invoices/:invoiceId/mark-paid
router.post("/invoices/:invoiceId/mark-paid", requireAuth, requireCompany, async (req, res) => {
  const invoiceId = parseInt(req.params.invoiceId);
  const [existing] = await db
    .select()
    .from(invoicesTable)
    .where(and(eq(invoicesTable.id, invoiceId), eq(invoicesTable.companyId, req.companyId!)))
    .limit(1);
  if (!existing) { res.status(404).json({ error: "Invoice not found" }); return; }
  if (existing.status === "paid") { res.json(existing); return; }
  const now = new Date();
  const [updated] = await db.update(invoicesTable)
    .set({ status: "paid", paidAt: now, updatedAt: now })
    .where(eq(invoicesTable.id, invoiceId)).returning();
  res.json(updated);
});

export default router;
