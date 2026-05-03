import { Router } from "express";
import {
  db,
  quotesTable,
  invoicesTable,
  projectsTable,
  usersTable,
} from "@workspace/db";
import { eq, and, count, desc } from "drizzle-orm";
import { requireAuth, requireCompany } from "../lib/auth";
import { CreateQuoteBody, UpdateQuoteBody, RejectQuoteBody, ConvertQuoteToInvoiceBody } from "@workspace/api-zod";

const router = Router({ mergeParams: true });

async function verifyProjectAccess(projectId: number, companyId: number) {
  const [project] = await db
    .select()
    .from(projectsTable)
    .where(and(eq(projectsTable.id, projectId), eq(projectsTable.companyId, companyId)))
    .limit(1);
  return project ?? null;
}

async function getNextQuoteNumber(companyId: number): Promise<string> {
  const [result] = await db
    .select({ count: count() })
    .from(quotesTable)
    .where(eq(quotesTable.companyId, companyId));
  const num = (result?.count ?? 0) + 1;
  return `QUO-${String(num).padStart(4, "0")}`;
}

function calcTotals(lineItems: { quantity: number; unitPrice: number; total?: number }[], taxRate = 0.13) {
  const subtotal = lineItems.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
  const taxAmount = Math.round(subtotal * taxRate * 100) / 100;
  const total = Math.round((subtotal + taxAmount) * 100) / 100;
  return { subtotal: subtotal.toFixed(2), taxAmount: taxAmount.toFixed(2), total: total.toFixed(2) };
}

// GET / — list quotes for a project
router.get("/", requireAuth, requireCompany, async (req, res) => {
  const projectId = parseInt(req.params.projectId);
  const project = await verifyProjectAccess(projectId, req.companyId!);
  if (!project) { res.status(404).json({ error: "Project not found" }); return; }

  const quotes = await db
    .select()
    .from(quotesTable)
    .where(and(eq(quotesTable.projectId, projectId), eq(quotesTable.companyId, req.companyId!)))
    .orderBy(desc(quotesTable.createdAt));
  res.json(quotes);
});

// POST / — create quote (projectId=0 means company-level, not tied to a project)
router.post("/", requireAuth, requireCompany, async (req, res) => {
  const projectId = parseInt(req.params.projectId);

  // Only verify project access when a real projectId is provided
  if (projectId > 0) {
    const project = await verifyProjectAccess(projectId, req.companyId!);
    if (!project) { res.status(404).json({ error: "Project not found" }); return; }
  }

  const parsed = CreateQuoteBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid body", details: parsed.error }); return; }

  const { title, clientName, clientEmail, voiceInput, lineItems = [], notes, validUntil } = parsed.data;
  const quoteNumber = await getNextQuoteNumber(req.companyId!);
  const taxRate = 0.13;
  const { subtotal, taxAmount, total } = calcTotals(lineItems as { quantity: number; unitPrice: number }[], taxRate);

  const [quote] = await db.insert(quotesTable).values({
    companyId: req.companyId!,
    projectId: projectId > 0 ? projectId : null,
    quoteNumber,
    title,
    clientName,
    clientEmail: clientEmail ?? null,
    voiceInput: voiceInput ?? null,
    lineItems: (lineItems as { description: string; quantity: number; unit: string; unitPrice: number; total: number }[]),
    subtotal,
    taxRate: taxRate.toFixed(4),
    taxAmount,
    total,
    notes: notes ?? null,
    validUntil: validUntil ?? null,
    createdByUserId: req.userId!,
    status: "draft",
  }).returning();

  res.status(201).json(quote);
});

// GET /:quoteId — projectId=0 means fetch from any project (company-level access)
router.get("/:quoteId", requireAuth, requireCompany, async (req, res) => {
  const projectId = parseInt(req.params.projectId);
  const quoteId = parseInt(req.params.quoteId);

  const [quote] = await db
    .select()
    .from(quotesTable)
    .where(and(eq(quotesTable.id, quoteId), eq(quotesTable.companyId, req.companyId!)))
    .limit(1);
  if (!quote) { res.status(404).json({ error: "Quote not found" }); return; }
  // Only enforce projectId match when caller passes a valid (> 0) projectId
  if (projectId > 0 && quote.projectId !== null && quote.projectId !== projectId) {
    res.status(404).json({ error: "Quote not found" }); return;
  }
  res.json(quote);
});

// PUT /:quoteId — projectId=0 means company-level (skip project ownership check)
router.put("/:quoteId", requireAuth, requireCompany, async (req, res) => {
  const projectId = parseInt(req.params.projectId);
  const quoteId = parseInt(req.params.quoteId);

  const [existing] = await db.select().from(quotesTable)
    .where(and(eq(quotesTable.id, quoteId), eq(quotesTable.companyId, req.companyId!))).limit(1);
  if (!existing) { res.status(404).json({ error: "Quote not found" }); return; }
  // Only enforce projectId match when a real (> 0) projectId is provided
  if (projectId > 0 && existing.projectId !== null && existing.projectId !== projectId) {
    res.status(404).json({ error: "Quote not found" }); return;
  }
  if (existing.status !== "draft" && existing.status !== "rejected") {
    res.status(409).json({ error: "Only draft or rejected quotes can be edited" }); return;
  }

  const parsed = UpdateQuoteBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid body", details: parsed.error }); return; }

  const { title, clientName, clientEmail, voiceInput, lineItems, notes, validUntil } = parsed.data;
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (title !== undefined) updates.title = title;
  if (clientName !== undefined) updates.clientName = clientName;
  if (clientEmail !== undefined) updates.clientEmail = clientEmail ?? null;
  if (voiceInput !== undefined) updates.voiceInput = voiceInput ?? null;
  if (notes !== undefined) updates.notes = notes ?? null;
  if (validUntil !== undefined) updates.validUntil = validUntil ?? null;
  if (lineItems !== undefined) {
    const items = lineItems as { description: string; quantity: number; unit: string; unitPrice: number; total: number }[];
    const { subtotal, taxAmount, total } = calcTotals(items, parseFloat(existing.taxRate));
    updates.lineItems = items;
    updates.subtotal = subtotal;
    updates.taxAmount = taxAmount;
    updates.total = total;
  }

  const [updated] = await db.update(quotesTable).set(updates).where(eq(quotesTable.id, quoteId)).returning();
  res.json(updated);
});

// DELETE /:quoteId
router.delete("/:quoteId", requireAuth, requireCompany, async (req, res) => {
  const projectId = parseInt(req.params.projectId);
  const quoteId = parseInt(req.params.quoteId);

  const [existing] = await db.select().from(quotesTable)
    .where(and(eq(quotesTable.id, quoteId), eq(quotesTable.companyId, req.companyId!))).limit(1);
  if (!existing || existing.projectId !== projectId) { res.status(404).json({ error: "Quote not found" }); return; }

  await db.delete(quotesTable).where(eq(quotesTable.id, quoteId));
  res.status(204).send();
});

// POST /:quoteId/submit
router.post("/:quoteId/submit", requireAuth, requireCompany, async (req, res) => {
  const quoteId = parseInt(req.params.quoteId);
  const [existing] = await db.select().from(quotesTable)
    .where(and(eq(quotesTable.id, quoteId), eq(quotesTable.companyId, req.companyId!))).limit(1);
  if (!existing) { res.status(404).json({ error: "Quote not found" }); return; }
  if (existing.status !== "draft" && existing.status !== "rejected") {
    res.status(409).json({ error: "Only draft or rejected quotes can be submitted" }); return;
  }
  const [updated] = await db.update(quotesTable)
    .set({ status: "pending_approval", updatedAt: new Date() })
    .where(eq(quotesTable.id, quoteId)).returning();
  res.json(updated);
});

// POST /:quoteId/approve
router.post("/:quoteId/approve", requireAuth, requireCompany, async (req, res) => {
  const quoteId = parseInt(req.params.quoteId);
  const [existing] = await db.select().from(quotesTable)
    .where(and(eq(quotesTable.id, quoteId), eq(quotesTable.companyId, req.companyId!))).limit(1);
  if (!existing) { res.status(404).json({ error: "Quote not found" }); return; }
  if (existing.status !== "pending_approval") {
    res.status(409).json({ error: "Only pending quotes can be approved" }); return;
  }
  const now = new Date();
  const [updated] = await db.update(quotesTable)
    .set({ status: "approved", approvedByUserId: req.userId!, approvedAt: now, updatedAt: now })
    .where(eq(quotesTable.id, quoteId)).returning();
  res.json(updated);
});

// POST /:quoteId/reject
router.post("/:quoteId/reject", requireAuth, requireCompany, async (req, res) => {
  const quoteId = parseInt(req.params.quoteId);
  const [existing] = await db.select().from(quotesTable)
    .where(and(eq(quotesTable.id, quoteId), eq(quotesTable.companyId, req.companyId!))).limit(1);
  if (!existing) { res.status(404).json({ error: "Quote not found" }); return; }
  if (existing.status !== "pending_approval") {
    res.status(409).json({ error: "Only pending quotes can be rejected" }); return;
  }
  const parsed = RejectQuoteBody.safeParse(req.body);
  const notes = parsed.success ? (parsed.data.reason ?? null) : null;
  const [updated] = await db.update(quotesTable)
    .set({ status: "rejected", notes: notes ?? existing.notes, updatedAt: new Date() })
    .where(eq(quotesTable.id, quoteId)).returning();
  res.json(updated);
});

// POST /:quoteId/convert-to-invoice
router.post("/:quoteId/convert-to-invoice", requireAuth, requireCompany, async (req, res) => {
  const quoteId = parseInt(req.params.quoteId);
  const [quote] = await db.select().from(quotesTable)
    .where(and(eq(quotesTable.id, quoteId), eq(quotesTable.companyId, req.companyId!))).limit(1);
  if (!quote) { res.status(404).json({ error: "Quote not found" }); return; }
  if (quote.status !== "approved") {
    res.status(409).json({ error: "Only approved quotes can be converted to invoices" }); return;
  }

  const parsed = ConvertQuoteToInvoiceBody.safeParse(req.body);
  const dueDate = parsed.success ? (parsed.data.dueDate ?? null) : null;

  const invoiceCount = await db.select({ count: count() }).from(invoicesTable)
    .where(eq(invoicesTable.companyId, req.companyId!));
  const invoiceNum = (invoiceCount[0]?.count ?? 0) + 1;
  const invoiceNumber = `INV-${String(invoiceNum).padStart(4, "0")}`;

  const now = new Date();
  const [invoice] = await db.insert(invoicesTable).values({
    companyId: req.companyId!,
    projectId: quote.projectId ?? null,
    quoteId: quote.id,
    invoiceNumber,
    title: quote.title,
    clientName: quote.clientName,
    clientEmail: quote.clientEmail ?? null,
    status: "draft",
    lineItems: quote.lineItems as { description: string; quantity: number; unit: string; unitPrice: number; total: number }[],
    subtotal: quote.subtotal,
    taxRate: quote.taxRate,
    taxAmount: quote.taxAmount,
    total: quote.total,
    notes: quote.notes ?? null,
    dueDate: dueDate ?? null,
    createdByUserId: req.userId!,
  }).returning();

  await db.update(quotesTable)
    .set({ status: "converted", convertedAt: now, updatedAt: now })
    .where(eq(quotesTable.id, quoteId));

  res.status(201).json(invoice);
});

export default router;
