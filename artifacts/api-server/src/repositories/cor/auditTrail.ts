import { db } from "@workspace/db";
import {
  corAuditTrailTable,
  corVoiceActionLogsTable,
  capaTicketsTable,
  inspectionsTable,
  projectsTable,
  usersTable,
  userMembershipsTable,
  workerCredentialsTable,
  policyDocumentsTable,
  policySignoffsTable,
  subcontractorsTable,
  type InsertCorAuditTrail,
  type InsertCorVoiceActionLog,
  type CorAuditTrail,
  type CorVoiceActionLog,
  type CapaTicket,
  type InsertCapaTicket,
} from "@workspace/db";
import { eq, and, sql, desc, asc, inArray, isNull, gte, lte, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

// ── Shared types ──────────────────────────────────────────────────────────────

export interface CorDashboard {
  overallScore: number;
  totalEntries: number;
  scoreByElement: Array<{
    ihsaElement: string;
    ihsaElementName: string;
    averageScore: number;
    entryCount: number;
    failCount: number;
  }>;
  recentFindings: CorAuditTrail[];
}

// ── Admin / Owner-Foreman queries ─────────────────────────────────────────────

export async function getProjectCorDashboard(
  companyId: number,
  projectId: number,
): Promise<CorDashboard> {
  const rows = await db
    .select({
      ihsaElement: corAuditTrailTable.ihsaElement,
      ihsaElementName: corAuditTrailTable.ihsaElementName,
      averageScore: sql<number>`ROUND(AVG(${corAuditTrailTable.complianceScore}), 1)`,
      entryCount: sql<number>`COUNT(*)::int`,
      failCount: sql<number>`SUM(CASE WHEN ${corAuditTrailTable.findingType} = 'fail' THEN 1 ELSE 0 END)::int`,
    })
    .from(corAuditTrailTable)
    .where(
      and(
        eq(corAuditTrailTable.companyId, companyId),
        eq(corAuditTrailTable.projectId, projectId),
      ),
    )
    .groupBy(corAuditTrailTable.ihsaElement, corAuditTrailTable.ihsaElementName)
    .orderBy(asc(corAuditTrailTable.ihsaElement));

  const totalEntries = rows.reduce((s, r) => s + r.entryCount, 0);
  const overallScore =
    totalEntries === 0
      ? 100
      : Math.round(rows.reduce((s, r) => s + r.averageScore * r.entryCount, 0) / totalEntries);

  const recentFindings = await db
    .select()
    .from(corAuditTrailTable)
    .where(
      and(
        eq(corAuditTrailTable.companyId, companyId),
        eq(corAuditTrailTable.projectId, projectId),
      ),
    )
    .orderBy(desc(corAuditTrailTable.createdAt))
    .limit(10);

  return {
    overallScore,
    totalEntries,
    scoreByElement: rows,
    recentFindings,
  };
}

export async function getCompanyCorSummary(companyId: number) {
  return db
    .select({
      projectId: corAuditTrailTable.projectId,
      overallScore: sql<number>`ROUND(AVG(${corAuditTrailTable.complianceScore}), 1)`,
      entryCount: sql<number>`COUNT(*)::int`,
    })
    .from(corAuditTrailTable)
    .where(eq(corAuditTrailTable.companyId, companyId))
    .groupBy(corAuditTrailTable.projectId)
    .orderBy(asc(corAuditTrailTable.projectId));
}

export async function getCorAuditTrail(
  companyId: number,
  projectId: number,
  opts: {
    limit?: number;
    offset?: number;
    ihsaElement?: string;
    findingType?: string;
  } = {},
): Promise<{ rows: CorAuditTrail[]; total: number }> {
  const { limit = 50, offset = 0, ihsaElement, findingType } = opts;

  const conditions = [
    eq(corAuditTrailTable.companyId, companyId),
    eq(corAuditTrailTable.projectId, projectId),
    ...(ihsaElement ? [eq(corAuditTrailTable.ihsaElement, ihsaElement as any)] : []),
    ...(findingType ? [eq(corAuditTrailTable.findingType, findingType)] : []),
  ];

  const [rows, [{ total }]] = await Promise.all([
    db
      .select()
      .from(corAuditTrailTable)
      .where(and(...conditions))
      .orderBy(desc(corAuditTrailTable.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ total: sql<number>`COUNT(*)::int` })
      .from(corAuditTrailTable)
      .where(and(...conditions)),
  ]);

  return { rows, total };
}

export async function getVoiceLogsForProject(
  companyId: number,
  projectId: number,
): Promise<CorVoiceActionLog[]> {
  return db
    .select()
    .from(corVoiceActionLogsTable)
    .where(
      and(
        eq(corVoiceActionLogsTable.companyId, companyId),
        eq(corVoiceActionLogsTable.projectId, projectId),
      ),
    )
    .orderBy(desc(corVoiceActionLogsTable.createdAt));
}

// ── Worker self-scoped queries ─────────────────────────────────────────────────

export async function getMyCorAuditEntries(
  companyId: number,
  userId: number,
): Promise<CorAuditTrail[]> {
  return db
    .select()
    .from(corAuditTrailTable)
    .where(
      and(
        eq(corAuditTrailTable.companyId, companyId),
        eq(corAuditTrailTable.submittedByUserId, userId),
      ),
    )
    .orderBy(desc(corAuditTrailTable.createdAt))
    .limit(100);
}

export async function getMyVoiceLogs(
  companyId: number,
  userId: number,
): Promise<CorVoiceActionLog[]> {
  return db
    .select()
    .from(corVoiceActionLogsTable)
    .where(
      and(
        eq(corVoiceActionLogsTable.companyId, companyId),
        eq(corVoiceActionLogsTable.submittedByUserId, userId),
      ),
    )
    .orderBy(desc(corVoiceActionLogsTable.createdAt));
}

// ── Shared write ──────────────────────────────────────────────────────────────

export async function upsertCorAuditEntry(
  data: InsertCorAuditTrail,
): Promise<CorAuditTrail> {
  const [row] = await db
    .insert(corAuditTrailTable)
    .values(data)
    .onConflictDoUpdate({
      target: [
        corAuditTrailTable.companyId,
        corAuditTrailTable.sourceType,
        corAuditTrailTable.sourceRecordId,
        corAuditTrailTable.ihsaElement,
      ],
      set: {
        findingType: data.findingType,
        findingDescription: data.findingDescription,
        complianceScore: data.complianceScore,
        evidenceSnapshot: data.evidenceSnapshot,
        submittedByUserId: data.submittedByUserId,
        createdAt: new Date(),
      },
    })
    .returning();

  return row;
}

export async function createVoiceActionLog(
  data: InsertCorVoiceActionLog,
): Promise<CorVoiceActionLog> {
  const [row] = await db.insert(corVoiceActionLogsTable).values(data).returning();
  return row;
}

// ── CAPA Tickets ──────────────────────────────────────────────────────────────

const assignedUserAlias = alias(usersTable, "assigned_user");
const createdByUserAlias = alias(usersTable, "created_by_user");

export interface CapaWithDetails extends CapaTicket {
  assignedToName: string | null;
  createdByName: string | null;
}

export async function listCapaTickets(
  companyId: number,
  opts: { status?: string; limit?: number; offset?: number } = {},
): Promise<{ data: CapaWithDetails[]; total: number }> {
  const conditions = [eq(capaTicketsTable.companyId, companyId)];
  if (opts.status && opts.status !== "all") {
    conditions.push(sql`${capaTicketsTable.status} = ${opts.status}`);
  }

  const where = and(...conditions);
  const [totalRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(capaTicketsTable)
    .where(where);

  const rows = await db
    .select({
      ticket: capaTicketsTable,
      assignedToName: sql<string | null>`
        CASE WHEN ${assignedUserAlias.id} IS NOT NULL
          THEN ${assignedUserAlias.firstName} || ' ' || ${assignedUserAlias.lastName}
          ELSE NULL END`,
      createdByName: sql<string | null>`
        CASE WHEN ${createdByUserAlias.id} IS NOT NULL
          THEN ${createdByUserAlias.firstName} || ' ' || ${createdByUserAlias.lastName}
          ELSE NULL END`,
    })
    .from(capaTicketsTable)
    .leftJoin(assignedUserAlias, eq(capaTicketsTable.assignedToUserId, assignedUserAlias.id))
    .leftJoin(createdByUserAlias, eq(capaTicketsTable.createdByUserId, createdByUserAlias.id))
    .where(where)
    .orderBy(desc(capaTicketsTable.createdAt))
    .limit(opts.limit ?? 50)
    .offset(opts.offset ?? 0);

  return {
    data: rows.map((r) => ({ ...r.ticket, assignedToName: r.assignedToName, createdByName: r.createdByName })),
    total: totalRow?.count ?? 0,
  };
}

export async function getCapaTicket(
  companyId: number,
  id: number,
): Promise<CapaWithDetails | null> {
  const [row] = await db
    .select({
      ticket: capaTicketsTable,
      assignedToName: sql<string | null>`
        CASE WHEN ${assignedUserAlias.id} IS NOT NULL
          THEN ${assignedUserAlias.firstName} || ' ' || ${assignedUserAlias.lastName}
          ELSE NULL END`,
      createdByName: sql<string | null>`
        CASE WHEN ${createdByUserAlias.id} IS NOT NULL
          THEN ${createdByUserAlias.firstName} || ' ' || ${createdByUserAlias.lastName}
          ELSE NULL END`,
    })
    .from(capaTicketsTable)
    .leftJoin(assignedUserAlias, eq(capaTicketsTable.assignedToUserId, assignedUserAlias.id))
    .leftJoin(createdByUserAlias, eq(capaTicketsTable.createdByUserId, createdByUserAlias.id))
    .where(and(eq(capaTicketsTable.companyId, companyId), eq(capaTicketsTable.id, id)));

  if (!row) return null;
  return { ...row.ticket, assignedToName: row.assignedToName, createdByName: row.createdByName };
}

export async function createCapaTicket(data: InsertCapaTicket): Promise<CapaTicket> {
  const [row] = await db.insert(capaTicketsTable).values(data).returning();
  return row;
}

export async function updateCapaTicket(
  companyId: number,
  id: number,
  data: Partial<Pick<InsertCapaTicket, "title" | "description" | "priority" | "status" | "assignedToUserId" | "dueDate" | "ihsaElement">>,
): Promise<CapaTicket | null> {
  const [existing] = await db
    .select({ isLocked: capaTicketsTable.isLocked })
    .from(capaTicketsTable)
    .where(and(eq(capaTicketsTable.companyId, companyId), eq(capaTicketsTable.id, id)));

  if (!existing || existing.isLocked) return null;

  const [row] = await db
    .update(capaTicketsTable)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(capaTicketsTable.companyId, companyId), eq(capaTicketsTable.id, id)))
    .returning();
  return row ?? null;
}

export async function closeCapaTicket(
  companyId: number,
  id: number,
  opts: { closedByUserId: number; closureNotes: string; evidencePhotoUrl?: string },
): Promise<CapaTicket | null> {
  const [existing] = await db
    .select({ isLocked: capaTicketsTable.isLocked })
    .from(capaTicketsTable)
    .where(and(eq(capaTicketsTable.companyId, companyId), eq(capaTicketsTable.id, id)));

  if (!existing || existing.isLocked) return null;

  const [row] = await db
    .update(capaTicketsTable)
    .set({
      status: "closed",
      isLocked: true,
      closedAt: new Date(),
      closedByUserId: opts.closedByUserId,
      closureNotes: opts.closureNotes,
      evidencePhotoUrl: opts.evidencePhotoUrl ?? null,
      updatedAt: new Date(),
    })
    .where(and(eq(capaTicketsTable.companyId, companyId), eq(capaTicketsTable.id, id)))
    .returning();
  return row ?? null;
}

export async function voidCapaTicket(companyId: number, id: number): Promise<boolean> {
  const [existing] = await db
    .select({ isLocked: capaTicketsTable.isLocked })
    .from(capaTicketsTable)
    .where(and(eq(capaTicketsTable.companyId, companyId), eq(capaTicketsTable.id, id)));

  if (!existing || existing.isLocked) return false;

  const result = await db
    .update(capaTicketsTable)
    .set({ status: "void", updatedAt: new Date() })
    .where(and(eq(capaTicketsTable.companyId, companyId), eq(capaTicketsTable.id, id)));

  return (result.rowCount ?? 0) > 0;
}

export async function maybeAutoCreateCapa(auditEntry: CorAuditTrail): Promise<CapaTicket | null> {
  if (auditEntry.findingType !== "fail") return null;
  // Inspections get per-item CAPAs created directly in the inspections route — skip here
  if (auditEntry.sourceType === "inspection") return null;

  // Idempotent — skip if a CAPA already exists for this audit entry (non-item CAPAs have null sourceItemRef)
  const [existing] = await db
    .select({ id: capaTicketsTable.id })
    .from(capaTicketsTable)
    .where(
      and(
        eq(capaTicketsTable.companyId, auditEntry.companyId),
        sql`${capaTicketsTable.sourceType} = ${auditEntry.sourceType}`,
        eq(capaTicketsTable.sourceRecordId, auditEntry.id),
        isNull(capaTicketsTable.sourceItemRef),
      ),
    )
    .limit(1);

  if (existing) return null;

  const score = auditEntry.complianceScore;
  const priority: InsertCapaTicket["priority"] =
    score < 25 ? "critical" : score < 50 ? "high" : score < 75 ? "medium" : "low";

  const title = `[FAIL] ${auditEntry.ihsaElementName} — ${auditEntry.findingDescription.slice(0, 80)}${auditEntry.findingDescription.length > 80 ? "…" : ""}`;

  return createCapaTicket({
    companyId: auditEntry.companyId,
    projectId: auditEntry.projectId,
    title,
    description: auditEntry.findingDescription,
    sourceType: "audit_trail",
    sourceRecordId: auditEntry.id,
    ihsaElement: auditEntry.ihsaElement,
    priority,
    status: "open",
    createdByUserId: auditEntry.submittedByUserId ?? undefined,
  });
}

export async function getCapaSummary(companyId: number): Promise<{
  open: number;
  inProgress: number;
  pendingReview: number;
  closed: number;
  overdue: number;
}> {
  const today = new Date().toISOString().split("T")[0]!;

  const rows = await db
    .select({
      status: capaTicketsTable.status,
      count: sql<number>`count(*)::int`,
    })
    .from(capaTicketsTable)
    .where(eq(capaTicketsTable.companyId, companyId))
    .groupBy(capaTicketsTable.status);

  const overdueRows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(capaTicketsTable)
    .where(
      and(
        eq(capaTicketsTable.companyId, companyId),
        sql`${capaTicketsTable.status} IN ('open', 'in_progress', 'pending_review')`,
        sql`${capaTicketsTable.dueDate} IS NOT NULL AND ${capaTicketsTable.dueDate} < ${today}`,
      ),
    );

  const result = { open: 0, inProgress: 0, pendingReview: 0, closed: 0, overdue: overdueRows[0]?.count ?? 0 };
  for (const row of rows) {
    if (row.status === "open") result.open = row.count;
    else if (row.status === "in_progress") result.inProgress = row.count;
    else if (row.status === "pending_review") result.pendingReview = row.count;
    else if (row.status === "closed") result.closed = row.count;
  }
  return result;
}

// ── Inspection → CAPA bridge ──────────────────────────────────────────────────

const SEVERITY_TO_PRIORITY: Record<string, InsertCapaTicket["priority"]> = {
  high: "critical",
  medium: "high",
  low: "medium",
};

// IHSA element default by inspection type — used for per-item CAPAs
const INSPECTION_TYPE_IHSA: Record<string, string> = {
  safety:        "element_2",  // Hazard ID & Assessment
  general:       "element_4",  // Ongoing Inspections
  quality:       "element_4",
  progress:      "element_4",
  structural:    "element_4",
  electrical:    "element_12", // Safety Equipment
  fire:          "element_13", // Fire Safety
  environmental: "element_11", // Environmental Protection
};

export async function createCapasFromInspectionItems(
  inspection: {
    id: number;
    companyId: number;
    projectId: number | null;
    inspectorId: number;
    inspectionType: string;
    date: string;
  },
  failedItems: Array<{ itemName: string; severity: string; comment?: string | null }>,
): Promise<CapaTicket[]> {
  if (!failedItems.length) return [];

  // Batch-check which items already have a CAPA
  const existing = await db
    .select({ sourceItemRef: capaTicketsTable.sourceItemRef })
    .from(capaTicketsTable)
    .where(
      and(
        eq(capaTicketsTable.companyId, inspection.companyId),
        sql`${capaTicketsTable.sourceType} = 'inspection'`,
        eq(capaTicketsTable.sourceRecordId, inspection.id),
      ),
    );

  const existingRefs = new Set(existing.map((r) => r.sourceItemRef).filter(Boolean));
  const toCreate = failedItems.filter((item) => !existingRefs.has(item.itemName));
  if (!toCreate.length) return [];

  const defaultElement = INSPECTION_TYPE_IHSA[inspection.inspectionType] ?? "element_4";
  const inspTypeLabel = inspection.inspectionType.replace(/_/g, " ");

  const values: InsertCapaTicket[] = toCreate.map((item) => ({
    companyId: inspection.companyId,
    projectId: inspection.projectId ?? undefined,
    title: `[INSPECTION FAIL] ${item.itemName}`,
    description: `${inspTypeLabel.charAt(0).toUpperCase() + inspTypeLabel.slice(1)} inspection on ${inspection.date}: "${item.itemName}" failed.${item.comment ? ` Notes: ${item.comment}` : ""}`,
    sourceType: "inspection" as const,
    sourceRecordId: inspection.id,
    sourceItemRef: item.itemName,
    ihsaElement: defaultElement as InsertCapaTicket["ihsaElement"],
    priority: SEVERITY_TO_PRIORITY[item.severity] ?? "medium",
    status: "open" as const,
    createdByUserId: inspection.inspectorId,
  }));

  const rows = await db.insert(capaTicketsTable).values(values).returning();
  return rows;
}

// ── Action Required queue (open inspection CAPAs) ─────────────────────────────

export interface ActionRequiredCapa extends CapaWithDetails {
  inspectionType: string | null;
  inspectionDate: string | null;
  projectName: string | null;
  sourceItemRef: string | null;
}

export async function getActionRequiredCapas(companyId: number): Promise<ActionRequiredCapa[]> {
  const rows = await db
    .select({
      ticket: capaTicketsTable,
      assignedToName: sql<string | null>`
        CASE WHEN ${assignedUserAlias.id} IS NOT NULL
          THEN ${assignedUserAlias.firstName} || ' ' || ${assignedUserAlias.lastName}
          ELSE NULL END`,
      inspectionType: inspectionsTable.inspectionType,
      inspectionDate: inspectionsTable.date,
      projectName: projectsTable.name,
    })
    .from(capaTicketsTable)
    .leftJoin(assignedUserAlias, eq(capaTicketsTable.assignedToUserId, assignedUserAlias.id))
    .leftJoin(
      inspectionsTable,
      and(
        sql`${capaTicketsTable.sourceType} = 'inspection'`,
        eq(capaTicketsTable.sourceRecordId, inspectionsTable.id),
      ),
    )
    .leftJoin(projectsTable, eq(capaTicketsTable.projectId, projectsTable.id))
    .where(
      and(
        eq(capaTicketsTable.companyId, companyId),
        sql`${capaTicketsTable.sourceType} = 'inspection'`,
        sql`${capaTicketsTable.status} IN ('open', 'in_progress', 'pending_review')`,
      ),
    )
    .orderBy(
      sql`CASE ${capaTicketsTable.priority} WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END`,
      asc(capaTicketsTable.dueDate),
      desc(capaTicketsTable.createdAt),
    );

  return rows.map((r) => ({
    ...r.ticket,
    assignedToName: r.assignedToName,
    createdByName: null,
    inspectionType: r.inspectionType ?? null,
    inspectionDate: r.inspectionDate ?? null,
    projectName: r.projectName ?? null,
    sourceItemRef: r.ticket.sourceItemRef,
  }));
}


// ── Shadow Auditor data aggregation ──────────────────────────────────────────

export interface ShadowAuditorDataRow {
  element: string;
  averageScore: number;
  entryCount: number;
  failCount: number;
  daysSinceLastEntry: number | null;
}

export interface ShadowAuditorCapaRow {
  element: string;
  openCount: number;
  overdueCount: number;
}

export interface ShadowAuditorVoiceRow {
  element: string;
  count: number;
}

export interface ShadowAuditorSignoffRow {
  element: string;
  compliance: number;
}

export interface ShadowAuditorData {
  elementStats: ShadowAuditorDataRow[];
  capaByElement: ShadowAuditorCapaRow[];
  voiceLogsByElement: ShadowAuditorVoiceRow[];
  signoffByElement: ShadowAuditorSignoffRow[];
  expiringCredentialCount: number;
  flaggedSubcontractorCount: number;
}

export async function getShadowAuditorData(
  companyId: number,
  lookbackDays: number,
): Promise<ShadowAuditorData> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - lookbackDays);

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const today = new Date().toISOString().split("T")[0]!;

  const [elementRows, capaRows, voiceRows, signoffRows, credRow, subRow] = await Promise.all([
    // Per-element audit stats for the lookback window
    db
      .select({
        element: corAuditTrailTable.ihsaElement,
        averageScore: sql<number>`ROUND(AVG(${corAuditTrailTable.complianceScore}), 1)`,
        entryCount: sql<number>`COUNT(*)::int`,
        failCount: sql<number>`SUM(CASE WHEN ${corAuditTrailTable.findingType} = 'fail' THEN 1 ELSE 0 END)::int`,
        daysSinceLastEntry: sql<number>`EXTRACT(DAY FROM NOW() - MAX(${corAuditTrailTable.createdAt}))::int`,
      })
      .from(corAuditTrailTable)
      .where(
        and(
          eq(corAuditTrailTable.companyId, companyId),
          gte(corAuditTrailTable.createdAt, cutoff),
        ),
      )
      .groupBy(corAuditTrailTable.ihsaElement),

    // Open + overdue CAPA counts per element
    db
      .select({
        element: capaTicketsTable.ihsaElement,
        openCount: sql<number>`COUNT(*)::int`,
        overdueCount: sql<number>`SUM(CASE WHEN ${capaTicketsTable.dueDate} < ${today} THEN 1 ELSE 0 END)::int`,
      })
      .from(capaTicketsTable)
      .where(
        and(
          eq(capaTicketsTable.companyId, companyId),
          inArray(capaTicketsTable.status, ["open", "in_progress"]),
        ),
      )
      .groupBy(capaTicketsTable.ihsaElement),

    // Voice log counts per element (last 30 days)
    db
      .select({
        element: corVoiceActionLogsTable.ihsaElement,
        count: sql<number>`COUNT(*)::int`,
      })
      .from(corVoiceActionLogsTable)
      .where(
        and(
          eq(corVoiceActionLogsTable.companyId, companyId),
          gte(corVoiceActionLogsTable.createdAt, thirtyDaysAgo),
        ),
      )
      .groupBy(corVoiceActionLogsTable.ihsaElement),

    // Policy signoff counts per element
    db
      .select({
        ihsaElement: policyDocumentsTable.ihsaElement,
        totalSignoffs: sql<number>`COUNT(DISTINCT ${policySignoffsTable.workerUserId})::int`,
      })
      .from(policyDocumentsTable)
      .leftJoin(
        policySignoffsTable,
        and(
          eq(policySignoffsTable.policyDocumentId, policyDocumentsTable.id),
          eq(policySignoffsTable.isValid, true),
        ),
      )
      .where(
        and(
          eq(policyDocumentsTable.companyId, companyId),
          eq(policyDocumentsTable.isActive, true),
        ),
      )
      .groupBy(policyDocumentsTable.ihsaElement),

    // Count credentials expiring within 60 days or already expired
    db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(workerCredentialsTable)
      .innerJoin(
        userMembershipsTable,
        and(
          eq(userMembershipsTable.userId, workerCredentialsTable.userId),
          eq(userMembershipsTable.companyId, companyId),
        ),
      )
      .where(
        and(
          eq(workerCredentialsTable.companyId, companyId),
          or(
            eq(workerCredentialsTable.status, "expired"),
            and(
              eq(workerCredentialsTable.status, "active"),
              lte(
                workerCredentialsTable.expirationDate,
                sql`(CURRENT_DATE + INTERVAL '60 days')::date`,
              ),
            ),
          ),
        ),
      ),

    // Count flagged subcontractors
    db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(subcontractorsTable)
      .where(
        and(
          eq(subcontractorsTable.companyId, companyId),
          inArray(subcontractorsTable.overallStatus, ["expired", "non_compliant"]),
        ),
      ),
  ]);

  // Compute signoff compliance % per element
  const [totalWorkersRow] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(userMembershipsTable)
    .where(eq(userMembershipsTable.companyId, companyId));
  const totalWorkers = Math.max(totalWorkersRow?.count ?? 1, 1);

  const signoffByElement: ShadowAuditorSignoffRow[] = signoffRows.map((r) => ({
    element: r.ihsaElement as string,
    compliance: Math.round((r.totalSignoffs / totalWorkers) * 100),
  }));

  return {
    elementStats: elementRows.map((r) => ({
      element: r.element as string,
      averageScore: r.averageScore ?? 0,
      entryCount: r.entryCount ?? 0,
      failCount: r.failCount ?? 0,
      daysSinceLastEntry: r.daysSinceLastEntry ?? null,
    })),
    capaByElement: capaRows
      .filter((r) => r.element !== null)
      .map((r) => ({
        element: r.element as string,
        openCount: r.openCount ?? 0,
        overdueCount: r.overdueCount ?? 0,
      })),
    voiceLogsByElement: voiceRows
      .filter((r) => r.element !== null)
      .map((r) => ({
        element: r.element as string,
        count: r.count ?? 0,
      })),
    signoffByElement,
    expiringCredentialCount: credRow[0]?.count ?? 0,
    flaggedSubcontractorCount: subRow[0]?.count ?? 0,
  };
}
