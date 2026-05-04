import { Router } from "express";
import { db, invoicesTable, quotesTable, companiesTable } from "@workspace/db";
import { eq, and, desc, count, or } from "drizzle-orm";
import { requireAuth, requireCompany } from "../lib/auth";
import { UpdateInvoiceBody } from "@workspace/api-zod";
import { sendEmail, ResendSandboxError } from "../lib/mailer.js";
import { sendReminderForInvoice } from "../lib/invoiceReminders.js";
import { format } from "date-fns";

const router = Router();

async function getNextInvoiceNumber(companyId: number): Promise<string> {
  const [result] = await db.select({ count: count() }).from(invoicesTable).where(eq(invoicesTable.companyId, companyId));
  const num = (result?.count ?? 0) + 1;
  return `INV-${String(num).padStart(4, "0")}`;
}

/** Build a worker visibility condition: created by me OR assigned to me */
function workerVisibilityQuotes(userId: number) {
  return or(eq(quotesTable.createdByUserId, userId), eq(quotesTable.assignedToUserId, userId))!;
}
function workerVisibilityInvoices(userId: number) {
  return or(eq(invoicesTable.createdByUserId, userId), eq(invoicesTable.assignedToUserId, userId))!;
}

// POST /invoices — create a standalone invoice directly
router.post("/invoices", requireAuth, requireCompany, async (req, res) => {
  const { title, clientName, clientEmail, lineItems = [], notes, dueDate } = req.body ?? {};
  if (!title || !clientName) { res.status(400).json({ error: "title and clientName are required" }); return; }

  const taxRate = 0.13;
  const items = Array.isArray(lineItems) ? lineItems : [];
  const subtotal = items.reduce((s: number, i: any) => s + Number(i.quantity ?? 1) * Number(i.unitPrice ?? 0), 0);
  const taxAmount = Math.round(subtotal * taxRate * 100) / 100;
  const total = Math.round((subtotal + taxAmount) * 100) / 100;
  const invoiceNumber = await getNextInvoiceNumber(req.companyId!);

  const [invoice] = await db.insert(invoicesTable).values({
    companyId: req.companyId!,
    quoteId: null,
    invoiceNumber,
    title,
    clientName,
    clientEmail: clientEmail ?? null,
    lineItems: items,
    subtotal: subtotal.toFixed(2),
    taxRate: taxRate.toFixed(4),
    taxAmount: taxAmount.toFixed(2),
    total: total.toFixed(2),
    notes: notes ?? null,
    dueDate: dueDate ?? null,
    status: "draft",
    createdByUserId: req.userId!,
  }).returning();

  res.status(201).json(invoice);
});

// GET /quotes — list all company quotes (flat, with optional status filter)
router.get("/quotes", requireAuth, requireCompany, async (req, res) => {
  const { status } = req.query;
  const isWorker = req.userRole === "worker";

  const companyFilter = eq(quotesTable.companyId, req.companyId!);
  const statusFilter = status
    ? eq(quotesTable.status, status as "draft" | "pending_approval" | "approved" | "rejected" | "converted")
    : undefined;
  const workerFilter = isWorker ? workerVisibilityQuotes(req.userId!) : undefined;

  const conditions = [companyFilter, statusFilter, workerFilter].filter(Boolean);
  const where = conditions.length === 1 ? conditions[0]! : and(...conditions as any);

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
  const isWorker = req.userRole === "worker";

  const companyFilter = eq(invoicesTable.companyId, req.companyId!);
  const statusFilter = status
    ? eq(invoicesTable.status, status as "draft" | "sent" | "paid" | "overdue" | "cancelled")
    : undefined;
  const workerFilter = isWorker ? workerVisibilityInvoices(req.userId!) : undefined;

  const conditions = [companyFilter, statusFilter, workerFilter].filter(Boolean);
  const where = conditions.length === 1 ? conditions[0]! : and(...conditions as any);

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
  const isWorker = req.userRole === "worker";

  const baseCondition = and(eq(invoicesTable.id, invoiceId), eq(invoicesTable.companyId, req.companyId!))!;
  const where = isWorker
    ? and(baseCondition, workerVisibilityInvoices(req.userId!))!
    : baseCondition;

  const [invoice] = await db
    .select()
    .from(invoicesTable)
    .where(where)
    .limit(1);
  if (!invoice) { res.status(404).json({ error: "Invoice not found" }); return; }
  res.json(invoice);
});

// PUT /invoices/:invoiceId
router.put("/invoices/:invoiceId", requireAuth, requireCompany, async (req, res) => {
  const invoiceId = parseInt(req.params.invoiceId);
  const isWorker = req.userRole === "worker";

  const [existing] = await db
    .select()
    .from(invoicesTable)
    .where(and(eq(invoicesTable.id, invoiceId), eq(invoicesTable.companyId, req.companyId!)))
    .limit(1);
  if (!existing) { res.status(404).json({ error: "Invoice not found" }); return; }

  // Workers can only edit invoices they created
  if (isWorker && existing.createdByUserId !== req.userId!) {
    res.status(403).json({ error: "You can only edit invoices you created" }); return;
  }

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

// PATCH /invoices/:invoiceId/assign — owners/foremen assign an invoice to a worker
router.patch("/invoices/:invoiceId/assign", requireAuth, requireCompany, async (req, res) => {
  if (req.userRole === "worker") { res.status(403).json({ error: "Insufficient permissions" }); return; }

  const invoiceId = parseInt(req.params.invoiceId);
  const { assignedToUserId } = req.body ?? {};

  const [existing] = await db
    .select()
    .from(invoicesTable)
    .where(and(eq(invoicesTable.id, invoiceId), eq(invoicesTable.companyId, req.companyId!)))
    .limit(1);
  if (!existing) { res.status(404).json({ error: "Invoice not found" }); return; }

  const [updated] = await db
    .update(invoicesTable)
    .set({ assignedToUserId: assignedToUserId ?? null, updatedAt: new Date() })
    .where(eq(invoicesTable.id, invoiceId))
    .returning();
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

// POST /invoices/:invoiceId/send-email
router.post("/invoices/:invoiceId/send-email", requireAuth, requireCompany, async (req, res) => {
  const invoiceId = parseInt(req.params.invoiceId);
  const { pdfBase64 } = req.body as { pdfBase64?: string };

  if (!pdfBase64) {
    res.status(400).json({ error: "pdfBase64 is required" });
    return;
  }

  const [invoice] = await db
    .select()
    .from(invoicesTable)
    .where(and(eq(invoicesTable.id, invoiceId), eq(invoicesTable.companyId, req.companyId!)))
    .limit(1);
  if (!invoice) { res.status(404).json({ error: "Invoice not found" }); return; }

  if (!invoice.clientEmail) {
    res.status(400).json({ error: "Invoice has no client email address" });
    return;
  }

  const [company] = await db
    .select({ name: companiesTable.name })
    .from(companiesTable)
    .where(eq(companiesTable.id, req.companyId!))
    .limit(1);
  const companyName = company?.name ?? "Site Snap";

  const fmtCAD = (v: string | number) =>
    new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(Number(v));

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#172034;">
      <div style="background:#FF6600;padding:24px 32px;border-radius:8px 8px 0 0;">
        <h1 style="color:#fff;margin:0;font-size:22px;">${companyName}</h1>
        <p style="color:rgba(255,255,255,0.85);margin:4px 0 0;font-size:14px;">Invoice ${invoice.invoiceNumber}</p>
      </div>
      <div style="background:#f9f9f9;padding:32px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;">
        <p style="margin:0 0 16px;">Hi ${invoice.clientName},</p>
        <p style="margin:0 0 16px;">Please find your invoice <strong>${invoice.invoiceNumber}</strong> attached to this email.</p>
        <table style="width:100%;border-collapse:collapse;margin:0 0 24px;">
          <tr>
            <td style="padding:10px 14px;background:#fff;border:1px solid #e5e7eb;border-radius:4px 0 0 4px;color:#6b7280;font-size:13px;">Invoice Number</td>
            <td style="padding:10px 14px;background:#fff;border:1px solid #e5e7eb;border-left:none;font-size:13px;font-weight:600;">${invoice.invoiceNumber}</td>
          </tr>
          <tr>
            <td style="padding:10px 14px;background:#fff;border:1px solid #e5e7eb;border-top:none;color:#6b7280;font-size:13px;">Amount Due</td>
            <td style="padding:10px 14px;background:#fff;border:1px solid #e5e7eb;border-top:none;border-left:none;font-size:13px;font-weight:600;color:#FF6600;">${fmtCAD(invoice.total)} CAD</td>
          </tr>
          ${invoice.dueDate ? `<tr>
            <td style="padding:10px 14px;background:#fff;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 0 4px;color:#6b7280;font-size:13px;">Due Date</td>
            <td style="padding:10px 14px;background:#fff;border:1px solid #e5e7eb;border-top:none;border-left:none;border-radius:0 0 4px 0;font-size:13px;font-weight:600;">${format(new Date(invoice.dueDate), "MMMM d, yyyy")}</td>
          </tr>` : ""}
        </table>
        <p style="margin:0;font-size:13px;color:#6b7280;">If you have any questions about this invoice, please don't hesitate to reach out.</p>
        <p style="margin:16px 0 0;font-size:13px;color:#6b7280;">Thank you for your business.</p>
        <p style="margin:8px 0 0;font-size:13px;font-weight:600;">${companyName}</p>
      </div>
      <p style="text-align:center;font-size:11px;color:#9ca3af;margin:16px 0 0;">Powered by Site Snap</p>
    </div>
  `;

  try {
    await sendEmail({
      to: [invoice.clientEmail],
      subject: `Invoice ${invoice.invoiceNumber} from ${companyName} — ${fmtCAD(invoice.total)} CAD`,
      html,
      attachments: [
        {
          filename: `${invoice.invoiceNumber}.pdf`,
          content: pdfBase64,
        },
      ],
    });
    res.json({ ok: true });
  } catch (err) {
    if (err instanceof ResendSandboxError) {
      res.json({ ok: false, sandboxWarning: err.message });
      return;
    }
    req.log.error({ err }, "Failed to send invoice email");
    res.status(500).json({ error: "Failed to send email" });
  }
});

// POST /invoices/:invoiceId/send-reminder
router.post("/invoices/:invoiceId/send-reminder", requireAuth, requireCompany, async (req, res) => {
  const invoiceId = parseInt(req.params.invoiceId);

  const [invoice] = await db
    .select()
    .from(invoicesTable)
    .where(and(eq(invoicesTable.id, invoiceId), eq(invoicesTable.companyId, req.companyId!)))
    .limit(1);
  if (!invoice) { res.status(404).json({ error: "Invoice not found" }); return; }

  if (!invoice.clientEmail) {
    res.status(400).json({ error: "Invoice has no client email address" });
    return;
  }

  if (invoice.status === "paid" || invoice.status === "cancelled") {
    res.status(409).json({ error: "Reminders cannot be sent for paid or cancelled invoices" });
    return;
  }

  const [company] = await db
    .select({ name: companiesTable.name })
    .from(companiesTable)
    .where(eq(companiesTable.id, req.companyId!))
    .limit(1);
  const companyName = company?.name ?? "Site Snap";

  try {
    const result = await sendReminderForInvoice(invoice, companyName);
    res.json(result);
  } catch (err) {
    if (err instanceof ResendSandboxError) {
      res.json({ ok: false, sandboxWarning: (err as ResendSandboxError).message });
      return;
    }
    req.log.error({ err }, "Failed to send invoice reminder");
    res.status(500).json({ error: "Failed to send reminder" });
  }
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
