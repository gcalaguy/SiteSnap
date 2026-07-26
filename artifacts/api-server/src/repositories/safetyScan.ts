import {
  db,
  safetyScansTable,
  scanHazardsTable,
  capaTicketsTable,
  usersTable,
  type SafetyScan,
  type ScanHazard,
  type InsertSafetyScan,
  type InsertScanHazard,
  type InsertCapaTicket,
  type CapaTicket,
} from "@workspace/db";
import { eq, and, desc, sql, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

export interface SafetyScanWithHazards extends SafetyScan {
  hazards: Array<ScanHazard & { capaStatus: string | null }>;
}

export async function createSafetyScan(
  scan: InsertSafetyScan,
  hazards: Array<Omit<InsertScanHazard, "scanId" | "companyId">>,
): Promise<SafetyScanWithHazards> {
  const [row] = await db.insert(safetyScansTable).values(scan).returning();

  const hazardRows = hazards.length
    ? await db
        .insert(scanHazardsTable)
        .values(hazards.map((h) => ({ ...h, scanId: row.id, companyId: row.companyId })))
        .returning()
    : [];

  return { ...row, hazards: hazardRows.map((h) => ({ ...h, capaStatus: null })) };
}

export async function listSafetyScans(
  companyId: number,
  opts: { projectId?: number; riskLevel?: string; limit?: number; offset?: number } = {},
): Promise<{ data: SafetyScan[]; total: number }> {
  const conditions = [eq(safetyScansTable.companyId, companyId)];
  if (opts.projectId) conditions.push(eq(safetyScansTable.projectId, opts.projectId));
  if (opts.riskLevel) conditions.push(sql`${safetyScansTable.riskLevel} = ${opts.riskLevel}`);
  const where = and(...conditions);

  const [rows, [{ total }]] = await Promise.all([
    db
      .select()
      .from(safetyScansTable)
      .where(where)
      .orderBy(desc(safetyScansTable.createdAt))
      .limit(opts.limit ?? 50)
      .offset(opts.offset ?? 0),
    db.select({ total: sql<number>`count(*)::int` }).from(safetyScansTable).where(where),
  ]);

  return { data: rows, total };
}

export async function getSafetyScan(
  companyId: number,
  id: number,
): Promise<SafetyScanWithHazards | null> {
  const [scan] = await db
    .select()
    .from(safetyScansTable)
    .where(and(eq(safetyScansTable.companyId, companyId), eq(safetyScansTable.id, id)));
  if (!scan) return null;

  const hazards = await db
    .select({
      hazard: scanHazardsTable,
      capaStatus: capaTicketsTable.status,
    })
    .from(scanHazardsTable)
    .leftJoin(capaTicketsTable, eq(scanHazardsTable.capaTicketId, capaTicketsTable.id))
    .where(eq(scanHazardsTable.scanId, id))
    .orderBy(scanHazardsTable.id);

  return {
    ...scan,
    hazards: hazards.map((h) => ({ ...h.hazard, capaStatus: h.capaStatus ?? null })),
  };
}

export async function getScanHazard(
  companyId: number,
  scanId: number,
  hazardId: number,
): Promise<ScanHazard | null> {
  const [row] = await db
    .select()
    .from(scanHazardsTable)
    .where(
      and(
        eq(scanHazardsTable.companyId, companyId),
        eq(scanHazardsTable.scanId, scanId),
        eq(scanHazardsTable.id, hazardId),
      ),
    );
  return row ?? null;
}

export async function linkHazardToCapa(hazardId: number, capaTicketId: number): Promise<void> {
  await db.update(scanHazardsTable).set({ capaTicketId }).where(eq(scanHazardsTable.id, hazardId));
}

export async function setScanReportPath(id: number, reportObjectPath: string): Promise<void> {
  await db
    .update(safetyScansTable)
    .set({ reportObjectPath, updatedAt: new Date() })
    .where(eq(safetyScansTable.id, id));
}

export async function signSafetyScan(
  companyId: number,
  id: number,
  role: "inspector" | "foreman",
  signatureData: string,
  signedByUserId: number,
): Promise<SafetyScan | null> {
  const [existing] = await db
    .select({ id: safetyScansTable.id })
    .from(safetyScansTable)
    .where(and(eq(safetyScansTable.companyId, companyId), eq(safetyScansTable.id, id)));
  if (!existing) return null;

  const patch =
    role === "inspector"
      ? { inspectorSignatureData: signatureData, inspectorSignedAt: new Date() }
      : { foremanSignatureData: signatureData, foremanSignedAt: new Date(), foremanUserId: signedByUserId };

  const [row] = await db
    .update(safetyScansTable)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(safetyScansTable.companyId, companyId), eq(safetyScansTable.id, id)))
    .returning();
  return row ?? null;
}

// ── Scan hazard → CAPA corrective action bridge ────────────────────────────

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

export async function createCapaFromScanHazard(
  scan: SafetyScan,
  hazard: ScanHazard,
  createdByUserId: number,
  overrides: {
    assignedToUserId?: number;
    priority?: InsertCapaTicket["priority"];
    dueDate?: string;
    ihsaElement?: InsertCapaTicket["ihsaElement"];
  } = {},
): Promise<CapaTicket> {
  const priority = overrides.priority ?? SEVERITY_TO_PRIORITY[hazard.severity] ?? "medium";

  const [row] = await db
    .insert(capaTicketsTable)
    .values({
      companyId: scan.companyId,
      projectId: scan.projectId,
      title: `[SAFETY SCAN] ${hazard.title}`,
      description: `${hazard.description}${hazard.remediation ? `\n\nRecommended remediation: ${hazard.remediation}` : ""}`,
      sourceType: "safety_scan",
      sourceRecordId: scan.id,
      sourceItemRef: String(hazard.id),
      ihsaElement: overrides.ihsaElement,
      priority,
      status: "open",
      dueDate: overrides.dueDate ?? computeCapaDueDate(priority),
      assignedToUserId: overrides.assignedToUserId,
      evidencePhotoUrl: hazard.sourcePhotoObjectPath ?? undefined,
      createdByUserId,
    })
    .onConflictDoNothing()
    .returning();

  if (row) {
    await linkHazardToCapa(hazard.id, row.id);
    return row;
  }

  // Idempotent re-create: an action already exists for this hazard — return it.
  const [existing] = await db
    .select()
    .from(capaTicketsTable)
    .where(
      and(
        eq(capaTicketsTable.companyId, scan.companyId),
        sql`${capaTicketsTable.sourceType} = 'safety_scan'`,
        eq(capaTicketsTable.sourceRecordId, scan.id),
        eq(capaTicketsTable.sourceItemRef, String(hazard.id)),
      ),
    )
    .limit(1);
  return existing!;
}

export async function getCapaRowsForScan(
  companyId: number,
  scanId: number,
): Promise<Array<{ title: string; assignedToName: string | null; priority: string; dueDate: string | null; status: string }>> {
  const assignedUserAlias = alias(usersTable, "capa_assigned_user_for_scan");
  const rows = await db
    .select({
      title: capaTicketsTable.title,
      priority: capaTicketsTable.priority,
      dueDate: capaTicketsTable.dueDate,
      status: capaTicketsTable.status,
      assignedToName: sql<string | null>`
        CASE WHEN ${assignedUserAlias.id} IS NOT NULL
          THEN ${assignedUserAlias.firstName} || ' ' || ${assignedUserAlias.lastName}
          ELSE NULL END`,
    })
    .from(capaTicketsTable)
    .leftJoin(assignedUserAlias, eq(capaTicketsTable.assignedToUserId, assignedUserAlias.id))
    .where(
      and(
        eq(capaTicketsTable.companyId, companyId),
        sql`${capaTicketsTable.sourceType} = 'safety_scan'`,
        eq(capaTicketsTable.sourceRecordId, scanId),
      ),
    )
    .orderBy(capaTicketsTable.createdAt);
  return rows;
}

// ── Risk dashboard integration ──────────────────────────────────────────────

export interface ScanActionItem {
  id: number;
  title: string;
  priority: string;
  status: string;
  dueDate: string | null;
  assignedToName: string | null;
  projectId: number | null;
  overdue: boolean;
  sourceType: string;
}

export async function getActiveCorrectiveActions(
  companyId: number,
  projectIds: number[],
): Promise<ScanActionItem[]> {
  if (!projectIds.length) return [];
  const assignedUserAlias = alias(usersTable, "assigned_to_user_for_actions");
  const today = new Date().toISOString().split("T")[0]!;

  const rows = await db
    .select({
      id: capaTicketsTable.id,
      title: capaTicketsTable.title,
      priority: capaTicketsTable.priority,
      status: capaTicketsTable.status,
      dueDate: capaTicketsTable.dueDate,
      projectId: capaTicketsTable.projectId,
      sourceType: capaTicketsTable.sourceType,
      assignedToName: sql<string | null>`
        CASE WHEN ${assignedUserAlias.id} IS NOT NULL
          THEN ${assignedUserAlias.firstName} || ' ' || ${assignedUserAlias.lastName}
          ELSE NULL END`,
    })
    .from(capaTicketsTable)
    .leftJoin(assignedUserAlias, eq(capaTicketsTable.assignedToUserId, assignedUserAlias.id))
    .where(
      and(
        eq(capaTicketsTable.companyId, companyId),
        inArray(capaTicketsTable.projectId, projectIds),
        sql`${capaTicketsTable.status} IN ('open', 'in_progress', 'resolved')`,
      ),
    )
    .orderBy(
      sql`CASE ${capaTicketsTable.priority} WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END`,
      capaTicketsTable.dueDate,
    )
    .limit(50);

  return rows.map((r) => ({
    ...r,
    overdue: !!r.dueDate && r.dueDate < today && r.status !== "resolved",
  }));
}
