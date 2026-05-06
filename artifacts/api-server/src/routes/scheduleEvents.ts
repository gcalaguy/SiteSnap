import { Router } from "express";
import {
  db,
  equipmentTable,
  scheduleEventsTable,
  scheduleEventAssigneesTable,
  usersTable,
  projectsTable,
} from "@workspace/db";
import { eq, and, or, lt, gt, ne, inArray, gte, lte } from "drizzle-orm";
import { requireAuth, requireCompany, requireOwnerOrForeman } from "../lib/auth";
import { asyncHandler } from "../lib/asyncHandler";

const router = Router();

// ── Equipment ──────────────────────────────────────────────────────────────────

// GET /api/equipment
router.get(
  "/equipment",
  requireAuth,
  requireCompany,
  asyncHandler(async (req, res) => {
    const rows = await db
      .select()
      .from(equipmentTable)
      .where(eq(equipmentTable.companyId, req.companyId!))
      .orderBy(equipmentTable.name);
    res.json(rows);
  }),
);

// POST /api/equipment
router.post(
  "/equipment",
  requireAuth,
  requireCompany,
  requireOwnerOrForeman,
  asyncHandler(async (req, res) => {
    const { name, type, status, notes } = req.body;
    if (!name) {
      res.status(400).json({ error: "name is required" });
      return;
    }
    const [row] = await db
      .insert(equipmentTable)
      .values({ companyId: req.companyId!, name, type: type ?? "other", status: status ?? "available", notes: notes ?? null })
      .returning();
    res.status(201).json(row);
  }),
);

// PATCH /api/equipment/:id
router.patch(
  "/equipment/:id",
  requireAuth,
  requireCompany,
  requireOwnerOrForeman,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const { name, type, status, notes } = req.body;
    const [row] = await db
      .update(equipmentTable)
      .set({ ...(name !== undefined && { name }), ...(type !== undefined && { type }), ...(status !== undefined && { status }), ...(notes !== undefined && { notes }) })
      .where(and(eq(equipmentTable.id, id), eq(equipmentTable.companyId, req.companyId!)))
      .returning();
    if (!row) { res.status(404).json({ error: "Equipment not found" }); return; }
    res.json(row);
  }),
);

// DELETE /api/equipment/:id
router.delete(
  "/equipment/:id",
  requireAuth,
  requireCompany,
  requireOwnerOrForeman,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    await db.delete(equipmentTable).where(and(eq(equipmentTable.id, id), eq(equipmentTable.companyId, req.companyId!)));
    res.status(204).end();
  }),
);

// ── Schedule Events ────────────────────────────────────────────────────────────

type ConflictResult = { eventId: number; title: string; startTime: Date; endTime: Date };

async function detectConflicts(
  companyId: number,
  resourceType: "user" | "equipment",
  resourceId: number,
  startTime: Date,
  endTime: Date,
  excludeEventId?: number,
): Promise<ConflictResult[]> {
  const assigneesWithEvents = await db
    .select({
      eventId: scheduleEventAssigneesTable.eventId,
      title: scheduleEventsTable.title,
      startTime: scheduleEventsTable.startTime,
      endTime: scheduleEventsTable.endTime,
    })
    .from(scheduleEventAssigneesTable)
    .innerJoin(scheduleEventsTable, eq(scheduleEventsTable.id, scheduleEventAssigneesTable.eventId))
    .where(
      and(
        eq(scheduleEventsTable.companyId, companyId),
        eq(scheduleEventAssigneesTable.resourceType, resourceType),
        eq(scheduleEventAssigneesTable.resourceId, resourceId),
        lt(scheduleEventsTable.startTime, endTime),
        gt(scheduleEventsTable.endTime, startTime),
        ...(excludeEventId ? [ne(scheduleEventsTable.id, excludeEventId)] : []),
      ),
    );
  return assigneesWithEvents;
}

// GET /api/schedule/events
router.get(
  "/schedule/events",
  requireAuth,
  requireCompany,
  asyncHandler(async (req, res) => {
    const { from, to, projectId, type } = req.query as Record<string, string | undefined>;

    const conditions = [eq(scheduleEventsTable.companyId, req.companyId!)];
    if (from) conditions.push(gte(scheduleEventsTable.startTime, new Date(from)));
    if (to) conditions.push(lte(scheduleEventsTable.startTime, new Date(to)));
    if (projectId) conditions.push(eq(scheduleEventsTable.projectId, Number(projectId)));
    if (type) conditions.push(eq(scheduleEventsTable.type, type));

    const events = await db
      .select({
        id: scheduleEventsTable.id,
        companyId: scheduleEventsTable.companyId,
        projectId: scheduleEventsTable.projectId,
        type: scheduleEventsTable.type,
        title: scheduleEventsTable.title,
        startTime: scheduleEventsTable.startTime,
        endTime: scheduleEventsTable.endTime,
        location: scheduleEventsTable.location,
        notes: scheduleEventsTable.notes,
        status: scheduleEventsTable.status,
        createdByUserId: scheduleEventsTable.createdByUserId,
        createdAt: scheduleEventsTable.createdAt,
        projectName: projectsTable.name,
        createdByFirstName: usersTable.firstName,
        createdByLastName: usersTable.lastName,
      })
      .from(scheduleEventsTable)
      .leftJoin(projectsTable, eq(projectsTable.id, scheduleEventsTable.projectId))
      .leftJoin(usersTable, eq(usersTable.id, scheduleEventsTable.createdByUserId))
      .where(and(...conditions))
      .orderBy(scheduleEventsTable.startTime);

    // Fetch assignees for all events
    const eventIds = events.map((e) => e.id);
    const assignees =
      eventIds.length > 0
        ? await db
            .select()
            .from(scheduleEventAssigneesTable)
            .where(inArray(scheduleEventAssigneesTable.eventId, eventIds))
        : [];

    const result = events.map((e) => ({
      ...e,
      assignees: assignees.filter((a) => a.eventId === e.id),
    }));

    res.json(result);
  }),
);

// POST /api/schedule/events
router.post(
  "/schedule/events",
  requireAuth,
  requireCompany,
  requireOwnerOrForeman,
  asyncHandler(async (req, res) => {
    const { title, type, projectId, startTime, endTime, location, notes, assignees, allowConflict } = req.body;

    if (!title || !startTime || !endTime) {
      res.status(400).json({ error: "title, startTime, endTime are required" });
      return;
    }
    const start = new Date(startTime);
    const end = new Date(endTime);
    if (end <= start) {
      res.status(400).json({ error: "endTime must be after startTime" });
      return;
    }

    // Conflict detection (unless overridden)
    if (!allowConflict && Array.isArray(assignees) && assignees.length > 0) {
      const allConflicts: Array<{ resource: typeof assignees[0]; conflicts: ConflictResult[] }> = [];
      for (const a of assignees as Array<{ resourceType: "user" | "equipment"; resourceId: number }>) {
        const conflicts = await detectConflicts(req.companyId!, a.resourceType, a.resourceId, start, end);
        if (conflicts.length > 0) allConflicts.push({ resource: a, conflicts });
      }
      if (allConflicts.length > 0) {
        res.status(409).json({ error: "Scheduling conflict detected", conflicts: allConflicts });
        return;
      }
    }

    const [event] = await db
      .insert(scheduleEventsTable)
      .values({
        companyId: req.companyId!,
        projectId: projectId ? Number(projectId) : null,
        type: type ?? "meeting",
        title,
        startTime: start,
        endTime: end,
        location: location ?? null,
        notes: notes ?? null,
        status: "scheduled",
        createdByUserId: req.userId!,
      })
      .returning();

    if (Array.isArray(assignees) && assignees.length > 0) {
      await db.insert(scheduleEventAssigneesTable).values(
        assignees.map((a: { resourceType: string; resourceId: number }) => ({
          eventId: event.id,
          resourceType: a.resourceType,
          resourceId: a.resourceId,
        })),
      );
    }

    const eventAssignees = await db
      .select()
      .from(scheduleEventAssigneesTable)
      .where(eq(scheduleEventAssigneesTable.eventId, event.id));

    res.status(201).json({ ...event, assignees: eventAssignees });
  }),
);

// PATCH /api/schedule/events/:id
router.patch(
  "/schedule/events/:id",
  requireAuth,
  requireCompany,
  requireOwnerOrForeman,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const { title, type, projectId, startTime, endTime, location, notes, status, assignees, allowConflict } = req.body;

    const existing = await db
      .select()
      .from(scheduleEventsTable)
      .where(and(eq(scheduleEventsTable.id, id), eq(scheduleEventsTable.companyId, req.companyId!)))
      .limit(1);
    if (!existing[0]) { res.status(404).json({ error: "Event not found" }); return; }

    const start = startTime ? new Date(startTime) : existing[0].startTime;
    const end = endTime ? new Date(endTime) : existing[0].endTime;

    // Conflict detection on reschedule
    if (!allowConflict && (startTime || endTime)) {
      const currentAssignees = await db
        .select()
        .from(scheduleEventAssigneesTable)
        .where(eq(scheduleEventAssigneesTable.eventId, id));
      const checkList = assignees ?? currentAssignees.map((a) => ({ resourceType: a.resourceType, resourceId: a.resourceId }));
      for (const a of checkList as Array<{ resourceType: "user" | "equipment"; resourceId: number }>) {
        const conflicts = await detectConflicts(req.companyId!, a.resourceType, a.resourceId, start, end, id);
        if (conflicts.length > 0) {
          res.status(409).json({ error: "Scheduling conflict detected", conflicts });
          return;
        }
      }
    }

    const [updated] = await db
      .update(scheduleEventsTable)
      .set({
        ...(title !== undefined && { title }),
        ...(type !== undefined && { type }),
        ...(projectId !== undefined && { projectId: projectId ? Number(projectId) : null }),
        ...(startTime !== undefined && { startTime: start }),
        ...(endTime !== undefined && { endTime: end }),
        ...(location !== undefined && { location }),
        ...(notes !== undefined && { notes }),
        ...(status !== undefined && { status }),
      })
      .where(and(eq(scheduleEventsTable.id, id), eq(scheduleEventsTable.companyId, req.companyId!)))
      .returning();

    // Update assignees if provided
    if (Array.isArray(assignees)) {
      await db.delete(scheduleEventAssigneesTable).where(eq(scheduleEventAssigneesTable.eventId, id));
      if (assignees.length > 0) {
        await db.insert(scheduleEventAssigneesTable).values(
          assignees.map((a: { resourceType: string; resourceId: number }) => ({
            eventId: id,
            resourceType: a.resourceType,
            resourceId: a.resourceId,
          })),
        );
      }
    }

    const eventAssignees = await db
      .select()
      .from(scheduleEventAssigneesTable)
      .where(eq(scheduleEventAssigneesTable.eventId, id));

    res.json({ ...updated, assignees: eventAssignees });
  }),
);

// DELETE /api/schedule/events/:id
router.delete(
  "/schedule/events/:id",
  requireAuth,
  requireCompany,
  requireOwnerOrForeman,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    await db.delete(scheduleEventsTable).where(
      and(eq(scheduleEventsTable.id, id), eq(scheduleEventsTable.companyId, req.companyId!)),
    );
    res.status(204).end();
  }),
);

// GET /api/schedule/availability
// Returns free time slots for a resource on a given date
router.get(
  "/schedule/availability",
  requireAuth,
  requireCompany,
  asyncHandler(async (req, res) => {
    const { resourceType, resourceId, date } = req.query as Record<string, string>;
    if (!resourceType || !resourceId || !date) {
      res.status(400).json({ error: "resourceType, resourceId, and date are required" });
      return;
    }

    const dayStart = new Date(`${date}T00:00:00`);
    const dayEnd = new Date(`${date}T23:59:59`);

    const booked = await db
      .select({
        startTime: scheduleEventsTable.startTime,
        endTime: scheduleEventsTable.endTime,
        title: scheduleEventsTable.title,
      })
      .from(scheduleEventAssigneesTable)
      .innerJoin(scheduleEventsTable, eq(scheduleEventsTable.id, scheduleEventAssigneesTable.eventId))
      .where(
        and(
          eq(scheduleEventsTable.companyId, req.companyId!),
          eq(scheduleEventAssigneesTable.resourceType, resourceType),
          eq(scheduleEventAssigneesTable.resourceId, Number(resourceId)),
          lt(scheduleEventsTable.startTime, dayEnd),
          gt(scheduleEventsTable.endTime, dayStart),
        ),
      )
      .orderBy(scheduleEventsTable.startTime);

    res.json({ date, resourceType, resourceId: Number(resourceId), booked });
  }),
);

export default router;
