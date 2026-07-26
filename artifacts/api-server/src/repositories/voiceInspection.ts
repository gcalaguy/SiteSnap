import {
  db,
  voiceInspectionsTable,
  capaTicketsTable,
  usersTable,
  projectsTable,
  type VoiceInspection,
  type InsertVoiceInspection,
  type InsertCapaTicket,
  type CapaTicket,
} from "@workspace/db";
import { eq, and, desc, gte, lte, sql } from "drizzle-orm";

export interface VoiceInspectionWithMeta extends VoiceInspection {
  submitterName: string | null;
  projectName: string | null;
}

const submitterNameExpr = sql<string | null>`
  CASE WHEN ${usersTable.id} IS NOT NULL
    THEN ${usersTable.firstName} || ' ' || ${usersTable.lastName}
    ELSE NULL END`;

export async function createVoiceInspection(
  data: InsertVoiceInspection,
): Promise<VoiceInspection> {
  const [row] = await db.insert(voiceInspectionsTable).values(data).returning();
  return row;
}

export async function listVoiceInspections(
  companyId: number,
  opts: {
    projectId?: number;
    severityLevel?: string;
    passStatus?: string;
    submittedByUserId?: number;
    dateFrom?: string;
    dateTo?: string;
    limit?: number;
    offset?: number;
  } = {},
): Promise<{ data: VoiceInspectionWithMeta[]; total: number }> {
  const conditions = [eq(voiceInspectionsTable.companyId, companyId)];
  if (opts.projectId) conditions.push(eq(voiceInspectionsTable.projectId, opts.projectId));
  if (opts.severityLevel) conditions.push(sql`${voiceInspectionsTable.severityLevel} = ${opts.severityLevel}`);
  if (opts.passStatus) conditions.push(sql`${voiceInspectionsTable.passStatus} = ${opts.passStatus}`);
  if (opts.submittedByUserId) conditions.push(eq(voiceInspectionsTable.submittedByUserId, opts.submittedByUserId));
  if (opts.dateFrom) conditions.push(gte(voiceInspectionsTable.createdAt, new Date(opts.dateFrom)));
  if (opts.dateTo) conditions.push(lte(voiceInspectionsTable.createdAt, new Date(opts.dateTo)));
  const where = and(...conditions);

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        inspection: voiceInspectionsTable,
        submitterName: submitterNameExpr,
        projectName: projectsTable.name,
      })
      .from(voiceInspectionsTable)
      .leftJoin(usersTable, eq(voiceInspectionsTable.submittedByUserId, usersTable.id))
      .leftJoin(projectsTable, eq(voiceInspectionsTable.projectId, projectsTable.id))
      .where(where)
      .orderBy(desc(voiceInspectionsTable.createdAt))
      .limit(opts.limit ?? 50)
      .offset(opts.offset ?? 0),
    db.select({ total: sql<number>`count(*)::int` }).from(voiceInspectionsTable).where(where),
  ]);

  return {
    data: rows.map((r) => ({ ...r.inspection, submitterName: r.submitterName, projectName: r.projectName })),
    total,
  };
}

export async function getVoiceInspection(
  companyId: number,
  id: number,
): Promise<VoiceInspectionWithMeta | null> {
  const [row] = await db
    .select({
      inspection: voiceInspectionsTable,
      submitterName: submitterNameExpr,
      projectName: projectsTable.name,
    })
    .from(voiceInspectionsTable)
    .leftJoin(usersTable, eq(voiceInspectionsTable.submittedByUserId, usersTable.id))
    .leftJoin(projectsTable, eq(voiceInspectionsTable.projectId, projectsTable.id))
    .where(and(eq(voiceInspectionsTable.companyId, companyId), eq(voiceInspectionsTable.id, id)));
  if (!row) return null;
  return { ...row.inspection, submitterName: row.submitterName, projectName: row.projectName };
}

export async function linkCapaToInspection(inspectionId: number, capaTicketId: number): Promise<void> {
  await db
    .update(voiceInspectionsTable)
    .set({ capaTicketId })
    .where(eq(voiceInspectionsTable.id, inspectionId));
}

export async function updateVoiceInspectionProject(
  companyId: number,
  id: number,
  projectId: number,
): Promise<VoiceInspection | null> {
  const [row] = await db
    .update(voiceInspectionsTable)
    .set({ projectId, updatedAt: new Date() })
    .where(and(eq(voiceInspectionsTable.companyId, companyId), eq(voiceInspectionsTable.id, id)))
    .returning();
  return row ?? null;
}

// ── Voice inspection → CAPA corrective action bridge ────────────────────────

const SEVERITY_TO_PRIORITY: Record<string, InsertCapaTicket["priority"]> = {
  critical: "critical",
  high: "high",
  medium: "medium",
  low: "low",
};

function computeCapaDueDate(priority: InsertCapaTicket["priority"]): string {
  const hours = priority === "critical" || priority === "high" ? 24 : 48;
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString().split("T")[0]!;
}

export async function createCapaFromVoiceInspection(
  inspection: VoiceInspection,
  createdByUserId: number,
  overrides: {
    assignedToUserId?: number;
    priority?: InsertCapaTicket["priority"];
    dueDate?: string;
    ihsaElement?: InsertCapaTicket["ihsaElement"];
  } = {},
): Promise<CapaTicket> {
  const priority = overrides.priority ?? SEVERITY_TO_PRIORITY[inspection.severityLevel ?? "medium"] ?? "medium";
  const recommendedActions = Array.isArray(inspection.recommendedActions)
    ? (inspection.recommendedActions as string[])
    : [];

  const [row] = await db
    .insert(capaTicketsTable)
    .values({
      companyId: inspection.companyId,
      projectId: inspection.projectId,
      title: `[VOICE INSPECTION] ${inspection.equipmentOrArea ?? "Untitled"}`,
      description: `${inspection.hazardSummary ?? ""}${
        recommendedActions.length ? `\n\nRecommended actions:\n- ${recommendedActions.join("\n- ")}` : ""
      }`,
      sourceType: "voice_inspection",
      sourceRecordId: inspection.id,
      ihsaElement: overrides.ihsaElement,
      priority,
      status: "open",
      dueDate: overrides.dueDate ?? computeCapaDueDate(priority),
      assignedToUserId: overrides.assignedToUserId,
      createdByUserId,
    })
    .onConflictDoNothing()
    .returning();

  if (row) {
    await linkCapaToInspection(inspection.id, row.id);
    return row;
  }

  // Idempotent re-create: an action already exists for this inspection — return it.
  const [existing] = await db
    .select()
    .from(capaTicketsTable)
    .where(
      and(
        eq(capaTicketsTable.companyId, inspection.companyId),
        sql`${capaTicketsTable.sourceType} = 'voice_inspection'`,
        eq(capaTicketsTable.sourceRecordId, inspection.id),
      ),
    )
    .limit(1);
  return existing!;
}
