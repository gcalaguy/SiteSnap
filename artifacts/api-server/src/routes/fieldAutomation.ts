import { Router } from "express";
import {
  db,
  dailyLogsTable,
  sitePhotosTable,
  safetySignoffsTable,
  projectsTable,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth, requireCompany } from "../lib/auth";
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

export default router;
