import { Router } from "express";
import { eq, and, desc, asc } from "drizzle-orm";
import {
  db,
  projectsTable,
  projectDocumentsTable,
  dailyReportsTable,
  dailyReportPhotosTable,
  tasksTable,
  clientPortalTokensTable,
  clientPortalUploadsTable,
  clientPortalMessagesTable,
  invoicesTable,
  usersTable,
} from "@workspace/db";
import { requireAuth, requireCompany } from "../lib/auth.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { requirePermission } from "../lib/permissionGate.js";
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

async function photoUrl(objectPath: string): Promise<string> {
  const cleanPath = objectPath.replace(/^\/objects\//, "");
  try {
    return await objectStorageService.getObjectEntityReadURL(`/objects/${cleanPath}`, 900);
  } catch {
    return "";
  }
}

// ── POST /projects/:projectId/portal/token (auth) ─────────────────────────────

router.post(
  "/projects/:projectId/portal/token",
  requireAuth,
  requireCompany,
  requirePermission("viewClientMessages"),
  asyncHandler(async (req, res) => {
    const projectId = parseInt(req.params.projectId as string);
    if (isNaN(projectId)) { res.status(400).json({ error: "Invalid projectId" }); return; }

    const [project] = await db.select().from(projectsTable)
      .where(and(eq(projectsTable.id, projectId), eq(projectsTable.companyId, req.companyId!)))
      .limit(1);
    if (!project) { res.status(404).json({ error: "Project not found" }); return; }

    const [existing] = await db.select().from(clientPortalTokensTable)
      .where(and(eq(clientPortalTokensTable.projectId, projectId), eq(clientPortalTokensTable.isActive, true)))
      .limit(1);
    if (existing) { res.json({ token: existing.token }); return; }

    const token = crypto.randomUUID();
    const [created] = await db.insert(clientPortalTokensTable).values({ projectId, token }).returning();
    res.json({ token: created.token });
  }),
);

// ── DELETE /projects/:projectId/portal/token (auth) ──────────────────────────

router.delete(
  "/projects/:projectId/portal/token",
  requireAuth,
  requireCompany,
  requirePermission("viewClientMessages"),
  asyncHandler(async (req, res) => {
    const projectId = parseInt(req.params.projectId as string);
    if (isNaN(projectId)) { res.status(400).json({ error: "Invalid projectId" }); return; }

    const [project] = await db.select().from(projectsTable)
      .where(and(eq(projectsTable.id, projectId), eq(projectsTable.companyId, req.companyId!)))
      .limit(1);
    if (!project) { res.status(404).json({ error: "Project not found" }); return; }

    await db.update(clientPortalTokensTable)
      .set({ isActive: false })
      .where(and(eq(clientPortalTokensTable.projectId, projectId), eq(clientPortalTokensTable.isActive, true)));

    res.json({ success: true });
  }),
);

// ── GET /projects/:projectId/portal/uploads (auth) ───────────────────────────

router.get(
  "/projects/:projectId/portal/uploads",
  requireAuth,
  requireCompany,
  requirePermission("viewClientMessages"),
  asyncHandler(async (req, res) => {
    const projectId = parseInt(req.params.projectId as string);
    if (isNaN(projectId)) { res.status(400).json({ error: "Invalid projectId" }); return; }

    const [project] = await db.select().from(projectsTable)
      .where(and(eq(projectsTable.id, projectId), eq(projectsTable.companyId, req.companyId!)))
      .limit(1);
    if (!project) { res.status(404).json({ error: "Project not found" }); return; }

    const uploads = await db.select().from(clientPortalUploadsTable)
      .where(eq(clientPortalUploadsTable.projectId, projectId))
      .orderBy(desc(clientPortalUploadsTable.createdAt));
    res.json(uploads);
  }),
);

// ── GET /projects/:projectId/portal/messages (auth) ──────────────────────────
// Contractor reads all messages for a project portal.

router.get(
  "/projects/:projectId/portal/messages",
  requireAuth,
  requireCompany,
  asyncHandler(async (req, res) => {
    const projectId = parseInt(req.params.projectId as string);
    if (isNaN(projectId)) { res.status(400).json({ error: "Invalid projectId" }); return; }

    const [project] = await db.select().from(projectsTable)
      .where(and(eq(projectsTable.id, projectId), eq(projectsTable.companyId, req.companyId!)))
      .limit(1);
    if (!project) { res.status(404).json({ error: "Project not found" }); return; }

    // Must have an active portal before messages make sense
    const [portalToken] = await db.select().from(clientPortalTokensTable)
      .where(and(eq(clientPortalTokensTable.projectId, projectId), eq(clientPortalTokensTable.isActive, true)))
      .limit(1);
    if (!portalToken) {
      res.status(400).json({ error: "No active portal link for this project" });
      return;
    }

    const messages = await db.select().from(clientPortalMessagesTable)
      .where(eq(clientPortalMessagesTable.projectId, projectId))
      .orderBy(asc(clientPortalMessagesTable.createdAt));
    res.json(messages);
  }),
);

// ── POST /projects/:projectId/portal/messages (auth) ─────────────────────────
// Contractor sends a reply visible in the client portal.

const ContractorMessageBody = z.object({
  message: z.string().min(1).max(2000),
  senderName: z.string().optional(),
});

router.post(
  "/projects/:projectId/portal/messages",
  requireAuth,
  requireCompany,
  asyncHandler(async (req, res) => {
    const projectId = parseInt(req.params.projectId as string);
    if (isNaN(projectId)) { res.status(400).json({ error: "Invalid projectId" }); return; }

    const [project] = await db.select().from(projectsTable)
      .where(and(eq(projectsTable.id, projectId), eq(projectsTable.companyId, req.companyId!)))
      .limit(1);
    if (!project) { res.status(404).json({ error: "Project not found" }); return; }

    // Find active portal token
    const [portalToken] = await db.select().from(clientPortalTokensTable)
      .where(and(eq(clientPortalTokensTable.projectId, projectId), eq(clientPortalTokensTable.isActive, true)))
      .limit(1);
    if (!portalToken) { res.status(400).json({ error: "No active portal link for this project" }); return; }

    const parsed = ContractorMessageBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "Invalid body" }); return; }

    // Resolve the sender's real name from the DB
    const [sender] = await db
      .select({ firstName: usersTable.firstName, lastName: usersTable.lastName })
      .from(usersTable)
      .where(eq(usersTable.id, req.userId!))
      .limit(1);
    const resolvedName =
      parsed.data.senderName ??
      (sender ? `${sender.firstName} ${sender.lastName}`.trim() : "Your Contractor");

    const [created] = await db.insert(clientPortalMessagesTable).values({
      portalTokenId: portalToken.id,
      projectId,
      senderRole: "contractor",
      senderName: resolvedName,
      message: parsed.data.message,
    }).returning();

    res.status(201).json(created);
  }),
);

// ── GET /portal/:token (public) ───────────────────────────────────────────────

router.get("/portal/:token", asyncHandler(async (req, res) => {
  const portalToken = await resolveToken(req.params.token as string);
  if (!portalToken) { res.status(404).json({ error: "Portal link not found or has been revoked" }); return; }

  const { projectId } = portalToken;

  const [project] = await db.select().from(projectsTable)
    .where(eq(projectsTable.id, projectId))
    .limit(1);
  if (!project) { res.status(404).json({ error: "Project not found" }); return; }

  // Task progress
  const allTasks = await db.select({ status: tasksTable.status })
    .from(tasksTable)
    .where(eq(tasksTable.projectId, projectId));
  const totalTasks = allTasks.length;
  const doneTasks = allTasks.filter((t) => t.status === "done").length;
  const progressPct = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

  // Recent daily reports (last 7)
  const reports = await db.select({
    id: dailyReportsTable.id,
    reportDate: dailyReportsTable.reportDate,
    workPerformed: dailyReportsTable.workPerformed,
    aiSummary: dailyReportsTable.aiSummary,
  })
    .from(dailyReportsTable)
    .where(eq(dailyReportsTable.projectId, projectId))
    .orderBy(desc(dailyReportsTable.reportDate))
    .limit(7);

  // Photos from daily reports — newest reports first, up to 30 photos
  const rawPhotos = await db
    .select({
      id: dailyReportPhotosTable.id,
      objectPath: dailyReportPhotosTable.objectPath,
      caption: dailyReportPhotosTable.caption,
      uploadedAt: dailyReportPhotosTable.uploadedAt,
      reportDate: dailyReportsTable.reportDate,
    })
    .from(dailyReportPhotosTable)
    .innerJoin(dailyReportsTable, eq(dailyReportPhotosTable.reportId, dailyReportsTable.id))
    .where(eq(dailyReportsTable.projectId, projectId))
    .orderBy(desc(dailyReportPhotosTable.uploadedAt))
    .limit(30);

  const photos = await Promise.all(
    rawPhotos.map(async (p) => ({
      id: p.id,
      url: await photoUrl(p.objectPath),
      caption: p.caption,
      uploadedAt: p.uploadedAt,
      reportDate: p.reportDate,
    })),
  );

  // Contractor documents
  const rawDocuments = await db.select({
    id: projectDocumentsTable.id,
    filename: projectDocumentsTable.filename,
    fileType: projectDocumentsTable.fileType,
    fileSize: projectDocumentsTable.fileSize,
    aiSummary: projectDocumentsTable.aiSummary,
    objectPath: projectDocumentsTable.objectPath,
    createdAt: projectDocumentsTable.createdAt,
  })
    .from(projectDocumentsTable)
    .where(eq(projectDocumentsTable.projectId, projectId))
    .orderBy(desc(projectDocumentsTable.createdAt));

  const documents = await Promise.all(
    rawDocuments.map(async (d) => {
      let signedUrl: string | null = null;
      if (d.objectPath) {
        try {
          signedUrl = await objectStorageService.getObjectEntityReadURL(d.objectPath, 900);
        } catch {
          signedUrl = null;
        }
      }
      return {
        id: d.id,
        filename: d.filename,
        fileType: d.fileType,
        fileSize: d.fileSize,
        aiSummary: d.aiSummary,
        signedUrl,
        createdAt: d.createdAt,
      };
    }),
  );

  // Client uploads
  const clientUploads = await db.select().from(clientPortalUploadsTable)
    .where(eq(clientPortalUploadsTable.projectId, projectId))
    .orderBy(desc(clientPortalUploadsTable.createdAt));

  // Payment requests — invoices linked to this project that have been sent/paid/overdue
  const invoices = await db.select({
    id: invoicesTable.id,
    invoiceNumber: invoicesTable.invoiceNumber,
    title: invoicesTable.title,
    total: invoicesTable.total,
    status: invoicesTable.status,
    dueDate: invoicesTable.dueDate,
    sentAt: invoicesTable.sentAt,
    paidAt: invoicesTable.paidAt,
  })
    .from(invoicesTable)
    .where(
      and(
        eq(invoicesTable.projectId, projectId),
        // Only show invoices that have been sent to client (not drafts/cancelled)
      ),
    )
    .orderBy(desc(invoicesTable.createdAt));

  // Filter to non-draft, non-cancelled in JS (drizzle inArray needs workaround)
  const paymentRequests = invoices.filter(
    (inv) => inv.status !== "draft" && inv.status !== "cancelled",
  );

  // Messages for this portal
  const messages = await db.select().from(clientPortalMessagesTable)
    .where(eq(clientPortalMessagesTable.portalTokenId, portalToken.id))
    .orderBy(asc(clientPortalMessagesTable.createdAt));

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
    photos,
    documents,
    clientUploads,
    paymentRequests,
    messages,
  });
}))

// ── POST /portal/:token/upload-url (public) ───────────────────────────────────

const UploadUrlBody = z.object({
  name: z.string().min(1).max(255),
  size: z.number().int().positive(),
  contentType: z.string().min(1),
});

router.post("/portal/:token/upload-url", asyncHandler(async (req, res) => {
  const portalToken = await resolveToken(req.params.token as string);
  if (!portalToken) { res.status(404).json({ error: "Portal link not found or has been revoked" }); return; }

  const parsed = UploadUrlBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid request body" }); return; }

  const uploadURL = await objectStorageService.getObjectEntityUploadURL();
  const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);
  res.json({ uploadURL, objectPath });
}))

// ── POST /portal/:token/uploads (public) ─────────────────────────────────────

const RegisterUploadBody = z.object({
  filename: z.string().min(1).max(255),
  fileType: z.string().min(1),
  objectPath: z.string().min(1),
  fileSize: z.number().int().positive().optional(),
});

router.post("/portal/:token/uploads", asyncHandler(async (req, res) => {
  const portalToken = await resolveToken(req.params.token as string);
  if (!portalToken) { res.status(404).json({ error: "Portal link not found or has been revoked" }); return; }

  const parsed = RegisterUploadBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid request body" }); return; }

  const { filename, fileType, objectPath, fileSize } = parsed.data;
  const [created] = await db.insert(clientPortalUploadsTable).values({
    portalTokenId: portalToken.id,
    projectId: portalToken.projectId,
    filename,
    fileType,
    objectPath,
    fileSize,
  }).returning();

  res.status(201).json(created);
}))

// ── GET /portal/:token/messages (public) ─────────────────────────────────────
// Client retrieves conversation thread.

router.get("/portal/:token/messages", asyncHandler(async (req, res) => {
  const portalToken = await resolveToken(req.params.token as string);
  if (!portalToken) { res.status(404).json({ error: "Portal link not found or has been revoked" }); return; }

  const messages = await db.select().from(clientPortalMessagesTable)
    .where(eq(clientPortalMessagesTable.portalTokenId, portalToken.id))
    .orderBy(asc(clientPortalMessagesTable.createdAt));
  res.json(messages);
}))

// ── POST /portal/:token/messages (public) ────────────────────────────────────
// Client sends a message to the contractor.

const ClientMessageBody = z.object({
  message: z.string().min(1).max(2000),
  senderName: z.string().min(1).max(100).optional(),
});

router.post("/portal/:token/messages", asyncHandler(async (req, res) => {
  const portalToken = await resolveToken(req.params.token as string);
  if (!portalToken) { res.status(404).json({ error: "Portal link not found or has been revoked" }); return; }

  const parsed = ClientMessageBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid body" }); return; }

  const [created] = await db.insert(clientPortalMessagesTable).values({
    portalTokenId: portalToken.id,
    projectId: portalToken.projectId,
    senderRole: "client",
    senderName: parsed.data.senderName ?? "Client",
    message: parsed.data.message,
  }).returning();

  res.status(201).json(created);
}))

export default router;
