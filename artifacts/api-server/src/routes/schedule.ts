import { Router } from "express";
import { db, workerSchedulesTable, usersTable, projectsTable, companiesTable } from "@workspace/db";
import { eq, and, lte, gte, or } from "drizzle-orm";
import { requireAuth, requireCompany, requireOwnerOrForeman } from "../lib/auth";

const router = Router();

// GET /api/schedule?weekOf=YYYY-MM-DD
// Returns all worker assignments for the week containing weekOf
router.get("/schedule", requireAuth, requireCompany, requireOwnerOrForeman, async (req, res) => {
  const weekOfParam = req.query.weekOf as string | undefined;

  const base = weekOfParam ? new Date(weekOfParam) : new Date();
  const dayOfWeek = base.getDay(); // 0 = Sunday
  const monday = new Date(base);
  monday.setDate(base.getDate() - ((dayOfWeek + 6) % 7));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  const fmt = (d: Date) => d.toISOString().split("T")[0];

  const assignments = await db
    .select({
      id: workerSchedulesTable.id,
      projectId: workerSchedulesTable.projectId,
      userId: workerSchedulesTable.userId,
      startDate: workerSchedulesTable.startDate,
      endDate: workerSchedulesTable.endDate,
      notes: workerSchedulesTable.notes,
      createdAt: workerSchedulesTable.createdAt,
      projectName: projectsTable.name,
      projectStatus: projectsTable.status,
      userFirstName: usersTable.firstName,
      userLastName: usersTable.lastName,
      userRole: usersTable.role,
    })
    .from(workerSchedulesTable)
    .leftJoin(projectsTable, eq(workerSchedulesTable.projectId, projectsTable.id))
    .leftJoin(usersTable, eq(workerSchedulesTable.userId, usersTable.id))
    .where(
      and(
        eq(workerSchedulesTable.companyId, req.companyId!),
        lte(workerSchedulesTable.startDate, fmt(sunday)),
        gte(workerSchedulesTable.endDate, fmt(monday)),
      )
    );

  // Also get all company members for the calendar
  const members = await db
    .select({
      id: usersTable.id,
      firstName: usersTable.firstName,
      lastName: usersTable.lastName,
      role: usersTable.role,
      email: usersTable.email,
    })
    .from(usersTable)
    .where(eq(usersTable.companyId, req.companyId!));

  // And all active projects
  const projects = await db
    .select({ id: projectsTable.id, name: projectsTable.name, status: projectsTable.status })
    .from(projectsTable)
    .where(eq(projectsTable.companyId, req.companyId!));

  res.json({
    weekStart: fmt(monday),
    weekEnd: fmt(sunday),
    assignments,
    members,
    projects,
  });
});

// GET /api/projects/:projectId/schedule
// Returns all assignments for a specific project
router.get("/projects/:projectId/schedule", requireAuth, requireCompany, async (req, res) => {
  const projectId = Number(req.params.projectId);

  const assignments = await db
    .select({
      id: workerSchedulesTable.id,
      projectId: workerSchedulesTable.projectId,
      userId: workerSchedulesTable.userId,
      startDate: workerSchedulesTable.startDate,
      endDate: workerSchedulesTable.endDate,
      notes: workerSchedulesTable.notes,
      createdAt: workerSchedulesTable.createdAt,
      userFirstName: usersTable.firstName,
      userLastName: usersTable.lastName,
      userRole: usersTable.role,
      userEmail: usersTable.email,
    })
    .from(workerSchedulesTable)
    .leftJoin(usersTable, eq(workerSchedulesTable.userId, usersTable.id))
    .where(
      and(
        eq(workerSchedulesTable.projectId, projectId),
        eq(workerSchedulesTable.companyId, req.companyId!),
      )
    )
    .orderBy(workerSchedulesTable.startDate);

  res.json(assignments);
});

// POST /api/schedule — create assignment
router.post("/schedule", requireAuth, requireCompany, requireOwnerOrForeman, async (req, res) => {
  const { projectId, userId, startDate, endDate, notes } = req.body;

  if (!projectId || !userId || !startDate || !endDate) {
    res.status(400).json({ error: "projectId, userId, startDate, endDate are required" });
    return;
  }

  const [row] = await db.insert(workerSchedulesTable).values({
    companyId: req.companyId!,
    projectId: Number(projectId),
    userId: Number(userId),
    startDate,
    endDate,
    notes: notes ?? null,
  }).returning();

  // Return with user + project info
  const [full] = await db
    .select({
      id: workerSchedulesTable.id,
      projectId: workerSchedulesTable.projectId,
      userId: workerSchedulesTable.userId,
      startDate: workerSchedulesTable.startDate,
      endDate: workerSchedulesTable.endDate,
      notes: workerSchedulesTable.notes,
      createdAt: workerSchedulesTable.createdAt,
      projectName: projectsTable.name,
      userFirstName: usersTable.firstName,
      userLastName: usersTable.lastName,
      userRole: usersTable.role,
    })
    .from(workerSchedulesTable)
    .leftJoin(projectsTable, eq(workerSchedulesTable.projectId, projectsTable.id))
    .leftJoin(usersTable, eq(workerSchedulesTable.userId, usersTable.id))
    .where(eq(workerSchedulesTable.id, row.id));

  res.status(201).json(full);
});

// PATCH /api/schedule/:id — update dates
router.patch("/schedule/:id", requireAuth, requireCompany, requireOwnerOrForeman, async (req, res) => {
  const id = Number(req.params.id);
  const { startDate, endDate } = req.body;

  if (!startDate || !endDate) {
    res.status(400).json({ error: "startDate and endDate are required" });
    return;
  }

  const [updated] = await db.update(workerSchedulesTable)
    .set({ startDate, endDate })
    .where(and(
      eq(workerSchedulesTable.id, id),
      eq(workerSchedulesTable.companyId, req.companyId!),
    ))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Assignment not found" });
    return;
  }

  res.json(updated);
});

// DELETE /api/schedule/:id
router.delete("/schedule/:id", requireAuth, requireCompany, requireOwnerOrForeman, async (req, res) => {
  const id = Number(req.params.id);
  await db.delete(workerSchedulesTable)
    .where(and(
      eq(workerSchedulesTable.id, id),
      eq(workerSchedulesTable.companyId, req.companyId!),
    ));
  res.status(204).end();
});

// GET /api/schedule/gantt?from=YYYY-MM-DD&to=YYYY-MM-DD
router.get("/schedule/gantt", requireAuth, requireCompany, requireOwnerOrForeman, async (req, res) => {
  const { from, to } = req.query as { from?: string; to?: string };
  const now = new Date();
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const fmt = (d: Date) => d.toISOString().split("T")[0];
  const fromDate = from ?? fmt(firstOfMonth);
  const toDate = to ?? fmt(lastOfMonth);

  const [assignments, projects, members] = await Promise.all([
    db
      .select({
        id: workerSchedulesTable.id,
        projectId: workerSchedulesTable.projectId,
        userId: workerSchedulesTable.userId,
        startDate: workerSchedulesTable.startDate,
        endDate: workerSchedulesTable.endDate,
        notes: workerSchedulesTable.notes,
        projectName: projectsTable.name,
        userFirstName: usersTable.firstName,
        userLastName: usersTable.lastName,
        userRole: usersTable.role,
      })
      .from(workerSchedulesTable)
      .leftJoin(projectsTable, eq(workerSchedulesTable.projectId, projectsTable.id))
      .leftJoin(usersTable, eq(workerSchedulesTable.userId, usersTable.id))
      .where(
        and(
          eq(workerSchedulesTable.companyId, req.companyId!),
          lte(workerSchedulesTable.startDate, toDate),
          gte(workerSchedulesTable.endDate, fromDate),
        )
      ),
    db
      .select({
        id: projectsTable.id,
        name: projectsTable.name,
        status: projectsTable.status,
        startDate: projectsTable.startDate,
        endDate: projectsTable.endDate,
      })
      .from(projectsTable)
      .where(eq(projectsTable.companyId, req.companyId!)),
    db
      .select({
        id: usersTable.id,
        firstName: usersTable.firstName,
        lastName: usersTable.lastName,
        role: usersTable.role,
        email: usersTable.email,
      })
      .from(usersTable)
      .where(eq(usersTable.companyId, req.companyId!)),
  ]);

  res.json({ assignments, projects, members, from: fromDate, to: toDate });
});

export default router;
