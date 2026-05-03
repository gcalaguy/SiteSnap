import { Router } from "express";
import {
  db,
  projectsTable,
  dailyReportsTable,
  rfisTable,
  costAnalysesTable,
  tasksTable,
  projectMembersTable,
  usersTable,
} from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { requireAuth, requireCompany, requireOwnerOrForeman } from "../lib/auth";
import { CreateProjectBody, UpdateProjectBody } from "@workspace/api-zod";

const router = Router();

// GET /projects
router.get("/projects", requireAuth, requireCompany, async (req, res) => {
  if (req.userRole === "worker") {
    const rows = await db
      .select({ project: projectsTable })
      .from(projectsTable)
      .innerJoin(
        projectMembersTable,
        and(
          eq(projectMembersTable.projectId, projectsTable.id),
          eq(projectMembersTable.userId, req.userId!),
        ),
      )
      .where(eq(projectsTable.companyId, req.companyId!));
    res.json(rows.map((r) => r.project));
  } else {
    const projects = await db
      .select()
      .from(projectsTable)
      .where(eq(projectsTable.companyId, req.companyId!));
    res.json(projects);
  }
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

    // Workers may only access projects they are explicitly assigned to
    if (req.userRole === "worker") {
      const [membership] = await db
        .select()
        .from(projectMembersTable)
        .where(
          and(
            eq(projectMembersTable.projectId, projectId),
            eq(projectMembersTable.userId, req.userId!),
          ),
        )
        .limit(1);

      if (!membership) {
        res.status(403).json({ error: "Access denied" });
        return;
      }
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

    const [reports, rfis, analyses, tasks] = await Promise.all([
      db.select().from(dailyReportsTable).where(eq(dailyReportsTable.projectId, projectId)),
      db.select().from(rfisTable).where(eq(rfisTable.projectId, projectId)),
      db.select().from(costAnalysesTable).where(eq(costAnalysesTable.projectId, projectId)),
      db.select().from(tasksTable).where(eq(tasksTable.projectId, projectId)),
    ]);

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

    const todoCount = tasks.filter((t) => t.status === "todo").length;
    const inProgressCount = tasks.filter((t) => t.status === "in_progress").length;
    const doneCount = tasks.filter((t) => t.status === "done").length;

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
      taskTotal: tasks.length,
      taskTodoCount: todoCount,
      taskInProgressCount: inProgressCount,
      taskDoneCount: doneCount,
    });
  },
);

// GET /projects/:projectId/members — list workers assigned to a project
router.get(
  "/projects/:projectId/members",
  requireAuth,
  requireCompany,
  async (req, res) => {
    const projectId = parseInt(req.params.projectId);

    const rows = await db
      .select({
        id: usersTable.id,
        firstName: usersTable.firstName,
        lastName: usersTable.lastName,
        email: usersTable.email,
        role: usersTable.role,
        addedAt: projectMembersTable.addedAt,
      })
      .from(projectMembersTable)
      .innerJoin(usersTable, eq(usersTable.id, projectMembersTable.userId))
      .where(
        and(
          eq(projectMembersTable.projectId, projectId),
          eq(projectMembersTable.companyId, req.companyId!),
        ),
      );

    res.json(rows);
  },
);

// POST /projects/:projectId/members — assign a worker to a project
router.post(
  "/projects/:projectId/members",
  requireAuth,
  requireCompany,
  requireOwnerOrForeman,
  async (req, res) => {
    const projectId = parseInt(req.params.projectId);
    const { userId } = req.body;

    if (!userId) {
      res.status(400).json({ error: "userId is required" });
      return;
    }

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

    const [user] = await db
      .select()
      .from(usersTable)
      .where(
        and(
          eq(usersTable.id, userId),
          eq(usersTable.companyId, req.companyId!),
        ),
      )
      .limit(1);

    if (!user) {
      res.status(404).json({ error: "User not found in this company" });
      return;
    }

    try {
      const [member] = await db
        .insert(projectMembersTable)
        .values({ projectId, userId, companyId: req.companyId! })
        .returning();
      res.status(201).json(member);
    } catch (e: any) {
      if (e.code === "23505") {
        res.status(409).json({ error: "User is already assigned to this project" });
      } else {
        throw e;
      }
    }
  },
);

// DELETE /projects/:projectId/members/:userId — remove a worker from a project
router.delete(
  "/projects/:projectId/members/:memberId",
  requireAuth,
  requireCompany,
  requireOwnerOrForeman,
  async (req, res) => {
    const projectId = parseInt(req.params.projectId);
    const memberId = parseInt(req.params.memberId);

    await db
      .delete(projectMembersTable)
      .where(
        and(
          eq(projectMembersTable.projectId, projectId),
          eq(projectMembersTable.userId, memberId),
          eq(projectMembersTable.companyId, req.companyId!),
        ),
      );

    res.status(204).send();
  },
);

export default router;
