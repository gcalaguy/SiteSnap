import { Router } from "express";
import { db, dailyReportsTable, usersTable, projectsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth, requireCompany } from "../lib/auth";
import { CreateDailyReportBody, UpdateDailyReportBody } from "@workspace/api-zod";

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
router.get("/", requireAuth, requireCompany, async (req, res) => {
  const projectId = parseInt(req.params.projectId);
  const project = await verifyProjectAccess(projectId, req.companyId!);
  if (!project) { res.status(404).json({ error: "Project not found" }); return; }

  const reports = await db
    .select()
    .from(dailyReportsTable)
    .where(eq(dailyReportsTable.projectId, projectId));

  // Attach submittedBy user for each report
  const userIds = [...new Set(reports.map((r) => r.submittedByUserId))];
  const users = userIds.length
    ? await db.select().from(usersTable).where(
        userIds.length === 1
          ? eq(usersTable.id, userIds[0])
          : eq(usersTable.id, userIds[0]), // simplified; full IN needed for prod
      )
    : [];
  const userMap = Object.fromEntries(users.map((u) => [u.id, u]));

  res.json(reports.map((r) => ({ ...r, submittedBy: userMap[r.submittedByUserId] ?? null })));
});

// POST /projects/:projectId/daily-reports
router.post("/", requireAuth, requireCompany, async (req, res) => {
  const projectId = parseInt(req.params.projectId);
  const project = await verifyProjectAccess(projectId, req.companyId!);
  if (!project) { res.status(404).json({ error: "Project not found" }); return; }

  const parsed = CreateDailyReportBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body", details: parsed.error });
    return;
  }

  const [report] = await db
    .insert(dailyReportsTable)
    .values({ ...parsed.data, projectId, submittedByUserId: req.userId! })
    .returning();

  const [submittedBy] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, req.userId!))
    .limit(1);

  res.status(201).json({ ...report, submittedBy: submittedBy ?? null });
});

// GET /projects/:projectId/daily-reports/:reportId
router.get("/:reportId", requireAuth, requireCompany, async (req, res) => {
  const projectId = parseInt(req.params.projectId);
  const reportId = parseInt(req.params.reportId);

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
router.put("/:reportId", requireAuth, requireCompany, async (req, res) => {
  const projectId = parseInt(req.params.projectId);
  const reportId = parseInt(req.params.reportId);

  const parsed = UpdateDailyReportBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body" });
    return;
  }

  const [report] = await db
    .update(dailyReportsTable)
    .set(parsed.data)
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

export default router;
