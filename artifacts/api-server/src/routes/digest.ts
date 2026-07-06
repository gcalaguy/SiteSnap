import { Router } from "express";
import { eq } from "drizzle-orm";
import { requireAuth, requireCompany, requireTenantCtx, requireOwner, requireSuperAdmin } from "../lib/auth.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { BadRequestError } from "../lib/errors.js";
import { buildDigest } from "../lib/digest.js";
import { buildDigestHtml } from "../lib/digestTemplate.js";
import { sendEmail, ResendSandboxError } from "../lib/mailer.js";
import { sendDigestForAllCompanies } from "../cron.js";
import { db, companiesTable } from "@workspace/db";
import { z } from "zod";

const router = Router();

const EmailConfigBody = z.object({
  fromEmail: z.string().email().nullable().optional(),
  resendApiKey: z.string().max(200).nullable().optional(),
});

router.post("/digest/send-all", requireAuth, requireSuperAdmin, asyncHandler(async (req, res) => {
  const result = await sendDigestForAllCompanies();
  res.json(result);
}))

router.post("/digest/preview", requireAuth, requireCompany, requireTenantCtx, asyncHandler(async (req, res) => {
  const companyId = (req as any).companyId as number;
  const digest = await buildDigest(companyId);

  if (!digest) {
    res.status(404).json({ error: "No data for this company" });
    return;
  }

  const html = buildDigestHtml(digest);
  res.type("html").send(html);
}))

router.post("/digest/send-now", requireAuth, requireCompany, requireTenantCtx, asyncHandler(async (req, res) => {
  const companyId = (req as any).companyId as number;

  const [[company], digest] = await Promise.all([
    db
      .select({ digestFromEmail: companiesTable.digestFromEmail, resendApiKey: companiesTable.resendApiKey })
      .from(companiesTable)
      .where(eq(companiesTable.id, companyId)),
    buildDigest(companyId),
  ]);

  if (!digest) {
    res.status(404).json({ error: "No active projects or recipients" });
    return;
  }

  if (digest.recipients.length === 0) {
    res.status(422).json({ error: "No owner/foreman recipients found for this company." });
    return;
  }

  const html = buildDigestHtml(digest);
  const subject = `Site Snap Daily Digest — ${digest.date}`;
  const to = digest.recipients.map((r) => r.email);

  try {
    await sendEmail({ to, subject, html, from: company?.digestFromEmail, apiKey: company?.resendApiKey });
    res.json({ sent: to.length, recipients: to });
  } catch (err) {
    if (err instanceof ResendSandboxError) {
      res.status(422).json({
        error: err.message,
        code: "resend_sandbox",
        allowedEmail: err.allowedEmail,
        intendedRecipients: to,
      });
      return;
    }
    req.log.error({ err }, "Failed to send digest email");
    res.status(500).json({ error: "Failed to send digest email. Please try again." });
  }
}))

function buildEmailConfigResponse(company: { digestFromEmail: string | null; resendApiKey: string | null }) {
  const dbFrom = company.digestFromEmail ?? "";
  const envFrom = process.env["DIGEST_FROM_EMAIL"] ?? "";
  const raw = dbFrom || envFrom;
  const isDefault = !raw || raw === "Site Snap <onboarding@resend.dev>";
  const fromEmail = isDefault ? "onboarding@resend.dev (Resend default)" : raw;
  const resendKeySet = !!(company.resendApiKey || process.env["RESEND_API_KEY"]);
  return { fromEmail, isCustomDomain: !isDefault, resendKeySet };
}

router.get("/settings/email-config", requireAuth, requireCompany, requireTenantCtx, asyncHandler(async (req, res) => {
  const companyId = (req as any).companyId as number;
  const [company] = await db
    .select({ digestFromEmail: companiesTable.digestFromEmail, resendApiKey: companiesTable.resendApiKey })
    .from(companiesTable)
    .where(eq(companiesTable.id, companyId));

  if (!company) {
    res.status(404).json({ error: "Company not found" });
    return;
  }

  res.json(buildEmailConfigResponse(company));
}))

router.patch("/settings/email-config", requireAuth, requireCompany, requireTenantCtx, requireOwner, asyncHandler(async (req, res) => {
  const companyId = (req as any).companyId as number;
  const bodyParsed = EmailConfigBody.safeParse(req.body);
  if (!bodyParsed.success) throw new BadRequestError("Malformed request payload", bodyParsed.error.flatten());
  const { fromEmail, resendApiKey } = bodyParsed.data;

  const updates: Partial<typeof companiesTable.$inferInsert> = {};
  if (fromEmail !== undefined) updates.digestFromEmail = fromEmail ?? null;
  if (resendApiKey !== undefined) updates.resendApiKey = resendApiKey ?? null;

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "No fields to update" });
    return;
  }

  const [updated] = await db
    .update(companiesTable)
    .set(updates)
    .where(eq(companiesTable.id, companyId))
    .returning({ digestFromEmail: companiesTable.digestFromEmail, resendApiKey: companiesTable.resendApiKey });

  if (!updated) {
    res.status(404).json({ error: "Company not found" });
    return;
  }

  res.json(buildEmailConfigResponse(updated));
}))

export default router;
