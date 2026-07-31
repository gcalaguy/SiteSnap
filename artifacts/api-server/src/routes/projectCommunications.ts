import { Router } from "express";
import { requireAuth, requireCompany, requireTenantCtx } from "../lib/auth";
import { requireFeature } from "../lib/featureGate";
import { requirePermission } from "../lib/permissionGate";
import { asyncHandler } from "../lib/asyncHandler";
import { BadRequestError, NotFoundError } from "../lib/errors";
import { assertProjectInCompany } from "../lib/projectAccess";
import {
  listThreadsForProject,
  getThread,
  listMessagesForThread,
  listAttachmentsForMessage,
  searchEmails,
  getAttachment,
  listAttachmentsForProject,
  listTimelineEventsForProject,
  listMessageSummariesForProject,
} from "../repositories/emailIntegrations";
import {
  listProjectMatchKeywords,
  addProjectMatchKeyword,
  removeProjectMatchKeyword,
} from "../repositories/projectMatching";
import { ObjectStorageService } from "../lib/objectStorage";
import { z } from "zod/v4";

// Mounted at /projects/:projectId/communications with mergeParams, matching
// the documentsRouter/dailyReportsRouter nested-resource convention.
const router = Router({ mergeParams: true });

router.use(
  requireAuth,
  requireCompany,
  requireTenantCtx,
  requireFeature("COMMS_HUB"),
  requirePermission("viewProjectCommunications"),
);

async function requireProject(req: any): Promise<number> {
  const projectId = parseInt(req.params.projectId as string);
  if (isNaN(projectId)) throw new BadRequestError("Invalid project id");
  const project = await assertProjectInCompany(projectId, req.companyId!);
  if (!project) throw new NotFoundError("Project not found");
  return projectId;
}

// ── GET /projects/:projectId/communications/threads ─────────────────────────
router.get(
  "/threads",
  asyncHandler(async (req, res) => {
    const projectId = await requireProject(req);
    const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
    const offset = req.query.offset ? parseInt(req.query.offset as string) : undefined;
    const result = await listThreadsForProject(req.companyId!, projectId, { limit, offset });
    res.json(result);
  }),
);

// ── GET /projects/:projectId/communications/threads/:threadId ───────────────
router.get(
  "/threads/:threadId",
  asyncHandler(async (req, res) => {
    await requireProject(req);
    const threadId = parseInt(req.params.threadId as string);
    if (isNaN(threadId)) throw new BadRequestError("Invalid thread id");

    const thread = await getThread(req.companyId!, threadId);
    if (!thread) throw new NotFoundError("Thread not found");

    const rawMessages = await listMessagesForThread(req.companyId!, threadId);
    const messages = await Promise.all(
      rawMessages.map(async (m) => ({
        ...m,
        attachments: m.hasAttachments ? await listAttachmentsForMessage(req.companyId!, m.id) : [],
      })),
    );
    res.json({ thread, messages });
  }),
);

// ── GET /projects/:projectId/communications/search?q= ────────────────────────
router.get(
  "/search",
  asyncHandler(async (req, res) => {
    const projectId = await requireProject(req);
    const q = (req.query.q as string) ?? "";
    if (!q.trim()) throw new BadRequestError("Query parameter 'q' is required");
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 25;

    const results = await searchEmails(req.companyId!, projectId, q, limit);
    res.json({ results });
  }),
);

// ── GET /projects/:projectId/communications/attachments/:attachmentId/url ──
router.get(
  "/attachments/:attachmentId/url",
  asyncHandler(async (req, res) => {
    await requireProject(req);
    const attachmentId = parseInt(req.params.attachmentId as string);
    if (isNaN(attachmentId)) throw new BadRequestError("Invalid attachment id");

    const attachment = await getAttachment(req.companyId!, attachmentId);
    if (!attachment) throw new NotFoundError("Attachment not found");

    const objectStorage = new ObjectStorageService();
    const url = await objectStorage.getObjectEntityReadURL(attachment.objectPath);
    res.json({ url, filename: attachment.filename, contentType: attachment.contentType });
  }),
);

// ── GET /projects/:projectId/communications/attachments ────────────────────
// Phase 4 — every attachment across this project's threads, categorized, with
// documentId set once it's been promoted into the project's document library.
router.get(
  "/attachments",
  asyncHandler(async (req, res) => {
    const projectId = await requireProject(req);
    const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
    const offset = req.query.offset ? parseInt(req.query.offset as string) : undefined;
    const result = await listAttachmentsForProject(req.companyId!, projectId, { limit, offset });
    res.json(result);
  }),
);

// ── GET /projects/:projectId/communications/timeline ────────────────────────
// Phase 4 — AI-derived chronological project events, each linking back to its
// source email thread/message.
router.get(
  "/timeline",
  asyncHandler(async (req, res) => {
    const projectId = await requireProject(req);
    const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
    const offset = req.query.offset ? parseInt(req.query.offset as string) : undefined;
    const eventType = req.query.eventType as any;
    const result = await listTimelineEventsForProject(req.companyId!, projectId, { limit, offset, eventType });
    res.json(result);
  }),
);

// ── GET /projects/:projectId/communications/summaries ───────────────────────
// Phase 4 mobile "AI Summaries" tab — a feed of per-message AI summaries for
// this project, most recent first.
router.get(
  "/summaries",
  asyncHandler(async (req, res) => {
    const projectId = await requireProject(req);
    const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
    const offset = req.query.offset ? parseInt(req.query.offset as string) : undefined;
    const result = await listMessageSummariesForProject(req.companyId!, projectId, { limit, offset });
    res.json(result);
  }),
);

// ── GET /projects/:projectId/communications/match-keywords ─────────────────
// User-defined keywords (Phase 2 matching engine signal) — a company admin
// tags a project with free-text terms the deterministic scorer should also
// treat as evidence, e.g. a job's informal nickname that won't appear in any
// structured field (project number, PO number, etc).
router.get(
  "/match-keywords",
  asyncHandler(async (req, res) => {
    const projectId = await requireProject(req);
    const keywords = await listProjectMatchKeywords(req.companyId!, projectId);
    res.json({ data: keywords });
  }),
);

// ── POST /projects/:projectId/communications/match-keywords ────────────────
const AddKeywordBody = z.object({ keyword: z.string().min(1).max(100) });

router.post(
  "/match-keywords",
  asyncHandler(async (req, res) => {
    const projectId = await requireProject(req);
    const parsed = AddKeywordBody.safeParse(req.body);
    if (!parsed.success) throw new BadRequestError("Invalid request body", parsed.error.issues);

    const keyword = await addProjectMatchKeyword({
      companyId: req.companyId!,
      projectId,
      keyword: parsed.data.keyword.trim(),
      createdByUserId: req.userId ?? null,
    });
    res.status(201).json(keyword);
  }),
);

// ── DELETE /projects/:projectId/communications/match-keywords/:keywordId ───
router.delete(
  "/match-keywords/:keywordId",
  asyncHandler(async (req, res) => {
    await requireProject(req);
    const keywordId = parseInt(req.params.keywordId as string);
    if (isNaN(keywordId)) throw new BadRequestError("Invalid keyword id");
    const deleted = await removeProjectMatchKeyword(req.companyId!, keywordId);
    if (!deleted) throw new NotFoundError("Keyword not found");
    res.status(204).send();
  }),
);

export default router;
