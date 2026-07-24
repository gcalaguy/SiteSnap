import { Router } from "express";
import { eq, and, desc, inArray, sql } from "drizzle-orm";
import {
  db,
  psiChecklistsTable,
  psiSignaturesTable,
  psiApprovalsTable,
  usersTable,
  userMembershipsTable,
  projectsTable,
} from "@workspace/db";
import { requireAuth, requireCompany, requireTenantCtx, requireOwnerOrForeman, isPrivilegedRole } from "../lib/auth";
import { canAccessProject, getAccessibleProjectIds, assertProjectInCompany } from "../lib/projectAccess";
import { asyncHandler } from "../lib/asyncHandler";
import { BadRequestError, ForbiddenError, NotFoundError } from "../lib/errors";
import { notify } from "../lib/notify";
import { logger } from "../lib/logger";
import { processPsiChecklist } from "../services/cor/evidenceAggregator";
import { z } from "zod";

const router = Router();

const PsiHazardCategorySchema = z.object({
  checked: z.array(z.string()).default([]),
  otherText: z.string().optional(),
  other2Text: z.string().optional(),
  other3Text: z.string().optional(),
});

const PsiHazardsSchema = z.object({
  environmental: PsiHazardCategorySchema,
  ergonomic: PsiHazardCategorySchema,
  ppe: PsiHazardCategorySchema,
  workingAtHeight: PsiHazardCategorySchema,
  activity: PsiHazardCategorySchema,
  equipment: PsiHazardCategorySchema,
  trafficControl: PsiHazardCategorySchema,
  personalLimitation: PsiHazardCategorySchema,
  additionalEquipment: PsiHazardCategorySchema,
});

const PsiTaskRowSchema = z.object({
  id: z.string(),
  task: z.string().default(""),
  hazard: z.string().default(""),
  control: z.string().default(""),
});

const PsiVoiceNoteSchema = z.object({
  id: z.string(),
  transcript: z.string(),
  recordedAt: z.string(),
  audioUrl: z.string().nullable().optional(),
});

const CreatePsiBody = z.object({
  projectId: z.number(),
  date: z.string().min(1),
  weatherTemp: z.string().optional().nullable(),
  tradeDescription: z.string().optional().nullable(),
  location: z.string().optional().nullable(),
  hazards: PsiHazardsSchema,
  taskRows: z.array(PsiTaskRowSchema).default([]),
  voiceNotes: z.array(PsiVoiceNoteSchema).default([]),
  submit: z.boolean().default(false),
});

const UpdatePsiBody = CreatePsiBody.omit({ submit: true }).partial();

const SignatureBody = z.object({
  signatureUrl: z.string().min(1),
  targetUserId: z.number().optional(),
});

const ApprovalBody = z.object({
  signatureUrl: z.string().optional(),
});

// ── Helpers ───────────────────────────────────────────────────────────────────

// Resolves who a signature/approval should be recorded against. Defaults to
// the caller; a caller may act on behalf of another company member only if
// they hold an owner/foreman role (mirrors time-clock's targetUserId pattern).
async function resolveSigner(req: any, targetUserId: number | undefined): Promise<{ userId: number; role: string }> {
  if (targetUserId == null || targetUserId === req.userId) {
    return { userId: req.userId!, role: req.userRole ?? "worker" };
  }
  if (!isPrivilegedRole(req)) {
    throw new ForbiddenError("Only owners/foremen can sign on behalf of another worker");
  }
  const [membership] = await db
    .select({ role: userMembershipsTable.role })
    .from(userMembershipsTable)
    .where(and(eq(userMembershipsTable.userId, targetUserId), eq(userMembershipsTable.companyId, req.companyId!)));
  if (!membership) throw new NotFoundError("User not found in this company");
  return { userId: targetUserId, role: membership.role };
}

async function notifyPsiTeam(companyId: number, creatorId: number, psiId: number, projectId: number): Promise<void> {
  try {
    const team = await db
      .select({ id: usersTable.id, email: usersTable.email })
      .from(usersTable)
      .innerJoin(
        userMembershipsTable,
        and(
          eq(userMembershipsTable.userId, usersTable.id),
          eq(userMembershipsTable.companyId, companyId),
          sql`${userMembershipsTable.role} IN ('owner','foreman')`,
        ),
      );

    for (const member of team) {
      if (member.id === creatorId) continue;
      await notify({
        userId: member.id,
        actorUserId: creatorId,
        type: "inspection",
        title: "Pre-Inspection Checklist Submitted",
        body: "A new PSI (Pre-Site/Task Inspection) checklist has been submitted and needs sign-off.",
        referenceId: psiId,
        projectId,
      }).catch(() => {});
    }
  } catch (err) {
    logger.error({ err }, "notifyPsiTeam failed");
  }
}

async function countsByPsiIds(psiIds: number[]): Promise<Record<number, { signatures: number; approved: number }>> {
  const result: Record<number, { signatures: number; approved: number }> = {};
  if (psiIds.length === 0) return result;

  const [sigRows, apprRows] = await Promise.all([
    db
      .select({ psiId: psiSignaturesTable.psiId, count: sql<number>`count(*)::int` })
      .from(psiSignaturesTable)
      .where(inArray(psiSignaturesTable.psiId, psiIds))
      .groupBy(psiSignaturesTable.psiId),
    db
      .select({ psiId: psiApprovalsTable.psiId, count: sql<number>`count(*)::int` })
      .from(psiApprovalsTable)
      .where(inArray(psiApprovalsTable.psiId, psiIds))
      .groupBy(psiApprovalsTable.psiId),
  ]);

  for (const id of psiIds) result[id] = { signatures: 0, approved: 0 };
  for (const row of sigRows) result[row.psiId].signatures = row.count;
  for (const row of apprRows) result[row.psiId].approved = row.count;
  return result;
}

// ── GET /psi — list, role-scoped ──────────────────────────────────────────────

router.get(
  "/psi",
  requireAuth,
  requireCompany,
  requireTenantCtx,
  asyncHandler(async (req, res) => {
    const projectIdParam = req.query.projectId ? parseInt(req.query.projectId as string) : undefined;
    const projectIdFilter = projectIdParam && !isNaN(projectIdParam) ? projectIdParam : undefined;

    const conditions: any[] = [eq(psiChecklistsTable.companyId, req.companyId!)];
    if (projectIdFilter !== undefined) {
      if (!(await canAccessProject(req.companyId!, req.userId!, req.userRole ?? "worker", projectIdFilter))) {
        throw new ForbiddenError("You are not assigned to this project");
      }
      conditions.push(eq(psiChecklistsTable.projectId, projectIdFilter));
    } else if ((req.userRole ?? "worker") === "worker") {
      const accessibleIds = await getAccessibleProjectIds(req.companyId!, req.userId!, req.userRole ?? "worker");
      conditions.push(accessibleIds.length ? inArray(psiChecklistsTable.projectId, accessibleIds) : eq(psiChecklistsTable.id, -1));
    }

    const rows = await db
      .select({
        psi: psiChecklistsTable,
        project: { id: projectsTable.id, name: projectsTable.name },
        creator: { id: usersTable.id, firstName: usersTable.firstName, lastName: usersTable.lastName },
      })
      .from(psiChecklistsTable)
      .leftJoin(projectsTable, eq(projectsTable.id, psiChecklistsTable.projectId))
      .leftJoin(usersTable, eq(usersTable.id, psiChecklistsTable.createdByUserId))
      .where(and(...conditions))
      .orderBy(desc(psiChecklistsTable.createdAt));

    const counts = await countsByPsiIds(rows.map((r) => r.psi.id));

    res.json(
      rows.map((r) => ({
        ...r,
        signatureCount: counts[r.psi.id]?.signatures ?? 0,
        approvalCount: counts[r.psi.id]?.approved ?? 0,
      })),
    );
  }),
);

// ── GET /psi/:id — detail ─────────────────────────────────────────────────────

router.get(
  "/psi/:id",
  requireAuth,
  requireCompany,
  requireTenantCtx,
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) throw new BadRequestError("Invalid id");

    const [row] = await db
      .select({
        psi: psiChecklistsTable,
        project: { id: projectsTable.id, name: projectsTable.name },
        creator: { id: usersTable.id, firstName: usersTable.firstName, lastName: usersTable.lastName },
      })
      .from(psiChecklistsTable)
      .leftJoin(projectsTable, eq(projectsTable.id, psiChecklistsTable.projectId))
      .leftJoin(usersTable, eq(usersTable.id, psiChecklistsTable.createdByUserId))
      .where(and(eq(psiChecklistsTable.id, id), eq(psiChecklistsTable.companyId, req.companyId!)));

    if (!row) throw new NotFoundError("PSI checklist not found");

    if (!(await canAccessProject(req.companyId!, req.userId!, req.userRole ?? "worker", row.psi.projectId))) {
      throw new ForbiddenError("You are not assigned to this project");
    }

    const [signatures, approvals] = await Promise.all([
      db
        .select({
          id: psiSignaturesTable.id,
          userId: psiSignaturesTable.userId,
          signatureUrl: psiSignaturesTable.signatureUrl,
          signedAt: psiSignaturesTable.signedAt,
          firstName: usersTable.firstName,
          lastName: usersTable.lastName,
        })
        .from(psiSignaturesTable)
        .leftJoin(usersTable, eq(usersTable.id, psiSignaturesTable.userId))
        .where(eq(psiSignaturesTable.psiId, id)),
      db
        .select({
          id: psiApprovalsTable.id,
          userId: psiApprovalsTable.userId,
          signatureUrl: psiApprovalsTable.signatureUrl,
          approvedAt: psiApprovalsTable.approvedAt,
          firstName: usersTable.firstName,
          lastName: usersTable.lastName,
        })
        .from(psiApprovalsTable)
        .leftJoin(usersTable, eq(usersTable.id, psiApprovalsTable.userId))
        .where(eq(psiApprovalsTable.psiId, id)),
    ]);

    res.json({ ...row, signatures, approvals });
  }),
);

// ── POST /psi — create (draft or submit) ──────────────────────────────────────

router.post(
  "/psi",
  requireAuth,
  requireCompany,
  requireTenantCtx,
  asyncHandler(async (req, res) => {
    const parsed = CreatePsiBody.safeParse(req.body);
    if (!parsed.success) throw new BadRequestError("Invalid request body", parsed.error.flatten());

    const { projectId, date, weatherTemp, tradeDescription, location, hazards, taskRows, voiceNotes, submit } = parsed.data;

    const project = await assertProjectInCompany(projectId, req.companyId!);
    if (!project) throw new NotFoundError("Project not found");

    if (!(await canAccessProject(req.companyId!, req.userId!, req.userRole ?? "worker", projectId))) {
      throw new ForbiddenError("You are not assigned to this project");
    }

    const [psi] = await db
      .insert(psiChecklistsTable)
      .values({
        companyId: req.companyId!,
        projectId,
        createdByUserId: req.userId!,
        date,
        weatherTemp: weatherTemp ?? null,
        tradeDescription: tradeDescription ?? null,
        location: location ?? null,
        hazards,
        taskRows,
        voiceNotes,
        status: submit ? "submitted" : "draft",
        submittedAt: submit ? new Date() : null,
      })
      .returning();

    if (submit) {
      notifyPsiTeam(req.companyId!, req.userId!, psi.id, projectId).catch(() => {});
      processPsiChecklist(
        { id: psi.id, projectId: psi.projectId, createdByUserId: psi.createdByUserId, hazards: psi.hazards as any },
        req.companyId!,
      ).catch((err) => logger.error({ err }, "COR evidence aggregation error (psi checklist)"));
    }

    res.status(201).json(psi);
  }),
);

// ── PATCH /psi/:id — edit a draft ─────────────────────────────────────────────

router.patch(
  "/psi/:id",
  requireAuth,
  requireCompany,
  requireTenantCtx,
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) throw new BadRequestError("Invalid id");

    const [existing] = await db
      .select()
      .from(psiChecklistsTable)
      .where(and(eq(psiChecklistsTable.id, id), eq(psiChecklistsTable.companyId, req.companyId!)));
    if (!existing) throw new NotFoundError("PSI checklist not found");
    if (existing.status !== "draft") throw new BadRequestError("Only draft PSIs can be edited");

    const isOwnerOrForeman = req.userRole === "owner" || req.userRole === "foreman";
    if (existing.createdByUserId !== req.userId! && !isOwnerOrForeman) {
      throw new ForbiddenError("Only the creator or an owner/foreman may edit this draft");
    }

    const parsed = UpdatePsiBody.safeParse(req.body);
    if (!parsed.success) throw new BadRequestError("Invalid request body", parsed.error.flatten());

    const { projectId, ...rest } = parsed.data;
    if (projectId != null) {
      const project = await assertProjectInCompany(projectId, req.companyId!);
      if (!project) throw new NotFoundError("Project not found");
      if (!(await canAccessProject(req.companyId!, req.userId!, req.userRole ?? "worker", projectId))) {
        throw new ForbiddenError("You are not assigned to this project");
      }
    }

    const [updated] = await db
      .update(psiChecklistsTable)
      .set({ ...rest, ...(projectId != null ? { projectId } : {}), updatedAt: new Date() })
      .where(and(eq(psiChecklistsTable.id, id), eq(psiChecklistsTable.companyId, req.companyId!)))
      .returning();

    res.json(updated);
  }),
);

// ── POST /psi/:id/submit — submit an existing draft ───────────────────────────

router.post(
  "/psi/:id/submit",
  requireAuth,
  requireCompany,
  requireTenantCtx,
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) throw new BadRequestError("Invalid id");

    const [existing] = await db
      .select()
      .from(psiChecklistsTable)
      .where(and(eq(psiChecklistsTable.id, id), eq(psiChecklistsTable.companyId, req.companyId!)));
    if (!existing) throw new NotFoundError("PSI checklist not found");
    if (existing.status === "submitted") throw new BadRequestError("Already submitted");

    const isOwnerOrForeman = req.userRole === "owner" || req.userRole === "foreman";
    if (existing.createdByUserId !== req.userId! && !isOwnerOrForeman) {
      throw new ForbiddenError("Only the creator or an owner/foreman may submit this draft");
    }

    const [updated] = await db
      .update(psiChecklistsTable)
      .set({ status: "submitted", submittedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(psiChecklistsTable.id, id), eq(psiChecklistsTable.companyId, req.companyId!)))
      .returning();

    notifyPsiTeam(req.companyId!, req.userId!, id, existing.projectId).catch(() => {});
    processPsiChecklist(
      { id, projectId: existing.projectId, createdByUserId: existing.createdByUserId, hazards: existing.hazards as any },
      req.companyId!,
    ).catch((err) => logger.error({ err }, "COR evidence aggregation error (psi checklist)"));

    res.json(updated);
  }),
);

// ── POST /psi/:id/signature — worker/owner/foreman adds their signature ──────

router.post(
  "/psi/:id/signature",
  requireAuth,
  requireCompany,
  requireTenantCtx,
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) throw new BadRequestError("Invalid id");

    const parsed = SignatureBody.safeParse(req.body);
    if (!parsed.success) throw new BadRequestError("Invalid request body", parsed.error.flatten());

    const [psi] = await db
      .select()
      .from(psiChecklistsTable)
      .where(and(eq(psiChecklistsTable.id, id), eq(psiChecklistsTable.companyId, req.companyId!)));
    if (!psi) throw new NotFoundError("PSI checklist not found");

    const { userId: signerUserId, role: signerRole } = await resolveSigner(req, parsed.data.targetUserId);

    if (!(await canAccessProject(req.companyId!, signerUserId, signerRole, psi.projectId))) {
      throw new ForbiddenError("That worker is not assigned to this project");
    }

    const [signature] = await db
      .insert(psiSignaturesTable)
      .values({ companyId: req.companyId!, psiId: id, userId: signerUserId, signatureUrl: parsed.data.signatureUrl })
      .onConflictDoUpdate({
        target: [psiSignaturesTable.psiId, psiSignaturesTable.userId],
        set: { signatureUrl: parsed.data.signatureUrl, signedAt: new Date() },
      })
      .returning();

    res.status(201).json(signature);
  }),
);

const AddVoiceNoteBody = z.object({
  transcript: z.string().min(1),
  audioUrl: z.string().nullable().optional(),
});

// ── POST /psi/:id/voice-notes — anyone with project access can append ───────
// Deliberately not routed through the general PATCH /psi/:id (creator/admin-
// only, draft-only) — voice notes are a collaborative log that must stay
// addable by anyone present at the toolbox talk, before or after submission.

router.post(
  "/psi/:id/voice-notes",
  requireAuth,
  requireCompany,
  requireTenantCtx,
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) throw new BadRequestError("Invalid id");

    const parsed = AddVoiceNoteBody.safeParse(req.body);
    if (!parsed.success) throw new BadRequestError("Invalid request body", parsed.error.flatten());

    const [psi] = await db
      .select()
      .from(psiChecklistsTable)
      .where(and(eq(psiChecklistsTable.id, id), eq(psiChecklistsTable.companyId, req.companyId!)));
    if (!psi) throw new NotFoundError("PSI checklist not found");

    if (!(await canAccessProject(req.companyId!, req.userId!, req.userRole ?? "worker", psi.projectId))) {
      throw new ForbiddenError("You are not assigned to this project");
    }

    const note = {
      id: `vn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      transcript: parsed.data.transcript,
      recordedAt: new Date().toISOString(),
      audioUrl: parsed.data.audioUrl ?? null,
    };
    const voiceNotes = [...(psi.voiceNotes as typeof note[]), note];

    const [updated] = await db
      .update(psiChecklistsTable)
      .set({ voiceNotes, updatedAt: new Date() })
      .where(eq(psiChecklistsTable.id, id))
      .returning();

    res.status(201).json(updated);
  }),
);

// ── DELETE /psi/:id/voice-notes/:noteId — anyone with project access ────────

router.delete(
  "/psi/:id/voice-notes/:noteId",
  requireAuth,
  requireCompany,
  requireTenantCtx,
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) throw new BadRequestError("Invalid id");
    const noteId = req.params.noteId as string;

    const [psi] = await db
      .select()
      .from(psiChecklistsTable)
      .where(and(eq(psiChecklistsTable.id, id), eq(psiChecklistsTable.companyId, req.companyId!)));
    if (!psi) throw new NotFoundError("PSI checklist not found");

    if (!(await canAccessProject(req.companyId!, req.userId!, req.userRole ?? "worker", psi.projectId))) {
      throw new ForbiddenError("You are not assigned to this project");
    }

    const voiceNotes = (psi.voiceNotes as Array<{ id: string }>).filter((n) => n.id !== noteId);

    const [updated] = await db
      .update(psiChecklistsTable)
      .set({ voiceNotes, updatedAt: new Date() })
      .where(eq(psiChecklistsTable.id, id))
      .returning();

    res.json(updated);
  }),
);

// ── POST /psi/:id/approvals — owner/foreman signs off ────────────────────────
// Any owner or foreman may approve; there's no fixed roster of role slots —
// existence of a row against their own userId IS the approval.

router.post(
  "/psi/:id/approvals",
  requireAuth,
  requireCompany,
  requireTenantCtx,
  requireOwnerOrForeman,
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) throw new BadRequestError("Invalid id");

    const parsed = ApprovalBody.safeParse(req.body);
    if (!parsed.success) throw new BadRequestError("Invalid request body", parsed.error.flatten());

    const [psi] = await db
      .select()
      .from(psiChecklistsTable)
      .where(and(eq(psiChecklistsTable.id, id), eq(psiChecklistsTable.companyId, req.companyId!)));
    if (!psi) throw new NotFoundError("PSI checklist not found");

    const [approval] = await db
      .insert(psiApprovalsTable)
      .values({
        companyId: req.companyId!,
        psiId: id,
        userId: req.userId!,
        signatureUrl: parsed.data.signatureUrl ?? null,
      })
      .onConflictDoUpdate({
        target: [psiApprovalsTable.psiId, psiApprovalsTable.userId],
        set: { signatureUrl: parsed.data.signatureUrl ?? null, approvedAt: new Date() },
      })
      .returning();

    res.status(201).json(approval);
  }),
);

export default router;
