import { Router } from "express";
import { eq } from "drizzle-orm";
import { requireAuth, requireCompany, requireOwner } from "../lib/auth.js";
import { buildDigest } from "../lib/digest.js";
import { buildDigestHtml } from "../lib/digestTemplate.js";
import { sendEmail, ResendSandboxError } from "../lib/mailer.js";
import { sendDigestForAllCompanies } from "../cron.js";
import { db, companiesTable } from "@workspace/db";

const router = Router();

router.post("/digest/send-all", requireAuth, async (req, res) => {
  const result = await sendDigestForAllCompanies();
  res.json(result);
});

router.post("/digest/preview", requireAuth, requireCompany, async (req, res) => {
  const companyId = (req as any).companyId as number;
  const digest = await buildDigest(companyId);

  if (!digest) {
    res.status(404).json({ error: "No data for this company" });
    return;
  }

  const html = buildDigestHtml(digest);
  res.type("html").send(html);
});

router.post("/digest/send-now", requireAuth, requireCompany, async (req, res) => {
  const companyId = (req as any).companyId as number;
  const digest = await buildDigest(companyId);

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
    await sendEmail({ to, subject, html });
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
});

function buildEmailConfigResponse(company: { digestFromEmail: string | null; resendApiKey: string | null }) {
  const dbFrom = company.digestFromEmail ?? "";
  const envFrom = process.env["DIGEST_FROM_EMAIL"] ?? "";
  const raw = dbFrom || envFrom;
  const isDefault = !raw || raw === "Site Snap <onboarding@resend.dev>";
  const fromEmail = isDefault ? "onboarding@resend.dev (Resend default)" : raw;
  const resendKeySet = !!(company.resendApiKey || process.env["RESEND_API_KEY"]);
  return { fromEmail, isCustomDomain: !isDefault, resendKeySet };
}

router.get("/settings/email-config", requireAuth, requireCompany, async (req, res) => {
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
});

router.patch("/settings/email-config", requireAuth, requireCompany, requireOwner, async (req, res) => {
  const companyId = (req as any).companyId as number;
  const { fromEmail, resendApiKey } = req.body as { fromEmail?: string | null; resendApiKey?: string | null };

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
});

export default router;
