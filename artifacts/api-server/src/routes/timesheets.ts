import { Router } from "express";
import { db, timesheetsTable, timeEntriesTable, usersTable } from "@workspace/db";
import { eq, and, desc, gte, lte, sql } from "drizzle-orm";
import { requireAuth, requireCompany, requireOwnerOrForeman } from "../lib/auth";
import { z } from "zod";

const router = Router();

const SubmitTimesheetBody = z.object({
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "weekStart must be YYYY-MM-DD"),
  totalHours: z.number().nonnegative(),
  hourlyRate: z.number().nonnegative().optional().nullable(),
  description: z.string().max(2000).optional().nullable(),
  notes: z.string().max(1000).optional(),
  projectId: z.number().int().optional().nullable(),
});

const ReviewBody = z.object({
  notes: z.string().max(1000).optional(),
});

async function withReviewer(timesheet: Record<string, unknown>, reviewedByUserId: number | null) {
  if (!reviewedByUserId) return { ...timesheet, reviewer: null };
  const [reviewer] = await db
    .select({ id: usersTable.id, firstName: usersTable.firstName, lastName: usersTable.lastName, email: usersTable.email })
    .from(usersTable)
    .where(eq(usersTable.id, reviewedByUserId))
    .limit(1);
  return { ...timesheet, reviewer: reviewer ?? null };
}

async function withSubmitter(timesheet: Record<string, unknown>, userId: number) {
  const [submitter] = await db
    .select({ id: usersTable.id, firstName: usersTable.firstName, lastName: usersTable.lastName, email: usersTable.email, role: usersTable.role })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  return { ...timesheet, user: submitter ?? null };
}

// GET /timesheets — list (owner/foreman: all; worker: own)
router.get("/timesheets", requireAuth, requireCompany, async (req, res) => {
  const isPrivileged = req.userRole === "owner" || req.userRole === "foreman";
  const { status, userId, from, to } = req.query;

  const conditions: ReturnType<typeof eq>[] = [eq(timesheetsTable.companyId, req.companyId!)];

  if (!isPrivileged) {
    conditions.push(eq(timesheetsTable.userId, req.userId!));
  } else if (userId) {
    conditions.push(eq(timesheetsTable.userId, parseInt(userId as string)));
  }

  if (status) conditions.push(eq(timesheetsTable.status, status as string));
  if (from) conditions.push(gte(timesheetsTable.weekStart, from as string));
  if (to) conditions.push(lte(timesheetsTable.weekStart, to as string));

  const rows = await db
    .select()
    .from(timesheetsTable)
    .where(and(...conditions))
    .orderBy(desc(timesheetsTable.weekStart), desc(timesheetsTable.submittedAt));

  const enriched = await Promise.all(
    rows.map(async (ts) => {
      const withUser = await withSubmitter(ts as unknown as Record<string, unknown>, ts.userId);
      return withReviewer(withUser, ts.reviewedByUserId);
    })
  );

  res.json(enriched);
});

// POST /timesheets — submit a timesheet
router.post("/timesheets", requireAuth, requireCompany, async (req, res) => {
  const parsed = SubmitTimesheetBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid body", details: parsed.error }); return; }

  const { weekStart, totalHours, hourlyRate, description, notes, projectId } = parsed.data;

  // Upsert: if same user+company+weekStart exists, update it
  const [existing] = await db
    .select()
    .from(timesheetsTable)
    .where(and(
      eq(timesheetsTable.companyId, req.companyId!),
      eq(timesheetsTable.userId, req.userId!),
      eq(timesheetsTable.weekStart, weekStart)
    ))
    .limit(1);

  if (existing) {
    const [updated] = await db.update(timesheetsTable)
      .set({
        status: "submitted",
        totalHours: totalHours.toFixed(2),
        hourlyRate: hourlyRate != null ? hourlyRate.toFixed(2) : null,
        description: description ?? null,
        notes: notes ?? null,
        projectId: projectId ?? null,
        submittedAt: new Date(),
        reviewedByUserId: null,
        reviewedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(timesheetsTable.id, existing.id))
      .returning();
    const withUser = await withSubmitter(updated as unknown as Record<string, unknown>, updated.userId);
    res.status(201).json(await withReviewer(withUser, null));
    return;
  }

  const [ts] = await db.insert(timesheetsTable).values({
    companyId: req.companyId!,
    userId: req.userId!,
    projectId: projectId ?? null,
    weekStart,
    status: "submitted",
    totalHours: totalHours.toFixed(2),
    hourlyRate: hourlyRate != null ? hourlyRate.toFixed(2) : null,
    description: description ?? null,
    notes: notes ?? null,
  }).returning();

  const withUser = await withSubmitter(ts as unknown as Record<string, unknown>, ts.userId);
  res.status(201).json(await withReviewer(withUser, null));
});

// GET /timesheets/:timesheetId
router.get("/timesheets/:timesheetId", requireAuth, requireCompany, async (req, res) => {
  const id = parseInt(req.params.timesheetId);
  const isPrivileged = req.userRole === "owner" || req.userRole === "foreman";

  const [ts] = await db.select().from(timesheetsTable)
    .where(and(eq(timesheetsTable.id, id), eq(timesheetsTable.companyId, req.companyId!)))
    .limit(1);
  if (!ts) { res.status(404).json({ error: "Timesheet not found" }); return; }
  if (!isPrivileged && ts.userId !== req.userId) { res.status(403).json({ error: "Forbidden" }); return; }

  const withUser = await withSubmitter(ts as unknown as Record<string, unknown>, ts.userId);
  res.json(await withReviewer(withUser, ts.reviewedByUserId));
});

// POST /timesheets/:timesheetId/approve
router.post("/timesheets/:timesheetId/approve", requireAuth, requireCompany, requireOwnerOrForeman, async (req, res) => {
  const id = parseInt(req.params.timesheetId);
  const parsed = ReviewBody.safeParse(req.body);
  const notes = parsed.success ? (parsed.data.notes ?? null) : null;

  const [ts] = await db.select().from(timesheetsTable)
    .where(and(eq(timesheetsTable.id, id), eq(timesheetsTable.companyId, req.companyId!)))
    .limit(1);
  if (!ts) { res.status(404).json({ error: "Timesheet not found" }); return; }
  if (ts.status !== "submitted") { res.status(409).json({ error: "Only submitted timesheets can be approved" }); return; }

  const now = new Date();
  const [updated] = await db.update(timesheetsTable)
    .set({ status: "approved", notes, reviewedByUserId: req.userId!, reviewedAt: now, updatedAt: now })
    .where(eq(timesheetsTable.id, id))
    .returning();

  const withUser = await withSubmitter(updated as unknown as Record<string, unknown>, updated.userId);
  res.json(await withReviewer(withUser, updated.reviewedByUserId));
});

// POST /timesheets/:timesheetId/deny
router.post("/timesheets/:timesheetId/deny", requireAuth, requireCompany, requireOwnerOrForeman, async (req, res) => {
  const id = parseInt(req.params.timesheetId);
  const parsed = ReviewBody.safeParse(req.body);
  const notes = parsed.success ? (parsed.data.notes ?? null) : null;

  const [ts] = await db.select().from(timesheetsTable)
    .where(and(eq(timesheetsTable.id, id), eq(timesheetsTable.companyId, req.companyId!)))
    .limit(1);
  if (!ts) { res.status(404).json({ error: "Timesheet not found" }); return; }
  if (ts.status !== "submitted") { res.status(409).json({ error: "Only submitted timesheets can be denied" }); return; }

  const now = new Date();
  const [updated] = await db.update(timesheetsTable)
    .set({ status: "denied", notes, reviewedByUserId: req.userId!, reviewedAt: now, updatedAt: now })
    .where(eq(timesheetsTable.id, id))
    .returning();

  const withUser = await withSubmitter(updated as unknown as Record<string, unknown>, updated.userId);
  res.json(await withReviewer(withUser, updated.reviewedByUserId));
});

export default router;
