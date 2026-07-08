import { Router } from "express";
import {
  db,
  dailyLogsTable,
  sitePhotosTable,
  safetySignoffsTable,
  usersTable,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth, requireCompany, requireTenantCtx, requireOwner } from "../lib/auth";
import { asyncHandler } from "../lib/asyncHandler";
import { requirePermission } from "../lib/permissionGate";
import { assertProjectInCompany as verifyProjectAccess, canAccessProject } from "../lib/projectAccess";
import { z } from "zod";
import { logger } from "../lib/logger";
import { processSafetySignoff } from "../services/cor/evidenceAggregator";

const CreateDailyLogBody = z.object({
  projectId: z.number(),
  notes: z.string().max(5000).nullish(),
  weatherTemp: z.string().max(20).nullish(),
  weatherCondition: z.string().max(200).nullish(),
});

const CreateSitePhotoBody = z.object({
  projectId: z.number(),
  imageUrl: z.string().min(1).max(2000),
  markupData: z.object({}).passthrough().nullish(),
  roomLocation: z.string().max(500).nullish(),
});

const CreateSafetySignoffBody = z.object({
  projectId: z.number(),
  responses: z.object({}).passthrough(),
  signatureUrl: z.string().max(2000).nullish(),
});

const router = Router();

// ── Daily Logs ───────────────────────────────────────────────────────────

// POST /api/field/daily-log
router.post(
  "/field/daily-log",
  requireAuth,
  requireCompany,
  requireTenantCtx,
  requirePermission("viewTimesheets"),
  asyncHandler(async (req, res) => {
    const parsed = CreateDailyLogBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Malformed request payload", details: parsed.error.issues });
      return;
    }

    const { projectId, notes, weatherTemp, weatherCondition } = parsed.data;
    const project = await verifyProjectAccess(projectId, req.companyId!);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    if (!(await canAccessProject(req.companyId!, req.userId!, req.userRole ?? "worker", projectId))) {
      res.status(403).json({ error: "You are not assigned to this project" });
      return;
    }

    const [log] = await db
      .insert(dailyLogsTable)
      .values({
        projectId,
        foremanId: req.userId!,
        notes: notes ?? null,
        weatherTemp: weatherTemp ?? null,
        weatherCondition: weatherCondition ?? null,
      })
      .returning();

    res.status(201).json(log);
  }),
);

// GET /api/field/daily-log?projectId={n}
router.get(
  "/field/daily-log",
  requireAuth,
  requireCompany,
  requireTenantCtx,
  requirePermission("viewTimesheets"),
  asyncHandler(async (req, res) => {
    const projectId = req.query.projectId
      ? parseInt(req.query.projectId as string)
      : null;
    if (!projectId || isNaN(projectId)) {
      res.status(400).json({ error: "projectId query param required" });
      return;
    }

    const project = await verifyProjectAccess(projectId, req.companyId!);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    if (!(await canAccessProject(req.companyId!, req.userId!, req.userRole ?? "worker", projectId))) {
      res.status(403).json({ error: "You are not assigned to this project" });
      return;
    }

    const rows = await db
      .select({
        id: dailyLogsTable.id,
        projectId: dailyLogsTable.projectId,
        foremanId: dailyLogsTable.foremanId,
        notes: dailyLogsTable.notes,
        weatherTemp: dailyLogsTable.weatherTemp,
        weatherCondition: dailyLogsTable.weatherCondition,
        createdAt: dailyLogsTable.createdAt,
        createdByName: usersTable.firstName,
      })
      .from(dailyLogsTable)
      .leftJoin(usersTable, eq(dailyLogsTable.foremanId, usersTable.id))
      .where(eq(dailyLogsTable.projectId, projectId));

    res.json(rows);
  }),
);

// PUT /api/field/daily-log/:id (owner only)
router.put(
  "/field/daily-log/:id",
  requireAuth,
  requireCompany,
  requireTenantCtx,
  requireOwner,
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }

    const [existing] = await db
      .select()
      .from(dailyLogsTable)
      .where(eq(dailyLogsTable.id, id))
      .limit(1);

    if (!existing) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    const project = await verifyProjectAccess(existing.projectId, req.companyId!);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    const body = req.body as Record<string, unknown>;
    const updates: Record<string, unknown> = {};
    if ("notes" in body) updates.notes = body.notes ?? null;
    if ("weatherTemp" in body) updates.weatherTemp = body.weatherTemp ?? null;
    if ("weatherCondition" in body) updates.weatherCondition = body.weatherCondition ?? null;

    const [updated] = await db
      .update(dailyLogsTable)
      .set(updates)
      .where(and(eq(dailyLogsTable.id, id), eq(dailyLogsTable.projectId, existing.projectId)))
      .returning();

    res.json(updated);
  }),
);

// DELETE /api/field/daily-log/:id (owner only)
router.delete(
  "/field/daily-log/:id",
  requireAuth,
  requireCompany,
  requireTenantCtx,
  requireOwner,
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }

    const [existing] = await db
      .select()
      .from(dailyLogsTable)
      .where(eq(dailyLogsTable.id, id))
      .limit(1);

    if (!existing) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    const project = await verifyProjectAccess(existing.projectId, req.companyId!);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    await db.delete(dailyLogsTable).where(and(eq(dailyLogsTable.id, id), eq(dailyLogsTable.projectId, existing.projectId)));
    res.status(204).send();
  }),
);

// ── Site Photos ────────────────────────────────────────────────────────────

// POST /api/field/photo-upload
router.post(
  "/field/photo-upload",
  requireAuth,
  requireCompany,
  requireTenantCtx,
  requirePermission("viewTimesheets"),
  asyncHandler(async (req, res) => {
    const parsed = CreateSitePhotoBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Malformed request payload", details: parsed.error.issues });
      return;
    }

    const { projectId, imageUrl, markupData, roomLocation } = parsed.data;
    const project = await verifyProjectAccess(projectId, req.companyId!);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    if (!(await canAccessProject(req.companyId!, req.userId!, req.userRole ?? "worker", projectId))) {
      res.status(403).json({ error: "You are not assigned to this project" });
      return;
    }

    const [photo] = await db
      .insert(sitePhotosTable)
      .values({
        projectId,
        imageUrl,
        markupData: markupData ?? null,
        roomLocation: roomLocation ?? null,
      })
      .returning();

    res.status(201).json(photo);
  }),
);

// GET /api/field/photo-upload?projectId={n}
router.get(
  "/field/photo-upload",
  requireAuth,
  requireCompany,
  requireTenantCtx,
  requirePermission("viewTimesheets"),
  asyncHandler(async (req, res) => {
    const projectId = req.query.projectId
      ? parseInt(req.query.projectId as string)
      : null;
    if (!projectId || isNaN(projectId)) {
      res.status(400).json({ error: "projectId query param required" });
      return;
    }

    const project = await verifyProjectAccess(projectId, req.companyId!);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    if (!(await canAccessProject(req.companyId!, req.userId!, req.userRole ?? "worker", projectId))) {
      res.status(403).json({ error: "You are not assigned to this project" });
      return;
    }

    const photos = await db
      .select()
      .from(sitePhotosTable)
      .where(eq(sitePhotosTable.projectId, projectId));

    res.json(photos);
  }),
);

// PUT /api/field/photo-upload/:id (owner only)
router.put(
  "/field/photo-upload/:id",
  requireAuth,
  requireCompany,
  requireTenantCtx,
  requireOwner,
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }

    const [existing] = await db
      .select()
      .from(sitePhotosTable)
      .where(eq(sitePhotosTable.id, id))
      .limit(1);

    if (!existing) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    const project = await verifyProjectAccess(existing.projectId, req.companyId!);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    const body = req.body as Record<string, unknown>;
    const updates: Record<string, unknown> = {};
    if ("roomLocation" in body) updates.roomLocation = body.roomLocation ?? null;

    const [updated] = await db
      .update(sitePhotosTable)
      .set(updates)
      .where(and(eq(sitePhotosTable.id, id), eq(sitePhotosTable.projectId, existing.projectId)))
      .returning();

    res.json(updated);
  }),
);

// DELETE /api/field/photo-upload/:id (owner only)
router.delete(
  "/field/photo-upload/:id",
  requireAuth,
  requireCompany,
  requireTenantCtx,
  requireOwner,
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }

    const [existing] = await db
      .select()
      .from(sitePhotosTable)
      .where(eq(sitePhotosTable.id, id))
      .limit(1);

    if (!existing) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    const project = await verifyProjectAccess(existing.projectId, req.companyId!);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    await db.delete(sitePhotosTable).where(and(eq(sitePhotosTable.id, id), eq(sitePhotosTable.projectId, existing.projectId)));
    res.status(204).send();
  }),
);

// ── Safety Signoffs ───────────────────────────────────────────────────────────

// POST /api/field/safety-check
router.post(
  "/field/safety-check",
  requireAuth,
  requireCompany,
  requireTenantCtx,
  requirePermission("viewTimesheets"),
  asyncHandler(async (req, res) => {
    const parsed = CreateSafetySignoffBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Malformed request payload", details: parsed.error.issues });
      return;
    }

    const { projectId, responses, signatureUrl } = parsed.data;
    const project = await verifyProjectAccess(projectId, req.companyId!);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    if (!(await canAccessProject(req.companyId!, req.userId!, req.userRole ?? "worker", projectId))) {
      res.status(403).json({ error: "You are not assigned to this project" });
      return;
    }

    const [signoff] = await db
      .insert(safetySignoffsTable)
      .values({
        projectId,
        workerId: req.userId!,
        responses,
        signatureUrl: signatureUrl ?? null,
      })
      .returning();

    processSafetySignoff(
      { id: signoff.id, projectId: signoff.projectId, workerId: signoff.workerId, responses: signoff.responses as Record<string, unknown> | null },
      req.companyId!,
    ).catch((err) => logger.error({ err }, "COR evidence aggregation error (safety signoff)"));

    res.status(201).json(signoff);
  }),
);

// GET /api/field/safety-check?projectId={n}
router.get(
  "/field/safety-check",
  requireAuth,
  requireCompany,
  requireTenantCtx,
  requirePermission("viewTimesheets"),
  asyncHandler(async (req, res) => {
    const projectId = req.query.projectId
      ? parseInt(req.query.projectId as string)
      : null;
    if (!projectId || isNaN(projectId)) {
      res.status(400).json({ error: "projectId query param required" });
      return;
    }

    const project = await verifyProjectAccess(projectId, req.companyId!);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    if (!(await canAccessProject(req.companyId!, req.userId!, req.userRole ?? "worker", projectId))) {
      res.status(403).json({ error: "You are not assigned to this project" });
      return;
    }

    const signoffs = await db
      .select()
      .from(safetySignoffsTable)
      .where(eq(safetySignoffsTable.projectId, projectId));

    res.json(signoffs);
  }),
);

// PUT /api/field/safety-check/:id (owner only)
router.put(
  "/field/safety-check/:id",
  requireAuth,
  requireCompany,
  requireTenantCtx,
  requireOwner,
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }

    const [existing] = await db
      .select()
      .from(safetySignoffsTable)
      .where(eq(safetySignoffsTable.id, id))
      .limit(1);

    if (!existing) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    const project = await verifyProjectAccess(existing.projectId, req.companyId!);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    const body = req.body as Record<string, unknown>;
    const updates: Record<string, unknown> = {};
    if ("responses" in body && typeof body.responses === "object" && body.responses !== null) {
      updates.responses = body.responses;
    }
    if ("signatureUrl" in body) updates.signatureUrl = body.signatureUrl ?? null;

    const [updated] = await db
      .update(safetySignoffsTable)
      .set(updates)
      .where(and(eq(safetySignoffsTable.id, id), eq(safetySignoffsTable.projectId, existing.projectId)))
      .returning();

    res.json(updated);
  }),
);

// DELETE /api/field/safety-check/:id (owner only)
router.delete(
  "/field/safety-check/:id",
  requireAuth,
  requireCompany,
  requireTenantCtx,
  requireOwner,
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }

    const [existing] = await db
      .select()
      .from(safetySignoffsTable)
      .where(eq(safetySignoffsTable.id, id))
      .limit(1);

    if (!existing) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    const project = await verifyProjectAccess(existing.projectId, req.companyId!);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    await db.delete(safetySignoffsTable).where(and(eq(safetySignoffsTable.id, id), eq(safetySignoffsTable.projectId, existing.projectId)));
    res.status(204).send();
  }),
);

export default router;
