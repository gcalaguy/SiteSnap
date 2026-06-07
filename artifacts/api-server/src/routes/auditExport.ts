/**
 * Compliance dashboard stats + Ministry Audit Export endpoints.
 *
 *  GET  /api/compliance/dashboard            – per-project directive counts + safety status
 *  GET  /api/projects/:projectId/compliance/audit-export  – downloadable chronological PDF audit packet
 */
import { Router } from "express";
import {
  db,
  aiComplianceDirectivesTable,
  projectsTable,
  formSubmissionsTable,
  formTemplatesTable,
  usersTable,
  workerDocumentsTable,
  companiesTable,
  dailyLogsTable,
  safetySignoffsTable,
} from "@workspace/db";
import { eq, and, desc, sql, inArray } from "drizzle-orm";
import { asyncHandler } from "../lib/asyncHandler";
import { requireAuth, requireCompany } from "../lib/auth";
import { NotFoundError } from "../lib/errors";
import { buildSafetyAuditPdfBuffer } from "../lib/safetyAuditPdf";
import type { AuditTimelineItem } from "../lib/safetyAuditPdf";

const router = Router();

// ── GET /api/compliance/dashboard ─────────────────────────────────────────────
// Returns per-project directive counts and derived safety status for all
// active projects belonging to the authenticated company.
router.get(
  "/compliance/dashboard",
  requireAuth,
  requireCompany,
  asyncHandler(async (req, res) => {
    const companyId = req.companyId!;

    const projects = await db
      .select({ id: projectsTable.id, name: projectsTable.name, status: projectsTable.status })
      .from(projectsTable)
      .where(and(
        eq(projectsTable.companyId, companyId),
        sql`${projectsTable.status} IN ('active','planning')`,
      ));

    if (projects.length === 0) {
      res.json([]);
      return;
    }

    const projectIds = projects.map((p) => p.id);

    const directives = await db
      .select({
        projectId: aiComplianceDirectivesTable.projectId,
        status: aiComplianceDirectivesTable.status,
        urgency: aiComplianceDirectivesTable.urgency,
      })
      .from(aiComplianceDirectivesTable)
      .where(
        and(
          eq(aiComplianceDirectivesTable.companyId, companyId),
          inArray(aiComplianceDirectivesTable.projectId, projectIds),
        ),
      );

    type Stats = { pending: number; pendingHigh: number; completed: number; dismissed: number };
    const statMap = new Map<number, Stats>();
    for (const pid of projectIds) {
      statMap.set(pid, { pending: 0, pendingHigh: 0, completed: 0, dismissed: 0 });
    }
    for (const d of directives) {
      const s = statMap.get(d.projectId);
      if (!s) continue;
      if (d.status === "PENDING") {
        s.pending++;
        if (d.urgency === "HIGH") s.pendingHigh++;
      } else if (d.status === "COMPLETED") {
        s.completed++;
      } else if (d.status === "DISMISSED") {
        s.dismissed++;
      }
    }

    const rows = projects.map((p) => {
      const s = statMap.get(p.id) ?? { pending: 0, pendingHigh: 0, completed: 0, dismissed: 0 };
      const safetyStatus =
        s.pendingHigh > 0 ? "critical" :
        s.pending > 0     ? "warning" :
                            "ok";
      return { project: p, ...s, safetyStatus };
    });

    const ORDER: Record<string, number> = { critical: 0, warning: 1, ok: 2 };
    rows.sort((a, b) => ORDER[a.safetyStatus] - ORDER[b.safetyStatus]);

    res.json(rows);
  }),
);

// ── GET /api/projects/:projectId/compliance/audit-export ─────────────────────
// Compiles all signed safety forms, toolbox signoffs, daily logs, worker
// certifications, and directive history into a single chronological PDF.
router.get(
  "/projects/:projectId/compliance/audit-export",
  requireAuth,
  requireCompany,
  asyncHandler(async (req, res) => {
    const projectId = Number(req.params.projectId);
    const companyId = req.companyId!;

    const [project] = await db
      .select({
        id: projectsTable.id,
        name: projectsTable.name,
        address: projectsTable.address,
        city: projectsTable.city,
        province: projectsTable.province,
      })
      .from(projectsTable)
      .where(and(eq(projectsTable.id, projectId), eq(projectsTable.companyId, companyId)))
      .limit(1);

    if (!project) throw new NotFoundError("Project not found");

    const [me] = await db
      .select({ firstName: usersTable.firstName, lastName: usersTable.lastName })
      .from(usersTable)
      .where(eq(usersTable.id, req.userId!))
      .limit(1);
    const exportedBy = me ? `${me.firstName ?? ""} ${me.lastName ?? ""}`.trim() : "System";

    // ── 1. Safety form submissions ──────────────────────────────────────────
    const rawSubs = await db
      .select({
        id: formSubmissionsTable.id,
        templateId: formSubmissionsTable.templateId,
        data: formSubmissionsTable.data,
        status: formSubmissionsTable.status,
        aiSummary: formSubmissionsTable.aiSummary,
        reviewedAt: formSubmissionsTable.reviewedAt,
        reviewNotes: formSubmissionsTable.reviewNotes,
        createdAt: formSubmissionsTable.createdAt,
        reviewedByUserId: formSubmissionsTable.reviewedByUserId,
        userId: formSubmissionsTable.userId,
        templateName: formTemplatesTable.name,
        category: formTemplatesTable.category,
      })
      .from(formSubmissionsTable)
      .innerJoin(formTemplatesTable, eq(formTemplatesTable.id, formSubmissionsTable.templateId))
      .where(
        and(
          eq(formSubmissionsTable.projectId, projectId),
          eq(formSubmissionsTable.companyId, companyId),
        ),
      )
      .orderBy(desc(formSubmissionsTable.createdAt));

    const userIds = Array.from(new Set([
      ...rawSubs.map((s) => s.userId),
      ...rawSubs.map((s) => s.reviewedByUserId).filter(Boolean) as number[],
    ]));

    const userRows = userIds.length > 0
      ? await db
          .select({ id: usersTable.id, firstName: usersTable.firstName, lastName: usersTable.lastName })
          .from(usersTable)
          .where(sql`${usersTable.id} = ANY(ARRAY[${sql.join(userIds.map((id) => sql`${id}`), sql`, `)}]::int[])`)
      : [];
    const userMap = new Map(userRows.map((u) => [u.id, `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim()]));

    const items: AuditTimelineItem[] = rawSubs.map((s) => ({
      date: new Date(s.createdAt).toISOString(),
      type: "form",
      title: s.templateName,
      description: s.aiSummary ?? undefined,
      status: s.status,
      by: userMap.get(s.userId) ?? `User #${s.userId}`,
    }));

    // ── 2. Safety signoffs (toolbox logs) ───────────────────────────────────
    const rawSignoffs = await db
      .select({
        id: safetySignoffsTable.id,
        workerId: safetySignoffsTable.workerId,
        responses: safetySignoffsTable.responses,
        signatureUrl: safetySignoffsTable.signatureUrl,
        createdAt: safetySignoffsTable.createdAt,
      })
      .from(safetySignoffsTable)
      .where(eq(safetySignoffsTable.projectId, projectId))
      .orderBy(desc(safetySignoffsTable.createdAt));

    const signoffUserIds = Array.from(new Set(rawSignoffs.map((s) => s.workerId)));
    const signoffUsers = signoffUserIds.length > 0
      ? await db
          .select({ id: usersTable.id, firstName: usersTable.firstName, lastName: usersTable.lastName })
          .from(usersTable)
          .where(sql`${usersTable.id} = ANY(ARRAY[${sql.join(signoffUserIds.map((id) => sql`${id}`), sql`, `)}]::int[])`)
      : [];
    const signoffUserMap = new Map(signoffUsers.map((u) => [u.id, `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim()]));

    for (const s of rawSignoffs) {
      const workerName = signoffUserMap.get(s.workerId) ?? `User #${s.workerId}`;
      items.push({
        date: new Date(s.createdAt).toISOString(),
        type: "signoff",
        title: "Toolbox Talk / Safety Signoff",
        description: s.signatureUrl ? "Digitally signed" : "Unsigned",
        status: "signed",
        by: workerName,
      });
    }

    // ── 3. Daily logs (field logs) ──────────────────────────────────────────
    const rawLogs = await db
      .select({
        id: dailyLogsTable.id,
        foremanId: dailyLogsTable.foremanId,
        notes: dailyLogsTable.notes,
        weatherTemp: dailyLogsTable.weatherTemp,
        weatherCondition: dailyLogsTable.weatherCondition,
        createdAt: dailyLogsTable.createdAt,
      })
      .from(dailyLogsTable)
      .where(eq(dailyLogsTable.projectId, projectId))
      .orderBy(desc(dailyLogsTable.createdAt));

    const logUserIds = Array.from(new Set(rawLogs.map((l) => l.foremanId)));
    const logUsers = logUserIds.length > 0
      ? await db
          .select({ id: usersTable.id, firstName: usersTable.firstName, lastName: usersTable.lastName })
          .from(usersTable)
          .where(sql`${usersTable.id} = ANY(ARRAY[${sql.join(logUserIds.map((id) => sql`${id}`), sql`, `)}]::int[])`)
      : [];
    const logUserMap = new Map(logUsers.map((u) => [u.id, `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim()]));

    for (const l of rawLogs) {
      const weather = [l.weatherTemp, l.weatherCondition].filter(Boolean).join(" ") || "No weather recorded";
      items.push({
        date: new Date(l.createdAt).toISOString(),
        type: "log",
        title: "Daily Field Log",
        description: l.notes ?? "No notes",
        status: weather,
        by: logUserMap.get(l.foremanId) ?? `User #${l.foremanId}`,
      });
    }

    // ── 4. Worker certifications ──────────────────────────────────────────────
    const rawCerts = await db
      .select({
        id: workerDocumentsTable.id,
        workerId: workerDocumentsTable.workerId,
        documentType: workerDocumentsTable.documentType,
        status: workerDocumentsTable.status,
        expirationDate: workerDocumentsTable.expirationDate,
        fileUrl: workerDocumentsTable.fileUrl,
        createdAt: workerDocumentsTable.createdAt,
        firstName: usersTable.firstName,
        lastName: usersTable.lastName,
      })
      .from(workerDocumentsTable)
      .innerJoin(usersTable, eq(usersTable.id, workerDocumentsTable.workerId))
      .where(eq(workerDocumentsTable.companyId, companyId))
      .orderBy(desc(workerDocumentsTable.createdAt));

    for (const c of rawCerts) {
      const workerName = `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim();
      const extra = c.expirationDate
        ? `Expires: ${new Date(c.expirationDate).toLocaleDateString("en-CA")}`
        : undefined;
      items.push({
        date: new Date(c.createdAt).toISOString(),
        type: "certification",
        title: c.documentType,
        description: workerName,
        status: c.status,
        extra,
        color: c.status === "expired" ? [220, 38, 38] : c.status === "active" ? [22, 163, 74] : [120, 120, 120],
      });
    }

    // ── 5. AI compliance directives ───────────────────────────────────────────
    const rawDirectives = await db
      .select()
      .from(aiComplianceDirectivesTable)
      .where(
        and(
          eq(aiComplianceDirectivesTable.projectId, projectId),
          eq(aiComplianceDirectivesTable.companyId, companyId),
        ),
      )
      .orderBy(desc(aiComplianceDirectivesTable.createdAt));

    for (const d of rawDirectives) {
      items.push({
        date: new Date(d.createdAt).toISOString(),
        type: "directive",
        title: d.targetFormId.replace(/_/g, " "),
        description: d.workerDirective,
        status: d.status,
        urgency: d.urgency,
        extra: `Confidence: ${d.confidenceScore}%`,
        color: d.urgency === "HIGH" ? [220, 38, 38] : d.urgency === "MEDIUM" ? [217, 119, 6] : [22, 163, 74],
      });
    }

    // Sort all items chronologically (newest first)
    items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    // ── Build PDF ───────────────────────────────────────────────────────────
    const [company] = await db
      .select({ name: companiesTable.name })
      .from(companiesTable)
      .where(eq(companiesTable.id, companyId))
      .limit(1);

    const pdfBuffer = await buildSafetyAuditPdfBuffer({
      companyName: (company as any)?.name ?? "Your Company",
      projectName: project.name,
      projectLocation: [project.address, project.city, project.province].filter(Boolean).join(", "),
      exportedAt: new Date().toLocaleDateString("en-CA", {
        year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit",
      }),
      exportedBy,
      items,
      summaryCounts: {
        forms: rawSubs.length,
        signoffs: rawSignoffs.length,
        logs: rawLogs.length,
        certifications: rawCerts.length,
        directives: rawDirectives.length,
      },
    });

    const filename = `audit-${project.name.replace(/\s+/g, "-").toLowerCase()}-${new Date().toISOString().slice(0, 10)}.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Length", pdfBuffer.length);
    res.send(pdfBuffer);
  }),
);

export default router;
