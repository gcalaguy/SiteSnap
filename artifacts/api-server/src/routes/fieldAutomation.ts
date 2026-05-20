import { Router } from "express";
import {
  db,
  dailyLogsTable,
  sitePhotosTable,
  safetySignoffsTable,
  projectsTable,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth, requireCompany, requireOwner } from "../lib/auth";
import { requirePermission } from "../lib/permissionGate";
import {
  CreateDailyLogBody,
  CreateSitePhotoBody,
  CreateSafetySignoffBody,
} from "@workspace/api-zod";

const router = Router();

// Helper: verify project belongs to user's company
async function verifyProjectAccess(projectId: number, companyId: number) {
  const [project] = await db
    .select()
    .from(projectsTable)
    .where(
      and(
        eq(projectsTable.id, projectId),
        eq(projectsTable.companyId, companyId),
      ),
    )
    .limit(1);
  return project;
}

// ── Daily Logs ───────────────────────────────────────────────────────────

// POST /api/field/daily-log
router.post(
  "/field/daily-log",
  requireAuth,
  requireCompany,
  requirePermission("viewTimesheets"),
  async (req, res) => {
    const parsed = CreateDailyLogBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid body", details: parsed.error });
      return;
    }

    const { projectId, notes, weatherTemp, weatherCondition } = parsed.data;
    const project = await verifyProjectAccess(projectId, req.companyId!);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
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
  },
);

// GET /api/field/daily-log?projectId={n}
router.get(
  "/field/daily-log",
  requireAuth,
  requireCompany,
  requirePermission("viewTimesheets"),
  async (req, res) => {
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

    const logs = await db
      .select()
      .from(dailyLogsTable)
      .where(eq(dailyLogsTable.projectId, projectId));

    res.json(logs);
  },
);

// PUT /api/field/daily-log/:id (owner only)
router.put(
  "/field/daily-log/:id",
  requireAuth,
  requireCompany,
  requireOwner,
  async (req, res) => {
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
      .where(eq(dailyLogsTable.id, id))
      .returning();

    res.json(updated);
  },
);

// DELETE /api/field/daily-log/:id (owner only)
router.delete(
  "/field/daily-log/:id",
  requireAuth,
  requireCompany,
  requireOwner,
  async (req, res) => {
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

    await db.delete(dailyLogsTable).where(eq(dailyLogsTable.id, id));
    res.status(204).send();
  },
);

// ── Site Photos ────────────────────────────────────────────────────────────

// POST /api/field/photo-upload
router.post(
  "/field/photo-upload",
  requireAuth,
  requireCompany,
  requirePermission("viewTimesheets"),
  async (req, res) => {
    const parsed = CreateSitePhotoBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid body", details: parsed.error });
      return;
    }

    const { projectId, imageUrl, markupData, roomLocation } = parsed.data;
    const project = await verifyProjectAccess(projectId, req.companyId!);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
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
  },
);

// GET /api/field/photo-upload?projectId={n}
router.get(
  "/field/photo-upload",
  requireAuth,
  requireCompany,
  requirePermission("viewTimesheets"),
  async (req, res) => {
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

    const photos = await db
      .select()
      .from(sitePhotosTable)
      .where(eq(sitePhotosTable.projectId, projectId));

    res.json(photos);
  },
);

// PUT /api/field/photo-upload/:id (owner only)
router.put(
  "/field/photo-upload/:id",
  requireAuth,
  requireCompany,
  requireOwner,
  async (req, res) => {
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
      .where(eq(sitePhotosTable.id, id))
      .returning();

    res.json(updated);
  },
);

// DELETE /api/field/photo-upload/:id (owner only)
router.delete(
  "/field/photo-upload/:id",
  requireAuth,
  requireCompany,
  requireOwner,
  async (req, res) => {
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

    await db.delete(sitePhotosTable).where(eq(sitePhotosTable.id, id));
    res.status(204).send();
  },
);

// ── Safety Signoffs ───────────────────────────────────────────────────────────

// POST /api/field/safety-check
router.post(
  "/field/safety-check",
  requireAuth,
  requireCompany,
  requirePermission("viewTimesheets"),
  async (req, res) => {
    const parsed = CreateSafetySignoffBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid body", details: parsed.error });
      return;
    }

    const { projectId, responses, signatureUrl } = parsed.data;
    const project = await verifyProjectAccess(projectId, req.companyId!);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
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

    res.status(201).json(signoff);
  },
);

// GET /api/field/safety-check?projectId={n}
router.get(
  "/field/safety-check",
  requireAuth,
  requireCompany,
  requirePermission("viewTimesheets"),
  async (req, res) => {
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

    const signoffs = await db
      .select()
      .from(safetySignoffsTable)
      .where(eq(safetySignoffsTable.projectId, projectId));

    res.json(signoffs);
  },
);

// PUT /api/field/safety-check/:id (owner only)
router.put(
  "/field/safety-check/:id",
  requireAuth,
  requireCompany,
  requireOwner,
  async (req, res) => {
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
      .where(eq(safetySignoffsTable.id, id))
      .returning();

    res.json(updated);
  },
);

// DELETE /api/field/safety-check/:id (owner only)
router.delete(
  "/field/safety-check/:id",
  requireAuth,
  requireCompany,
  requireOwner,
  async (req, res) => {
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

    await db.delete(safetySignoffsTable).where(eq(safetySignoffsTable.id, id));
    res.status(204).send();
  },
);

export default router;
