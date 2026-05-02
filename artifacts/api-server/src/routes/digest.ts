import { Router } from "express";
import { requireAuth, requireCompany } from "../lib/auth.js";
import { buildDigest } from "../lib/digest.js";
import { buildDigestHtml } from "../lib/digestTemplate.js";
import { sendEmail } from "../lib/mailer.js";
import { sendDigestForAllCompanies } from "../cron.js";

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
    res.status(422).json({ error: "No owner/foreman recipients found" });
    return;
  }

  const html = buildDigestHtml(digest);
  const subject = `BuildCore Daily Digest — ${digest.date}`;
  const to = digest.recipients.map((r) => r.email);

  await sendEmail({ to, subject, html });

  res.json({ sent: to.length, recipients: to });
});

export default router;
