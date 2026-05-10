import { Router } from "express";
import { db, quotesTable, invoicesTable, companiesTable } from "@workspace/db";
import { eq, and, isNull, or } from "drizzle-orm";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { asyncHandler } from "../lib/asyncHandler";
import { getClientInfo } from "../lib/clientInfo";

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

function publicQuotePayload(q: Record<string, unknown>, companyName?: string | null) {
  // Strip internal fields, expose only what the client viewer needs.
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
    signerIp: q.signerIp ?? null,
    signerUserAgent: q.signerUserAgent ?? null,
    signatureData: q.signatureData ?? null,
    companyName: companyName ?? null,
  };
}

function publicInvoicePayload(i: Record<string, unknown>, companyName?: string | null) {
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
    signerIp: i.signerIp ?? null,
    signerUserAgent: i.signerUserAgent ?? null,
    signatureData: i.signatureData ?? null,
    companyName: companyName ?? null,
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
    res.json(publicQuotePayload(quote as unknown as Record<string, unknown>, companyName));
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
          eq(quotesTable.status, "pending_approval"),
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
    res.json(publicQuotePayload(updated as unknown as Record<string, unknown>, companyName));
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
    res.json(publicInvoicePayload(invoice as unknown as Record<string, unknown>, companyName));
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
    res.json(publicInvoicePayload(updated as unknown as Record<string, unknown>, companyName));
  }),
);

export default router;
