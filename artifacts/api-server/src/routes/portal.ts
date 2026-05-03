import { Router } from "express";
import { eq, and, desc, count } from "drizzle-orm";
import {
  db,
  projectsTable,
  projectDocumentsTable,
  dailyReportsTable,
  tasksTable,
  clientPortalTokensTable,
  clientPortalUploadsTable,
} from "@workspace/db";
import { requireAuth, requireCompany } from "../lib/auth.js";
import { ObjectStorageService } from "../lib/objectStorage.js";
import { z } from "zod";
import crypto from "crypto";

const router = Router({ mergeParams: true });
const objectStorageService = new ObjectStorageService();

// ── Helper: resolve portal token and active project ───────────────────────────

async function resolveToken(token: string) {
  const [row] = await db
    .select()
    .from(clientPortalTokensTable)
    .where(
      and(
        eq(clientPortalTokensTable.token, token),
        eq(clientPortalTokensTable.isActive, true),
      ),
    )
    .limit(1);
  return row ?? null;
}

// ── POST /projects/:projectId/portal/token (auth) ─────────────────────────────
// Generate or retrieve the portal share token for a project.

router.post(
  "/projects/:projectId/portal/token",
  requireAuth,
  requireCompany,
  async (req, res) => {
    const projectId = parseInt(req.params.projectId);
    if (isNaN(projectId)) {
      res.status(400).json({ error: "Invalid projectId" });
      return;
    }

    // Verify project belongs to this company
    const [project] = await db
      .select()
      .from(projectsTable)
      .where(
        and(
          eq(projectsTable.id, projectId),
          eq(projectsTable.companyId, req.companyId!),
        ),
      )
      .limit(1);

    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    // Return existing active token if one exists
    const [existing] = await db
      .select()
      .from(clientPortalTokensTable)
      .where(
        and(
          eq(clientPortalTokensTable.projectId, projectId),
          eq(clientPortalTokensTable.isActive, true),
        ),
      )
      .limit(1);

    if (existing) {
      res.json({ token: existing.token });
      return;
    }

    // Create new token
    const token = crypto.randomUUID();
    const [created] = await db
      .insert(clientPortalTokensTable)
      .values({ projectId, token })
      .returning();

    res.json({ token: created.token });
  },
);

// ── DELETE /projects/:projectId/portal/token (auth) ──────────────────────────
// Revoke the portal share token for a project.

router.delete(
  "/projects/:projectId/portal/token",
  requireAuth,
  requireCompany,
  async (req, res) => {
    const projectId = parseInt(req.params.projectId);
    if (isNaN(projectId)) {
      res.status(400).json({ error: "Invalid projectId" });
      return;
    }

    // Verify project belongs to this company
    const [project] = await db
      .select()
      .from(projectsTable)
      .where(
        and(
          eq(projectsTable.id, projectId),
          eq(projectsTable.companyId, req.companyId!),
        ),
      )
      .limit(1);

    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    await db
      .update(clientPortalTokensTable)
      .set({ isActive: false })
      .where(
        and(
          eq(clientPortalTokensTable.projectId, projectId),
          eq(clientPortalTokensTable.isActive, true),
        ),
      );

    res.json({ success: true });
  },
);

// ── GET /portal/:token (public) ───────────────────────────────────────────────
// Returns project progress, documents, and recent updates for a portal token.

router.get("/portal/:token", async (req, res) => {
  const portalToken = await resolveToken(req.params.token);
  if (!portalToken) {
    res.status(404).json({ error: "Portal link not found or has been revoked" });
    return;
  }

  const { projectId } = portalToken;

  const [project] = await db
    .select()
    .from(projectsTable)
    .where(eq(projectsTable.id, projectId))
    .limit(1);

  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  // Task progress
  const allTasks = await db
    .select({ status: tasksTable.status })
    .from(tasksTable)
    .where(eq(tasksTable.projectId, projectId));

  const totalTasks = allTasks.length;
  const doneTasks = allTasks.filter((t) => t.status === "done").length;
  const progressPct = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

  // Recent daily reports (last 7)
  const reports = await db
    .select({
      id: dailyReportsTable.id,
      reportDate: dailyReportsTable.reportDate,
      workPerformed: dailyReportsTable.workPerformed,
      aiSummary: dailyReportsTable.aiSummary,
    })
    .from(dailyReportsTable)
    .where(eq(dailyReportsTable.projectId, projectId))
    .orderBy(desc(dailyReportsTable.reportDate))
    .limit(7);

  // Contractor documents (exclude pending AI items, show metadata only)
  const documents = await db
    .select({
      id: projectDocumentsTable.id,
      filename: projectDocumentsTable.filename,
      fileType: projectDocumentsTable.fileType,
      fileSize: projectDocumentsTable.fileSize,
      aiSummary: projectDocumentsTable.aiSummary,
      createdAt: projectDocumentsTable.createdAt,
    })
    .from(projectDocumentsTable)
    .where(eq(projectDocumentsTable.projectId, projectId))
    .orderBy(desc(projectDocumentsTable.createdAt));

  // Client uploads
  const clientUploads = await db
    .select()
    .from(clientPortalUploadsTable)
    .where(eq(clientPortalUploadsTable.projectId, projectId))
    .orderBy(desc(clientPortalUploadsTable.createdAt));

  res.json({
    project: {
      name: project.name,
      status: project.status,
      address: project.address,
      city: project.city,
      province: project.province,
      startDate: project.startDate,
      endDate: project.endDate,
      budget: project.budget,
    },
    progress: { totalTasks, doneTasks, progressPct },
    reports,
    documents,
    clientUploads,
  });
});

// ── POST /portal/:token/upload-url (public) ───────────────────────────────────
// Request a presigned upload URL for a client file upload.

const UploadUrlBody = z.object({
  name: z.string().min(1).max(255),
  size: z.number().int().positive(),
  contentType: z.string().min(1),
});

router.post("/portal/:token/upload-url", async (req, res) => {
  const portalToken = await resolveToken(req.params.token);
  if (!portalToken) {
    res.status(404).json({ error: "Portal link not found or has been revoked" });
    return;
  }

  const parsed = UploadUrlBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const uploadURL = await objectStorageService.getObjectEntityUploadURL();
  const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);

  res.json({ uploadURL, objectPath });
});

// ── POST /portal/:token/uploads (public) ─────────────────────────────────────
// Register a client upload after the file has been uploaded to storage.

const RegisterUploadBody = z.object({
  filename: z.string().min(1).max(255),
  fileType: z.string().min(1),
  objectPath: z.string().min(1),
  fileSize: z.number().int().positive().optional(),
});

router.post("/portal/:token/uploads", async (req, res) => {
  const portalToken = await resolveToken(req.params.token);
  if (!portalToken) {
    res.status(404).json({ error: "Portal link not found or has been revoked" });
    return;
  }

  const parsed = RegisterUploadBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const { filename, fileType, objectPath, fileSize } = parsed.data;

  const [created] = await db
    .insert(clientPortalUploadsTable)
    .values({
      portalTokenId: portalToken.id,
      projectId: portalToken.projectId,
      filename,
      fileType,
      objectPath,
      fileSize,
    })
    .returning();

  res.status(201).json(created);
});

export default router;
