import { Router } from "express";
import { db, dailyReportsTable, usersTable, projectsTable, dailyReportPhotosTable } from "@workspace/db";
import { eq, and, inArray, gte, lte, SQL } from "drizzle-orm";
import { requireAuth, requireCompany, requireOwnerOrForeman } from "../lib/auth";
import { requirePermission } from "../lib/permissionGate";
import { canAccessProject, getAccessibleProjectIds, assertProjectInCompany as verifyProjectAccess } from "../lib/projectAccess";
import { CreateDailyReportBody, UpdateDailyReportBody } from "@workspace/api-zod";
import { asyncHandler } from "../lib/asyncHandler";
import { logAuditEventFromRequest } from "../utils/logger";
import { processComplianceEvent } from "../services/compliance/processor";

// GET /daily-reports — all daily reports across all projects for the authenticated company
export const allDailyReportsRouter = Router();
allDailyReportsRouter.get(
  "/daily-reports",
  requireAuth,
  requireCompany,
  requirePermission("viewTimesheets"),
  asyncHandler(async (req, res) => {
    const { projectId: projectIdParam, from: fromParam, to: toParam } = req.query as Record<string, string | undefined>;

    const projectIdFilter = projectIdParam ? parseInt(projectIdParam, 10) : undefined;

    const conditions: SQL[] = [eq(projectsTable.companyId, req.companyId!)];
    if (projectIdFilter && !isNaN(projectIdFilter)) {
      if (!(await canAccessProject(req.companyId!, req.userId!, req.userRole ?? "worker", projectIdFilter))) {
        res.status(403).json({ error: "You are not assigned to this project" });
        return;
      }
      conditions.push(eq(dailyReportsTable.projectId, projectIdFilter));
    } else if ((req.userRole ?? "worker") === "worker") {
      // No explicit project filter requested — constrain to the worker's assigned projects
      // rather than returning every report in the company.
      const accessibleIds = await getAccessibleProjectIds(req.companyId!, req.userId!, req.userRole ?? "worker");
      conditions.push(accessibleIds.length ? inArray(dailyReportsTable.projectId, accessibleIds) : eq(dailyReportsTable.id, -1));
    }
    if (fromParam) {
      conditions.push(gte(dailyReportsTable.reportDate, fromParam));
    }
    if (toParam) {
      conditions.push(lte(dailyReportsTable.reportDate, toParam));
    }

    const rows = await db
      .select({
        id: dailyReportsTable.id,
        projectId: dailyReportsTable.projectId,
        projectName: projectsTable.name,
        reportDate: dailyReportsTable.reportDate,
        weather: dailyReportsTable.weather,
        temperature: dailyReportsTable.temperature,
        crewCount: dailyReportsTable.crewCount,
        workPerformed: dailyReportsTable.workPerformed,
        issues: dailyReportsTable.issues,
        notes: dailyReportsTable.notes,
        createdAt: dailyReportsTable.createdAt,
        submittedByFirstName: usersTable.firstName,
        submittedByLastName: usersTable.lastName,
      })
      .from(dailyReportsTable)
      .innerJoin(projectsTable, eq(dailyReportsTable.projectId, projectsTable.id))
      .leftJoin(usersTable, eq(dailyReportsTable.submittedByUserId, usersTable.id))
      .where(and(...conditions))
      .orderBy(dailyReportsTable.reportDate);

    res.json(rows.map((r) => ({
      id: r.id,
      projectId: r.projectId,
      projectName: r.projectName ?? null,
      reportDate: r.reportDate,
      weather: r.weather ?? null,
      temperature: r.temperature ?? null,
      crewCount: r.crewCount,
      workPerformed: r.workPerformed,
      issues: r.issues ?? null,
      notes: r.notes ?? null,
      createdAt: r.createdAt,
      submittedByName: r.submittedByFirstName && r.submittedByLastName
        ? `${r.submittedByFirstName} ${r.submittedByLastName}`
        : "Unknown",
    })));
  }),
);

const router = Router({ mergeParams: true });

// GET /projects/:projectId/daily-reports
router.get("/", requireAuth, requireCompany, requirePermission("viewTimesheets"), asyncHandler(async (req, res) => {
  const projectId = parseInt(req.params.projectId as string);
  const project = await verifyProjectAccess(projectId, req.companyId!);
  if (!project) { res.status(404).json({ error: "Project not found" }); return; }
  if (!(await canAccessProject(req.companyId!, req.userId!, req.userRole ?? "worker", projectId))) {
    res.status(403).json({ error: "You are not assigned to this project" });
    return;
  }

  const reports = await db
    .select()
    .from(dailyReportsTable)
    .where(eq(dailyReportsTable.projectId, projectId));

  if (reports.length === 0) {
    res.json([]);
    return;
  }

  // Batch-fetch users and photos for all reports in two queries
  const reportIds = reports.map((r) => r.id);
  const userIds = [...new Set(reports.map((r) => r.submittedByUserId))];

  const [users, photos] = await Promise.all([
    userIds.length
      ? db.select().from(usersTable).where(inArray(usersTable.id, userIds))
      : Promise.resolve([]),
    db.select().from(dailyReportPhotosTable).where(inArray(dailyReportPhotosTable.reportId, reportIds)),
  ]);

  const userMap = Object.fromEntries(users.map((u) => [u.id, u]));
  const photosByReport: Record<number, typeof photos> = {};
  for (const p of photos) {
    if (!photosByReport[p.reportId]) photosByReport[p.reportId] = [];
    photosByReport[p.reportId].push(p);
  }

  res.json(reports.map((r) => ({
    ...r,
    submittedBy: userMap[r.submittedByUserId] ?? null,
    photos: photosByReport[r.id] ?? [],
  })));
}))

// POST /projects/:projectId/daily-reports
// Upsert: if a report already exists for the given date, append incoming notes
// to the existing record instead of creating a duplicate.
router.post("/", requireAuth, requireCompany, requirePermission("submitExpenses"), asyncHandler(async (req, res) => {
  if (!req.companyId) { res.status(403).json({ error: "No company associated with this account" }); return; }

  const projectId = parseInt(req.params.projectId as string);
  const project = await verifyProjectAccess(projectId, req.companyId!);
  if (!project) { res.status(404).json({ error: "Project not found" }); return; }
  if (!(await canAccessProject(req.companyId!, req.userId!, req.userRole ?? "worker", projectId))) {
    res.status(403).json({ error: "You are not assigned to this project" });
    return;
  }

  const parsed = CreateDailyReportBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body", details: parsed.error });
    return;
  }

  // HIGH-001: idempotency key sent by offline clients to prevent duplicate
  // reports when a retry races with a previously delivered request.
  const { clientIdempotencyKey } = req.body as { clientIdempotencyKey?: string };
  if (clientIdempotencyKey) {
    const [dup] = await db
      .select()
      .from(dailyReportsTable)
      .where(eq(dailyReportsTable.clientIdempotencyKey, clientIdempotencyKey))
      .limit(1);
    if (dup) { res.status(200).json(dup); return; }
  }

  const { reportDate, ...restInsert } = parsed.data;
  const dateStr = reportDate instanceof Date ? reportDate.toISOString().split("T")[0] : reportDate;

  // Look for an existing report for this project + date
  const [existing] = await db
    .select()
    .from(dailyReportsTable)
    .where(
      and(
        eq(dailyReportsTable.projectId, projectId),
        eq(dailyReportsTable.reportDate, dateStr)
      )
    )
    .limit(1);

  if (existing) {
    // Append incoming notes / workPerformed to the existing report
    const newNotes = restInsert.notes
      ? existing.notes
        ? `${existing.notes}\n\n${restInsert.notes}`
        : restInsert.notes
      : existing.notes;

    const newWorkPerformed = restInsert.workPerformed
      ? existing.workPerformed
        ? `${existing.workPerformed}\n\n${restInsert.workPerformed}`
        : restInsert.workPerformed
      : existing.workPerformed;

    const [updated] = await db
      .update(dailyReportsTable)
      .set({
        workPerformed: newWorkPerformed,
        notes: newNotes,
        materialsUsed: restInsert.materialsUsed ?? existing.materialsUsed,
        equipment: restInsert.equipment ?? existing.equipment,
        issues: restInsert.issues ?? existing.issues,
        crewCount: restInsert.crewCount ?? existing.crewCount,
        weather: restInsert.weather ?? existing.weather,
        temperature: restInsert.temperature ?? existing.temperature,
      })
      .where(eq(dailyReportsTable.id, existing.id))
      .returning();

    const [submittedBy] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, updated.submittedByUserId))
      .limit(1);

    logAuditEventFromRequest(req, "Daily Report Updated", `Updated daily report for ${dateStr} in project ${projectId}`).catch(() => {});

    res.status(200).json({ ...updated, submittedBy: submittedBy ?? null });

    // Fire-and-forget compliance check
    processComplianceEvent({
      companyId: req.companyId!,
      projectId,
      sourceType: "DAILY_REPORT",
      sourceRecordId: String(updated.id),
      text: [updated.workPerformed, updated.notes, updated.issues].filter(Boolean).join("\n"),
    }).catch(() => {});
    return;
  }

  // No existing report for today — create a new one
  const [report] = await db
    .insert(dailyReportsTable)
    .values({
      ...restInsert,
      projectId,
      companyId: req.companyId!,
      submittedByUserId: req.userId!,
      reportDate: dateStr,
      ...(clientIdempotencyKey && { clientIdempotencyKey }),
    })
    .returning();

  const [submittedBy] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, req.userId!))
    .limit(1);

  logAuditEventFromRequest(req, "Daily Report Created", `Submitted daily report for ${dateStr} in project ${projectId}`).catch(() => {});

  res.status(201).json({ ...report, submittedBy: submittedBy ?? null });

  // Fire-and-forget compliance check
  processComplianceEvent({
    companyId: req.companyId!,
    projectId,
    sourceType: "DAILY_REPORT",
    sourceRecordId: String(report.id),
    text: [report.workPerformed, report.notes, report.issues].filter(Boolean).join("\n"),
  }).catch(() => {});
}))

// GET /projects/:projectId/daily-reports/:reportId
router.get("/:reportId", requireAuth, requireCompany, requirePermission("viewTimesheets"), asyncHandler(async (req, res) => {
  const projectId = parseInt(req.params.projectId as string);
  const reportId = parseInt(req.params.reportId as string);
  if (!(await canAccessProject(req.companyId!, req.userId!, req.userRole ?? "worker", projectId))) {
    res.status(403).json({ error: "You are not assigned to this project" });
    return;
  }

  const [report] = await db
    .select()
    .from(dailyReportsTable)
    .where(and(eq(dailyReportsTable.id, reportId), eq(dailyReportsTable.projectId, projectId)))
    .limit(1);

  if (!report) { res.status(404).json({ error: "Report not found" }); return; }

  const [submittedBy] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, report.submittedByUserId))
    .limit(1);

  res.json({ ...report, submittedBy: submittedBy ?? null });
}))

// PUT /projects/:projectId/daily-reports/:reportId
router.put("/:reportId", requireAuth, requireCompany, requirePermission("submitExpenses"), asyncHandler(async (req, res) => {
  const projectId = parseInt(req.params.projectId as string);
  const reportId = parseInt(req.params.reportId as string);

  const projectCheck = await verifyProjectAccess(projectId, req.companyId!);
  if (!projectCheck) { res.status(404).json({ error: "Project not found" }); return; }
  if (!(await canAccessProject(req.companyId!, req.userId!, req.userRole ?? "worker", projectId))) {
    res.status(403).json({ error: "You are not assigned to this project" });
    return;
  }

  const parsed = UpdateDailyReportBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body" });
    return;
  }

  const { reportDate: updReportDate, ...restUpdate } = parsed.data;
  const [report] = await db
    .update(dailyReportsTable)
    .set({
      ...restUpdate,
      ...(updReportDate !== undefined && {
        reportDate: updReportDate instanceof Date ? updReportDate.toISOString().split("T")[0] : updReportDate,
      }),
    })
    .where(and(eq(dailyReportsTable.id, reportId), eq(dailyReportsTable.projectId, projectId)))
    .returning();

  if (!report) { res.status(404).json({ error: "Report not found" }); return; }

  const [submittedBy] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, report.submittedByUserId))
    .limit(1);

  res.json({ ...report, submittedBy: submittedBy ?? null });
}))

// DELETE /projects/:projectId/daily-reports/:reportId
router.delete("/:reportId", requireAuth, requireCompany, requireOwnerOrForeman, asyncHandler(async (req, res) => {
  const projectId = parseInt(req.params.projectId as string);
  const reportId = parseInt(req.params.reportId as string);

  const projectCheck = await verifyProjectAccess(projectId, req.companyId!);
  if (!projectCheck) { res.status(404).json({ error: "Project not found" }); return; }

  // Delete associated photos first to satisfy the FK constraint
  await db.delete(dailyReportPhotosTable).where(eq(dailyReportPhotosTable.reportId, reportId));

  await db
    .delete(dailyReportsTable)
    .where(and(eq(dailyReportsTable.id, reportId), eq(dailyReportsTable.projectId, projectId)));
  res.json({ ok: true });
}))

export default router;
