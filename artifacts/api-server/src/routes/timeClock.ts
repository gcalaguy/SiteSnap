import { Router } from "express";
import {
  db,
  timeClockSessionsTable,
  timeEntriesTable,
  timesheetsTable,
  projectsTable,
  usersTable,
  userMembershipsTable,
  projectMembersTable,
} from "@workspace/db";
import { eq, and, desc, sql, inArray } from "drizzle-orm";
import { requireAuth, requireCompany, requireTenantCtx, requireOwnerOrForeman, isPrivilegedRole } from "../lib/auth";
import { assertProjectInCompany, canAccessProject } from "../lib/projectAccess";
import { asyncHandler } from "../lib/asyncHandler";
import { logger } from "../lib/logger";
import { getMonday, syncTimesheetFromEntries } from "./timeEntries";
import { z } from "zod";

const router = Router();
router.use(requireAuth, requireCompany, requireTenantCtx);

const userSelect = {
  id: usersTable.id,
  firstName: usersTable.firstName,
  lastName: usersTable.lastName,
  email: usersTable.email,
  role: userMembershipsTable.role,
};

const projectSelect = {
  id: projectsTable.id,
  name: projectsTable.name,
};

const sessionSelect = {
  id: timeClockSessionsTable.id,
  companyId: timeClockSessionsTable.companyId,
  projectId: timeClockSessionsTable.projectId,
  userId: timeClockSessionsTable.userId,
  clockedInByUserId: timeClockSessionsTable.clockedInByUserId,
  clockedOutByUserId: timeClockSessionsTable.clockedOutByUserId,
  date: timeClockSessionsTable.date,
  clockInTime: timeClockSessionsTable.clockInTime,
  clockOutTime: timeClockSessionsTable.clockOutTime,
  clockInNotes: timeClockSessionsTable.clockInNotes,
  clockOutNotes: timeClockSessionsTable.clockOutNotes,
  status: timeClockSessionsTable.status,
  timeEntryId: timeClockSessionsTable.timeEntryId,
};

async function withUserAndProject<T extends { userId: number; projectId: number }>(
  companyId: number,
  row: T,
) {
  // Sequential, not Promise.all: both queries run on the single connection
  // held by the ambient withTenantCtx transaction (via requireTenantCtx), which
  // can only execute one query at a time.
  const [user] = await db
    .select(userSelect)
    .from(usersTable)
    .leftJoin(userMembershipsTable, and(eq(userMembershipsTable.userId, usersTable.id), eq(userMembershipsTable.companyId, companyId)))
    .where(eq(usersTable.id, row.userId))
    .limit(1);
  const [project] = await db.select(projectSelect).from(projectsTable).where(eq(projectsTable.id, row.projectId)).limit(1);
  return { ...row, user: user ?? null, project: project ?? null };
}

/**
 * Batched variant of withUserAndProject for a set of rows that share the same
 * project (e.g. Team Punch clock-in-all) — one project lookup and one batched
 * user lookup instead of 2 queries per row.
 */
async function withUsersAndProject<T extends { userId: number; projectId: number }>(
  companyId: number,
  rows: T[],
) {
  if (rows.length === 0) return [];
  const projectId = rows[0].projectId;

  // Sequential, not Promise.all — same single-connection transaction
  // constraint as withUserAndProject above.
  const users = await db
    .select(userSelect)
    .from(usersTable)
    .leftJoin(userMembershipsTable, and(eq(userMembershipsTable.userId, usersTable.id), eq(userMembershipsTable.companyId, companyId)))
    .where(inArray(usersTable.id, rows.map((r) => r.userId)));
  const [project] = await db.select(projectSelect).from(projectsTable).where(eq(projectsTable.id, projectId)).limit(1);
  const userById = new Map(users.map((u) => [u.id, u]));

  return rows.map((row) => ({ ...row, user: userById.get(row.userId) ?? null, project: project ?? null }));
}

async function findActiveSession(companyId: number, userId: number) {
  const [session] = await db
    .select(sessionSelect)
    .from(timeClockSessionsTable)
    .where(and(
      eq(timeClockSessionsTable.companyId, companyId),
      eq(timeClockSessionsTable.userId, userId),
      eq(timeClockSessionsTable.status, "active"),
    ))
    .limit(1);
  return session ?? null;
}

async function closeSession(companyId: number, session: typeof timeClockSessionsTable.$inferSelect, closedByUserId: number, notes: string | null) {
  const clockOutTime = new Date();
  const rawHours = (clockOutTime.getTime() - new Date(session.clockInTime).getTime()) / 3_600_000;
  if (rawHours > 24) {
    logger.warn({ companyId, sessionId: session.id, rawHours }, "timeClock: session open for over 24h at clock-out — possible forgotten clock-out");
  }
  const hours = Math.min(24, Math.max(0.01, Math.round(rawHours * 100) / 100));

  await db.update(timeClockSessionsTable)
    .set({ status: "completed", clockOutTime, clockedOutByUserId: closedByUserId, clockOutNotes: notes, updatedAt: new Date() })
    .where(eq(timeClockSessionsTable.id, session.id));

  const [entry] = await db.insert(timeEntriesTable).values({
    companyId,
    projectId: session.projectId,
    userId: session.userId,
    date: session.date,
    hours: hours.toFixed(2),
    description: notes ?? session.clockInNotes ?? null,
  }).returning();

  await db.update(timeClockSessionsTable)
    .set({ timeEntryId: entry.id })
    .where(eq(timeClockSessionsTable.id, session.id));

  try {
    await syncTimesheetFromEntries(companyId, session.userId, getMonday(session.date), session.projectId);
  } catch (syncErr: any) {
    logger.error(
      { err: syncErr, companyId, userId: session.userId, projectId: session.projectId, sessionId: session.id },
      "timeClock: syncTimesheetFromEntries failed after clock-out — time entry saved but timesheet not updated",
    );
  }

  return entry;
}

const ClockInBody = z.object({
  projectId: z.number().int(),
  notes: z.string().max(500).optional(),
  localDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "localDate must be YYYY-MM-DD"),
  targetUserId: z.number().int().optional(),
});

// POST /time-clock/clock-in
router.post("/time-clock/clock-in", asyncHandler(async (req, res) => {
  const parsed = ClockInBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid body", details: parsed.error }); return; }
  const { projectId, notes, localDate, targetUserId } = parsed.data;

  let effectiveUserId = req.userId!;
  let effectiveRole = req.userRole ?? "worker";

  if (targetUserId != null && targetUserId !== req.userId) {
    if (!isPrivilegedRole(req)) { res.status(403).json({ error: "Only owners/foremen can clock in other workers" }); return; }
    const [membership] = await db
      .select({ role: userMembershipsTable.role })
      .from(userMembershipsTable)
      .where(and(eq(userMembershipsTable.userId, targetUserId), eq(userMembershipsTable.companyId, req.companyId!)))
      .limit(1);
    if (!membership) { res.status(404).json({ error: "User not found in this company" }); return; }
    effectiveUserId = targetUserId;
    effectiveRole = membership.role;
  }

  const project = await assertProjectInCompany(projectId, req.companyId!);
  if (!project) { res.status(404).json({ error: "Project not found" }); return; }

  if (!(await canAccessProject(req.companyId!, effectiveUserId, effectiveRole, projectId))) {
    res.status(403).json({ error: "That worker is not assigned to this project" });
    return;
  }

  const existing = await findActiveSession(req.companyId!, effectiveUserId);
  if (existing) { res.status(409).json({ error: "Already clocked in", session: existing }); return; }

  let session: typeof timeClockSessionsTable.$inferSelect;
  try {
    [session] = await db.insert(timeClockSessionsTable).values({
      companyId: req.companyId!,
      projectId,
      userId: effectiveUserId,
      clockedInByUserId: req.userId!,
      date: localDate,
      clockInNotes: notes ?? null,
    }).returning();
  } catch (insertErr: any) {
    // Partial-unique-index safety net: a race clocked this user in first.
    if (insertErr?.code === "23505") {
      const raced = await findActiveSession(req.companyId!, effectiveUserId);
      res.status(409).json({ error: "Already clocked in", session: raced });
      return;
    }
    throw insertErr;
  }

  res.status(201).json(await withUserAndProject(req.companyId!, session));
}));

const ClockOutBody = z.object({
  notes: z.string().max(500).optional(),
});

// POST /time-clock/:sessionId/clock-out
router.post("/time-clock/:sessionId/clock-out", asyncHandler(async (req, res) => {
  const sessionId = parseInt(req.params.sessionId as string, 10);
  if (isNaN(sessionId)) { res.status(400).json({ error: "Invalid sessionId" }); return; }

  const parsed = ClockOutBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid body", details: parsed.error }); return; }

  const [session] = await db
    .select()
    .from(timeClockSessionsTable)
    .where(and(eq(timeClockSessionsTable.id, sessionId), eq(timeClockSessionsTable.companyId, req.companyId!)))
    .limit(1);
  if (!session) { res.status(404).json({ error: "Session not found" }); return; }
  if (session.userId !== req.userId && !isPrivilegedRole(req)) { res.status(403).json({ error: "Forbidden" }); return; }
  if (session.status !== "active") { res.status(409).json({ error: "Session already closed" }); return; }

  const timeEntry = await closeSession(req.companyId!, session, req.userId!, parsed.data.notes ?? null);

  const [updated] = await db.select(sessionSelect).from(timeClockSessionsTable).where(eq(timeClockSessionsTable.id, sessionId)).limit(1);
  res.json({ session: updated, timeEntry });
}));

// DELETE /time-clock/:sessionId — cancel a mis-tapped clock-in while still active
router.delete("/time-clock/:sessionId", asyncHandler(async (req, res) => {
  const sessionId = parseInt(req.params.sessionId as string, 10);
  if (isNaN(sessionId)) { res.status(400).json({ error: "Invalid sessionId" }); return; }

  const [session] = await db
    .select()
    .from(timeClockSessionsTable)
    .where(and(eq(timeClockSessionsTable.id, sessionId), eq(timeClockSessionsTable.companyId, req.companyId!)))
    .limit(1);
  if (!session) { res.status(404).json({ error: "Session not found" }); return; }
  if (session.userId !== req.userId && !isPrivilegedRole(req)) { res.status(403).json({ error: "Forbidden" }); return; }
  if (session.status !== "active") { res.status(409).json({ error: "Only an active session can be cancelled" }); return; }

  await db.delete(timeClockSessionsTable).where(eq(timeClockSessionsTable.id, sessionId));
  res.json({ ok: true });
}));

// GET /time-clock/active — the caller's own active session, if any
router.get("/time-clock/active", asyncHandler(async (req, res) => {
  const session = await findActiveSession(req.companyId!, req.userId!);
  res.json({ session: session ? await withUserAndProject(req.companyId!, session) : null });
}));

// GET /time-clock/active-sessions — company-wide, owner/foreman only ("who's clocked in now")
router.get("/time-clock/active-sessions", requireOwnerOrForeman, asyncHandler(async (req, res) => {
  const sessions = await db
    .select({
      ...sessionSelect,
      user: userSelect,
      project: projectSelect,
    })
    .from(timeClockSessionsTable)
    .leftJoin(usersTable, eq(timeClockSessionsTable.userId, usersTable.id))
    .leftJoin(userMembershipsTable, and(eq(userMembershipsTable.userId, timeClockSessionsTable.userId), eq(userMembershipsTable.companyId, req.companyId!)))
    .leftJoin(projectsTable, eq(timeClockSessionsTable.projectId, projectsTable.id))
    .where(and(eq(timeClockSessionsTable.companyId, req.companyId!), eq(timeClockSessionsTable.status, "active")))
    .orderBy(desc(timeClockSessionsTable.clockInTime));

  res.json(sessions);
}));

const ClockInAllBody = z.object({
  projectId: z.number().int(),
  notes: z.string().max(500).optional(),
  localDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "localDate must be YYYY-MM-DD"),
});

// POST /time-clock/clock-in-all — Team Punch bulk action, owner/foreman only
router.post("/time-clock/clock-in-all", requireOwnerOrForeman, asyncHandler(async (req, res) => {
  const parsed = ClockInAllBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid body", details: parsed.error }); return; }
  const { projectId, notes, localDate } = parsed.data;

  const project = await assertProjectInCompany(projectId, req.companyId!);
  if (!project) { res.status(404).json({ error: "Project not found" }); return; }

  const memberRows = await db
    .select({ userId: projectMembersTable.userId })
    .from(projectMembersTable)
    .where(and(eq(projectMembersTable.projectId, projectId), eq(projectMembersTable.companyId, req.companyId!)));

  const activeRows = await db
    .select({ userId: timeClockSessionsTable.userId })
    .from(timeClockSessionsTable)
    .where(and(eq(timeClockSessionsTable.companyId, req.companyId!), eq(timeClockSessionsTable.status, "active")));
  const alreadyActive = new Set(activeRows.map((r) => r.userId));

  const toClockIn = memberRows.map((r) => r.userId).filter((id) => !alreadyActive.has(id));

  const created: (typeof timeClockSessionsTable.$inferSelect)[] = [];
  for (const userId of toClockIn) {
    try {
      const [session] = await db.insert(timeClockSessionsTable).values({
        companyId: req.companyId!,
        projectId,
        userId,
        clockedInByUserId: req.userId!,
        date: localDate,
        clockInNotes: notes ?? null,
      }).returning();
      created.push(session);
    } catch (insertErr: any) {
      if (insertErr?.code === "23505") continue; // raced with another clock-in — skip
      throw insertErr;
    }
  }

  const clockedIn = await withUsersAndProject(req.companyId!, created);

  res.status(201).json({
    clockedIn,
    skipped: [...alreadyActive].filter((id) => memberRows.some((r) => r.userId === id)),
  });
}));

// GET /time-clock/summary?date=YYYY-MM-DD — today's hours + active session + week total
router.get("/time-clock/summary", asyncHandler(async (req, res) => {
  const date = (req.query.date as string) || new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { res.status(400).json({ error: "date must be YYYY-MM-DD" }); return; }

  // Sequential — same single-connection tenant transaction as elsewhere in this file.
  const [completed] = await db.select({ total: sql<string>`coalesce(sum(${timeEntriesTable.hours}), 0)` })
    .from(timeEntriesTable)
    .where(and(eq(timeEntriesTable.companyId, req.companyId!), eq(timeEntriesTable.userId, req.userId!), eq(timeEntriesTable.date, date)));
  const activeSession = await findActiveSession(req.companyId!, req.userId!);

  const completedHoursToday = parseFloat(completed.total);
  const activeElapsedHours = activeSession
    ? Math.round(((Date.now() - new Date(activeSession.clockInTime).getTime()) / 3_600_000) * 100) / 100
    : 0;

  const weekStart = getMonday(date);
  const weekWhere = activeSession
    ? and(
        eq(timesheetsTable.companyId, req.companyId!),
        eq(timesheetsTable.userId, req.userId!),
        eq(timesheetsTable.weekStart, weekStart),
        eq(timesheetsTable.projectId, activeSession.projectId),
      )
    : and(
        eq(timesheetsTable.companyId, req.companyId!),
        eq(timesheetsTable.userId, req.userId!),
        eq(timesheetsTable.weekStart, weekStart),
      );

  // No active session (or the active project has no timesheet row yet): sum
  // across all of this week's per-project timesheet rows for the user.
  const weekRows = await db.select({ totalHours: timesheetsTable.totalHours }).from(timesheetsTable).where(weekWhere);
  const weekTotalHours = activeSession
    ? (weekRows[0]?.totalHours ?? "0.00")
    : weekRows.reduce((sum, r) => sum + parseFloat(r.totalHours), 0).toFixed(2);

  res.json({
    date,
    completedHoursToday: completedHoursToday.toFixed(2),
    activeSession: activeSession ? await withUserAndProject(req.companyId!, activeSession) : null,
    activeElapsedHours: activeElapsedHours.toFixed(2),
    todayTotalHours: (completedHoursToday + activeElapsedHours).toFixed(2),
    weekTotalHours,
  });
}));

export default router;
