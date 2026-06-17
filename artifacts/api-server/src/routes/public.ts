import { Router } from "express";
import { db, quotesTable, invoicesTable, companiesTable, usersTable, userMembershipsTable } from "@workspace/db";
import { eq, and, isNull, or, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { asyncHandler } from "../lib/asyncHandler";
import { getClientInfo } from "../lib/clientInfo";
import { sendEmail, ResendSandboxError, escapeHtml } from "../lib/mailer.js";
import { logger } from "../lib/logger.js";
import { buildInvoicePdfBuffer } from "../lib/invoicePdf.js";

const router = Router();

const signRateLimiter = rateLimit({
  windowMs: 60_000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many sign attempts, please try again shortly." },
});

const SignBody = z.object({
  signatureData: z
    .string()
    .min(50, "signatureData (data URL) is required")
    .max(2_000_000, "signature too large"),
  signerName: z.string().min(1).max(120),
});

async function publicQuotePayload(q: Record<string, unknown>, companyName?: string | null) {
  // Pull company terms if available
  let terms: string | null = null;
  if (q.companyId) {
    const [c] = await db
      .select({ defaultQuoteTerms: companiesTable.defaultQuoteTerms })
      .from(companiesTable)
      .where(eq(companiesTable.id, q.companyId as number))
      .limit(1);
    terms = c?.defaultQuoteTerms ?? null;
  }
  return {
    id: q.id,
    quoteNumber: q.quoteNumber,
    title: q.title,
    clientName: q.clientName,
    clientEmail: q.clientEmail,
    clientCompanyName: q.clientCompanyName ?? null,
    clientAddress: q.clientAddress ?? null,
    clientPhone: q.clientPhone ?? null,
    status: q.status,
    lineItems: q.lineItems,
    subtotal: q.subtotal,
    taxRate: q.taxRate,
    taxAmount: q.taxAmount,
    total: q.total,
    notes: q.notes,
    validUntil: q.validUntil,
    createdAt: q.createdAt,
    signedAt: q.signedAt ?? null,
    signerName: q.signerName ?? null,
    signatureData: q.signatureData ?? null,
    companyName: companyName ?? null,
    terms,
  };
}

async function publicInvoicePayload(i: Record<string, unknown>, companyName?: string | null) {
  let terms: string | null = null;
  if (i.companyId) {
    const [c] = await db
      .select({ defaultInvoiceNotes: companiesTable.defaultInvoiceNotes })
      .from(companiesTable)
      .where(eq(companiesTable.id, i.companyId as number))
      .limit(1);
    terms = c?.defaultInvoiceNotes ?? null;
  }
  return {
    id: i.id,
    invoiceNumber: i.invoiceNumber,
    title: i.title,
    clientName: i.clientName,
    clientEmail: i.clientEmail,
    status: i.status,
    lineItems: i.lineItems,
    subtotal: i.subtotal,
    taxRate: i.taxRate,
    taxAmount: i.taxAmount,
    total: i.total,
    notes: i.notes,
    dueDate: i.dueDate,
    sentAt: i.sentAt,
    paidAt: i.paidAt,
    createdAt: i.createdAt,
    signedAt: i.signedAt ?? null,
    signerName: i.signerName ?? null,
    signatureData: i.signatureData ?? null,
    companyName: companyName ?? null,
    terms,
  };
}

async function getCompanyName(companyId: number): Promise<string | null> {
  const [c] = await db
    .select({ name: companiesTable.name })
    .from(companiesTable)
    .where(eq(companiesTable.id, companyId))
    .limit(1);
  return c?.name ?? null;
}

async function getCompanyOwnerEmail(companyId: number): Promise<string | null> {
  const [owner] = await db
    .select({ email: usersTable.email })
    .from(usersTable)
    .innerJoin(
      userMembershipsTable,
      and(
        eq(userMembershipsTable.userId, usersTable.id),
        eq(userMembershipsTable.companyId, companyId),
        eq(userMembershipsTable.role, "owner"),
      ),
    )
    .limit(1);
  return owner?.email ?? null;
}

const fmtCAD = (v: string | number) =>
  new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(Number(v));

function buildInvoiceSignedClientHtml(invoice: {
  invoiceNumber: string;
  clientName: string;
  total: string | number;
  signerName: string;
  signedAt: Date;
}, companyName: string): string {
  const timestamp = invoice.signedAt.toUTCString();
  const safeCompanyName = escapeHtml(companyName);
  const safeInvoiceNumber = escapeHtml(invoice.invoiceNumber);
  const safeClientName = escapeHtml(invoice.clientName);
  const safeSignerName = escapeHtml(invoice.signerName);
  return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#172034;">
      <div style="background:#FF6600;padding:24px 32px;border-radius:8px 8px 0 0;">
        <h1 style="color:#fff;margin:0;font-size:22px;">${safeCompanyName}</h1>
        <p style="color:rgba(255,255,255,0.85);margin:4px 0 0;font-size:14px;">Invoice Signed — ${safeInvoiceNumber}</p>
      </div>
      <div style="background:#f9f9f9;padding:32px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;">
        <p style="margin:0 0 16px;">Hi ${safeClientName},</p>
        <p style="margin:0 0 24px;">Thank you for signing invoice <strong>${safeInvoiceNumber}</strong>. Here is a summary for your records.</p>
        <table style="width:100%;border-collapse:collapse;margin:0 0 24px;">
          <tr>
            <td style="padding:10px 14px;background:#fff;border:1px solid #e5e7eb;border-radius:4px 0 0 0;color:#6b7280;font-size:13px;">Invoice Number</td>
            <td style="padding:10px 14px;background:#fff;border:1px solid #e5e7eb;border-left:none;border-radius:0 4px 0 0;font-size:13px;font-weight:600;">${safeInvoiceNumber}</td>
          </tr>
          <tr>
            <td style="padding:10px 14px;background:#fff;border:1px solid #e5e7eb;border-top:none;color:#6b7280;font-size:13px;">Total</td>
            <td style="padding:10px 14px;background:#fff;border:1px solid #e5e7eb;border-top:none;border-left:none;font-size:13px;font-weight:600;color:#FF6600;">${fmtCAD(invoice.total)}</td>
          </tr>
          <tr>
            <td style="padding:10px 14px;background:#fff;border:1px solid #e5e7eb;border-top:none;color:#6b7280;font-size:13px;">Signed By</td>
            <td style="padding:10px 14px;background:#fff;border:1px solid #e5e7eb;border-top:none;border-left:none;font-size:13px;font-weight:600;">${safeSignerName}</td>
          </tr>
          <tr>
            <td style="padding:10px 14px;background:#fff;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 0 4px;color:#6b7280;font-size:13px;">Signed At (UTC)</td>
            <td style="padding:10px 14px;background:#fff;border:1px solid #e5e7eb;border-top:none;border-left:none;border-radius:0 0 4px 0;font-size:13px;">${timestamp}</td>
          </tr>
        </table>
        <p style="margin:0;font-size:13px;color:#6b7280;">Please keep this email as your confirmation. If you have any questions, reply to this email or contact <strong>${safeCompanyName}</strong> directly.</p>
        <p style="margin:16px 0 0;font-size:13px;font-weight:600;">${safeCompanyName}</p>
      </div>
      <p style="text-align:center;font-size:11px;color:#9ca3af;margin:16px 0 0;">Powered by Site Snap</p>
    </div>
  `;
}

function buildInvoiceSignedOwnerHtml(invoice: {
  invoiceNumber: string;
  clientName: string;
  clientEmail: string | null;
  total: string | number;
  signerName: string;
  signedAt: Date;
}, companyName: string): string {
  const timestamp = invoice.signedAt.toUTCString();
  const safeInvoiceNumber = escapeHtml(invoice.invoiceNumber);
  const safeClientName = escapeHtml(invoice.clientName);
  const safeClientEmail = invoice.clientEmail ? escapeHtml(invoice.clientEmail) : null;
  const safeSignerName = escapeHtml(invoice.signerName);
  return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#172034;">
      <div style="background:#172034;padding:24px 32px;border-radius:8px 8px 0 0;">
        <h1 style="color:#fff;margin:0;font-size:22px;">Site Snap</h1>
        <p style="color:rgba(255,255,255,0.7);margin:4px 0 0;font-size:14px;">Invoice Signed Notification</p>
      </div>
      <div style="background:#f9f9f9;padding:32px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;">
        <p style="margin:0 0 16px;">Your invoice has been signed by the client.</p>
        <table style="width:100%;border-collapse:collapse;margin:0 0 24px;">
          <tr>
            <td style="padding:10px 14px;background:#fff;border:1px solid #e5e7eb;border-radius:4px 0 0 0;color:#6b7280;font-size:13px;">Invoice Number</td>
            <td style="padding:10px 14px;background:#fff;border:1px solid #e5e7eb;border-left:none;border-radius:0 4px 0 0;font-size:13px;font-weight:600;">${safeInvoiceNumber}</td>
          </tr>
          <tr>
            <td style="padding:10px 14px;background:#fff;border:1px solid #e5e7eb;border-top:none;color:#6b7280;font-size:13px;">Client</td>
            <td style="padding:10px 14px;background:#fff;border:1px solid #e5e7eb;border-top:none;border-left:none;font-size:13px;font-weight:600;">${safeClientName}${safeClientEmail ? ` &lt;${safeClientEmail}&gt;` : ""}</td>
          </tr>
          <tr>
            <td style="padding:10px 14px;background:#fff;border:1px solid #e5e7eb;border-top:none;color:#6b7280;font-size:13px;">Total</td>
            <td style="padding:10px 14px;background:#fff;border:1px solid #e5e7eb;border-top:none;border-left:none;font-size:13px;font-weight:600;color:#FF6600;">${fmtCAD(invoice.total)}</td>
          </tr>
          <tr>
            <td style="padding:10px 14px;background:#fff;border:1px solid #e5e7eb;border-top:none;color:#6b7280;font-size:13px;">Signed By</td>
            <td style="padding:10px 14px;background:#fff;border:1px solid #e5e7eb;border-top:none;border-left:none;font-size:13px;font-weight:600;">${safeSignerName}</td>
          </tr>
          <tr>
            <td style="padding:10px 14px;background:#fff;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 0 4px;color:#6b7280;font-size:13px;">Signed At (UTC)</td>
            <td style="padding:10px 14px;background:#fff;border:1px solid #e5e7eb;border-top:none;border-left:none;border-radius:0 0 4px 0;font-size:13px;">${timestamp}</td>
          </tr>
        </table>
        <p style="margin:0;font-size:13px;color:#6b7280;">Log in to Site Snap to view the signed invoice and proceed with next steps.</p>
      </div>
      <p style="text-align:center;font-size:11px;color:#9ca3af;margin:16px 0 0;">Powered by Site Snap</p>
    </div>
  `;
}

function buildQuoteSignedClientHtml(quote: {
  quoteNumber: string;
  clientName: string;
  total: string | number;
  signerName: string;
  signedAt: Date;
}, companyName: string): string {
  const timestamp = quote.signedAt.toUTCString();
  const safeCompanyName = escapeHtml(companyName);
  const safeQuoteNumber = escapeHtml(quote.quoteNumber);
  const safeClientName = escapeHtml(quote.clientName);
  const safeSignerName = escapeHtml(quote.signerName);
  return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#172034;">
      <div style="background:#D4AF37;padding:24px 32px;border-radius:8px 8px 0 0;">
        <h1 style="color:#fff;margin:0;font-size:22px;">${safeCompanyName}</h1>
        <p style="color:rgba(255,255,255,0.85);margin:4px 0 0;font-size:14px;">Quote Approved — ${safeQuoteNumber}</p>
      </div>
      <div style="background:#f9f9f9;padding:32px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;">
        <p style="margin:0 0 16px;">Hi ${safeClientName},</p>
        <p style="margin:0 0 24px;">Thank you for approving quote <strong>${safeQuoteNumber}</strong>. Here is a summary for your records.</p>
        <table style="width:100%;border-collapse:collapse;margin:0 0 24px;">
          <tr>
            <td style="padding:10px 14px;background:#fff;border:1px solid #e5e7eb;border-radius:4px 0 0 0;color:#6b7280;font-size:13px;">Quote Number</td>
            <td style="padding:10px 14px;background:#fff;border:1px solid #e5e7eb;border-left:none;border-radius:0 4px 0 0;font-size:13px;font-weight:600;">${safeQuoteNumber}</td>
          </tr>
          <tr>
            <td style="padding:10px 14px;background:#fff;border:1px solid #e5e7eb;border-top:none;color:#6b7280;font-size:13px;">Total</td>
            <td style="padding:10px 14px;background:#fff;border:1px solid #e5e7eb;border-top:none;border-left:none;font-size:13px;font-weight:600;color:#D4AF37;">${fmtCAD(quote.total)}</td>
          </tr>
          <tr>
            <td style="padding:10px 14px;background:#fff;border:1px solid #e5e7eb;border-top:none;color:#6b7280;font-size:13px;">Approved By</td>
            <td style="padding:10px 14px;background:#fff;border:1px solid #e5e7eb;border-top:none;border-left:none;font-size:13px;font-weight:600;">${safeSignerName}</td>
          </tr>
          <tr>
            <td style="padding:10px 14px;background:#fff;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 0 4px;color:#6b7280;font-size:13px;">Approved At (UTC)</td>
            <td style="padding:10px 14px;background:#fff;border:1px solid #e5e7eb;border-top:none;border-left:none;border-radius:0 0 4px 0;font-size:13px;">${timestamp}</td>
          </tr>
        </table>
        <p style="margin:0;font-size:13px;color:#6b7280;">Please keep this email as your confirmation. If you have any questions, reply to this email or contact <strong>${safeCompanyName}</strong> directly.</p>
        <p style="margin:16px 0 0;font-size:13px;font-weight:600;">${safeCompanyName}</p>
      </div>
      <p style="text-align:center;font-size:11px;color:#9ca3af;margin:16px 0 0;">Powered by Site Snap</p>
    </div>
  `;
}

async function sendInvoiceSignedEmails(
  invoice: {
    id: number;
    invoiceNumber: string;
    clientName: string;
    clientEmail: string | null;
    total: string | number;
    signerName: string;
    signedAt: Date;
    companyId: number;
    lineItems: unknown;
    subtotal: string | number;
    taxRate: string | number;
    taxAmount: string | number;
    notes?: string | null;
    dueDate?: string | null;
    createdAt: string;
  },
  companyName: string,
  company?: { address?: string | null; phone?: string | null; defaultInvoiceNotes?: string | null } | null,
): Promise<void> {
  const ownerEmail = await getCompanyOwnerEmail(invoice.companyId);

  // Build PDF buffer server-side
  let pdfBase64: string | undefined;
  try {
    const pdfBuffer = await buildInvoicePdfBuffer({
      invoiceNumber: invoice.invoiceNumber,
      title: invoice.invoiceNumber,
      clientName: invoice.clientName,
      clientEmail: invoice.clientEmail,
      status: "signed",
      lineItems: (invoice.lineItems as any[]) ?? [],
      subtotal: invoice.subtotal,
      taxRate: invoice.taxRate,
      taxAmount: invoice.taxAmount,
      total: invoice.total,
      notes: invoice.notes,
      dueDate: invoice.dueDate,
      createdAt: invoice.createdAt,
      companyName,
      companyAddress: company?.address ?? null,
      companyPhone: company?.phone ?? null,
      signerName: invoice.signerName,
      signedAt: invoice.signedAt,
      defaultNotes: company?.defaultInvoiceNotes ?? null,
    });
    pdfBase64 = pdfBuffer.toString("base64");
  } catch (pdfErr) {
    logger.error({ err: pdfErr, invoiceId: invoice.id }, "Failed to generate signed invoice PDF");
  }

  const emailPromises: Promise<void>[] = [];

  if (invoice.clientEmail) {
    const clientHtml = buildInvoiceSignedClientHtml(invoice, companyName);
    emailPromises.push(
      sendEmail({
        to: [invoice.clientEmail],
        subject: `Invoice ${invoice.invoiceNumber} — Signature Confirmed`,
        html: clientHtml,
        ...(pdfBase64
          ? {
              attachments: [
                {
                  filename: `${invoice.invoiceNumber}.pdf`,
                  content: pdfBase64,
                },
              ],
            }
          : {}),
      }).catch((err) => {
        if (err instanceof ResendSandboxError) {
          logger.warn({ invoiceId: invoice.id, sandboxWarning: err.message }, "Invoice signed client email sandboxed");
        } else {
          logger.error({ err, invoiceId: invoice.id }, "Failed to send invoice signed client email");
        }
      }),
    );
  }

  if (ownerEmail) {
    const ownerHtml = buildInvoiceSignedOwnerHtml(invoice, companyName);
    emailPromises.push(
      sendEmail({
        to: [ownerEmail],
        subject: `Invoice ${invoice.invoiceNumber} Signed by ${invoice.signerName}`,
        html: ownerHtml,
      }).catch((err) => {
        if (err instanceof ResendSandboxError) {
          logger.warn({ invoiceId: invoice.id, sandboxWarning: err.message }, "Invoice signed owner email sandboxed");
        } else {
          logger.error({ err, invoiceId: invoice.id }, "Failed to send invoice signed owner email");
        }
      }),
    );
  }

  await Promise.all(emailPromises);
}

// ── Public Quote: GET ─────────────────────────────────────────────────────────
router.get(
  "/public/quotes/:token",
  asyncHandler(async (req, res) => {
    const token = req.params.token;
    const [quote] = await db
      .select()
      .from(quotesTable)
      .where(eq(quotesTable.publicToken, token as string))
      .limit(1);
    if (!quote) {
      res.status(404).json({ error: "Quote not found" });
      return;
    }
    const companyName = await getCompanyName(quote.companyId);
    res.json(await publicQuotePayload(quote as unknown as Record<string, unknown>, companyName));
  }),
);

// ── Public Quote: SIGN ────────────────────────────────────────────────────────
router.post(
  "/public/quotes/:token/sign",
  signRateLimiter,
  asyncHandler(async (req, res) => {
    const token = req.params.token;
    const parsed = SignBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
      return;
    }
    const info = getClientInfo(req);
    // Atomic, idempotent sign: only update if not already signed and in a signable status.
    const updatedRows = await db
      .update(quotesTable)
      .set({
        status: "approved",
        signatureData: parsed.data.signatureData,
        signerName: parsed.data.signerName,
        signerIp: info.ip,
        signerUserAgent: info.userAgent,
        signedAt: info.signedAt,
        approvedAt: info.signedAt,
        updatedAt: info.signedAt,
      })
      .where(
        and(
          eq(quotesTable.publicToken, token as string),
          isNull(quotesTable.signedAt),
          or(eq(quotesTable.status, "pending_approval"), eq(quotesTable.status, "approved")),
        ),
      )
      .returning();
    if (updatedRows.length === 0) {
      // Distinguish 404 vs 409.
      const [existing] = await db
        .select({ status: quotesTable.status, signedAt: quotesTable.signedAt })
        .from(quotesTable)
        .where(eq(quotesTable.publicToken, token as string))
        .limit(1);
      if (!existing) {
        res.status(404).json({ error: "Quote not found" });
        return;
      }
      if (existing.signedAt) {
        res.status(409).json({ error: "Quote has already been signed" });
        return;
      }
      res.status(409).json({ error: "Quote is not in a signable state", status: existing.status });
      return;
    }
    const updated = updatedRows[0];
    const companyName = await getCompanyName(updated.companyId);
    res.json(await publicQuotePayload(updated as unknown as Record<string, unknown>, companyName));

    // Send confirmation email to client (fire-and-forget)
    if (updated.clientEmail) {
      const html = buildQuoteSignedClientHtml(
        {
          quoteNumber: updated.quoteNumber,
          clientName: updated.clientName,
          total: updated.total,
          signerName: updated.signerName ?? parsed.data.signerName,
          signedAt: updated.signedAt ?? info.signedAt,
        },
        companyName ?? "Site Snap",
      );
      sendEmail({
        to: [updated.clientEmail],
        subject: `Quote ${updated.quoteNumber} — Approved`,
        html,
      }).catch((err) => {
        if (err instanceof ResendSandboxError) {
          logger.warn({ quoteId: updated.id, sandboxWarning: err.message }, "Quote signed client email sandboxed");
        } else {
          logger.error({ err, quoteId: updated.id }, "Failed to send quote signed client email");
        }
      });
    }
  }),
);

// ── Public Quote: ACCEPT (e-sign + auto-invoice) ─────────────────────────────
router.patch(
  "/public/quotes/:token/accept",
  signRateLimiter,
  asyncHandler(async (req, res) => {
    const token = req.params.token;
    const parsed = SignBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
      return;
    }

    // Pre-flight check to give a clear error before entering the transaction
    const [quote] = await db
      .select()
      .from(quotesTable)
      .where(eq(quotesTable.publicToken, token as string))
      .limit(1);

    if (!quote) { res.status(404).json({ error: "Quote not found" }); return; }
    if (quote.signedAt) { res.status(409).json({ error: "Quote has already been accepted" }); return; }
    if (quote.status !== "approved") {
      res.status(409).json({ error: "Quote is not ready for acceptance", status: quote.status });
      return;
    }
    // Expiry: compare YYYY-MM-DD strings to avoid timezone ambiguity
    if (quote.validUntil) {
      const today = new Date().toISOString().split("T")[0];
      if (quote.validUntil < today) {
        res.status(410).json({ error: "This quote has expired" });
        return;
      }
    }

    const info = getClientInfo(req);

    let result: { quote: typeof quotesTable.$inferSelect; invoice: typeof invoicesTable.$inferSelect } | null = null;
    try {
      result = await db.transaction(async (tx) => {
        // Atomic idempotency guard — first writer wins; signedAt IS NULL in WHERE
        // means a concurrent request gets 0 rows and throws CONCURRENT_ACCEPT.
        const [accepted] = await tx
          .update(quotesTable)
          .set({
            status: "accepted",
            signatureData: parsed.data.signatureData,
            signerName: parsed.data.signerName,
            signerIp: info.ip,
            signerUserAgent: info.userAgent,
            signedAt: info.signedAt,
            approvedAt: info.signedAt,
            updatedAt: info.signedAt,
          })
          .where(
            and(
              eq(quotesTable.publicToken, token as string),
              isNull(quotesTable.signedAt),
              eq(quotesTable.status, "approved"),
            ),
          )
          .returning();

        if (!accepted) throw new Error("CONCURRENT_ACCEPT");

        // Atomically allocate invoice number inside the same transaction
        const [company] = await tx
          .update(companiesTable)
          .set({ invoiceCounter: sql`invoice_counter + 1` })
          .where(eq(companiesTable.id, accepted.companyId))
          .returning({
            counter: companiesTable.invoiceCounter,
            prefix: companiesTable.invoiceNumberPrefix,
            start: companiesTable.invoiceStartNumber,
          });

        const invoiceNum = company.counter + ((company.start ?? 1) - 1);
        const invoiceNumber = `${company.prefix ?? "INV"}-${String(invoiceNum).padStart(4, "0")}`;

        const [invoice] = await tx
          .insert(invoicesTable)
          .values({
            companyId: accepted.companyId,
            projectId: accepted.projectId ?? null,
            quoteId: accepted.id,
            invoiceNumber,
            title: accepted.title,
            clientName: accepted.clientName,
            clientEmail: accepted.clientEmail ?? null,
            status: "draft",
            lineItems: accepted.lineItems as { description: string; quantity: number; unit: string; unitPrice: number; total: number }[],
            subtotal: accepted.subtotal,
            taxRate: accepted.taxRate,
            taxAmount: accepted.taxAmount,
            total: accepted.total,
            notes: accepted.notes ?? null,
            createdByUserId: accepted.createdByUserId,
            publicToken: randomUUID(),
          })
          .returning();

        return { quote: accepted, invoice };
      });
    } catch (err: any) {
      if (err?.message === "CONCURRENT_ACCEPT") {
        res.status(409).json({ error: "Quote has already been accepted" });
        return;
      }
      logger.error({ err }, "Failed to accept quote");
      res.status(500).json({ error: "Failed to accept quote. Please try again." });
      return;
    }

    const companyName = await getCompanyName(result.quote.companyId);
    res.json({
      quote: await publicQuotePayload(result.quote as unknown as Record<string, unknown>, companyName),
      invoiceId: result.invoice.id,
      invoiceNumber: result.invoice.invoiceNumber,
    });

    // Fire-and-forget confirmation email to client
    if (result.quote.clientEmail) {
      const html = buildQuoteSignedClientHtml(
        {
          quoteNumber: result.quote.quoteNumber,
          clientName: result.quote.clientName,
          total: result.quote.total,
          signerName: result.quote.signerName ?? parsed.data.signerName,
          signedAt: result.quote.signedAt ?? info.signedAt,
        },
        companyName ?? "Site Snap",
      );
      sendEmail({
        to: [result.quote.clientEmail],
        subject: `Quote ${result.quote.quoteNumber} — Accepted`,
        html,
      }).catch((err) => {
        if (err instanceof ResendSandboxError) {
          logger.warn({ quoteId: result!.quote.id, sandboxWarning: err.message }, "Quote accept client email sandboxed");
        } else {
          logger.error({ err, quoteId: result!.quote.id }, "Failed to send quote accept confirmation email");
        }
      });
    }
  }),
);

// ── Public Invoice: GET ───────────────────────────────────────────────────────
router.get(
  "/public/invoices/:token",
  asyncHandler(async (req, res) => {
    const token = req.params.token;
    const [invoice] = await db
      .select()
      .from(invoicesTable)
      .where(eq(invoicesTable.publicToken, token as string))
      .limit(1);
    if (!invoice) {
      res.status(404).json({ error: "Invoice not found" });
      return;
    }
    const companyName = await getCompanyName(invoice.companyId);
    res.json(await publicInvoicePayload(invoice as unknown as Record<string, unknown>, companyName));
  }),
);

// ── Public Invoice: SIGN ──────────────────────────────────────────────────────
router.post(
  "/public/invoices/:token/sign",
  signRateLimiter,
  asyncHandler(async (req, res) => {
    const token = req.params.token;
    const parsed = SignBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
      return;
    }
    const info = getClientInfo(req);
    // Atomic, idempotent sign: only allow if not already signed and not cancelled.
    const updatedRows = await db
      .update(invoicesTable)
      .set({
        signatureData: parsed.data.signatureData,
        signerName: parsed.data.signerName,
        signerIp: info.ip,
        signerUserAgent: info.userAgent,
        signedAt: info.signedAt,
        updatedAt: info.signedAt,
      })
      .where(
        and(
          eq(invoicesTable.publicToken, token as string),
          isNull(invoicesTable.signedAt),
          or(eq(invoicesTable.status, "sent"), eq(invoicesTable.status, "overdue")),
        ),
      )
      .returning();
    if (updatedRows.length === 0) {
      const [existing] = await db
        .select({ status: invoicesTable.status, signedAt: invoicesTable.signedAt })
        .from(invoicesTable)
        .where(eq(invoicesTable.publicToken, token as string))
        .limit(1);
      if (!existing) {
        res.status(404).json({ error: "Invoice not found" });
        return;
      }
      if (existing.signedAt) {
        res.status(409).json({ error: "Invoice has already been signed" });
        return;
      }
      res.status(409).json({ error: "Invoice is not in a signable state", status: existing.status });
      return;
    }
    const updated = updatedRows[0];
    const companyName = await getCompanyName(updated.companyId);
    res.json(await publicInvoicePayload(updated as unknown as Record<string, unknown>, companyName));

    // Fetch company details for PDF & email
    const [company] = await db
      .select({
        name: companiesTable.name,
        address: companiesTable.address,
        phone: companiesTable.phone,
        defaultInvoiceNotes: companiesTable.defaultInvoiceNotes,
      })
      .from(companiesTable)
      .where(eq(companiesTable.id, updated.companyId))
      .limit(1);

    // Send confirmation emails (fire-and-forget; errors are logged, not surfaced to client)
    sendInvoiceSignedEmails(
      {
        id: updated.id,
        invoiceNumber: updated.invoiceNumber,
        clientName: updated.clientName,
        clientEmail: updated.clientEmail,
        total: updated.total,
        signerName: updated.signerName ?? parsed.data.signerName,
        signedAt: updated.signedAt ?? info.signedAt,
        companyId: updated.companyId,
        lineItems: updated.lineItems,
        subtotal: updated.subtotal,
        taxRate: updated.taxRate,
        taxAmount: updated.taxAmount,
        notes: updated.notes,
        dueDate: updated.dueDate,
        createdAt: String(updated.createdAt),
      },
      company?.name ?? companyName ?? "Site Snap",
      company ?? null,
    ).catch((err) => {
      logger.error({ err, invoiceId: updated.id }, "Unexpected error in sendInvoiceSignedEmails");
    });
  }),
);

export default router;
