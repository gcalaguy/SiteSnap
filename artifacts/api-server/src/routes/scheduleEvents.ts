import { Router } from "express";
import {
  db,
  equipmentTable,
  scheduleEventsTable,
  scheduleEventAssigneesTable,
  usersTable,
  projectsTable,
  companiesTable,
} from "@workspace/db";
import { eq, and, or, lt, gt, ne, inArray, gte, lte } from "drizzle-orm";
import { requireAuth, requireCompany, requireOwnerOrForeman } from "../lib/auth";
import { requirePermission } from "../lib/permissionGate";
import { asyncHandler } from "../lib/asyncHandler";
import { sendEmail, ResendSandboxError } from "../lib/mailer";
import { logger } from "../lib/logger";
import { getMeetingLink, type MeetingPlatform } from "../lib/meetingService";
import { z } from "zod";
import { processComplianceEvent } from "../services/compliance/processor";

const router = Router();

const CreateScheduleEventBody = z.object({
  title: z.string().min(1).max(200),
  type: z.string().optional(),
  projectId: z.number().int().positive().optional(),
  startTime: z.string().min(1),
  endTime: z.string().min(1),
  location: z.string().optional(),
  notes: z.string().optional(),
  assignees: z.array(z.object({ resourceType: z.enum(["user", "equipment"]), resourceId: z.number().int().positive() })).optional(),
  allowConflict: z.boolean().optional(),
  recipientEmails: z.array(z.string().email()).optional(),
  meetingPlatform: z.string().optional(),
  meetingLink: z.string().optional(),
});

const UpdateScheduleEventBody = z.object({
  title: z.string().min(1).max(200).optional(),
  type: z.string().optional(),
  projectId: z.number().int().positive().optional(),
  startTime: z.string().min(1).optional(),
  endTime: z.string().min(1).optional(),
  location: z.string().optional(),
  notes: z.string().optional(),
  status: z.string().optional(),
  assignees: z.array(z.object({ resourceType: z.enum(["user", "equipment"]), resourceId: z.number().int().positive() })).optional(),
  allowConflict: z.boolean().optional(),
  meetingPlatform: z.string().optional(),
  meetingLink: z.string().optional(),
});

const CreateEquipmentBody = z.object({
  name: z.string().min(1).max(200),
  type: z.string().optional(),
  status: z.string().optional(),
  notes: z.string().optional(),
});

// ── Equipment ──────────────────────────────────────────────────────────────────

// GET /api/equipment
router.get(
  "/equipment",
  requireAuth,
  requireCompany,
  requirePermission("viewSchedules"),
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
  requirePermission("viewSchedules"),
  requireOwnerOrForeman,
  asyncHandler(async (req, res) => {
    const parsed = CreateEquipmentBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "Malformed request payload", details: parsed.error.flatten() }); return; }
    const { name, type, status, notes } = parsed.data;
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
  requirePermission("viewSchedules"),
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
        meetingPlatform: scheduleEventsTable.meetingPlatform,
        meetingLink: scheduleEventsTable.meetingLink,
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
  requirePermission("viewSchedules"),
  requireOwnerOrForeman,
  asyncHandler(async (req, res) => {
    const parsed = CreateScheduleEventBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "Malformed request payload", details: parsed.error.flatten() }); return; }
    const { title, type, projectId, startTime, endTime, location, notes, assignees, allowConflict, recipientEmails, meetingPlatform, meetingLink: providedMeetingLink } = parsed.data;
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

    // ── Resolve meeting link ────────────────────────────────────────────
    let resolvedMeetingLink: string | null = providedMeetingLink ?? null;
    const resolvedPlatform: string | null = meetingPlatform ?? null;

    if (resolvedPlatform && !resolvedMeetingLink) {
      try {
        const [companyRow] = await db
          .select({ meetingConfig: companiesTable.meetingConfig })
          .from(companiesTable)
          .where(eq(companiesTable.id, req.companyId!))
          .limit(1);

        const meeting = await getMeetingLink({
          platform: resolvedPlatform as MeetingPlatform,
          companyId: req.companyId!,
          title,
          startTime: start,
          endTime: end,
          meetingConfig: companyRow?.meetingConfig as Record<string, unknown> | null,
        });
        resolvedMeetingLink = meeting.link;
      } catch (err) {
        logger.warn({ err }, "Meeting link generation failed; proceeding without link");
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
        meetingPlatform: resolvedPlatform,
        meetingLink: resolvedMeetingLink,
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

    // ── Fire-and-forget: compliance check when event is project-linked ────
    if (event.projectId) {
      processComplianceEvent({
        companyId: req.companyId!,
        projectId: event.projectId,
        sourceType: "SCHEDULE",
        sourceRecordId: String(event.id),
        text: [event.title, event.notes, event.location].filter(Boolean).join("\n"),
      }).catch(() => {});
    }

    // ── Fire-and-forget: email manually specified recipients ─────────────
    const emails: string[] = Array.isArray(recipientEmails)
      ? (recipientEmails as string[]).map((e) => e.trim().toLowerCase()).filter(Boolean)
      : [];
    if (emails.length > 0) {
    Promise.all([
      db.select({ name: companiesTable.name })
        .from(companiesTable)
        .where(eq(companiesTable.id, req.companyId!))
        .limit(1),
      db.select({ firstName: usersTable.firstName, lastName: usersTable.lastName })
        .from(usersTable)
        .where(eq(usersTable.id, req.userId!))
        .limit(1),
    ]).then(([[company], [creator]]) => {
      if (emails.length === 0) return;

      const companyName = company?.name ?? "your company";
      const creatorName = creator ? `${creator.firstName} ${creator.lastName}`.trim() : "A team member";
      const typeLabel: Record<string, string> = {
        meeting: "Meeting",
        equipment_booking: "Equipment Booking",
        site_visit: "Site Visit",
        inspection: "Inspection",
        other: "Event",
      };
      const label = typeLabel[event.type as string] ?? "Event";

      const fmt = (d: Date) =>
        new Intl.DateTimeFormat("en-CA", {
          weekday: "long", year: "numeric", month: "long", day: "numeric",
          hour: "numeric", minute: "2-digit", timeZoneName: "short",
        }).format(d);

      const locationRow = event.location
        ? `<tr><td style="padding:6px 0;color:#64748b;font-size:14px;width:120px;">Location</td><td style="padding:6px 0;color:#172034;font-size:14px;">${event.location}</td></tr>`
        : "";
      const notesRow = event.notes
        ? `<tr><td style="padding:6px 0;color:#64748b;font-size:14px;vertical-align:top;width:120px;">Notes</td><td style="padding:6px 0;color:#172034;font-size:14px;">${event.notes}</td></tr>`
        : "";

      const platformLabels: Record<string, string> = {
        google_meet: "Google Meet",
        zoom: "Zoom",
        teams: "Microsoft Teams",
      };
      const meetingRow = resolvedMeetingLink
        ? `<tr>
            <td style="padding:6px 0;color:#64748b;font-size:14px;width:120px;">${platformLabels[resolvedPlatform ?? ""] ?? "Meeting"}</td>
            <td style="padding:6px 0;font-size:14px;">
              <a href="${resolvedMeetingLink}" style="color:#C9A84C;font-weight:600;text-decoration:none;">
                Join Meeting →
              </a>
            </td>
           </tr>`
        : "";

      return sendEmail({
        to: emails,
        subject: `📅 New ${label}: ${event.title} — ${companyName}`,
        html: `
<div style="font-family:sans-serif;max-width:540px;margin:0 auto;padding:32px 24px;background:#f8fafc;border-radius:12px;">
  <div style="text-align:center;margin-bottom:28px;">
    <span style="font-size:36px;">📅</span>
    <h1 style="margin:12px 0 4px;font-size:22px;color:#172034;">${label} Scheduled</h1>
    <p style="color:#64748b;margin:0;">Added by <strong>${creatorName}</strong> on <strong>${companyName}</strong></p>
  </div>
  <div style="background:#fff;border-radius:10px;padding:24px;border:1px solid #e2e8f0;margin-bottom:20px;">
    <h2 style="margin:0 0 16px;font-size:18px;color:#172034;">${event.title}</h2>
    <table style="width:100%;border-collapse:collapse;">
      <tr>
        <td style="padding:6px 0;color:#64748b;font-size:14px;width:120px;">Starts</td>
        <td style="padding:6px 0;color:#172034;font-size:14px;">${fmt(event.startTime)}</td>
      </tr>
      <tr>
        <td style="padding:6px 0;color:#64748b;font-size:14px;">Ends</td>
        <td style="padding:6px 0;color:#172034;font-size:14px;">${fmt(event.endTime)}</td>
      </tr>
      ${locationRow}
      ${notesRow}
      ${meetingRow}
    </table>
  </div>
  ${resolvedMeetingLink ? `
  <div style="text-align:center;margin-bottom:20px;">
    <a href="${resolvedMeetingLink}"
       style="display:inline-block;background:#C9A84C;color:#111;font-weight:700;font-size:15px;
              padding:12px 28px;border-radius:8px;text-decoration:none;">
      Join Meeting
    </a>
  </div>` : ""}
  <p style="color:#94a3b8;font-size:12px;text-align:center;margin:0;">
    View this event in the <strong>Schedule → Events</strong> tab of Site Snap.
  </p>
</div>`,
      });
    }).catch((err: unknown) => {
      if (err instanceof ResendSandboxError) {
        logger.warn({ allowedEmail: err.allowedEmail }, "Event invite email skipped — Resend sandbox mode");
      } else {
        logger.error({ err }, "Failed to send event invite emails");
      }
    });
    } // end if emails.length > 0
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
    const parsed = UpdateScheduleEventBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "Malformed request payload", details: parsed.error.flatten() }); return; }
    const { title, type, projectId, startTime, endTime, location, notes, status, assignees, allowConflict } = parsed.data;

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

    const { meetingPlatform, meetingLink } = req.body;

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
        ...(meetingPlatform !== undefined && { meetingPlatform: meetingPlatform ?? null }),
        ...(meetingLink !== undefined && { meetingLink: meetingLink ?? null }),
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
