import { Router } from "express";
import { db, dailyReportsTable, usersTable, projectsTable, dailyReportPhotosTable } from "@workspace/db";
import { eq, and, inArray, gte, lte, SQL } from "drizzle-orm";
import { requireAuth, requireCompany, requireOwnerOrForeman } from "../lib/auth";
import { requirePermission } from "../lib/permissionGate";
import { CreateDailyReportBody, UpdateDailyReportBody } from "@workspace/api-zod";
import { asyncHandler } from "../lib/asyncHandler";

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
      conditions.push(eq(dailyReportsTable.projectId, projectIdFilter));
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
      createdAt: r.createdAt,
      submittedByName: r.submittedByFirstName && r.submittedByLastName
        ? `${r.submittedByFirstName} ${r.submittedByLastName}`
        : "Unknown",
    })));
  }),
);

const router = Router({ mergeParams: true });

// Helper: verify project belongs to user's company
async function verifyProjectAccess(projectId: number, companyId: number) {
  const [project] = await db
    .select()
    .from(projectsTable)
    .where(and(eq(projectsTable.id, projectId), eq(projectsTable.companyId, companyId)))
    .limit(1);
  return project;
}

// GET /projects/:projectId/daily-reports
router.get("/", requireAuth, requireCompany, requirePermission("viewTimesheets"), async (req, res) => {
  const projectId = parseInt(req.params.projectId as string);
  const project = await verifyProjectAccess(projectId, req.companyId!);
  if (!project) { res.status(404).json({ error: "Project not found" }); return; }

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
});

// POST /projects/:projectId/daily-reports
router.post("/", requireAuth, requireCompany, requirePermission("submitExpenses"), async (req, res) => {
  const projectId = parseInt(req.params.projectId as string);
  const project = await verifyProjectAccess(projectId, req.companyId!);
  if (!project) { res.status(404).json({ error: "Project not found" }); return; }

  const parsed = CreateDailyReportBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body", details: parsed.error });
    return;
  }

  const { reportDate, ...restInsert } = parsed.data;
  const [report] = await db
    .insert(dailyReportsTable)
    .values({
      ...restInsert,
      projectId,
      submittedByUserId: req.userId!,
      reportDate: reportDate instanceof Date ? reportDate.toISOString().split("T")[0] : reportDate,
    })
    .returning();

  const [submittedBy] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, req.userId!))
    .limit(1);

  res.status(201).json({ ...report, submittedBy: submittedBy ?? null });
});

// GET /projects/:projectId/daily-reports/:reportId
router.get("/:reportId", requireAuth, requireCompany, requirePermission("viewTimesheets"), async (req, res) => {
  const projectId = parseInt(req.params.projectId as string);
  const reportId = parseInt(req.params.reportId as string);

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
});

// PUT /projects/:projectId/daily-reports/:reportId
router.put("/:reportId", requireAuth, requireCompany, requirePermission("submitExpenses"), async (req, res) => {
  const projectId = parseInt(req.params.projectId as string);
  const reportId = parseInt(req.params.reportId as string);

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
});

// DELETE /projects/:projectId/daily-reports/:reportId
router.delete("/:reportId", requireAuth, requireCompany, requireOwnerOrForeman, async (req, res) => {
  const projectId = parseInt(req.params.projectId as string);
  const reportId = parseInt(req.params.reportId as string);
  await db
    .delete(dailyReportsTable)
    .where(and(eq(dailyReportsTable.id, reportId), eq(dailyReportsTable.projectId, projectId)));
  res.json({ ok: true });
});

export default router;
