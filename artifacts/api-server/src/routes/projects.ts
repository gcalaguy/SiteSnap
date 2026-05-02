import { Router } from "express";
import {
  db,
  projectsTable,
  dailyReportsTable,
  rfisTable,
  costAnalysesTable,
} from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { requireAuth, requireCompany, requireOwnerOrForeman } from "../lib/auth";
import { CreateProjectBody, UpdateProjectBody } from "@workspace/api-zod";

const router = Router();

// GET /projects
router.get("/projects", requireAuth, requireCompany, async (req, res) => {
  const projects = await db
    .select()
    .from(projectsTable)
    .where(eq(projectsTable.companyId, req.companyId!));
  res.json(projects);
});

// POST /projects
router.post(
  "/projects",
  requireAuth,
  requireCompany,
  requireOwnerOrForeman,
  async (req, res) => {
    const parsed = CreateProjectBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid body", details: parsed.error });
      return;
    }

    const [project] = await db
      .insert(projectsTable)
      .values({ ...parsed.data, companyId: req.companyId! })
      .returning();

    res.status(201).json(project);
  },
);

// GET /projects/:projectId
router.get(
  "/projects/:projectId",
  requireAuth,
  requireCompany,
  async (req, res) => {
    const projectId = parseInt(req.params.projectId);

    const [project] = await db
      .select()
      .from(projectsTable)
      .where(
        and(
          eq(projectsTable.id, projectId),
          eq(projectsTable.companyId, req.companyId!),
        ),
      )
      .limit(1);

    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    res.json(project);
  },
);

// PUT /projects/:projectId
router.put(
  "/projects/:projectId",
  requireAuth,
  requireCompany,
  requireOwnerOrForeman,
  async (req, res) => {
    const projectId = parseInt(req.params.projectId);
    const parsed = UpdateProjectBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid body" });
      return;
    }

    const [project] = await db
      .update(projectsTable)
      .set(parsed.data)
      .where(
        and(
          eq(projectsTable.id, projectId),
          eq(projectsTable.companyId, req.companyId!),
        ),
      )
      .returning();

    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    res.json(project);
  },
);

// DELETE /projects/:projectId
router.delete(
  "/projects/:projectId",
  requireAuth,
  requireCompany,
  requireOwnerOrForeman,
  async (req, res) => {
    const projectId = parseInt(req.params.projectId);

    await db
      .delete(projectsTable)
      .where(
        and(
          eq(projectsTable.id, projectId),
          eq(projectsTable.companyId, req.companyId!),
        ),
      );

    res.status(204).send();
  },
);

// GET /projects/:projectId/summary — dashboard summary for a single project
router.get(
  "/projects/:projectId/summary",
  requireAuth,
  requireCompany,
  async (req, res) => {
    const projectId = parseInt(req.params.projectId);

    const [project] = await db
      .select()
      .from(projectsTable)
      .where(
        and(
          eq(projectsTable.id, projectId),
          eq(projectsTable.companyId, req.companyId!),
        ),
      )
      .limit(1);

    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    const reports = await db
      .select()
      .from(dailyReportsTable)
      .where(eq(dailyReportsTable.projectId, projectId));

    const rfis = await db
      .select()
      .from(rfisTable)
      .where(eq(rfisTable.projectId, projectId));

    const analyses = await db
      .select()
      .from(costAnalysesTable)
      .where(eq(costAnalysesTable.projectId, projectId));

    const totalSpent = analyses.reduce(
      (sum, a) => sum + parseFloat(a.totalCost),
      0,
    );
    const budget = project.budget ? parseFloat(project.budget) : null;
    const openRFIs = rfis.filter((r) => r.status === "open" || r.status === "in_review").length;
    const closedRFIs = rfis.filter((r) => r.status === "answered" || r.status === "closed").length;
    const lastReport = reports.sort((a, b) =>
      b.reportDate.localeCompare(a.reportDate),
    )[0];

    res.json({
      projectId: project.id,
      projectName: project.name,
      status: project.status,
      totalBudget: budget,
      totalSpent,
      budgetUtilizationPercent: budget ? Math.round((totalSpent / budget) * 100) : null,
      reportCount: reports.length,
      openRFICount: openRFIs,
      closedRFICount: closedRFIs,
      lastReportDate: lastReport?.reportDate ?? null,
    });
  },
);

export default router;
