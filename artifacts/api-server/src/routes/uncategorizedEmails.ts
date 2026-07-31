import { Router } from "express";
import { z } from "zod/v4";
import { db, projectsTable } from "@workspace/db";
import { requireAuth, requireCompany, requireTenantCtx } from "../lib/auth";
import { requireFeature } from "../lib/featureGate";
import { requirePermission } from "../lib/permissionGate";
import { asyncHandler } from "../lib/asyncHandler";
import { BadRequestError, NotFoundError } from "../lib/errors";
import { assertProjectInCompany } from "../lib/projectAccess";
import {
  listInboxThreads,
  archiveThread,
  ignoreThread,
  mergeThreads,
} from "../repositories/emailIntegrations";
import { recordManualAssignment } from "../repositories/projectMatching";

/**
 * Global "Uncategorized Emails" inbox (Phase 2) — threads the matching engine
 * either couldn't confidently place (unassigned) or only suggested
 * (suggested), spanning every project in the company. The single-thread
 * assign action reuses the existing manual assign-project endpoint
 * (PATCH /email-integrations/threads/:threadId/assign-project); everything
 * else here (archive/ignore/merge/bulk-assign/create-project) is new.
 */
const router = Router();

router.use(
  requireAuth,
  requireCompany,
  requireTenantCtx,
  requireFeature("COMMS_HUB"),
  requirePermission("viewProjectCommunications"),
);

// ── GET /uncategorized-emails ────────────────────────────────────────────────
router.get(
  "/uncategorized-emails",
  asyncHandler(async (req, res) => {
    const statusParam = req.query.status as string | undefined;
    const status = statusParam
      ? (statusParam.split(",") as ("unassigned" | "suggested")[])
      : undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
    const offset = req.query.offset ? parseInt(req.query.offset as string) : undefined;
    const result = await listInboxThreads(req.companyId!, { status, limit, offset });
    res.json(result);
  }),
);

// ── POST /uncategorized-emails/:threadId/archive ────────────────────────────
router.post(
  "/uncategorized-emails/:threadId/archive",
  asyncHandler(async (req, res) => {
    const threadId = parseInt(req.params.threadId as string);
    if (isNaN(threadId)) throw new BadRequestError("Invalid thread id");
    const updated = await archiveThread(req.companyId!, threadId);
    if (!updated) throw new NotFoundError("Thread not found");
    res.json(updated);
  }),
);

// ── POST /uncategorized-emails/:threadId/ignore ─────────────────────────────
router.post(
  "/uncategorized-emails/:threadId/ignore",
  asyncHandler(async (req, res) => {
    const threadId = parseInt(req.params.threadId as string);
    if (isNaN(threadId)) throw new BadRequestError("Invalid thread id");
    const updated = await ignoreThread(req.companyId!, threadId);
    if (!updated) throw new NotFoundError("Thread not found");
    res.json(updated);
  }),
);

// ── POST /uncategorized-emails/bulk-assign ──────────────────────────────────
const BulkAssignBody = z.object({
  threadIds: z.array(z.number().int()).min(1),
  projectId: z.number().int(),
});

router.post(
  "/uncategorized-emails/bulk-assign",
  asyncHandler(async (req, res) => {
    const parsed = BulkAssignBody.safeParse(req.body);
    if (!parsed.success) throw new BadRequestError("Invalid request body", parsed.error.issues);

    const project = await assertProjectInCompany(parsed.data.projectId, req.companyId!);
    if (!project) throw new NotFoundError("Project not found");

    // Sequential rather than a single bulk UPDATE — each assignment needs its
    // own recordManualAssignment() call (prior-state read, correction log,
    // learned-signal reinforcement per thread's own sender/subject).
    const updated = [];
    for (const threadId of parsed.data.threadIds) {
      const thread = await recordManualAssignment(req.companyId!, threadId, parsed.data.projectId, req.userId ?? null);
      if (thread) updated.push(thread);
    }
    res.json({ data: updated });
  }),
);

// ── POST /uncategorized-emails/merge ────────────────────────────────────────
const MergeBody = z.object({
  sourceThreadId: z.number().int(),
  targetThreadId: z.number().int(),
});

router.post(
  "/uncategorized-emails/merge",
  asyncHandler(async (req, res) => {
    const parsed = MergeBody.safeParse(req.body);
    if (!parsed.success) throw new BadRequestError("Invalid request body", parsed.error.issues);
    if (parsed.data.sourceThreadId === parsed.data.targetThreadId) {
      throw new BadRequestError("Cannot merge a thread into itself");
    }

    const merged = await mergeThreads(req.companyId!, parsed.data.sourceThreadId, parsed.data.targetThreadId);
    if (!merged) throw new NotFoundError("Thread not found");
    res.json(merged);
  }),
);

// ── POST /uncategorized-emails/:threadId/create-project-and-assign ─────────
const CreateProjectAndAssignBody = z.object({
  name: z.string().min(1),
  address: z.string().min(1),
  city: z.string().min(1),
  province: z.string().min(1),
});

router.post(
  "/uncategorized-emails/:threadId/create-project-and-assign",
  asyncHandler(async (req, res) => {
    const threadId = parseInt(req.params.threadId as string);
    if (isNaN(threadId)) throw new BadRequestError("Invalid thread id");
    const parsed = CreateProjectAndAssignBody.safeParse(req.body);
    if (!parsed.success) throw new BadRequestError("Invalid request body", parsed.error.issues);

    const [project] = await db
      .insert(projectsTable)
      .values({ ...parsed.data, companyId: req.companyId! })
      .returning();

    const updated = await recordManualAssignment(req.companyId!, threadId, project.id, req.userId ?? null);
    if (!updated) throw new NotFoundError("Thread not found");

    res.status(201).json({ project, thread: updated });
  }),
);

export default router;
