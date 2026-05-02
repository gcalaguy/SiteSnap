import cron from "node-cron";
import { db, companiesTable } from "@workspace/db";
import { buildDigest } from "./lib/digest.js";
import { buildDigestHtml } from "./lib/digestTemplate.js";
import { sendEmail } from "./lib/mailer.js";
import { sendOverdueReminders } from "./lib/invoiceReminders.js";
import { logger } from "./lib/logger.js";

export async function sendDigestForAllCompanies(): Promise<{
  sent: number;
  skipped: number;
  errors: number;
}> {
  const companies = await db
    .select({ id: companiesTable.id, name: companiesTable.name })
    .from(companiesTable);

  let sent = 0;
  let skipped = 0;
  let errors = 0;

  for (const company of companies) {
    try {
      const digest = await buildDigest(company.id);

      if (!digest) {
        skipped++;
        continue;
      }

      // No recipients or no active-project content
      if (digest.recipients.length === 0) {
        skipped++;
        continue;
      }

      const html = buildDigestHtml(digest);
      const subject = `Site Snap Daily Digest — ${digest.date}`;
      const to = digest.recipients.map((r) => r.email);

      await sendEmail({ to, subject, html });
      logger.info(
        { companyId: company.id, companyName: company.name, recipients: to.length },
        "Digest sent",
      );
      sent++;
    } catch (err) {
      logger.error({ err, companyId: company.id }, "Failed to send digest for company");
      errors++;
    }
  }

  return { sent, skipped, errors };
}

export function startDailyCron(): void {
  // 7:00 AM Eastern every day — daily digest
  cron.schedule(
    "0 7 * * *",
    async () => {
      logger.info("Daily digest cron triggered");
      const result = await sendDigestForAllCompanies();
      logger.info(result, "Daily digest cron complete");
    },
    { timezone: "America/Toronto" },
  );
  logger.info("Daily digest cron scheduled: 7:00 AM ET");

  // 8:00 AM Eastern every day — overdue invoice reminders
  cron.schedule(
    "0 8 * * *",
    async () => {
      logger.info("Overdue invoice reminder cron triggered");
      const result = await sendOverdueReminders();
      logger.info(result, "Overdue invoice reminder cron complete");
    },
    { timezone: "America/Toronto" },
  );
  logger.info("Overdue invoice reminder cron scheduled: 8:00 AM ET");
}
