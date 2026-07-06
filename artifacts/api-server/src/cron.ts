import cron from "node-cron";
import {
  db,
  companiesTable,
  leadsTable,
  usersTable,
  userMembershipsTable,
  notificationsTable,
  dailyReportPhotosTable,
  projectDocumentsTable,
  clientPortalUploadsTable,
  submissionPhotosTable,
  scansTable,
  tradehubPostMediaTable,
  tradehubProfilesTable,
  fileAttachmentsTable,
} from "@workspace/db";
import { buildDigest } from "./lib/digest.js";
import { buildDigestHtml } from "./lib/digestTemplate.js";
import { sendEmail } from "./lib/mailer.js";
import { buildCredentialExpiryHtml } from "./lib/corAlerts.js";
import { sendOverdueReminders } from "./lib/invoiceReminders.js";
import { checkEvidenceGaps } from "./services/evidenceGapMonitor.js";
import { logger } from "./lib/logger.js";
import { eq, and, sql, lt, inArray } from "drizzle-orm";
import { ObjectStorageService } from "./lib/objectStorage.js";
import {
  getExpiringSoonCredentials,
  getCompanySafetyManagerEmails,
  hasCredentialAlertBeenSent,
  recordCredentialAlert,
} from "./repositories/cor/index.js";

// Distributed cron lock keys — unique per job, stored in PostgreSQL advisory locks.
// These integers are arbitrary but must never collide with other advisory lock users.
const LOCK = { DIGEST: 7001, INVOICE_REMINDERS: 7002, IDLE_LEADS: 7003, ORPHAN_CLEANUP: 7004, CREDENTIAL_ALERTS: 7005, EVIDENCE_GAP_MONITOR: 7006 } as const;

/**
 * Attempt to acquire a PostgreSQL session-level advisory lock.
 * Returns true if the lock was acquired (this instance should run the job).
 * Returns false if another instance already holds it (skip silently).
 * pg_try_advisory_lock is non-blocking — it never waits.
 */
async function tryAdvisoryLock(key: number): Promise<boolean> {
  try {
    const result = await db.execute(sql`SELECT pg_try_advisory_lock(${key}::bigint) AS acquired`);
    return Boolean((result.rows?.[0] as any)?.acquired ?? (result as any)[0]?.acquired);
  } catch {
    // If the DB call itself fails, allow the job to run — better to double-send
    // once than to silently skip forever.
    return true;
  }
}

async function releaseAdvisoryLock(key: number): Promise<void> {
  try {
    await db.execute(sql`SELECT pg_advisory_unlock(${key}::bigint)`);
  } catch { /* ignore */ }
}

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

/**
 * Collect every objectPath currently referenced in any DB table.
 * Returns a Set of canonical /objects/... paths.
 */
async function collectReferencedObjectPaths(): Promise<Set<string>> {
  const paths = new Set<string>();

  const [photos, docs, portalUploads, subPhotos, scanRows, postMedia, profiles, attachments] =
    await Promise.all([
      db.select({ p: dailyReportPhotosTable.objectPath }).from(dailyReportPhotosTable),
      db.select({ p: projectDocumentsTable.objectPath }).from(projectDocumentsTable),
      db.select({ p: clientPortalUploadsTable.objectPath }).from(clientPortalUploadsTable),
      db.select({ p: submissionPhotosTable.objectPath }).from(submissionPhotosTable),
      db.select({ p: scansTable.objectPath }).from(scansTable),
      db.select({ p: tradehubPostMediaTable.objectPath }).from(tradehubPostMediaTable),
      db.select({ p: tradehubProfilesTable.voiceIntroObjectPath }).from(tradehubProfilesTable),
      db.select({ p: fileAttachmentsTable.objectPath }).from(fileAttachmentsTable),
    ]);

  for (const rows of [photos, docs, portalUploads, subPhotos, scanRows, postMedia, attachments]) {
    for (const row of rows) {
      if (row.p) paths.add(row.p);
    }
  }
  for (const row of profiles) {
    if (row.p) paths.add(row.p);
  }

  return paths;
}

export async function cleanupOrphanedStorageObjects(): Promise<{
  scanned: number;
  deleted: number;
  errors: number;
}> {
  const objectStorageService = new ObjectStorageService();

  let allGcsPaths: string[];
  try {
    allGcsPaths = await objectStorageService.listAllPrivateObjectPaths();
  } catch (err) {
    // Object storage not configured in this environment — skip silently.
    logger.warn({ err }, "Orphan cleanup: could not list GCS objects — skipping");
    return { scanned: 0, deleted: 0, errors: 0 };
  }

  const referencedPaths = await collectReferencedObjectPaths();

  const orphans = allGcsPaths.filter((p) => !referencedPaths.has(p));
  logger.info(
    { total: allGcsPaths.length, referenced: referencedPaths.size, orphans: orphans.length },
    "Orphan cleanup: scan complete",
  );

  let deleted = 0;
  let errors = 0;

  for (const orphanPath of orphans) {
    try {
      await objectStorageService.deleteObjectByPath(orphanPath);
      deleted++;
      logger.info({ objectPath: orphanPath }, "Orphan cleanup: deleted orphaned object");
    } catch (err) {
      errors++;
      logger.error({ err, objectPath: orphanPath }, "Orphan cleanup: failed to delete object");
    }
  }

  return { scanned: allGcsPaths.length, deleted, errors };
}

const CREDENTIAL_LABELS: Record<string, string> = {
  working_at_heights: "Working at Heights",
  whmis: "WHMIS",
  cor_training: "COR Training",
  first_aid: "First Aid",
  fall_protection: "Fall Protection",
  confined_space: "Confined Space",
  elevated_work_platform: "Elevated Work Platform",
};

export async function sendCredentialExpiryAlerts(): Promise<{
  alerted: number;
  skipped: number;
  errors: number;
}> {
  let alerted = 0;
  let skipped = 0;
  let errors = 0;

  const appUrl = process.env["APP_BASE_URL"] ?? null;

  // Fetch credentials in both the 30-day window (28–32 days) and 60-day window (58–62 days)
  const [thirtyDay, sixtyDay] = await Promise.all([
    getExpiringSoonCredentials(28, 32),
    getExpiringSoonCredentials(58, 62),
  ]);

  const candidates: Array<{ cred: (typeof thirtyDay)[0]; alertType: "30_day" | "60_day" }> = [
    ...thirtyDay.map((c) => ({ cred: c, alertType: "30_day" as const })),
    ...sixtyDay.map((c) => ({ cred: c, alertType: "60_day" as const })),
  ];

  // Cache safety manager emails per company to avoid repeated queries
  const managerEmailCache = new Map<number, string[]>();

  for (const { cred, alertType } of candidates) {
    try {
      const alreadySent = await hasCredentialAlertBeenSent({
        companyId: cred.companyId,
        userId: cred.userId,
        credentialType: cred.credentialType,
        alertType,
        sentForExpiry: cred.expirationDate,
      });

      if (alreadySent) {
        skipped++;
        continue;
      }

      // Collect recipients: worker + safety managers
      if (!managerEmailCache.has(cred.companyId)) {
        const managers = await getCompanySafetyManagerEmails(cred.companyId);
        managerEmailCache.set(cred.companyId, managers);
      }
      const managerEmails = managerEmailCache.get(cred.companyId) ?? [];
      const to = [...new Set([cred.workerEmail, ...managerEmails].filter(Boolean))];

      if (to.length === 0) {
        skipped++;
        continue;
      }

      const label = CREDENTIAL_LABELS[cred.credentialType] ?? cred.credentialType;
      const workerName = `${cred.workerFirstName} ${cred.workerLastName}`.trim();

      const html = buildCredentialExpiryHtml({
        workerName,
        credentialType: cred.credentialType,
        credentialLabel: label,
        expiryDate: cred.expirationDate,
        daysRemaining: cred.daysRemaining,
        appUrl,
      });

      const daysLabel = alertType === "30_day" ? "30" : "60";
      const subject = `[${daysLabel}-Day Alert] ${workerName}'s ${label} expires ${cred.expirationDate}`;

      await sendEmail({
        to,
        subject,
        html,
        apiKey: cred.companyResendApiKey,
        from: cred.companyDigestFromEmail,
      });

      // Log to prevent duplicate sends
      await Promise.all(
        to.map((email) =>
          recordCredentialAlert({
            companyId: cred.companyId,
            userId: cred.userId,
            credentialType: cred.credentialType,
            alertType,
            sentForExpiry: cred.expirationDate,
            sentToEmail: email,
          }),
        ),
      );

      logger.info(
        { companyId: cred.companyId, userId: cred.userId, credentialType: cred.credentialType, alertType, daysRemaining: cred.daysRemaining },
        "Credential expiry alert sent",
      );
      alerted++;
    } catch (err) {
      logger.error({ err, userId: cred.userId, credentialType: cred.credentialType }, "Credential expiry alert failed");
      errors++;
    }
  }

  return { alerted, skipped, errors };
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
      // In-process guard (same instance overlap)
      if (digestRunning) {
        logger.warn("Daily digest cron skipped — previous run still in progress (in-process)");
        return;
      }
      // Distributed guard (multi-instance): only one server runs the job
      const locked = await tryAdvisoryLock(LOCK.DIGEST);
      if (!locked) {
        logger.warn("Daily digest cron skipped — advisory lock held by another instance");
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
        await releaseAdvisoryLock(LOCK.DIGEST);
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
        logger.warn("Overdue invoice reminder cron skipped — previous run still in progress (in-process)");
        return;
      }
      const locked = await tryAdvisoryLock(LOCK.INVOICE_REMINDERS);
      if (!locked) {
        logger.warn("Overdue invoice reminder cron skipped — advisory lock held by another instance");
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
        await releaseAdvisoryLock(LOCK.INVOICE_REMINDERS);
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
        logger.warn("Idle lead notification cron skipped — previous run still in progress (in-process)");
        return;
      }
      const locked = await tryAdvisoryLock(LOCK.IDLE_LEADS);
      if (!locked) {
        logger.warn("Idle lead notification cron skipped — advisory lock held by another instance");
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
        await releaseAdvisoryLock(LOCK.IDLE_LEADS);
      }
    },
    { timezone: "America/Toronto" },
  );
  logger.info("Idle lead notification cron scheduled: 9:00 AM ET");

  // 6:00 AM ET every day — COR credential expiry alerts (30-day and 60-day windows)
  let credAlertRunning = false;
  cron.schedule(
    "0 6 * * *",
    async () => {
      if (credAlertRunning) {
        logger.warn("Credential expiry alert cron skipped — previous run still in progress (in-process)");
        return;
      }
      const locked = await tryAdvisoryLock(LOCK.CREDENTIAL_ALERTS);
      if (!locked) {
        logger.warn("Credential expiry alert cron skipped — advisory lock held by another instance");
        return;
      }
      credAlertRunning = true;
      try {
        logger.info("Credential expiry alert cron triggered");
        const result = await sendCredentialExpiryAlerts();
        logger.info(result, "Credential expiry alert cron complete");
      } catch (err) {
        logger.error({ err }, "Unhandled error in credential expiry alert cron");
      } finally {
        credAlertRunning = false;
        await releaseAdvisoryLock(LOCK.CREDENTIAL_ALERTS);
      }
    },
    { timezone: "America/Toronto" },
  );
  logger.info("Credential expiry alert cron scheduled: 6:00 AM ET");

  // 2:00 AM ET every Sunday — orphaned GCS file cleanup
  // Runs weekly to avoid hammering the GCS list API daily.
  let orphanRunning = false;
  cron.schedule(
    "0 2 * * 0",
    async () => {
      if (orphanRunning) {
        logger.warn("Orphan cleanup cron skipped — previous run still in progress");
        return;
      }
      const locked = await tryAdvisoryLock(LOCK.ORPHAN_CLEANUP);
      if (!locked) {
        logger.warn("Orphan cleanup cron skipped — advisory lock held by another instance");
        return;
      }
      orphanRunning = true;
      try {
        logger.info("Orphan cleanup cron triggered");
        const result = await cleanupOrphanedStorageObjects();
        logger.info(result, "Orphan cleanup cron complete");
      } catch (err) {
        logger.error({ err }, "Unhandled error in orphan cleanup cron");
      } finally {
        orphanRunning = false;
        await releaseAdvisoryLock(LOCK.ORPHAN_CLEANUP);
      }
    },
    { timezone: "America/Toronto" },
  );
  logger.info("Orphan cleanup cron scheduled: 2:00 AM ET Sundays");

  // Every 4 hours — COR evidence gap monitor
  // Checks active projects for stale IHSA element evidence and notifies foremen.
  // 4-hour cadence ensures a 24-hour housekeeping gap is caught within the same workday.
  let evidenceGapRunning = false;
  cron.schedule(
    "0 */4 * * *",
    async () => {
      if (evidenceGapRunning) {
        logger.warn("Evidence gap monitor cron skipped — previous run still in progress");
        return;
      }
      const locked = await tryAdvisoryLock(LOCK.EVIDENCE_GAP_MONITOR);
      if (!locked) {
        logger.warn("Evidence gap monitor cron skipped — advisory lock held by another instance");
        return;
      }
      evidenceGapRunning = true;
      try {
        logger.info("Evidence gap monitor cron triggered");
        const result = await checkEvidenceGaps();
        logger.info(result, "Evidence gap monitor cron complete");
      } catch (err) {
        logger.error({ err }, "Unhandled error in evidence gap monitor cron");
      } finally {
        evidenceGapRunning = false;
        await releaseAdvisoryLock(LOCK.EVIDENCE_GAP_MONITOR);
      }
    },
    { timezone: "America/Toronto" },
  );
  logger.info("Evidence gap monitor cron scheduled: every 4 hours");
}
