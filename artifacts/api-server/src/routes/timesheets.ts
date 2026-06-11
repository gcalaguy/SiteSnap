import { Router } from "express";
import { db, timesheetsTable, timeEntriesTable, usersTable, userMembershipsTable, projectsTable } from "@workspace/db";
import { eq, and, desc, gte, lte, sql, inArray } from "drizzle-orm";
import { requireAuth, requireCompany, requireOwnerOrForeman } from "../lib/auth";
import { requirePermission } from "../lib/permissionGate";
import { asyncHandler } from "../lib/asyncHandler";
import { sendEmail, ResendSandboxError } from "../lib/mailer";
import { getClientInfo } from "../lib/clientInfo";
import { z } from "zod";
import { ApproveTimesheetBody } from "@workspace/api-zod";

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
    .select({ id: usersTable.id, firstName: usersTable.firstName, lastName: usersTable.lastName, email: usersTable.email, role: userMembershipsTable.role })
    .from(usersTable)
    .leftJoin(
      userMembershipsTable,
      eq(userMembershipsTable.userId, usersTable.id),
    )
    .where(eq(usersTable.id, userId))
    .limit(1);
  return { ...timesheet, user: submitter ?? null };
}

// GET /timesheets — list (owner/foreman: all; worker: own)
router.get("/timesheets", requireAuth, requireCompany, requirePermission("viewTimesheets"), async (req, res) => {
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

  // Batch-load all users (submitters + reviewers) in a single query — avoids N+1
  const allUserIds = [...new Set([
    ...rows.map((ts) => ts.userId),
    ...rows.map((ts) => ts.reviewedByUserId).filter((id): id is number => id != null),
  ])];
  const userRows = allUserIds.length
    ? await db
        .select({
          id: usersTable.id,
          firstName: usersTable.firstName,
          lastName: usersTable.lastName,
          email: usersTable.email,
          role: userMembershipsTable.role,
        })
        .from(usersTable)
        .leftJoin(userMembershipsTable, eq(userMembershipsTable.userId, usersTable.id))
        .where(inArray(usersTable.id, allUserIds))
    : [];
  const userMap = new Map(userRows.map((u) => [u.id, u]));

  const enriched = rows.map((ts) => ({
    ...ts,
    user: userMap.get(ts.userId) ?? null,
    reviewer: ts.reviewedByUserId != null ? (userMap.get(ts.reviewedByUserId) ?? null) : null,
  }));

  res.json(enriched);
});

// POST /timesheets — submit a timesheet
router.post("/timesheets", requireAuth, requireCompany, async (req, res) => {
  const parsed = SubmitTimesheetBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid body", details: parsed.error }); return; }

  const { weekStart, totalHours, hourlyRate, description, notes, projectId } = parsed.data;

  // P1 fix: upsert key now includes projectId so workers logging hours for
  // multiple projects in the same week get separate records rather than
  // overwriting. A NULL projectId is its own key (general/unassigned hours).
  const projectCondition = projectId != null
    ? eq(timesheetsTable.projectId, projectId)
    : sql`${timesheetsTable.projectId} IS NULL`;

  const [existing] = await db
    .select()
    .from(timesheetsTable)
    .where(and(
      eq(timesheetsTable.companyId, req.companyId!),
      eq(timesheetsTable.userId, req.userId!),
      eq(timesheetsTable.weekStart, weekStart),
      projectCondition,
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
      .where(and(eq(timesheetsTable.id, existing.id), eq(timesheetsTable.companyId, req.companyId!)))
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
router.get("/timesheets/:timesheetId", requireAuth, requireCompany, requirePermission("viewTimesheets"), async (req, res) => {
  const id = parseInt(req.params.timesheetId as string);
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
  const id = parseInt(req.params.timesheetId as string);
  const parsed = ApproveTimesheetBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "A signature is required to approve a timesheet", details: parsed.error.flatten() });
    return;
  }

  const [ts] = await db.select().from(timesheetsTable)
    .where(and(eq(timesheetsTable.id, id), eq(timesheetsTable.companyId, req.companyId!)))
    .limit(1);
  if (!ts) { res.status(404).json({ error: "Timesheet not found" }); return; }
  if (ts.status !== "submitted") { res.status(409).json({ error: "Only submitted timesheets can be approved" }); return; }

  const info = getClientInfo(req);
  const [updated] = await db.update(timesheetsTable)
    .set({
      status: "approved",
      notes: parsed.data.notes ?? null,
      reviewedByUserId: req.userId!,
      reviewedAt: info.signedAt,
      signatureData: parsed.data.signatureData,
      signerName: parsed.data.signerName ?? null,
      signerIp: info.ip,
      signerUserAgent: info.userAgent,
      signedAt: info.signedAt,
      updatedAt: info.signedAt,
    })
    .where(and(eq(timesheetsTable.id, id), eq(timesheetsTable.companyId, req.companyId!)))
    .returning();

  const withUser = await withSubmitter(updated as unknown as Record<string, unknown>, updated.userId);
  res.json(await withReviewer(withUser, updated.reviewedByUserId));
});

// GET /timesheets/payroll-export — approved hours for payroll handoff
router.get("/timesheets/payroll-export", requireAuth, requireCompany, requireOwnerOrForeman, async (req, res) => {
  const { from, to } = req.query;

  const conditions = [eq(timesheetsTable.companyId, req.companyId!), eq(timesheetsTable.status, "approved")];
  if (from) conditions.push(gte(timesheetsTable.weekStart, from as string));
  if (to) conditions.push(lte(timesheetsTable.weekStart, to as string));

  const rows = await db
    .select({
      id: timesheetsTable.id,
      weekStart: timesheetsTable.weekStart,
      totalHours: timesheetsTable.totalHours,
      userId: timesheetsTable.userId,
      projectId: timesheetsTable.projectId,
      userFirstName: usersTable.firstName,
      userLastName: usersTable.lastName,
      projectName: projectsTable.name,
    })
    .from(timesheetsTable)
    .leftJoin(usersTable, eq(timesheetsTable.userId, usersTable.id))
    .leftJoin(projectsTable, eq(timesheetsTable.projectId, projectsTable.id))
    .where(and(...conditions))
    .orderBy(desc(timesheetsTable.weekStart), desc(timesheetsTable.submittedAt));

  res.json(rows);
});

// POST /timesheets/:timesheetId/deny
router.post("/timesheets/:timesheetId/deny", requireAuth, requireCompany, requireOwnerOrForeman, async (req, res) => {
  const id = parseInt(req.params.timesheetId as string);
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
    .where(and(eq(timesheetsTable.id, id), eq(timesheetsTable.companyId, req.companyId!)))
    .returning();

  const withUser = await withSubmitter(updated as unknown as Record<string, unknown>, updated.userId);
  res.json(await withReviewer(withUser, updated.reviewedByUserId));
});

// PATCH /timesheets/:timesheetId — edit hours / rate / description
const EditTimesheetBody = z.object({
  totalHours: z.number().nonnegative().optional(),
  hourlyRate: z.number().nonnegative().nullable().optional(),
  description: z.string().max(2000).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
  status: z.enum(["submitted"]).optional(),
});

router.patch(
  "/timesheets/:timesheetId",
  requireAuth,
  requireCompany,
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.timesheetId as string);
    const isPrivileged = req.userRole === "owner" || req.userRole === "foreman";

    const [ts] = await db
      .select()
      .from(timesheetsTable)
      .where(and(eq(timesheetsTable.id, id), eq(timesheetsTable.companyId, req.companyId!)))
      .limit(1);
    if (!ts) { res.status(404).json({ error: "Timesheet not found" }); return; }
    if (!isPrivileged && ts.userId !== req.userId) { res.status(403).json({ error: "Forbidden" }); return; }

    const parsed = EditTimesheetBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "Invalid body", details: parsed.error }); return; }

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    const { totalHours, hourlyRate, description, notes, status } = parsed.data;
    if (totalHours !== undefined) updates.totalHours = totalHours.toFixed(2);
    if (hourlyRate !== undefined) updates.hourlyRate = hourlyRate != null ? hourlyRate.toFixed(2) : null;
    if (description !== undefined) updates.description = description;
    if (notes !== undefined) updates.notes = notes;
    if (status !== undefined) {
      updates.status = status;
      updates.reviewedByUserId = null;
      updates.reviewedAt = null;
    }

    const [updated] = await db
      .update(timesheetsTable)
      .set(updates)
      .where(and(eq(timesheetsTable.id, id), eq(timesheetsTable.companyId, req.companyId!)))
      .returning();

    const withUser = await withSubmitter(updated as unknown as Record<string, unknown>, updated.userId);
    res.json(await withReviewer(withUser, updated.reviewedByUserId));
  }),
);

// DELETE /timesheets/:timesheetId — delete own timesheet (owner/foreman can delete any)
router.delete(
  "/timesheets/:timesheetId",
  requireAuth,
  requireCompany,
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.timesheetId as string);
    const isPrivileged = req.userRole === "owner" || req.userRole === "foreman";

    const [ts] = await db
      .select()
      .from(timesheetsTable)
      .where(and(eq(timesheetsTable.id, id), eq(timesheetsTable.companyId, req.companyId!)))
      .limit(1);
    if (!ts) { res.status(404).json({ error: "Timesheet not found" }); return; }
    if (!isPrivileged && ts.userId !== req.userId) { res.status(403).json({ error: "Forbidden" }); return; }
    // Prevent deletion of approved timesheets (financial record)
    if (ts.status === "approved") { res.status(409).json({ error: "Approved timesheets cannot be deleted" }); return; }

    await db.delete(timesheetsTable).where(and(eq(timesheetsTable.id, id), eq(timesheetsTable.companyId, req.companyId!)));
    res.json({ ok: true });
  }),
);

// POST /timesheets/:timesheetId/email — send timesheet summary via Resend
const EmailTimesheetBody = z.object({
  to: z.string().email(),
  pdfBase64: z.string().optional(),
  filename: z.string().optional(),
});

router.post(
  "/timesheets/:timesheetId/email",
  requireAuth,
  requireCompany,
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.timesheetId as string);
    const isPrivileged = req.userRole === "owner" || req.userRole === "foreman";

    const [ts] = await db
      .select()
      .from(timesheetsTable)
      .where(and(eq(timesheetsTable.id, id), eq(timesheetsTable.companyId, req.companyId!)))
      .limit(1);
    if (!ts) { res.status(404).json({ error: "Timesheet not found" }); return; }
    if (!isPrivileged && ts.userId !== req.userId) { res.status(403).json({ error: "Forbidden" }); return; }

    const parsed = EmailTimesheetBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "Invalid email address" }); return; }

    const enrichedUser = await withSubmitter(ts as unknown as Record<string, unknown>, ts.userId) as any;
    const enriched = await withReviewer(enrichedUser, ts.reviewedByUserId) as any;

    const workerName = enriched.user
      ? `${enriched.user.firstName ?? ""} ${enriched.user.lastName ?? ""}`.trim() || enriched.user.email
      : "Worker";
    const weekEnd = new Date(ts.weekStart + "T00:00:00");
    weekEnd.setDate(weekEnd.getDate() + 6);
    const fmtDate = (d: Date) => d.toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" });
    const weekRange = `${fmtDate(new Date(ts.weekStart + "T00:00:00"))} – ${fmtDate(weekEnd)}`;
    const totalPay = ts.hourlyRate
      ? `CA$${(parseFloat(ts.totalHours) * parseFloat(ts.hourlyRate)).toFixed(2)}`
      : null;
    const statusColor = ts.status === "approved" ? "#16A34A" : ts.status === "denied" ? "#DC2626" : "#D97706";
    const statusLabel = ts.status === "approved" ? "Approved" : ts.status === "denied" ? "Denied" : "Pending Review";

    const html = `
<!DOCTYPE html><html><head><meta charset="utf-8" /><style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f9fafb; margin: 0; padding: 24px; color: #111; }
  .card { background: #fff; border-radius: 12px; padding: 28px 32px; max-width: 560px; margin: 0 auto; border: 1px solid #e5e7eb; }
  .logo { font-size: 20px; font-weight: 800; color: #111; margin-bottom: 24px; }
  .logo span { color: #C9A84C; }
  h2 { font-size: 22px; margin: 0 0 4px; }
  .sub { color: #6b7280; font-size: 14px; margin-bottom: 24px; }
  .stat-row { display: flex; gap: 16px; margin-bottom: 20px; }
  .stat { flex: 1; background: #f9fafb; border-radius: 8px; padding: 14px; border: 1px solid #e5e7eb; }
  .stat-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #9ca3af; margin-bottom: 4px; }
  .stat-value { font-size: 20px; font-weight: 700; color: #111; }
  .badge { display: inline-block; padding: 4px 10px; border-radius: 99px; font-size: 12px; font-weight: 600; background: ${statusColor}18; color: ${statusColor}; margin-bottom: 16px; }
  .desc { background: #f9fafb; border-radius: 8px; padding: 12px 16px; font-size: 14px; line-height: 1.5; color: #374151; margin-bottom: 16px; border: 1px solid #e5e7eb; }
  .footer { font-size: 12px; color: #9ca3af; margin-top: 24px; border-top: 1px solid #e5e7eb; padding-top: 16px; }
</style></head><body>
<div class="card">
  <div class="logo">Site<span>Snap</span></div>
  <h2>${workerName}</h2>
  <p class="sub">Weekly Timesheet · ${weekRange}</p>
  <div class="badge">${statusLabel}</div>
  <div class="stat-row">
    <div class="stat"><div class="stat-label">Total Hours</div><div class="stat-value">${parseFloat(ts.totalHours).toFixed(1)}h</div></div>
    ${ts.hourlyRate ? `<div class="stat"><div class="stat-label">Hourly Rate</div><div class="stat-value">CA$${parseFloat(ts.hourlyRate).toFixed(2)}/hr</div></div>` : ""}
    ${totalPay ? `<div class="stat"><div class="stat-label">Total Pay</div><div class="stat-value" style="color:#C9A84C">${totalPay}</div></div>` : ""}
  </div>
  ${ts.description ? `<div class="desc">${ts.description}</div>` : ""}
  ${ts.notes ? `<div class="desc"><b>${ts.status === "denied" ? "Denial reason" : "Notes"}:</b> ${ts.notes}</div>` : ""}
  <div class="footer">Submitted ${new Date(ts.submittedAt).toLocaleDateString("en-CA", { month: "long", day: "numeric", year: "numeric" })} · Sent from SiteSnap</div>
</div>
</body></html>`;

    const attachments =
      parsed.data.pdfBase64
        ? [{ filename: parsed.data.filename ?? `timesheet_${ts.weekStart}.pdf`, content: parsed.data.pdfBase64 }]
        : undefined;

    try {
      await sendEmail({ to: [parsed.data.to], subject: `Timesheet: ${workerName} — ${weekRange}`, html, attachments });
      res.json({ ok: true });
    } catch (err: any) {
      if (err instanceof ResendSandboxError) {
        res.status(422).json({ error: err.message, sandboxEmail: err.allowedEmail });
        return;
      }
      throw err;
    }
  }),
);

export default router;
