import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { and, eq, desc } from "drizzle-orm";
import { db, permitsTable, projectsTable } from "@workspace/db";
import { requireAuth, requireCompany, requireTenantCtx } from "../lib/auth";
import { requireFeature } from "../lib/featureGate";
import { asyncHandler } from "../lib/asyncHandler";
import {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  ValidationError,
} from "../lib/errors";
import { ObjectStorageService } from "../lib/objectStorage";
import {
  ObjectAccessGroupType,
  ObjectPermission,
  isUserInAccessGroup,
} from "../lib/objectAcl";
import { logAuditEventFromRequest } from "../utils/logger";
import { z } from "zod";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

// ── Role gates ────────────────────────────────────────────────────────────────

/**
 * Owner/Admin gate. In this codebase the company-level admin role is "owner"
 * (the user_role enum is owner/foreman/worker); platform super-admins also
 * qualify. Foremen and workers are rejected.
 */
const requirePermitAdmin = (req: Request, res: Response, next: NextFunction) => {
  if (req.userRole !== "owner" && req.systemRole !== "super_admin") {
    res.status(403).json({ error: "Owner or admin access required" });
    return;
  }
  next();
};

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Verify the project exists inside the caller's tenant. Returns null if not. */
async function verifyProjectInCompany(projectId: number, companyId: number) {
  const [project] = await db
    .select({ id: projectsTable.id })
    .from(projectsTable)
    .where(and(eq(projectsTable.id, projectId), eq(projectsTable.companyId, companyId)))
    .limit(1);
  return project ?? null;
}

/**
 * Attach the standard permit-file ACL policy to an uploaded object:
 * private, owned by the uploader, readable by any active company member.
 * (Owner/admin row-level checks gate writes; foremen reach the file only
 * through the read-only project view.)
 * Returns the normalized /objects/... path to persist as fileUrl.
 */
async function applyPermitFileAcl(
  req: Request,
  rawFileUrl: string,
): Promise<string> {
  return objectStorageService.trySetObjectEntityAclPolicy(rawFileUrl, {
    owner: String(req.userId!),
    visibility: "private",
    aclRules: [
      {
        group: {
          type: ObjectAccessGroupType.COMPANY_MEMBER,
          id: String(req.companyId!),
        },
        permission: ObjectPermission.READ,
      },
    ],
  });
}

const PG_UNIQUE_VIOLATION = "23505";

const CreatePermitBody = z.object({
  projectId: z.coerce.number().int().positive(),
  title: z.string().min(1).max(500),
  status: z.string().min(1).max(100).optional().default("active"),
  expirationDate: z.coerce.date().optional(),
  fileUrl: z.string().min(1).optional(),
});

const UpdatePermitBody = z.object({
  title: z.string().min(1).max(500).optional(),
  status: z.string().min(1).max(100).optional(),
  expirationDate: z.coerce.date().nullable().optional(),
  fileUrl: z.string().min(1).nullable().optional(),
});

// ── Routes ───────────────────────────────────────────────────────────────────

/**
 * GET /permits/global
 *
 * Company-wide permit view. Returns EVERY permit in the caller's company
 * across all projects. Restricted to Owner/Admin — foremen and workers get 403
 * from requirePermitAdmin before any data is touched.
 */
router.get(
  "/permits/global",
  requireAuth,
  requireCompany,
  requireTenantCtx,
  requireFeature("PERMITS"),
  requirePermitAdmin,
  asyncHandler(async (req, res) => {
    try {
      // Tenant isolation: every row must match the session's companyId.
      const permits = await db
        .select({
          id: permitsTable.id,
          companyId: permitsTable.companyId,
          projectId: permitsTable.projectId,
          projectName: projectsTable.name,
          title: permitsTable.title,
          status: permitsTable.status,
          expirationDate: permitsTable.expirationDate,
          fileUrl: permitsTable.fileUrl,
          createdAt: permitsTable.createdAt,
          updatedAt: permitsTable.updatedAt,
        })
        .from(permitsTable)
        .innerJoin(
          projectsTable,
          and(
            eq(projectsTable.id, permitsTable.projectId),
            // Join guard: the linked project must live in the same tenant.
            eq(projectsTable.companyId, req.companyId!),
          ),
        )
        .where(eq(permitsTable.companyId, req.companyId!))
        .orderBy(desc(permitsTable.createdAt));

      res.json(permits);
    } catch (err) {
      req.log.error(
        { err, companyId: req.companyId, userId: req.userId },
        "permits: global company-wide query failed",
      );
      throw err;
    }
  }),
);

/**
 * GET /permits/project/:projectId
 *
 * Project-scoped permit view (read-only). Owners/admins may read any project
 * in their company; foremen and workers must be assigned to the project —
 * verified through the PROJECT_MEMBER access group shared with objectAcl.ts.
 */
router.get(
  "/permits/project/:projectId",
  requireAuth,
  requireCompany,
  requireTenantCtx,
  requireFeature("PERMITS"),
  asyncHandler(async (req, res) => {
    const projectId = parseInt(req.params.projectId as string, 10);
    if (isNaN(projectId)) throw new BadRequestError("projectId must be a number");

    // Tenant isolation first: the project must belong to the session's company.
    const project = await verifyProjectInCompany(projectId, req.companyId!);
    if (!project) throw new NotFoundError("Project not found");

    // Owners/admins have a global company view; everyone else (foreman,
    // worker) must be assigned to this specific project.
    const isAdmin = req.userRole === "owner" || req.systemRole === "super_admin";
    if (!isAdmin) {
      const assigned = await isUserInAccessGroup(
        { type: ObjectAccessGroupType.PROJECT_MEMBER, id: String(projectId) },
        String(req.userId!),
      );
      if (!assigned) {
        req.log.warn(
          { userId: req.userId, companyId: req.companyId, projectId, role: req.userRole },
          "permits: blocked project view — user not assigned to project",
        );
        throw new ForbiddenError("You are not assigned to this project");
      }
    }

    try {
      const permits = await db
        .select()
        .from(permitsTable)
        .where(
          and(
            // Both predicates are required: companyId enforces the tenant
            // boundary even if a permit row were ever mislinked.
            eq(permitsTable.companyId, req.companyId!),
            eq(permitsTable.projectId, projectId),
          ),
        )
        .orderBy(desc(permitsTable.createdAt));

      res.json(permits);
    } catch (err) {
      req.log.error(
        { err, companyId: req.companyId, userId: req.userId, projectId },
        "permits: project-scoped query failed",
      );
      throw err;
    }
  }),
);

/**
 * POST /permits
 *
 * Create a permit (Owner/Admin only — foremen are view-only and get 403).
 * The unique (companyId, projectId, title) constraint keeps each permit a
 * single source of truth; duplicates surface as 409 Conflict.
 */
router.post(
  "/permits",
  requireAuth,
  requireCompany,
  requireTenantCtx,
  requireFeature("PERMITS"),
  requirePermitAdmin,
  asyncHandler(async (req, res) => {
    const parsed = CreatePermitBody.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError("Invalid permit data", parsed.error.issues);
    }
    const { projectId, title, status, expirationDate, fileUrl } = parsed.data;

    // The target project must belong to the caller's company — never accept a
    // foreign projectId, which would cross the tenant boundary.
    const project = await verifyProjectInCompany(projectId, req.companyId!);
    if (!project) throw new NotFoundError("Project not found");

    // Lock the uploaded file down to company members before persisting its path.
    let normalizedFileUrl: string | null = null;
    if (fileUrl) {
      try {
        normalizedFileUrl = await applyPermitFileAcl(req, fileUrl);
      } catch (err) {
        req.log.error(
          { err, companyId: req.companyId, userId: req.userId, fileUrl },
          "permits: failed to set ACL policy on permit file",
        );
        throw new BadRequestError("Permit file not found or inaccessible");
      }
    }

    try {
      const [permit] = await db
        .insert(permitsTable)
        .values({
          companyId: req.companyId!,
          projectId,
          title,
          status,
          expirationDate: expirationDate ?? null,
          fileUrl: normalizedFileUrl,
          createdByUserId: req.userId!,
        })
        .returning();

      logAuditEventFromRequest(
        req,
        "Permit Created",
        `Created permit "${title}" in project ${projectId}`,
      ).catch(() => {});

      res.status(201).json(permit);
    } catch (err: any) {
      if (err?.code === PG_UNIQUE_VIOLATION) {
        throw new ConflictError(
          "A permit with this title already exists for this project",
        );
      }
      req.log.error(
        { err, companyId: req.companyId, userId: req.userId, projectId },
        "permits: insert failed",
      );
      throw err;
    }
  }),
);

/**
 * PATCH /permits/:permitId
 *
 * Update a permit (Owner/Admin only). The WHERE clause pins both id and
 * companyId so a permit from another tenant can never be touched.
 */
router.patch(
  "/permits/:permitId",
  requireAuth,
  requireCompany,
  requireTenantCtx,
  requireFeature("PERMITS"),
  requirePermitAdmin,
  asyncHandler(async (req, res) => {
    const permitId = z.string().uuid().safeParse(req.params.permitId);
    if (!permitId.success) throw new BadRequestError("permitId must be a UUID");

    const parsed = UpdatePermitBody.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError("Invalid permit data", parsed.error.issues);
    }

    const updates: Record<string, unknown> = {};
    if (parsed.data.title !== undefined) updates.title = parsed.data.title;
    if (parsed.data.status !== undefined) updates.status = parsed.data.status;
    if (parsed.data.expirationDate !== undefined) {
      updates.expirationDate = parsed.data.expirationDate;
    }
    if (parsed.data.fileUrl !== undefined) {
      if (parsed.data.fileUrl === null) {
        updates.fileUrl = null;
      } else {
        try {
          updates.fileUrl = await applyPermitFileAcl(req, parsed.data.fileUrl);
        } catch (err) {
          req.log.error(
            { err, companyId: req.companyId, userId: req.userId, fileUrl: parsed.data.fileUrl },
            "permits: failed to set ACL policy on permit file",
          );
          throw new BadRequestError("Permit file not found or inaccessible");
        }
      }
    }
    if (Object.keys(updates).length === 0) {
      throw new BadRequestError("No fields to update");
    }

    try {
      const [permit] = await db
        .update(permitsTable)
        .set(updates)
        .where(
          and(
            eq(permitsTable.id, permitId.data),
            eq(permitsTable.companyId, req.companyId!),
          ),
        )
        .returning();

      if (!permit) throw new NotFoundError("Permit not found");

      logAuditEventFromRequest(
        req,
        "Permit Updated",
        `Updated permit "${permit.title}" (${permit.id})`,
      ).catch(() => {});

      res.json(permit);
    } catch (err: any) {
      if (err?.code === PG_UNIQUE_VIOLATION) {
        throw new ConflictError(
          "A permit with this title already exists for this project",
        );
      }
      throw err;
    }
  }),
);

/**
 * DELETE /permits/:permitId
 *
 * Delete a permit (Owner/Admin only), scoped to the caller's company.
 */
router.delete(
  "/permits/:permitId",
  requireAuth,
  requireCompany,
  requireTenantCtx,
  requireFeature("PERMITS"),
  requirePermitAdmin,
  asyncHandler(async (req, res) => {
    const permitId = z.string().uuid().safeParse(req.params.permitId);
    if (!permitId.success) throw new BadRequestError("permitId must be a UUID");

    try {
      const [deleted] = await db
        .delete(permitsTable)
        .where(
          and(
            eq(permitsTable.id, permitId.data),
            eq(permitsTable.companyId, req.companyId!),
          ),
        )
        .returning({ id: permitsTable.id, title: permitsTable.title });

      if (!deleted) throw new NotFoundError("Permit not found");

      logAuditEventFromRequest(
        req,
        "Permit Deleted",
        `Deleted permit "${deleted.title}" (${deleted.id})`,
      ).catch(() => {});

      res.status(204).send();
    } catch (err) {
      if (!(err instanceof NotFoundError)) {
        req.log.error(
          { err, companyId: req.companyId, userId: req.userId, permitId: permitId.data },
          "permits: delete failed",
        );
      }
      throw err;
    }
  }),
);

export default router;
