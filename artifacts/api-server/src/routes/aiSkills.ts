import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireCompany, requireTenantCtx, requireOwnerOrForeman } from "../lib/auth";
import { asyncHandler } from "../lib/asyncHandler";
import { requireAiQuota } from "../middlewares/requireAiQuota.js";
import { requireFeature } from "../lib/featureGate";
import { requirePermission } from "../lib/permissionGate";
import { canAccessProject, assertProjectInCompany, getAccessibleProjectIds } from "../lib/projectAccess";
import { BadRequestError, NotFoundError, ForbiddenError } from "../lib/errors";
import { listSkills, getSkill, restrictedSkillKeys, runSkill } from "../services/ai/skillLoader";
import { createAiSkillRun, listAiSkillRuns, getAiSkillRun, setAiSkillRunApproval } from "../repositories/aiSkills";

const router = Router();

const GenerateBody = z.object({
  projectId: z.number().int().positive(),
  notes: z.string().min(1).max(8000),
  attachmentObjectPaths: z.array(z.string().min(1)).max(8).optional(),
});

const RejectBody = z.object({
  rejectionReason: z.string().max(1000).optional(),
});

// ── GET /ai/skills ───────────────────────────────────────────────────────────

router.get(
  "/ai/skills",
  requireAuth,
  requireCompany,
  requireTenantCtx,
  requireFeature("AI_SKILLS"),
  asyncHandler(async (req, res) => {
    res.json(listSkills(req.userRole ?? "worker"));
  }),
);

// ── POST /ai/skills/:skillKey/generate ────────────────────────────────────────

router.post(
  "/ai/skills/:skillKey/generate",
  requireAuth,
  requireCompany,
  requireTenantCtx,
  requireFeature("AI_SKILLS"),
  requirePermission("useAiSkills"),
  requireAiQuota,
  asyncHandler(async (req, res) => {
    const { skillKey } = req.params as { skillKey: string };
    const skill = getSkill(skillKey);
    if (!skill) throw new NotFoundError("Unknown skill");
    if (skill.restricted && req.userRole === "worker") {
      throw new ForbiddenError("This skill is not available to workers");
    }

    const parsed = GenerateBody.safeParse(req.body);
    if (!parsed.success) throw new BadRequestError(parsed.error.issues.map((i) => i.message).join("; "));
    const { projectId, notes, attachmentObjectPaths } = parsed.data;

    const project = await assertProjectInCompany(projectId, req.companyId!);
    if (!project) throw new NotFoundError("Project not found");
    const allowed = await canAccessProject(req.companyId!, req.userId!, req.userRole!, projectId);
    if (!allowed) throw new ForbiddenError("No access to this project");

    const { outputJson, outputText } = await runSkill(skillKey, { notes, attachmentObjectPaths });

    const run = await createAiSkillRun({
      companyId: req.companyId!,
      projectId,
      userId: req.userId!,
      skillKey,
      inputs: { notes, attachmentObjectPaths: attachmentObjectPaths ?? [] },
      outputJson: outputJson ?? undefined,
      outputText: outputText ?? undefined,
      status: skill.requiresApproval ? "pending_approval" : "draft",
    });

    res.status(201).json(run);
  }),
);

// ── GET /ai/skills/runs ────────────────────────────────────────────────────────

router.get(
  "/ai/skills/runs",
  requireAuth,
  requireCompany,
  requireTenantCtx,
  requireFeature("AI_SKILLS"),
  asyncHandler(async (req, res) => {
    const projectId = req.query.projectId ? parseInt(req.query.projectId as string) : undefined;
    const skillKey = req.query.skillKey as string | undefined;
    const limit = Math.min(parseInt((req.query.limit as string) || "50"), 100);
    const offset = parseInt((req.query.offset as string) || "0");

    const isWorker = req.userRole === "worker";
    const accessibleProjectIds = isWorker
      ? await getAccessibleProjectIds(req.companyId!, req.userId!, req.userRole!)
      : undefined;

    const result = await listAiSkillRuns(req.companyId!, {
      projectId,
      skillKey,
      accessibleProjectIds,
      excludeSkillKeys: isWorker ? restrictedSkillKeys() : undefined,
      limit,
      offset,
    });
    res.json(result);
  }),
);

// ── GET /ai/skills/runs/:id ───────────────────────────────────────────────────

router.get(
  "/ai/skills/runs/:id",
  requireAuth,
  requireCompany,
  requireTenantCtx,
  requireFeature("AI_SKILLS"),
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) throw new BadRequestError("Invalid run ID");

    const run = await getAiSkillRun(req.companyId!, id);
    if (!run) throw new NotFoundError("AI skill run not found");

    if (req.userRole === "worker") {
      if (restrictedSkillKeys().includes(run.skillKey)) throw new ForbiddenError("Not available to workers");
      const allowed = await canAccessProject(req.companyId!, req.userId!, req.userRole!, run.projectId);
      if (!allowed) throw new ForbiddenError("No access to this project");
    }

    res.json(run);
  }),
);

// ── POST /ai/skills/runs/:id/approve ──────────────────────────────────────────

router.post(
  "/ai/skills/runs/:id/approve",
  requireAuth,
  requireCompany,
  requireTenantCtx,
  requireFeature("AI_SKILLS"),
  requireOwnerOrForeman,
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) throw new BadRequestError("Invalid run ID");

    const run = await getAiSkillRun(req.companyId!, id);
    if (!run) throw new NotFoundError("AI skill run not found");
    if (run.status !== "pending_approval") throw new BadRequestError("Run is not pending approval");

    const updated = await setAiSkillRunApproval(req.companyId!, id, {
      status: "approved",
      approvedByUserId: req.userId!,
    });
    res.json(updated);
  }),
);

// ── POST /ai/skills/runs/:id/reject ───────────────────────────────────────────

router.post(
  "/ai/skills/runs/:id/reject",
  requireAuth,
  requireCompany,
  requireTenantCtx,
  requireFeature("AI_SKILLS"),
  requireOwnerOrForeman,
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) throw new BadRequestError("Invalid run ID");

    const run = await getAiSkillRun(req.companyId!, id);
    if (!run) throw new NotFoundError("AI skill run not found");
    if (run.status !== "pending_approval") throw new BadRequestError("Run is not pending approval");

    const parsed = RejectBody.safeParse(req.body);
    if (!parsed.success) throw new BadRequestError(parsed.error.issues.map((i) => i.message).join("; "));

    const updated = await setAiSkillRunApproval(req.companyId!, id, {
      status: "rejected",
      approvedByUserId: req.userId!,
      rejectionReason: parsed.data.rejectionReason,
    });
    res.json(updated);
  }),
);

export default router;
