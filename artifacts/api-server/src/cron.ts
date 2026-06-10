import cron from "node-cron";
import { db, companiesTable, leadsTable, usersTable, userMembershipsTable, notificationsTable } from "@workspace/db";
import { buildDigest } from "./lib/digest.js";
import { buildDigestHtml } from "./lib/digestTemplate.js";
import { sendEmail } from "./lib/mailer.js";
import { sendOverdueReminders } from "./lib/invoiceReminders.js";
import { logger } from "./lib/logger.js";
import { eq, and, sql, lt, inArray } from "drizzle-orm";

const CRON_PAGE_SIZE = 50;

export async function sendDigestForAllCompanies(): Promise<{
  sent: number;
  skipped: number;
  errors: number;
}> {
  let sent = 0;
  let skipped = 0;
  let errors = 0;
  let offset = 0;

  // H3/H4: Process companies in pages to avoid loading all rows at once
  while (true) {
    const companies = await db
      .select({
        id: companiesTable.id,
        name: companiesTable.name,
        digestFromEmail: companiesTable.digestFromEmail,
        resendApiKey: companiesTable.resendApiKey,
      })
      .from(companiesTable)
      .limit(CRON_PAGE_SIZE)
      .offset(offset);

    if (companies.length === 0) break;
    offset += CRON_PAGE_SIZE;

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
  } // end while page loop

  return { sent, skipped, errors };
}

async function sendIdleLeadNotifications(): Promise<{ notified: number; skipped: number }> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  // H2: Batch everything into 3 queries instead of N×M per-row queries

  // 1. All idle leads across all companies in one query
  const idleLeads = await db
    .select()
    .from(leadsTable)
    .where(
      and(
        sql`${leadsTable.stage} NOT IN ('won', 'lost')`,
        lt(leadsTable.updatedAt, sevenDaysAgo),
      ),
    );

  if (idleLeads.length === 0) return { notified: 0, skipped: 0 };

  const companyIds = [...new Set(idleLeads.map((l) => l.companyId))];

  // 2. All owners/foremen for those companies in one query
  const recipients = await db
    .select({ userId: usersTable.id, companyId: userMembershipsTable.companyId })
    .from(usersTable)
    .innerJoin(
      userMembershipsTable,
      and(
        eq(userMembershipsTable.userId, usersTable.id),
        inArray(userMembershipsTable.companyId, companyIds),
        sql`${userMembershipsTable.role} IN ('owner', 'foreman')`,
      ),
    );

  if (recipients.length === 0) return { notified: 0, skipped: 0 };

  // Build (userId, leadId) candidate pairs scoped by companyId
  const leadsByCompany = new Map<number, typeof idleLeads>();
  for (const lead of idleLeads) {
    const arr = leadsByCompany.get(lead.companyId) ?? [];
    arr.push(lead);
    leadsByCompany.set(lead.companyId, arr);
  }
  const pairs: Array<{ userId: number; lead: typeof idleLeads[number] }> = [];
  for (const r of recipients) {
    for (const lead of (leadsByCompany.get(r.companyId) ?? [])) {
      pairs.push({ userId: r.userId, lead });
    }
  }
  if (pairs.length === 0) return { notified: 0, skipped: 0 };

  // 3. Fetch all already-sent idle_lead notifications for these leads in one query
  const leadIds = [...new Set(pairs.map((p) => p.lead.id))];
  const existing = await db
    .select({ userId: notificationsTable.userId, referenceId: notificationsTable.referenceId })
    .from(notificationsTable)
    .where(
      and(
        eq(notificationsTable.type, "idle_lead"),
        inArray(notificationsTable.referenceId, leadIds),
        sql`${notificationsTable.createdAt} > NOW() - INTERVAL '7 days'`,
      ),
    );
  const notifiedSet = new Set(existing.map((n) => `${n.userId}:${n.referenceId}`));

  // 4. Build inserts for pairs not already notified
  const toInsert = pairs
    .filter((p) => !notifiedSet.has(`${p.userId}:${p.lead.id}`))
    .map((p) => {
      const daysIdle = Math.floor((Date.now() - p.lead.updatedAt.getTime()) / (24 * 60 * 60 * 1000));
      return {
        userId: p.userId,
        type: "idle_lead" as const,
        title: "Lead needs follow-up",
        body: `"${p.lead.title}" has had no activity for ${daysIdle} days.`,
        referenceId: p.lead.id,
        projectId: p.lead.convertedProjectId ?? 0,
      };
    });

  if (toInsert.length > 0) {
    await db.insert(notificationsTable).values(toInsert);
  }

  return { notified: toInsert.length, skipped: pairs.length - toInsert.length };
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
