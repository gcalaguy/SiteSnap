import { Router } from "express";
import { db, auditLogsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireAuth, requireAuditAccess, requireTenantCtx } from "../lib/auth";
import { asyncHandler } from "../lib/asyncHandler";
import type { Request, Response, NextFunction } from "express";

const router = Router();
// Super admins deliberately see logs across every company, so they must NOT be
// wrapped in a single-tenant transaction — only scope regular Enterprise owners.
const tenantCtxUnlessSuperAdmin = (req: Request, res: Response, next: NextFunction) =>
  req.systemRole === "super_admin" ? next() : requireTenantCtx(req, res, next);
const guard = [requireAuth, requireAuditAccess, tenantCtxUnlessSuperAdmin];

// GET /api/audit-logs — read-only audit log viewer
// Super admins see all logs; Enterprise tenant owners see only their own company's logs.
router.get("/audit-logs", ...guard, asyncHandler(async (req, res) => {
  const isSuperAdmin = req.systemRole === "super_admin";
  const companyId = req.companyId;

  const conditions = isSuperAdmin ? [] : [eq(auditLogsTable.companyId, companyId!)];

  const logs = await db
    .select()
    .from(auditLogsTable)
    .where(conditions.length ? eq(auditLogsTable.companyId, companyId!) : undefined)
    .orderBy(desc(auditLogsTable.createdAt))
    .limit(500);

  res.json(logs);
}))

export default router;
