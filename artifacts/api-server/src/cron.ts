import cron from "node-cron";
import { db, companiesTable, leadsTable, usersTable, userMembershipsTable, notificationsTable } from "@workspace/db";
import { buildDigest } from "./lib/digest.js";
import { buildDigestHtml } from "./lib/digestTemplate.js";
import { sendEmail } from "./lib/mailer.js";
import { sendOverdueReminders } from "./lib/invoiceReminders.js";
import { logger } from "./lib/logger.js";
import { eq, and, sql, lt } from "drizzle-orm";

export async function sendDigestForAllCompanies(): Promise<{
  sent: number;
  skipped: number;
  errors: number;
}> {
  const companies = await db
    .select({
      id: companiesTable.id,
      name: companiesTable.name,
      digestFromEmail: companiesTable.digestFromEmail,
      resendApiKey: companiesTable.resendApiKey,
    })
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

      await sendEmail({ to, subject, html, from: company.digestFromEmail, apiKey: company.resendApiKey });
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

async function sendIdleLeadNotifications(): Promise<{ notified: number; skipped: number }> {
  const companies = await db
    .select({ id: companiesTable.id })
    .from(companiesTable);

  let notified = 0;
  let skipped = 0;

  for (const company of companies) {
    try {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      // Find idle leads (no update in 7+ days, still active)
      const idleLeads = await db
        .select()
        .from(leadsTable)
        .where(
          and(
            eq(leadsTable.companyId, company.id),
            sql`${leadsTable.stage} NOT IN ('won', 'lost')`,
            lt(leadsTable.updatedAt, sevenDaysAgo),
          ),
        );

      if (idleLeads.length === 0) {
        skipped++;
        continue;
      }

      // Get owners and foremen to notify
      const recipients = await db
        .select({
          id: usersTable.id,
          email: usersTable.email,
          firstName: usersTable.firstName,
          lastName: usersTable.lastName,
        })
        .from(usersTable)
        .innerJoin(
          userMembershipsTable,
          and(
            eq(userMembershipsTable.userId, usersTable.id),
            eq(userMembershipsTable.companyId, company.id),
            sql`${userMembershipsTable.role} IN ('owner', 'foreman')`,
          ),
        );

      for (const user of recipients) {
        for (const lead of idleLeads) {
          // Check if we already notified this user about this lead in the last 7 days
          const [existing] = await db
            .select({ id: notificationsTable.id })
            .from(notificationsTable)
            .where(
              and(
                eq(notificationsTable.userId, user.id),
                eq(notificationsTable.type, "idle_lead"),
                eq(notificationsTable.referenceId, lead.id),
                sql`${notificationsTable.createdAt} > NOW() - INTERVAL '7 days'`,
              ),
            )
            .limit(1);

          if (existing) continue;

          const daysIdle = Math.floor(
            (Date.now() - lead.updatedAt.getTime()) / (24 * 60 * 60 * 1000),
          );

          await db.insert(notificationsTable).values({
            userId: user.id,
            type: "idle_lead",
            title: "Lead needs follow-up",
            body: `"${lead.title}" has had no activity for ${daysIdle} days.`,
            referenceId: lead.id,
            projectId: lead.convertedProjectId ?? 0,
          });
          notified++;
        }
      }
    } catch (err) {
      logger.error({ err, companyId: company.id }, "Error sending idle lead notifications");
    }
  }

  return { notified, skipped };
}

export function startDailyCron(): void {
  // Re-entry guards — prevent overlapping runs if a job takes longer than its interval.
  let digestRunning = false;
  let remindersRunning = false;
  let idleLeadsRunning = false;

  // 7:00 AM Eastern every day — daily digest
  cron.schedule(
    "0 7 * * *",
    async () => {
      if (digestRunning) {
        logger.warn("Daily digest cron skipped — previous run still in progress");
        return;
      }
      digestRunning = true;
      try {
        logger.info("Daily digest cron triggered");
        const result = await sendDigestForAllCompanies();
        logger.info(result, "Daily digest cron complete");
      } catch (err) {
        logger.error({ err }, "Unhandled error in daily digest cron");
      } finally {
        digestRunning = false;
      }
    },
    { timezone: "America/Toronto" },
  );
  logger.info("Daily digest cron scheduled: 7:00 AM ET");

  // 8:00 AM Eastern every day — overdue invoice reminders
  cron.schedule(
    "0 8 * * *",
    async () => {
      if (remindersRunning) {
        logger.warn("Overdue invoice reminder cron skipped — previous run still in progress");
        return;
      }
      remindersRunning = true;
      try {
        logger.info("Overdue invoice reminder cron triggered");
        const result = await sendOverdueReminders();
        logger.info(result, "Overdue invoice reminder cron complete");
      } catch (err) {
        logger.error({ err }, "Unhandled error in overdue invoice reminder cron");
      } finally {
        remindersRunning = false;
      }
    },
    { timezone: "America/Toronto" },
  );
  logger.info("Overdue invoice reminder cron scheduled: 8:00 AM ET");

  // 9:00 AM Eastern every day — idle lead notifications
  cron.schedule(
    "0 9 * * *",
    async () => {
      if (idleLeadsRunning) {
        logger.warn("Idle lead notification cron skipped — previous run still in progress");
        return;
      }
      idleLeadsRunning = true;
      try {
        logger.info("Idle lead notification cron triggered");
        const result = await sendIdleLeadNotifications();
        logger.info(result, "Idle lead notification cron complete");
      } catch (err) {
        logger.error({ err }, "Unhandled error in idle lead notification cron");
      } finally {
        idleLeadsRunning = false;
      }
    },
    { timezone: "America/Toronto" },
  );
  logger.info("Idle lead notification cron scheduled: 9:00 AM ET");
}
