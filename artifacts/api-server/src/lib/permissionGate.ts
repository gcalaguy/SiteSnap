import type { MemberPermissions } from "@workspace/db";
import type { Request, Response, NextFunction } from "express";

const WORKER_DEFAULTS: Record<keyof MemberPermissions, boolean> = {
  viewQuotes:         false,
  viewTimesheets:     true,
  viewFinancials:     false,
  viewDocuments:      true,
  viewSchedules:      true,
  viewClientMessages: true,
  viewRiskTab:        true,
  viewSafetyTab:      true,
  viewInspectTab:     true,
  manageQuotes:       false,
  submitExpenses:     true,
  viewAllProjects:    false,
  viewDailyLog:       true,
  viewReports:        true,
  viewRFIs:           false,
  viewPhotos:         true,
  viewVault:          false,
  viewEstimator:      false,
  viewSiteScan:       false,
  viewTradeHub:       false,
  viewAskAI:          true,
};

/**
 * Resolve the effective boolean value for a permission flag.
 *
 * Priority:
 *   1. Explicit value in the stored permissions JSONB
 *   2. Owner/foreman default = true
 *   3. Worker default from WORKER_DEFAULTS
 */
export function resolvePermission(
  key: keyof MemberPermissions,
  role: "owner" | "foreman" | "worker",
  explicit: MemberPermissions | null | undefined,
): boolean {
  if (explicit?.[key] !== undefined) return explicit[key]!;
  if (role === "owner" || role === "foreman") return true;
  return WORKER_DEFAULTS[key];
}

/**
 * Middleware factory — blocks the request if the resolved permission is false.
 * super_admin and owner always bypass.
 *
 * Usage:
 *   router.get("/quotes", requireAuth, requireCompany,
 *              requirePermission("viewQuotes"), asyncHandler(listQuotes))
 */
export const requirePermission = (key: keyof MemberPermissions) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.systemRole === "super_admin") { next(); return; }
    if (req.userRole === "owner")          { next(); return; }

    const allowed = resolvePermission(
      key,
      req.userRole ?? "worker",
      req.userPermissions,
    );
    if (!allowed) {
      res.status(403).json({ error: "Permission denied", permission: key });
      return;
    }
    next();
  };
};
