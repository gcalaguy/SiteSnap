import { Router } from "express";
import {
  db,
  quotesTable,
  invoicesTable,
  projectsTable,
  usersTable,
} from "@workspace/db";
import { eq, and, count, desc, inArray, or } from "drizzle-orm";
import { requireAuth, requireCompany } from "../lib/auth";
import { CreateQuoteBody, UpdateQuoteBody, RejectQuoteBody, ConvertQuoteToInvoiceBody } from "@workspace/api-zod";
import { Resend } from "resend";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

async function notifyQuoteSubmitted(quote: {
  quoteNumber: string;
  title: string;
  clientName: string;
  total: string;
  companyId: number;
}) {
  if (!resend) return;
  try {
    const recipients = await db
      .select({ email: usersTable.email, firstName: usersTable.firstName, role: usersTable.role })
      .from(usersTable)
      .where(
        and(
          eq(usersTable.companyId, quote.companyId),
          inArray(usersTable.role, ["owner", "foreman"]),
        ),
      );

    if (!recipients.length) return;

    const totalFormatted = new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(parseFloat(quote.total));

    await Promise.allSettled(
      recipients.map((r) =>
        resend!.emails.send({
          from: "Site Snap <noreply@sitesnap.ca>",
          to: r.email,
          subject: `New Quote Submitted: ${quote.quoteNumber} — ${quote.clientName}`,
          html: `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
              <div style="background:#FF6600;padding:20px 24px;border-radius:8px 8px 0 0">
                <h1 style="color:#fff;margin:0;font-size:20px">Site Snap</h1>
              </div>
              <div style="padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px">
                <p style="color:#374151;font-size:15px">Hi ${r.firstName},</p>
                <p style="color:#374151">A quote has been submitted for your review:</p>
                <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px">
                  <tr style="border-bottom:1px solid #e5e7eb">
                    <td style="padding:8px 0;color:#6b7280;width:40%">Quote #</td>
                    <td style="padding:8px 0;font-weight:600;color:#111827">${quote.quoteNumber}</td>
                  </tr>
                  <tr style="border-bottom:1px solid #e5e7eb">
                    <td style="padding:8px 0;color:#6b7280">Title</td>
                    <td style="padding:8px 0;font-weight:600;color:#111827">${quote.title}</td>
                  </tr>
                  <tr style="border-bottom:1px solid #e5e7eb">
                    <td style="padding:8px 0;color:#6b7280">Client</td>
                    <td style="padding:8px 0;color:#111827">${quote.clientName}</td>
                  </tr>
                  <tr>
                    <td style="padding:8px 0;color:#6b7280">Total</td>
                    <td style="padding:8px 0;font-weight:700;color:#FF6600;font-size:16px">${totalFormatted}</td>
                  </tr>
                </table>
                <p style="color:#6b7280;font-size:13px">Log in to Site Snap to view and manage this quote.</p>
              </div>
            </div>
          `,
        })
      )
    );
  } catch {
    // Non-fatal
  }
}

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

/** Worker visibility: created by me OR assigned to me */
function workerVisibility(userId: number) {
  return or(eq(quotesTable.createdByUserId, userId), eq(quotesTable.assignedToUserId, userId))!;
}

// GET / — list quotes for a project
router.get("/", requireAuth, requireCompany, async (req, res) => {
  const projectId = parseInt(req.params.projectId);
  const project = await verifyProjectAccess(projectId, req.companyId!);
  if (!project) { res.status(404).json({ error: "Project not found" }); return; }

  const isWorker = req.userRole === "worker";
  const baseCondition = and(eq(quotesTable.projectId, projectId), eq(quotesTable.companyId, req.companyId!))!;
  const where = isWorker ? and(baseCondition, workerVisibility(req.userId!))! : baseCondition;

  const quotes = await db
    .select()
    .from(quotesTable)
    .where(where)
    .orderBy(desc(quotesTable.createdAt));
  res.json(quotes);
});

// POST / — create quote
router.post("/", requireAuth, requireCompany, async (req, res) => {
  const projectId = parseInt(req.params.projectId);

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

// GET /:quoteId
router.get("/:quoteId", requireAuth, requireCompany, async (req, res) => {
  const projectId = parseInt(req.params.projectId);
  const quoteId = parseInt(req.params.quoteId);
  const isWorker = req.userRole === "worker";

  const baseCondition = and(eq(quotesTable.id, quoteId), eq(quotesTable.companyId, req.companyId!))!;
  const where = isWorker ? and(baseCondition, workerVisibility(req.userId!))! : baseCondition;

  const [quote] = await db.select().from(quotesTable).where(where).limit(1);
  if (!quote) { res.status(404).json({ error: "Quote not found" }); return; }
  if (projectId > 0 && quote.projectId !== null && quote.projectId !== projectId) {
    res.status(404).json({ error: "Quote not found" }); return;
  }
  res.json(quote);
});

// PUT /:quoteId
router.put("/:quoteId", requireAuth, requireCompany, async (req, res) => {
  const projectId = parseInt(req.params.projectId);
  const quoteId = parseInt(req.params.quoteId);
  const isWorker = req.userRole === "worker";

  const [existing] = await db.select().from(quotesTable)
    .where(and(eq(quotesTable.id, quoteId), eq(quotesTable.companyId, req.companyId!))).limit(1);
  if (!existing) { res.status(404).json({ error: "Quote not found" }); return; }
  if (projectId > 0 && existing.projectId !== null && existing.projectId !== projectId) {
    res.status(404).json({ error: "Quote not found" }); return;
  }

  // Workers can only edit quotes they created
  if (isWorker && existing.createdByUserId !== req.userId!) {
    res.status(403).json({ error: "You can only edit quotes you created" }); return;
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
  const isWorker = req.userRole === "worker";

  const [existing] = await db.select().from(quotesTable)
    .where(and(eq(quotesTable.id, quoteId), eq(quotesTable.companyId, req.companyId!))).limit(1);
  if (!existing || (projectId > 0 && existing.projectId !== null && existing.projectId !== projectId)) { res.status(404).json({ error: "Quote not found" }); return; }

  // Workers can only delete quotes they created
  if (isWorker && existing.createdByUserId !== req.userId!) {
    res.status(403).json({ error: "You can only delete quotes you created" }); return;
  }

  await db.delete(quotesTable).where(eq(quotesTable.id, quoteId));
  res.status(204).send();
});

// POST /:quoteId/submit
router.post("/:quoteId/submit", requireAuth, requireCompany, async (req, res) => {
  const quoteId = parseInt(req.params.quoteId);
  const isWorker = req.userRole === "worker";

  const baseCondition = and(eq(quotesTable.id, quoteId), eq(quotesTable.companyId, req.companyId!))!;
  const where = isWorker ? and(baseCondition, workerVisibility(req.userId!))! : baseCondition;

  const [existing] = await db.select().from(quotesTable).where(where).limit(1);
  if (!existing) { res.status(404).json({ error: "Quote not found" }); return; }
  if (existing.status !== "draft" && existing.status !== "rejected") {
    res.status(409).json({ error: "Only draft or rejected quotes can be submitted" }); return;
  }
  const [updated] = await db.update(quotesTable)
    .set({ status: "pending_approval", updatedAt: new Date() })
    .where(eq(quotesTable.id, quoteId)).returning();

  notifyQuoteSubmitted({
    quoteNumber: updated.quoteNumber,
    title: updated.title,
    clientName: updated.clientName,
    total: updated.total,
    companyId: updated.companyId,
  });

  res.json(updated);
});

// POST /:quoteId/unsubmit
router.post("/:quoteId/unsubmit", requireAuth, requireCompany, async (req, res) => {
  const quoteId = parseInt(req.params.quoteId);
  const [existing] = await db.select().from(quotesTable)
    .where(and(eq(quotesTable.id, quoteId), eq(quotesTable.companyId, req.companyId!))).limit(1);
  if (!existing) { res.status(404).json({ error: "Quote not found" }); return; }
  if (existing.status !== "pending_approval") {
    res.status(409).json({ error: "Only submitted quotes can be unsubmitted" }); return;
  }
  const [updated] = await db.update(quotesTable)
    .set({ status: "draft", updatedAt: new Date() })
    .where(eq(quotesTable.id, quoteId)).returning();
  res.json(updated);
});

// POST /:quoteId/approve
router.post("/:quoteId/approve", requireAuth, requireCompany, async (req, res) => {
  if (req.userRole === "worker") { res.status(403).json({ error: "Insufficient permissions" }); return; }
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
  if (req.userRole === "worker") { res.status(403).json({ error: "Insufficient permissions" }); return; }
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

// PATCH /:quoteId/assign — owners/foremen assign a quote to a worker
router.patch("/:quoteId/assign", requireAuth, requireCompany, async (req, res) => {
  if (req.userRole === "worker") { res.status(403).json({ error: "Insufficient permissions" }); return; }

  const quoteId = parseInt(req.params.quoteId);
  const { assignedToUserId } = req.body ?? {};

  const [existing] = await db.select().from(quotesTable)
    .where(and(eq(quotesTable.id, quoteId), eq(quotesTable.companyId, req.companyId!))).limit(1);
  if (!existing) { res.status(404).json({ error: "Quote not found" }); return; }

  const [updated] = await db.update(quotesTable)
    .set({ assignedToUserId: assignedToUserId ?? null, updatedAt: new Date() })
    .where(eq(quotesTable.id, quoteId))
    .returning();
  res.json(updated);
});

// POST /:quoteId/convert-to-invoice
router.post("/:quoteId/convert-to-invoice", requireAuth, requireCompany, async (req, res) => {
  if (req.userRole === "worker") { res.status(403).json({ error: "Insufficient permissions" }); return; }

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
