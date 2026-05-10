import { Router } from "express";
import {
  db,
  projectsTable,
  dailyReportsTable,
  rfisTable,
  costAnalysesTable,
  tasksTable,
  projectMembersTable,
  workerSchedulesTable,
  usersTable,
  projectNotesTable,
} from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";
import { requireAuth, requireCompany, requireOwnerOrForeman } from "../lib/auth";
import { CreateProjectBody, UpdateProjectBody } from "@workspace/api-zod";
import { asyncHandler } from "../lib/asyncHandler";
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "../lib/errors";

const router = Router();

// GET /projects
router.get(
  "/projects",
  requireAuth,
  requireCompany,
  asyncHandler(async (req, res) => {
    if (req.userRole === "worker") {
      const userId = req.userId!;
      const companyId = req.companyId!;

      const [memberRows, scheduleRows] = await Promise.all([
        db
          .select({ projectId: projectMembersTable.projectId })
          .from(projectMembersTable)
          .where(and(eq(projectMembersTable.userId, userId), eq(projectMembersTable.companyId, companyId))),
        db
          .select({ projectId: workerSchedulesTable.projectId })
          .from(workerSchedulesTable)
          .where(and(eq(workerSchedulesTable.userId, userId), eq(workerSchedulesTable.companyId, companyId))),
      ]);

      const projectIdSet = new Set([
        ...memberRows.map((r) => r.projectId),
        ...scheduleRows.map((r) => r.projectId),
      ]);

      if (projectIdSet.size === 0) {
        res.json([]);
        return;
      }

      const projects = await db
        .select()
        .from(projectsTable)
        .where(and(eq(projectsTable.companyId, companyId), inArray(projectsTable.id, [...projectIdSet])));

      res.json(projects);
      return;
    }

    const projects = await db
      .select()
      .from(projectsTable)
      .where(eq(projectsTable.companyId, req.companyId!));

    res.json(projects);
  }),
);

// POST /projects
router.post(
  "/projects",
  requireAuth,
  requireCompany,
  requireOwnerOrForeman,
  asyncHandler(async (req, res) => {
    const parsed = CreateProjectBody.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError("Invalid project data", parsed.error.issues);
    }

    const { startDate, endDate, budget, ...rest } = parsed.data as {
      startDate?: Date | string | null;
      endDate?: Date | string | null;
      budget?: number | string | null;
      name: string;
      address: string;
      city: string;
      province: string;
      status?: "planning" | "active" | "on_hold" | "completed" | "cancelled";
      description?: string | null;
    };

    const [project] = await db
      .insert(projectsTable)
      .values({
        ...rest,
        companyId: req.companyId!,
        startDate: startDate ? String(startDate) : null,
        endDate: endDate ? String(endDate) : null,
        budget: budget != null ? String(budget) : null,
      })
      .returning();

    // Auto-create default tasks for new projects
    const defaultTasks = [
      { title: "Site Assessment & Setup", description: "Initial site walkthrough, safety plan, and equipment staging.", priority: "high" as const },
      { title: "Permits & Documentation", description: "Obtain all required permits and submit documentation.", priority: "high" as const },
      { title: "Foundation & Ground Work", description: "Excavation, grading, and foundation preparation.", priority: "medium" as const },
      { title: "Framing & Structure", description: "Structural framing, walls, and roofing.", priority: "medium" as const },
      { title: "Inspections", description: "Schedule and pass all required building inspections.", priority: "medium" as const },
      { title: "Final Cleanup & Handover", description: "Site cleanup, punch list, and client walkthrough.", priority: "low" as const },
    ];

    if (project) {
      await db.insert(tasksTable).values(
        defaultTasks.map((t) => ({
          projectId: project.id,
          title: t.title,
          description: t.description,
          status: "todo" as const,
          priority: t.priority,
        })),
      );
    }

    res.status(201).json(project);
  }),
);

// GET /projects/:projectId
router.get(
  "/projects/:projectId",
  requireAuth,
  requireCompany,
  asyncHandler(async (req, res) => {
    const projectId = parseInt(req.params.projectId);
    if (isNaN(projectId)) throw new BadRequestError("projectId must be a number");

    const [project] = await db
      .select()
      .from(projectsTable)
      .where(and(eq(projectsTable.id, projectId), eq(projectsTable.companyId, req.companyId!)))
      .limit(1);

    if (!project) throw new NotFoundError("Project not found");

    // Workers may only access projects they are assigned to
    if (req.userRole === "worker") {
      const [membership] = await db
        .select()
        .from(projectMembersTable)
        .where(and(eq(projectMembersTable.projectId, projectId), eq(projectMembersTable.userId, req.userId!)))
        .limit(1);

      if (!membership) {
        const [schedule] = await db
          .select()
          .from(workerSchedulesTable)
          .where(and(eq(workerSchedulesTable.projectId, projectId), eq(workerSchedulesTable.userId, req.userId!)))
          .limit(1);

        if (!schedule) throw new ForbiddenError("You are not assigned to this project");
      }
    }

    res.json(project);
  }),
);

// PUT /projects/:projectId
router.put(
  "/projects/:projectId",
  requireAuth,
  requireCompany,
  requireOwnerOrForeman,
  asyncHandler(async (req, res) => {
    const projectId = parseInt(req.params.projectId);
    if (isNaN(projectId)) throw new BadRequestError("projectId must be a number");

    const parsed = UpdateProjectBody.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError("Invalid project data", parsed.error.issues);
    }

    const { startDate: ud, endDate: ue, budget: ub, ...updateRest } = parsed.data as {
      startDate?: Date | string | null;
      endDate?: Date | string | null;
      budget?: number | string | null;
      name?: string;
      address?: string;
      city?: string;
      province?: string;
      status?: "planning" | "active" | "on_hold" | "completed" | "cancelled";
      description?: string | null;
    };

    const [project] = await db
      .update(projectsTable)
      .set({
        ...updateRest,
        startDate: ud !== undefined ? (ud ? String(ud) : null) : undefined,
        endDate: ue !== undefined ? (ue ? String(ue) : null) : undefined,
        budget: ub !== undefined ? (ub != null ? String(ub) : null) : undefined,
      })
      .where(and(eq(projectsTable.id, projectId), eq(projectsTable.companyId, req.companyId!)))
      .returning();

    if (!project) throw new NotFoundError("Project not found");

    res.json(project);
  }),
);

// DELETE /projects/:projectId
router.delete(
  "/projects/:projectId",
  requireAuth,
  requireCompany,
  requireOwnerOrForeman,
  asyncHandler(async (req, res) => {
    const projectId = parseInt(req.params.projectId);
    if (isNaN(projectId)) throw new BadRequestError("projectId must be a number");

    await db
      .delete(projectsTable)
      .where(and(eq(projectsTable.id, projectId), eq(projectsTable.companyId, req.companyId!)));

    res.status(204).send();
  }),
);

// GET /projects/:projectId/summary
router.get(
  "/projects/:projectId/summary",
  requireAuth,
  requireCompany,
  asyncHandler(async (req, res) => {
    const projectId = parseInt(req.params.projectId);
    if (isNaN(projectId)) throw new BadRequestError("projectId must be a number");

    const [project] = await db
      .select()
      .from(projectsTable)
      .where(and(eq(projectsTable.id, projectId), eq(projectsTable.companyId, req.companyId!)))
      .limit(1);

    if (!project) throw new NotFoundError("Project not found");

    const [reports, rfis, analyses, tasks] = await Promise.all([
      db.select().from(dailyReportsTable).where(eq(dailyReportsTable.projectId, projectId)),
      db.select().from(rfisTable).where(eq(rfisTable.projectId, projectId)),
      db.select().from(costAnalysesTable).where(eq(costAnalysesTable.projectId, projectId)),
      db.select().from(tasksTable).where(eq(tasksTable.projectId, projectId)),
    ]);

    const totalSpent = analyses.reduce((sum, a) => sum + parseFloat(a.totalCost), 0);
    const budget = project.budget ? parseFloat(project.budget) : null;
    const openRFIs = rfis.filter((r) => r.status === "open" || r.status === "in_review").length;
    const closedRFIs = rfis.filter((r) => r.status === "answered" || r.status === "closed").length;
    const lastReport = reports.sort((a, b) => b.reportDate.localeCompare(a.reportDate))[0];

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
      taskTodoCount: tasks.filter((t) => t.status === "todo").length,
      taskInProgressCount: tasks.filter((t) => t.status === "in_progress").length,
      taskDoneCount: tasks.filter((t) => t.status === "done").length,
    });
  }),
);

// GET /projects/:projectId/members
router.get(
  "/projects/:projectId/members",
  requireAuth,
  requireCompany,
  asyncHandler(async (req, res) => {
    const projectId = parseInt(req.params.projectId);
    if (isNaN(projectId)) throw new BadRequestError("projectId must be a number");

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
      .where(and(eq(projectMembersTable.projectId, projectId), eq(projectMembersTable.companyId, req.companyId!)));

    res.json(rows);
  }),
);

// POST /projects/:projectId/members
router.post(
  "/projects/:projectId/members",
  requireAuth,
  requireCompany,
  requireOwnerOrForeman,
  asyncHandler(async (req, res) => {
    const projectId = parseInt(req.params.projectId);
    if (isNaN(projectId)) throw new BadRequestError("projectId must be a number");

    const { userId } = req.body as { userId?: number };
    if (!userId) throw new BadRequestError("userId is required");

    const [[project], [user]] = await Promise.all([
      db
        .select()
        .from(projectsTable)
        .where(and(eq(projectsTable.id, projectId), eq(projectsTable.companyId, req.companyId!)))
        .limit(1),
      db
        .select()
        .from(usersTable)
        .where(and(eq(usersTable.id, userId), eq(usersTable.companyId, req.companyId!)))
        .limit(1),
    ]);

    if (!project) throw new NotFoundError("Project not found");
    if (!user) throw new NotFoundError("User not found in this company");

    try {
      const [member] = await db
        .insert(projectMembersTable)
        .values({ projectId, userId, companyId: req.companyId! })
        .returning();
      res.status(201).json(member);
    } catch (e: any) {
      if (e.code === "23505") {
        throw new ConflictError("User is already assigned to this project");
      }
      throw e;
    }
  }),
);

// DELETE /projects/:projectId/members/:memberId
router.delete(
  "/projects/:projectId/members/:memberId",
  requireAuth,
  requireCompany,
  requireOwnerOrForeman,
  asyncHandler(async (req, res) => {
    const projectId = parseInt(req.params.projectId);
    const memberId = parseInt(req.params.memberId);
    if (isNaN(projectId) || isNaN(memberId)) throw new BadRequestError("Invalid IDs");

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
  }),
);

// GET /projects/:projectId/notes
router.get(
  "/projects/:projectId/notes",
  requireAuth,
  requireCompany,
  asyncHandler(async (req, res) => {
    const projectId = parseInt(req.params.projectId);
    if (isNaN(projectId)) throw new BadRequestError("Invalid project ID");

    const notes = await db
      .select({
        id: projectNotesTable.id,
        content: projectNotesTable.content,
        createdAt: projectNotesTable.createdAt,
        author: {
          id: usersTable.id,
          firstName: usersTable.firstName,
          lastName: usersTable.lastName,
        },
      })
      .from(projectNotesTable)
      .leftJoin(usersTable, eq(projectNotesTable.authorId, usersTable.id))
      .where(
        and(
          eq(projectNotesTable.projectId, projectId),
          eq(projectNotesTable.companyId, req.companyId!),
        ),
      )
      .orderBy(projectNotesTable.createdAt);

    res.json(notes);
  }),
);

// POST /projects/:projectId/notes
router.post(
  "/projects/:projectId/notes",
  requireAuth,
  requireCompany,
  asyncHandler(async (req, res) => {
    const projectId = parseInt(req.params.projectId);
    if (isNaN(projectId)) throw new BadRequestError("Invalid project ID");

    const { content } = req.body as { content?: string };
    if (!content?.trim()) throw new ValidationError("content is required");

    const [note] = await db
      .insert(projectNotesTable)
      .values({
        projectId,
        companyId: req.companyId!,
        authorId: req.userId!,
        content: content.trim(),
      })
      .returning();

    res.status(201).json(note);
  }),
);

// DELETE /projects/:projectId/notes/:noteId
router.delete(
  "/projects/:projectId/notes/:noteId",
  requireAuth,
  requireCompany,
  asyncHandler(async (req, res) => {
    const projectId = parseInt(req.params.projectId);
    const noteId = parseInt(req.params.noteId);
    if (isNaN(projectId) || isNaN(noteId)) throw new BadRequestError("Invalid IDs");

    await db
      .delete(projectNotesTable)
      .where(
        and(
          eq(projectNotesTable.id, noteId),
          eq(projectNotesTable.projectId, projectId),
          eq(projectNotesTable.companyId, req.companyId!),
          eq(projectNotesTable.authorId, req.userId!),
        ),
      );

    res.status(204).send();
  }),
);

export default router;
