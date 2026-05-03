import { Router } from "express";
import { db, timeEntriesTable, projectsTable, usersTable } from "@workspace/db";
import { eq, and, desc, gte, lte, sql } from "drizzle-orm";
import { requireAuth, requireCompany, requireOwnerOrForeman } from "../lib/auth";
import { z } from "zod";

const router = Router({ mergeParams: true });

const CreateTimeEntryBody = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD"),
  hours: z.number().positive().max(24),
  description: z.string().max(500).optional(),
});

// GET /projects/:projectId/time-entries — list entries for a project
router.get("/", requireAuth, requireCompany, async (req, res) => {
  const projectId = parseInt(req.params.projectId);
  if (isNaN(projectId)) { res.status(400).json({ error: "Invalid projectId" }); return; }

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
        role: usersTable.role,
      },
    })
    .from(timeEntriesTable)
    .leftJoin(usersTable, eq(timeEntriesTable.userId, usersTable.id))
    .where(where)
    .orderBy(desc(timeEntriesTable.date), desc(timeEntriesTable.createdAt));

  res.json(entries);
});

// POST /projects/:projectId/time-entries — log hours
router.post("/", requireAuth, requireCompany, async (req, res) => {
  const projectId = parseInt(req.params.projectId);
  if (isNaN(projectId)) { res.status(400).json({ error: "Invalid projectId" }); return; }

  // Verify project belongs to company
  const [project] = await db.select({ id: projectsTable.id })
    .from(projectsTable)
    .where(and(eq(projectsTable.id, projectId), eq(projectsTable.companyId, req.companyId!)))
    .limit(1);
  if (!project) { res.status(404).json({ error: "Project not found" }); return; }

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

  // Attach user info to response
  const [user] = await db.select({ id: usersTable.id, firstName: usersTable.firstName, lastName: usersTable.lastName, email: usersTable.email, role: usersTable.role })
    .from(usersTable).where(eq(usersTable.id, req.userId!)).limit(1);

  res.status(201).json({ ...entry, user });
});

// DELETE /projects/:projectId/time-entries/:entryId — delete own entry (owner/foreman can delete any)
router.delete("/:entryId", requireAuth, requireCompany, async (req, res) => {
  const projectId = parseInt(req.params.projectId);
  const entryId = parseInt(req.params.entryId);
  if (isNaN(projectId) || isNaN(entryId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const isPrivileged = req.userRole === "owner" || req.userRole === "foreman";
  const where = isPrivileged
    ? and(eq(timeEntriesTable.id, entryId), eq(timeEntriesTable.companyId, req.companyId!))
    : and(eq(timeEntriesTable.id, entryId), eq(timeEntriesTable.userId, req.userId!), eq(timeEntriesTable.companyId, req.companyId!));

  const [deleted] = await db.delete(timeEntriesTable).where(where).returning();
  if (!deleted) { res.status(404).json({ error: "Entry not found or not authorized" }); return; }
  res.json({ ok: true });
});

export default router;
