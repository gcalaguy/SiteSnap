import { Router } from "express";
import { db, timeEntriesTable, projectsTable, usersTable, timesheetsTable, userMembershipsTable } from "@workspace/db";
import { eq, and, desc, gte, lte, sql } from "drizzle-orm";
import { requireAuth, requireCompany } from "../lib/auth";
import { canAccessProject } from "../lib/projectAccess";
import { asyncHandler } from "../lib/asyncHandler";
import { z } from "zod";

const router = Router({ mergeParams: true });

function getMonday(isoDate: string): string {
  const d = new Date(isoDate + "T00:00:00");
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

/**
 * After any time-entry change (create, edit, delete), recalculate the
 * total hours for that week and upsert the corresponding timesheet row.
 * Uses ON CONFLICT DO UPDATE to avoid race conditions.
 */
async function syncTimesheetFromEntries(companyId: number, userId: number, weekStart: string, projectId?: number | null) {
  const entries = await db
    .select({ hours: timeEntriesTable.hours })
    .from(timeEntriesTable)
    .where(and(
      eq(timeEntriesTable.companyId, companyId),
      eq(timeEntriesTable.userId, userId),
      gte(timeEntriesTable.date, weekStart),
      lte(timeEntriesTable.date, sql`${weekStart}::date + interval '6 days'`)
    ));

  const total = entries.reduce((s, e) => s + parseFloat(e.hours), 0);

  const values = {
    companyId,
    userId,
    weekStart,
    status: "submitted",
    totalHours: total.toFixed(2),
    projectId: projectId ?? null,
  };
  const set = {
    totalHours: total.toFixed(2),
    updatedAt: new Date(),
    projectId: projectId ?? null,
  };

  // Atomic upsert via ON CONFLICT — avoids race conditions when two entries
  // are created simultaneously for the same week. The DB enforces uniqueness
  // via two PARTIAL unique indexes (one for project_id IS NULL, one for
  // project_id IS NOT NULL — see migration 0018), so the conflict target must
  // match whichever one applies, including its predicate via targetWhere.
  if (projectId != null) {
    await db.insert(timesheetsTable)
      .values(values)
      .onConflictDoUpdate({
        target: [timesheetsTable.companyId, timesheetsTable.userId, timesheetsTable.weekStart, timesheetsTable.projectId],
        targetWhere: sql`${timesheetsTable.projectId} IS NOT NULL`,
        set,
      });
  } else {
    await db.insert(timesheetsTable)
      .values(values)
      .onConflictDoUpdate({
        target: [timesheetsTable.companyId, timesheetsTable.userId, timesheetsTable.weekStart],
        targetWhere: sql`${timesheetsTable.projectId} IS NULL`,
        set,
      });
  }
}

const CreateTimeEntryBody = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD"),
  hours: z.number().positive().max(24),
  description: z.string().max(500).optional(),
});

// GET /projects/:projectId/time-entries — list entries for a project
router.get("/", requireAuth, requireCompany, asyncHandler(async (req, res) => {
  const projectId = parseInt(req.params.projectId as string);
  if (isNaN(projectId)) { res.status(400).json({ error: "Invalid projectId" }); return; }
  if (!(await canAccessProject(req.companyId!, req.userId!, req.userRole ?? "worker", projectId))) {
    res.status(403).json({ error: "You are not assigned to this project" });
    return;
  }

  // Workers only see their own entries; foreman/owner see all
  const isPrivileged = req.userRole === "owner" || req.userRole === "foreman";
  const where = isPrivileged
    ? and(eq(timeEntriesTable.projectId, projectId), eq(timeEntriesTable.companyId, req.companyId!))
    : and(eq(timeEntriesTable.projectId, projectId), eq(timeEntriesTable.companyId, req.companyId!), eq(timeEntriesTable.userId, req.userId!));

  const entries = await db
    .select({
      id: timeEntriesTable.id,
      projectId: timeEntriesTable.projectId,
      userId: timeEntriesTable.userId,
      date: timeEntriesTable.date,
      hours: timeEntriesTable.hours,
      description: timeEntriesTable.description,
      createdAt: timeEntriesTable.createdAt,
      user: {
        id: usersTable.id,
        firstName: usersTable.firstName,
        lastName: usersTable.lastName,
        email: usersTable.email,
        role: userMembershipsTable.role,
      },
    })
    .from(timeEntriesTable)
    .leftJoin(usersTable, eq(timeEntriesTable.userId, usersTable.id))
    .leftJoin(
      userMembershipsTable,
      and(
        eq(userMembershipsTable.userId, timeEntriesTable.userId),
        eq(userMembershipsTable.companyId, req.companyId!),
      ),
    )
    .where(where)
    .orderBy(desc(timeEntriesTable.date), desc(timeEntriesTable.createdAt));

  res.json(entries);
}))

// POST /projects/:projectId/time-entries — log hours
router.post("/", requireAuth, requireCompany, asyncHandler(async (req, res) => {
  if (!req.companyId) { res.status(403).json({ error: "No company associated with this account" }); return; }

  const projectId = parseInt(req.params.projectId as string);
  if (isNaN(projectId)) { res.status(400).json({ error: "Invalid projectId" }); return; }

  // Verify project belongs to company
  const [project] = await db.select({ id: projectsTable.id })
    .from(projectsTable)
    .where(and(eq(projectsTable.id, projectId), eq(projectsTable.companyId, req.companyId!)))
    .limit(1);
  if (!project) { res.status(404).json({ error: "Project not found" }); return; }
  if (!(await canAccessProject(req.companyId!, req.userId!, req.userRole ?? "worker", projectId))) {
    res.status(403).json({ error: "You are not assigned to this project" });
    return;
  }

  const parsed = CreateTimeEntryBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid body", details: parsed.error }); return; }

  const [entry] = await db.insert(timeEntriesTable).values({
    companyId: req.companyId!,
    projectId,
    userId: req.userId!,
    date: parsed.data.date,
    hours: parsed.data.hours.toFixed(2),
    description: parsed.data.description ?? null,
  }).returning();

  // Auto-sync the timesheet for this week
  await syncTimesheetFromEntries(req.companyId!, req.userId!, getMonday(parsed.data.date), projectId);

  // Attach user info to response
  const [user] = await db
    .select({
      id: usersTable.id,
      firstName: usersTable.firstName,
      lastName: usersTable.lastName,
      email: usersTable.email,
      role: userMembershipsTable.role,
    })
    .from(usersTable)
    .leftJoin(
      userMembershipsTable,
      and(
        eq(userMembershipsTable.userId, usersTable.id),
        eq(userMembershipsTable.companyId, req.companyId!),
      ),
    )
    .where(eq(usersTable.id, req.userId!))
    .limit(1);

  res.status(201).json({ ...entry, user });
}))

// PATCH /projects/:projectId/time-entries/:entryId — edit own entry (owner/foreman can edit any)
const EditTimeEntryBody = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD").optional(),
  hours: z.number().positive().max(24).optional(),
  description: z.string().max(500).nullable().optional(),
});

router.patch("/:entryId", requireAuth, requireCompany, asyncHandler(async (req, res) => {
  const projectId = parseInt(req.params.projectId as string);
  const entryId = parseInt(req.params.entryId as string);
  if (isNaN(projectId) || isNaN(entryId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const isPrivileged = req.userRole === "owner" || req.userRole === "foreman";

  const [existing] = await db
    .select()
    .from(timeEntriesTable)
    .where(and(eq(timeEntriesTable.id, entryId), eq(timeEntriesTable.companyId, req.companyId!)))
    .limit(1);
  if (!existing) { res.status(404).json({ error: "Entry not found" }); return; }
  if (!isPrivileged && existing.userId !== req.userId) { res.status(403).json({ error: "Forbidden" }); return; }

  const parsed = EditTimeEntryBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid body", details: parsed.error }); return; }

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (parsed.data.date !== undefined) updates.date = parsed.data.date;
  if (parsed.data.hours !== undefined) updates.hours = parsed.data.hours.toFixed(2);
  if (parsed.data.description !== undefined) updates.description = parsed.data.description;

  const [updated] = await db
    .update(timeEntriesTable)
    .set(updates)
    .where(and(eq(timeEntriesTable.id, entryId), eq(timeEntriesTable.companyId, req.companyId!)))
    .returning();

  // Re-sync timesheet for the new date (or original date if date unchanged)
  const weekDate = parsed.data.date ?? existing.date;
  await syncTimesheetFromEntries(req.companyId!, updated.userId, getMonday(weekDate), projectId);

  // Also sync the old week if the date moved to a different week
  if (parsed.data.date && parsed.data.date !== existing.date) {
    const oldMonday = getMonday(existing.date);
    const newMonday = getMonday(parsed.data.date);
    if (oldMonday !== newMonday) {
      await syncTimesheetFromEntries(req.companyId!, updated.userId, oldMonday, projectId);
    }
  }

  const [user] = await db
    .select({
      id: usersTable.id,
      firstName: usersTable.firstName,
      lastName: usersTable.lastName,
      email: usersTable.email,
      role: userMembershipsTable.role,
    })
    .from(usersTable)
    .leftJoin(
      userMembershipsTable,
      and(
        eq(userMembershipsTable.userId, usersTable.id),
        eq(userMembershipsTable.companyId, req.companyId!),
      ),
    )
    .where(eq(usersTable.id, updated.userId))
    .limit(1);

  res.json({ ...updated, user });
}))

// DELETE /projects/:projectId/time-entries/:entryId — delete own entry (owner/foreman can delete any)
router.delete("/:entryId", requireAuth, requireCompany, asyncHandler(async (req, res) => {
  const projectId = parseInt(req.params.projectId as string);
  const entryId = parseInt(req.params.entryId as string);
  if (isNaN(projectId) || isNaN(entryId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const isPrivileged = req.userRole === "owner" || req.userRole === "foreman";
  const where = isPrivileged
    ? and(eq(timeEntriesTable.id, entryId), eq(timeEntriesTable.companyId, req.companyId!))
    : and(eq(timeEntriesTable.id, entryId), eq(timeEntriesTable.userId, req.userId!), eq(timeEntriesTable.companyId, req.companyId!));

  const [deleted] = await db.delete(timeEntriesTable).where(where).returning();
  if (!deleted) { res.status(404).json({ error: "Entry not found or not authorized" }); return; }

  // Re-sync timesheet after deletion
  await syncTimesheetFromEntries(req.companyId!, deleted.userId, getMonday(deleted.date), projectId);

  res.json({ ok: true });
}))

export default router;
