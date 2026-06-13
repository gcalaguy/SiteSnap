/**
 * Standalone RFI & Submittal Workflow routes.
 *
 * These endpoints complement the existing nested /projects/:projectId/rfis
 * routes. They expose a flat resource surface with explicit ACL checks via
 * objectAcl.checkRfiAccess, keeping authorization logic in one place.
 *
 * POST   /api/rfis                          — Foreman logs a new RFI
 * PUT    /api/rfis/:id/status               — Owner/Foreman approves or rejects
 * GET    /api/rfis/project/:projectId       — Chronological project feed (ACL-gated)
 */

import { Router } from "express";
import { db, rfisTable, projectsTable, usersTable } from "@workspace/db";
import { eq, and, asc, count } from "drizzle-orm";
import { z } from "zod";
import { requireAuth, requireCompany } from "../lib/auth";
import { asyncHandler } from "../lib/asyncHandler";
import { checkRfiAccess } from "../lib/objectAcl";

const router = Router();

// ── Validation schemas ────────────────────────────────────────────────────────

const CreateRfiWorkflowBody = z.object({
  projectId: z.number().int().positive(),
  title: z.string().min(1).max(500),
  description: z.string().min(1),
  blueprintCoordinates: z.string().optional(),
  imageUrl: z.string().url().optional(),
  assignedArchitectId: z.number().int().positive().optional(),
});

const UpdateRfiStatusBody = z.object({
  status: z.enum(["approved", "rejected"]),
});

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getNextRfiNumber(projectId: number): Promise<string> {
  const [result] = await db
    .select({ count: count() })
    .from(rfisTable)
    .where(eq(rfisTable.projectId, projectId));
  const num = (result?.count ?? 0) + 1;
  return `RFI-${String(num).padStart(3, "0")}`;
}

async function verifyProjectBelongsToCompany(
  projectId: number,
  companyId: number,
) {
  const [project] = await db
    .select({ id: projectsTable.id })
    .from(projectsTable)
    .where(
      and(
        eq(projectsTable.id, projectId),
        eq(projectsTable.companyId, companyId),
      ),
    )
    .limit(1);
  return !!project;
}

// ── POST /rfis ────────────────────────────────────────────────────────────────
// A Foreman (or Owner) logs a new RFI with optional blueprint coordinates
// and an image path. The caller must be a member of the company.

router.post(
  "/rfis",
  requireAuth,
  requireCompany,
  asyncHandler(async (req, res) => {
    if (req.userRole !== "foreman" && req.userRole !== "owner") {
      res.status(403).json({ error: "Only Foremen and Owners can log RFIs" });
      return;
    }

    const parsed = CreateRfiWorkflowBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
      return;
    }

    const { projectId, title, description, blueprintCoordinates, imageUrl, assignedArchitectId } =
      parsed.data;

    const projectExists = await verifyProjectBelongsToCompany(projectId, req.companyId!);
    if (!projectExists) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    const rfiNumber = await getNextRfiNumber(projectId);

    const [rfi] = await db
      .insert(rfisTable)
      .values({
        companyId: req.companyId!,
        projectId,
        rfiNumber,
        subject: title,
        description,
        submittedByUserId: req.userId!,
        assignedToUserId: assignedArchitectId ?? null,
        blueprintCoordinates: blueprintCoordinates ?? null,
        imageUrl: imageUrl ?? null,
        status: "open",
      })
      .returning();

    res.status(201).json(rfi);
  }),
);

// ── PUT /rfis/:id/status ──────────────────────────────────────────────────────
// Owner or Foreman changes the RFI status to APPROVED or REJECTED.

router.put(
  "/rfis/:id/status",
  requireAuth,
  requireCompany,
  asyncHandler(async (req, res) => {
    if (req.userRole !== "owner" && req.userRole !== "foreman") {
      res.status(403).json({ error: "Only Owners and Foremen can change RFI status" });
      return;
    }

    const rfiId = parseInt(req.params.id as string, 10);
    if (isNaN(rfiId)) {
      res.status(400).json({ error: "Invalid RFI id" });
      return;
    }

    const parsed = UpdateRfiStatusBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "status must be 'approved' or 'rejected'" });
      return;
    }

    // Scope update to the caller's company (companyId on the row or via project)
    const [rfi] = await db
      .update(rfisTable)
      .set({ status: parsed.data.status })
      .from(projectsTable)
      .where(
        and(
          eq(rfisTable.id, rfiId),
          eq(rfisTable.projectId, projectsTable.id),
          eq(projectsTable.companyId, req.companyId!),
        ),
      )
      .returning();

    if (!rfi) {
      res.status(404).json({ error: "RFI not found" });
      return;
    }

    res.json(rfi);
  }),
);

// ── GET /rfis/project/:projectId ─────────────────────────────────────────────
// Chronological feed of RFIs for a project.
// Access is enforced via checkRfiAccess:
//   - Owners:    any project in their company
//   - Foremen:   only projects they are assigned to
//   - Architects: only if they are assigned to at least one RFI in the project

router.get(
  "/rfis/project/:projectId",
  requireAuth,
  requireCompany,
  asyncHandler(async (req, res) => {
    const projectId = parseInt(req.params.projectId as string, 10);
    if (isNaN(projectId)) {
      res.status(400).json({ error: "Invalid projectId" });
      return;
    }

    const projectExists = await verifyProjectBelongsToCompany(projectId, req.companyId!);
    if (!projectExists) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    const allowed = await checkRfiAccess({
      userId: req.userId!,
      companyId: req.companyId!,
      projectId,
      role: req.userRole,
      systemRole: req.systemRole,
    });

    if (!allowed) {
      res.status(403).json({ error: "You do not have access to this project's RFIs" });
      return;
    }

    const rows = await db
      .select({
        id: rfisTable.id,
        rfiNumber: rfisTable.rfiNumber,
        title: rfisTable.subject,
        description: rfisTable.description,
        blueprintCoordinates: rfisTable.blueprintCoordinates,
        imageUrl: rfisTable.imageUrl,
        status: rfisTable.status,
        priority: rfisTable.priority,
        createdAt: rfisTable.createdAt,
        creatorId: rfisTable.submittedByUserId,
        assignedArchitectId: rfisTable.assignedToUserId,
        creatorFirstName: usersTable.firstName,
        creatorLastName: usersTable.lastName,
      })
      .from(rfisTable)
      .leftJoin(usersTable, eq(rfisTable.submittedByUserId, usersTable.id))
      .where(eq(rfisTable.projectId, projectId))
      .orderBy(asc(rfisTable.createdAt));

    res.json(
      rows.map((r) => ({
        ...r,
        creatorName:
          r.creatorFirstName && r.creatorLastName
            ? `${r.creatorFirstName} ${r.creatorLastName}`
            : "Unknown",
        creatorFirstName: undefined,
        creatorLastName: undefined,
      })),
    );
  }),
);

export default router;
