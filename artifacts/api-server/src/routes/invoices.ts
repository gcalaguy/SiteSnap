import { Router } from "express";
import { randomUUID } from "node:crypto";
import { db, invoicesTable, quotesTable, companiesTable } from "@workspace/db";
import { eq, and, desc, sql, or } from "drizzle-orm";
import { requireAuth, requireCompany, requireTenantCtx } from "../lib/auth";
import { asyncHandler } from "../lib/asyncHandler";
import { requirePermission } from "../lib/permissionGate";
import { sendEmail, ResendSandboxError } from "../lib/mailer.js";
import { sendReminderForInvoice } from "../lib/invoiceReminders.js";
import { logAuditEventFromRequest } from "../utils/logger";
import { invalidateDashboardMetricsCache } from "../services/dashboardMetrics";
import { buildInvoicePdfBuffer } from "../lib/invoicePdf.js";
import { parsePagination } from "../lib/pagination";
import { format, parseISO } from "date-fns";
import { z } from "zod";

const InvoiceLineItemSchema = z.object({
  description: z.string().max(500),
  quantity: z.number(),
  unit: z.string().max(20),
  unitPrice: z.number(),
  total: z.number(),
});

const CreateInvoiceBody = z.object({
  title: z.string().min(1).max(300),
  clientName: z.string().min(1).max(300),
  clientEmail: z.string().max(300).nullish(),
  lineItems: z.array(InvoiceLineItemSchema).max(100).optional(),
  notes: z.string().max(5000).nullish(),
  dueDate: z.string().max(20).nullish(),
});

const UpdateInvoiceBodyValidated = z.object({
  title: z.string().min(1).max(300).optional(),
  clientName: z.string().min(1).max(300).optional(),
  clientEmail: z.string().max(300).nullish(),
  lineItems: z.array(InvoiceLineItemSchema).max(100).optional(),
  subtotal: z.number().optional(),
  taxRate: z.number().optional(),
  taxAmount: z.number().optional(),
  total: z.number().optional(),
  notes: z.string().max(5000).nullish(),
  dueDate: z.coerce.date().nullish(),
});

const SendInvoiceEmailBody = z.object({
  // pdfBase64 accepted for backward-compat but ignored — PDF is generated server-side.
  // Capped at 1 byte to reject large uploads rather than silently discarding them.
  pdfBase64: z.string().max(1).optional(),
});

const router = Router();
router.use(requireAuth, requireCompany, requireTenantCtx);

/** Atomically increment the company's invoice counter and return the formatted number.
 *  Must be called inside a db.transaction() so the counter increment and the
 *  invoice insert are a single atomic unit — eliminates the SELECT count() race. */
export async function allocateInvoiceNumber(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  companyId: number,
): Promise<string> {
  const [company] = await tx
    .update(companiesTable)
    .set({ invoiceCounter: sql`invoice_counter + 1` })
    .where(eq(companiesTable.id, companyId))
    .returning({
      counter: companiesTable.invoiceCounter,
      prefix: companiesTable.invoiceNumberPrefix,
      start: companiesTable.invoiceStartNumber,
    });
  if (!company) throw new Error(`Company ${companyId} not found — cannot allocate invoice number`);
  const num = company.counter + ((company.start ?? 1) - 1);
  return `${company.prefix ?? "INV"}-${String(num).padStart(4, "0")}`;
}

/** Build a worker visibility condition: created by me OR assigned to me */
function workerVisibilityQuotes(userId: number) {
  return or(eq(quotesTable.createdByUserId, userId), eq(quotesTable.assignedToUserId, userId))!;
}
function workerVisibilityInvoices(userId: number) {
  return or(eq(invoicesTable.createdByUserId, userId), eq(invoicesTable.assignedToUserId, userId))!;
}

// POST /invoices — create a standalone invoice directly
router.post("/invoices", requirePermission("manageFinancials"), asyncHandler(async (req, res) => {
  const parsed = CreateInvoiceBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Malformed request payload", details: parsed.error.issues }); return; }

  const { title, clientName, clientEmail, lineItems = [], notes, dueDate } = parsed.data;

  const taxRate = 0.13;
  const items = lineItems;
  const subtotal = items.reduce((s, i) => s + Number(i.quantity ?? 1) * Number(i.unitPrice ?? 0), 0);
  const taxAmount = Math.round(subtotal * taxRate * 100) / 100;
  const total = Math.round((subtotal + taxAmount) * 100) / 100;

  const [invoice] = await db.transaction(async (tx) => {
    const invoiceNumber = await allocateInvoiceNumber(tx, req.companyId!);
    return tx.insert(invoicesTable).values({
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
      publicToken: randomUUID(),
    }).returning();
  });

  logAuditEventFromRequest(req, "Invoice Created", `Created invoice "${invoice.title}" (${invoice.invoiceNumber})`).catch(() => {});

  invalidateDashboardMetricsCache(String(req.companyId!));
  res.status(201).json(invoice);
}))

// GET /quotes — list all company quotes (flat, with optional status filter)
router.get("/quotes", requirePermission("viewQuotes"), asyncHandler(async (req, res) => {
  const { status } = req.query;
  const isWorker = req.userRole === "worker";
  const { limit, offset } = parsePagination(req.query, 50, 200);

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
    .orderBy(desc(quotesTable.createdAt))
    .limit(limit)
    .offset(offset);
  res.json(quotes);
}))

// GET /invoices — list all invoices for company
router.get("/invoices", requirePermission("viewFinancials"), asyncHandler(async (req, res) => {
  const { status } = req.query;
  const isWorker = req.userRole === "worker";
  const { limit, offset } = parsePagination(req.query, 50, 200);

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
    .orderBy(desc(invoicesTable.createdAt))
    .limit(limit)
    .offset(offset);
  res.json(invoices);
}))

// GET /invoices/:invoiceId
router.get("/invoices/:invoiceId", requirePermission("viewFinancials"), asyncHandler(async (req, res) => {
  const invoiceId = parseInt(req.params.invoiceId as string);
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
}))

// PUT /invoices/:invoiceId
router.put("/invoices/:invoiceId", requirePermission("manageFinancials"), asyncHandler(async (req, res) => {
  const invoiceId = parseInt(req.params.invoiceId as string);
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

  const parsed = UpdateInvoiceBodyValidated.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Malformed request payload", details: parsed.error.issues }); return; }

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

  const [updated] = await db.update(invoicesTable).set(updates).where(and(eq(invoicesTable.id, invoiceId), eq(invoicesTable.companyId, req.companyId!))).returning();

  logAuditEventFromRequest(req, "Invoice Updated", `Updated invoice "${updated.title}" (${updated.invoiceNumber})`).catch(() => {});

  invalidateDashboardMetricsCache(String(req.companyId!));
  res.json(updated);
}))

// PATCH /invoices/:invoiceId/assign — owners/foremen assign an invoice to a worker
router.patch("/invoices/:invoiceId/assign", asyncHandler(async (req, res) => {
  if (req.userRole === "worker") { res.status(403).json({ error: "Insufficient permissions" }); return; }

  const invoiceId = parseInt(req.params.invoiceId as string);
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
    .where(and(eq(invoicesTable.id, invoiceId), eq(invoicesTable.companyId, req.companyId!)))
    .returning();
  res.json(updated);
}))

// POST /invoices/:invoiceId/mark-sent
router.post("/invoices/:invoiceId/mark-sent", requirePermission("manageFinancials"), asyncHandler(async (req, res) => {
  const invoiceId = parseInt(req.params.invoiceId as string);
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
    .where(and(eq(invoicesTable.id, invoiceId), eq(invoicesTable.companyId, req.companyId!))).returning();

  logAuditEventFromRequest(req, "Invoice Marked Sent", `Marked invoice "${updated.title}" (${updated.invoiceNumber}) as sent`).catch(() => {});

  invalidateDashboardMetricsCache(String(req.companyId!));
  res.json(updated);
}))

// POST /invoices/:invoiceId/revert-to-draft
router.post("/invoices/:invoiceId/revert-to-draft", requirePermission("manageFinancials"), asyncHandler(async (req, res) => {
  const invoiceId = parseInt(req.params.invoiceId as string);
  const [existing] = await db
    .select()
    .from(invoicesTable)
    .where(and(eq(invoicesTable.id, invoiceId), eq(invoicesTable.companyId, req.companyId!)))
    .limit(1);
  if (!existing) { res.status(404).json({ error: "Invoice not found" }); return; }
  if (existing.signedAt) {
    res.status(409).json({ error: "Cannot revert a signed invoice to draft" }); return;
  }
  if (existing.status !== "sent" && existing.status !== "overdue") {
    res.status(409).json({ error: "Only sent or overdue invoices can be reverted to draft" }); return;
  }
  const [updated] = await db.update(invoicesTable)
    .set({ status: "draft", sentAt: null, updatedAt: new Date() })
    .where(and(eq(invoicesTable.id, invoiceId), eq(invoicesTable.companyId, req.companyId!))).returning();

  logAuditEventFromRequest(req, "Invoice Reverted to Draft", `Reverted invoice "${updated.title}" (${updated.invoiceNumber}) to draft`).catch(() => {});

  invalidateDashboardMetricsCache(String(req.companyId!));
  res.json(updated);
}))

// POST /invoices/:invoiceId/send-email
router.post("/invoices/:invoiceId/send-email", requirePermission("manageFinancials"), asyncHandler(async (req, res) => {
  const invoiceId = parseInt(req.params.invoiceId as string);

  const parsedEmail = SendInvoiceEmailBody.safeParse(req.body);
  if (!parsedEmail.success) {
    res.status(400).json({ error: "Malformed request payload", details: parsedEmail.error.issues });
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
    .select({ name: companiesTable.name, address: companiesTable.address, phone: companiesTable.phone, defaultInvoiceNotes: companiesTable.defaultInvoiceNotes })
    .from(companiesTable)
    .where(eq(companiesTable.id, req.companyId!))
    .limit(1);
  const companyName = company?.name ?? "Site Snap";

  // Generate PDF server-side — eliminates the 15MB client-upload attack surface.
  const pdfBuffer = await buildInvoicePdfBuffer({
    invoiceNumber: invoice.invoiceNumber,
    title: invoice.title,
    clientName: invoice.clientName,
    clientEmail: invoice.clientEmail,
    status: invoice.status,
    lineItems: (invoice.lineItems as { description: string; quantity: number; unit: string; unitPrice: number; total: number }[]) ?? [],
    subtotal: invoice.subtotal,
    taxRate: invoice.taxRate,
    taxAmount: invoice.taxAmount,
    total: invoice.total,
    notes: invoice.notes,
    dueDate: invoice.dueDate,
    createdAt: invoice.createdAt.toISOString(),
    companyName,
    companyAddress: company?.address ?? null,
    companyPhone: company?.phone ?? null,
    signerName: invoice.signerName,
    signedAt: invoice.signedAt,
    defaultNotes: company?.defaultInvoiceNotes ?? null,
  });

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
            <td style="padding:10px 14px;background:#fff;border:1px solid #e5e7eb;border-top:none;border-left:none;border-radius:0 0 4px 0;font-size:13px;font-weight:600;">${format(parseISO(invoice.dueDate), "MMMM d, yyyy")}</td>
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
          content: pdfBuffer.toString("base64"),
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
}))

// POST /invoices/:invoiceId/send-reminder
router.post("/invoices/:invoiceId/send-reminder", requirePermission("manageFinancials"), asyncHandler(async (req, res) => {
  const invoiceId = parseInt(req.params.invoiceId as string);

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
}))

// DELETE /invoices/:invoiceId — only draft invoices; workers may only delete their own
router.delete("/invoices/:invoiceId", asyncHandler(async (req, res) => {
  const invoiceId = parseInt(req.params.invoiceId as string);
  const [existing] = await db
    .select()
    .from(invoicesTable)
    .where(and(eq(invoicesTable.id, invoiceId), eq(invoicesTable.companyId, req.companyId!)))
    .limit(1);
  if (!existing) { res.status(404).json({ error: "Invoice not found" }); return; }
  if (existing.status !== "draft") {
    res.status(409).json({ error: "Only draft invoices can be deleted" });
    return;
  }
  if (req.userRole === "worker" && existing.createdByUserId !== req.userId) {
    res.status(403).json({ error: "You can only delete invoices you created" });
    return;
  }
  await db.delete(invoicesTable).where(and(eq(invoicesTable.id, invoiceId), eq(invoicesTable.companyId, req.companyId!)));
  invalidateDashboardMetricsCache(String(req.companyId!));
  res.status(204).end();
}))

// POST /invoices/:invoiceId/mark-paid
router.post("/invoices/:invoiceId/mark-paid", requirePermission("manageFinancials"), asyncHandler(async (req, res) => {
  const invoiceId = parseInt(req.params.invoiceId as string);
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
    .where(and(eq(invoicesTable.id, invoiceId), eq(invoicesTable.companyId, req.companyId!))).returning();
  invalidateDashboardMetricsCache(String(req.companyId!));
  res.json(updated);
}))

export default router;
