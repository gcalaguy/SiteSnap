import { Router } from "express";
import { db, auditLogsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireAuth, requireAuditAccess } from "../lib/auth";
import { asyncHandler } from "../lib/asyncHandler";

const router = Router();
const guard = [requireAuth, requireAuditAccess];

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
