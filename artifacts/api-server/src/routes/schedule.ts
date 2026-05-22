import { Router } from "express";
import { db, workerSchedulesTable, usersTable, userMembershipsTable, projectsTable, companiesTable, contactsTable } from "@workspace/db";
import { eq, and, lte, gte, or } from "drizzle-orm";
import { requireAuth, requireCompany, requireOwnerOrForeman } from "../lib/auth";
import { requirePermission } from "../lib/permissionGate";
import { z } from "zod";

const router = Router();

const CreateScheduleBody = z.object({
  projectId: z.number().int().positive(),
  userId: z.number().int().positive().optional(),
  contactId: z.number().int().positive().optional(),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  notes: z.string().optional(),
});

const UpdateScheduleBody = z.object({
  startDate: z.string().min(1),
  endDate: z.string().min(1),
});

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
      userRole: userMembershipsTable.role,
    })
    .from(workerSchedulesTable)
    .leftJoin(projectsTable, eq(workerSchedulesTable.projectId, projectsTable.id))
    .leftJoin(usersTable, eq(workerSchedulesTable.userId, usersTable.id))
    .leftJoin(
      userMembershipsTable,
      and(
        eq(userMembershipsTable.userId, workerSchedulesTable.userId),
        eq(userMembershipsTable.companyId, req.companyId!),
      ),
    )
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
      role: userMembershipsTable.role,
      email: usersTable.email,
    })
    .from(usersTable)
    .innerJoin(
      userMembershipsTable,
      and(
        eq(userMembershipsTable.userId, usersTable.id),
        eq(userMembershipsTable.companyId, req.companyId!),
      ),
    );

  // And all active projects
  const projects = await db
    .select({ id: projectsTable.id, name: projectsTable.name, status: projectsTable.status })
    .from(projectsTable)
    .where(eq(projectsTable.companyId, req.companyId!));

  const subcontractors = await db.select().from(contactsTable)
    .where(and(eq(contactsTable.companyId, req.companyId!), eq(contactsTable.type, "subcontractor")))
    .orderBy(contactsTable.name);

  res.json({
    weekStart: fmt(monday),
    weekEnd: fmt(sunday),
    assignments,
    members,
    projects,
    subcontractors,
  });
});

// GET /api/projects/:projectId/schedule
// Returns all assignments for a specific project
router.get("/projects/:projectId/schedule", requireAuth, requireCompany, requirePermission("viewSchedules"), async (req, res) => {
  const projectId = Number(req.params.projectId);

  const assignments = await db
    .select({
      id: workerSchedulesTable.id,
      projectId: workerSchedulesTable.projectId,
      userId: workerSchedulesTable.userId,
      contactId: workerSchedulesTable.contactId,
      startDate: workerSchedulesTable.startDate,
      endDate: workerSchedulesTable.endDate,
      notes: workerSchedulesTable.notes,
      createdAt: workerSchedulesTable.createdAt,
      userFirstName: usersTable.firstName,
      userLastName: usersTable.lastName,
      userRole: userMembershipsTable.role,
      userEmail: usersTable.email,
      contactName: contactsTable.name,
      contactType: contactsTable.type,
      contactCompliance: contactsTable.complianceStatus,
    })
    .from(workerSchedulesTable)
    .leftJoin(usersTable, eq(workerSchedulesTable.userId, usersTable.id))
    .leftJoin(contactsTable, eq(workerSchedulesTable.contactId, contactsTable.id))
    .leftJoin(
      userMembershipsTable,
      and(
        eq(userMembershipsTable.userId, workerSchedulesTable.userId),
        eq(userMembershipsTable.companyId, req.companyId!),
      ),
    )
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
  const parsed = CreateScheduleBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Malformed request payload", details: parsed.error.flatten() }); return; }

  const { projectId, userId, contactId, startDate, endDate, notes } = parsed.data;
  if (!userId && !contactId) {
    res.status(400).json({ error: "Either userId or contactId is required" });
    return;
  }

  // If a contactId is provided, check compliance
  if (contactId) {
    const [contact] = await db.select().from(contactsTable)
      .where(and(eq(contactsTable.id, Number(contactId)), eq(contactsTable.companyId, req.companyId!)))
      .limit(1);
    if (!contact) {
      res.status(404).json({ error: "Contact not found" });
      return;
    }
    if (contact.complianceStatus === "non_compliant") {
      res.status(409).json({ error: "This subcontractor is non-compliant. Update compliance documents before assigning.", code: "COMPLIANCE_ERROR" });
      return;
    }
  }

  const [row] = await db.insert(workerSchedulesTable).values({
    companyId: req.companyId!,
    projectId: Number(projectId),
    userId: userId ? Number(userId) : null,
    contactId: contactId ? Number(contactId) : null,
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
      contactId: workerSchedulesTable.contactId,
      startDate: workerSchedulesTable.startDate,
      endDate: workerSchedulesTable.endDate,
      notes: workerSchedulesTable.notes,
      createdAt: workerSchedulesTable.createdAt,
      projectName: projectsTable.name,
      userFirstName: usersTable.firstName,
      userLastName: usersTable.lastName,
      userRole: userMembershipsTable.role,
      contactName: contactsTable.name,
      contactType: contactsTable.type,
      contactCompliance: contactsTable.complianceStatus,
    })
    .from(workerSchedulesTable)
    .leftJoin(projectsTable, eq(workerSchedulesTable.projectId, projectsTable.id))
    .leftJoin(usersTable, eq(workerSchedulesTable.userId, usersTable.id))
    .leftJoin(contactsTable, eq(workerSchedulesTable.contactId, contactsTable.id))
    .leftJoin(
      userMembershipsTable,
      and(
        eq(userMembershipsTable.userId, workerSchedulesTable.userId),
        eq(userMembershipsTable.companyId, req.companyId!),
      ),
    )
    .where(eq(workerSchedulesTable.id, row.id));

  res.status(201).json(full);
});

// PATCH /api/schedule/:id — update dates
router.patch("/schedule/:id", requireAuth, requireCompany, requireOwnerOrForeman, async (req, res) => {
  const id = Number(req.params.id);
  const parsed = UpdateScheduleBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Malformed request payload", details: parsed.error.flatten() }); return; }
  const { startDate, endDate } = parsed.data;

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

  const [assignments, projects, members, subcontractors] = await Promise.all([
    db
      .select({
        id: workerSchedulesTable.id,
        projectId: workerSchedulesTable.projectId,
        userId: workerSchedulesTable.userId,
        contactId: workerSchedulesTable.contactId,
        startDate: workerSchedulesTable.startDate,
        endDate: workerSchedulesTable.endDate,
        notes: workerSchedulesTable.notes,
        projectName: projectsTable.name,
        userFirstName: usersTable.firstName,
        userLastName: usersTable.lastName,
        userRole: userMembershipsTable.role,
        contactName: contactsTable.name,
        contactType: contactsTable.type,
        contactCompliance: contactsTable.complianceStatus,
      })
      .from(workerSchedulesTable)
      .leftJoin(projectsTable, eq(workerSchedulesTable.projectId, projectsTable.id))
      .leftJoin(usersTable, eq(workerSchedulesTable.userId, usersTable.id))
      .leftJoin(contactsTable, eq(workerSchedulesTable.contactId, contactsTable.id))
      .leftJoin(
        userMembershipsTable,
        and(
          eq(userMembershipsTable.userId, workerSchedulesTable.userId),
          eq(userMembershipsTable.companyId, req.companyId!),
        ),
      )
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
        role: userMembershipsTable.role,
        email: usersTable.email,
      })
      .from(usersTable)
      .innerJoin(
        userMembershipsTable,
        and(
          eq(userMembershipsTable.userId, usersTable.id),
          eq(userMembershipsTable.companyId, req.companyId!),
        ),
      ),
    db.select().from(contactsTable)
      .where(and(eq(contactsTable.companyId, req.companyId!), eq(contactsTable.type, "subcontractor"))),
  ]);

  res.json({ assignments, projects, members, subcontractors, from: fromDate, to: toDate });
});

export default router;
