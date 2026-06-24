import {
  db,
  projectsTable,
  corAuditTrailTable,
  inspectionsTable,
  dailyLogsTable,
  notificationsTable,
  userMembershipsTable,
} from "@workspace/db";
import { and, inArray, sql } from "drizzle-orm";
import { logger } from "../lib/logger.js";

// Core IHSA elements that require recurring active evidence on a live site.
// Administrative/policy elements (management commitment, emergency plans, etc.)
// are intentionally excluded — they're set once, not logged daily/weekly.
const CORE_ELEMENTS = [
  {
    key: "element_4",
    label: "Ongoing Inspections",
    windowHours: 7 * 24,   // safety inspection must be logged at least weekly
    cooldownHours: 6 * 24, // don't re-notify until 6 days after last notification
  },
  {
    key: "element_10",
    label: "Workplace Housekeeping",
    windowHours: 24,        // housekeeping must be logged daily
    cooldownHours: 20,      // suppress re-alerts for 20 h to allow for late-day submission
  },
  {
    key: "element_3",
    label: "Hazard Control Measures",
    windowHours: 7 * 24,
    cooldownHours: 6 * 24,
  },
  {
    key: "element_9",
    label: "Worker Participation",
    windowHours: 14 * 24,
    cooldownHours: 13 * 24,
  },
] as const;

type CoreElement = (typeof CORE_ELEMENTS)[number];

interface EvidenceGap {
  projectId: number;
  projectName: string;
  companyId: number;
  element: CoreElement;
  lastEvidenceAt: Date | null;
  hoursSinceLast: number;
}

export interface EvidenceGapResult {
  gaps: number;
  notified: number;
  skipped: number;
  errors: number;
}

export async function checkEvidenceGaps(): Promise<EvidenceGapResult> {
  let notified = 0;
  let skipped = 0;
  let errors = 0;

  const now = new Date();
  const monitoredKeys = CORE_ELEMENTS.map((e) => e.key);

  // ── 1. Active projects ─────────────────────────────────────────────────────
  const activeProjects = await db
    .select({
      id: projectsTable.id,
      name: projectsTable.name,
      companyId: projectsTable.companyId,
      createdAt: projectsTable.createdAt,
    })
    .from(projectsTable)
    .where(inArray(projectsTable.status, ["active", "planning"]));

  if (activeProjects.length === 0) return { gaps: 0, notified: 0, skipped: 0, errors: 0 };

  const activeProjectIds = activeProjects.map((p) => p.id);

  // ── 2. Max evidence timestamp per (project, element) — COR audit trail ────
  // Single aggregation query across all monitored elements and all active projects.
  const auditRows = await db
    .select({
      projectId: corAuditTrailTable.projectId,
      ihsaElement: corAuditTrailTable.ihsaElement,
      lastAt: sql<string>`MAX(${corAuditTrailTable.createdAt})`.as("last_at"),
    })
    .from(corAuditTrailTable)
    .where(
      and(
        inArray(corAuditTrailTable.projectId, activeProjectIds),
        inArray(corAuditTrailTable.ihsaElement, monitoredKeys as any),
      ),
    )
    .groupBy(corAuditTrailTable.projectId, corAuditTrailTable.ihsaElement);

  // ── 3. Supplement element_4: raw inspections table ────────────────────────
  // Inspections may not always flow through the COR processor before the monitor runs.
  const inspectionRows = await db
    .select({
      projectId: inspectionsTable.projectId,
      lastAt: sql<string>`MAX(${inspectionsTable.createdAt})`.as("last_at"),
    })
    .from(inspectionsTable)
    .where(
      and(
        inArray(inspectionsTable.projectId, activeProjectIds),
        sql`${inspectionsTable.status} = 'submitted'`,
      ),
    )
    .groupBy(inspectionsTable.projectId);

  // ── 4. Supplement element_10: raw daily logs table ────────────────────────
  const dailyLogRows = await db
    .select({
      projectId: dailyLogsTable.projectId,
      lastAt: sql<string>`MAX(${dailyLogsTable.createdAt})`.as("last_at"),
    })
    .from(dailyLogsTable)
    .where(inArray(dailyLogsTable.projectId, activeProjectIds))
    .groupBy(dailyLogsTable.projectId);

  // ── 5. Build evidence map: projectId → elementKey → lastEvidenceAt ────────
  const evidenceMap = new Map<number, Map<string, Date>>();

  const upsertEvidence = (projectId: number, elementKey: string, raw: string) => {
    if (!projectId) return;
    const candidate = new Date(raw);
    if (!evidenceMap.has(projectId)) evidenceMap.set(projectId, new Map());
    const prev = evidenceMap.get(projectId)!.get(elementKey);
    if (!prev || candidate > prev) evidenceMap.get(projectId)!.set(elementKey, candidate);
  };

  for (const row of auditRows) upsertEvidence(row.projectId, row.ihsaElement, row.lastAt);
  for (const row of inspectionRows) if (row.projectId) upsertEvidence(row.projectId, "element_4", row.lastAt);
  for (const row of dailyLogRows) upsertEvidence(row.projectId, "element_10", row.lastAt);

  // ── 6. Identify gaps ──────────────────────────────────────────────────────
  const gaps: EvidenceGap[] = [];

  for (const project of activeProjects) {
    const elementEvidence = evidenceMap.get(project.id);
    const projectAgeMs = now.getTime() - project.createdAt.getTime();

    for (const el of CORE_ELEMENTS) {
      // Don't flag a gap if the project hasn't been alive for a full compliance window yet.
      if (projectAgeMs < el.windowHours * 60 * 60 * 1000) continue;

      const lastAt = elementEvidence?.get(el.key) ?? null;
      const hoursSinceLast = lastAt
        ? (now.getTime() - lastAt.getTime()) / (1000 * 60 * 60)
        : Infinity;

      if (hoursSinceLast >= el.windowHours) {
        gaps.push({
          projectId: project.id,
          projectName: project.name,
          companyId: project.companyId,
          element: el,
          lastEvidenceAt: lastAt,
          hoursSinceLast,
        });
      }
    }
  }

  if (gaps.length === 0) return { gaps: 0, notified: 0, skipped: 0, errors: 0 };

  // ── 7. Fetch foremen for all affected companies in one query ───────────────
  const affectedCompanyIds = [...new Set(gaps.map((g) => g.companyId))];

  const foremanRows = await db
    .select({
      userId: userMembershipsTable.userId,
      companyId: userMembershipsTable.companyId,
    })
    .from(userMembershipsTable)
    .where(
      and(
        inArray(userMembershipsTable.companyId, affectedCompanyIds),
        sql`${userMembershipsTable.role} = 'foreman'`,
        sql`${userMembershipsTable.isActive} = true`,
      ),
    );

  const foremansByCompany = new Map<number, number[]>();
  for (const row of foremanRows) {
    const arr = foremansByCompany.get(row.companyId) ?? [];
    arr.push(row.userId);
    foremansByCompany.set(row.companyId, arr);
  }

  // ── 8. Dedup: suppress if an identical gap notification was sent recently ──
  const allForemanIds = foremanRows.map((r) => r.userId);
  const allGapProjectIds = [...new Set(gaps.map((g) => g.projectId))];

  const alreadyNotified = new Set<string>(); // "userId:projectId:elementKey"

  if (allForemanIds.length > 0) {
    const maxCooldownMs = Math.max(...CORE_ELEMENTS.map((e) => e.cooldownHours)) * 60 * 60 * 1000;
    const cooldownCutoff = new Date(now.getTime() - maxCooldownMs);

    const recentNotifs = await db
      .select({
        userId: notificationsTable.userId,
        referenceId: notificationsTable.referenceId,
        body: notificationsTable.body,
        createdAt: notificationsTable.createdAt,
      })
      .from(notificationsTable)
      .where(
        and(
          sql`${notificationsTable.type} = 'compliance_gap'`,
          inArray(notificationsTable.userId, allForemanIds),
          inArray(notificationsTable.referenceId, allGapProjectIds),
          sql`${notificationsTable.createdAt} >= ${cooldownCutoff.toISOString()}`,
        ),
      );

    for (const n of recentNotifs) {
      // Body is prefixed with "[element_X]" — extract the key to build the dedup set.
      const match = n.body.match(/\[(element_\d+)\]/);
      if (!match) continue;
      const elementKey = match[1];
      const el = CORE_ELEMENTS.find((e) => e.key === elementKey);
      if (!el) continue;
      const sentHoursAgo = (now.getTime() - n.createdAt.getTime()) / (1000 * 60 * 60);
      if (sentHoursAgo < el.cooldownHours) {
        alreadyNotified.add(`${n.userId}:${n.referenceId}:${elementKey}`);
      }
    }
  }

  // ── 9. Build notification inserts ─────────────────────────────────────────
  const toInsert: Array<{
    userId: number;
    type: string;
    title: string;
    body: string;
    referenceId: number;
    projectId: number;
  }> = [];

  for (const gap of gaps) {
    const foremen = foremansByCompany.get(gap.companyId) ?? [];
    if (foremen.length === 0) {
      skipped++;
      continue;
    }

    const ageDescription =
      gap.lastEvidenceAt === null
        ? "No entry has ever been submitted for this element."
        : `Last logged ${Math.round(gap.hoursSinceLast)} hour${gap.hoursSinceLast >= 2 ? "s" : ""} ago.`;

    for (const foremanId of foremen) {
      const key = `${foremanId}:${gap.projectId}:${gap.element.key}`;
      if (alreadyNotified.has(key)) {
        skipped++;
        continue;
      }

      toInsert.push({
        userId: foremanId,
        type: "compliance_gap",
        title: `Log Required: ${gap.element.label}`,
        body: `[${gap.element.key}] Project "${gap.projectName}" needs a ${gap.element.label} log. ${ageDescription} Please submit a quick entry to stay COR-compliant.`,
        referenceId: gap.projectId,
        projectId: gap.projectId,
      });
    }
  }

  if (toInsert.length > 0) {
    try {
      await db.insert(notificationsTable).values(toInsert);
      notified = toInsert.length;
      logger.info(
        { notified, gaps: gaps.length },
        "Evidence gap monitor: notifications inserted",
      );
    } catch (err) {
      logger.error({ err }, "Evidence gap monitor: failed to insert notifications");
      errors++;
    }
  }

  return { gaps: gaps.length, notified, skipped, errors };
}
