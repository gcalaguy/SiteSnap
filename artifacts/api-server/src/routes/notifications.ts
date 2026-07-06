import { Router } from "express";
import type { Request } from "express";
import { db, notificationsTable, userMembershipsTable } from "@workspace/db";
import { eq, and, inArray, desc, count, type SQL } from "drizzle-orm";
import { requireAuth, requireCompany, requireTenantCtx } from "../lib/auth";
import { asyncHandler } from "../lib/asyncHandler";

const router = Router();

/**
 * Role-based visibility scope for the notifications feed. Enforced server-side
 * so the client never has to (and can't) widen its own view by role:
 *  - Owner / Super Admin: every notification addressed to any member of the
 *    active company — global, cross-project visibility.
 *  - Everyone else (Foreman, Project Manager, Worker): only notifications
 *    addressed directly to them.
 */
async function notificationVisibilityFilter(req: Request): Promise<SQL> {
  const userId = req.userId!;
  const companyId = req.companyId!;

  if (req.systemRole === "super_admin" || req.userRole === "owner") {
    const companyMembers = await db
      .select({ userId: userMembershipsTable.userId })
      .from(userMembershipsTable)
      .where(eq(userMembershipsTable.companyId, companyId));
    return inArray(notificationsTable.userId, companyMembers.map((m) => m.userId));
  }

  return eq(notificationsTable.userId, userId);
}

// GET /notifications
router.get("/notifications", requireAuth, requireCompany, requireTenantCtx, asyncHandler(async (req, res) => {
  const visibility = await notificationVisibilityFilter(req);

  const notifications = await db
    .select()
    .from(notificationsTable)
    .where(visibility)
    .orderBy(desc(notificationsTable.createdAt))
    .limit(50);

  res.json(notifications);
}));

// GET /notifications/unread-count
router.get("/notifications/unread-count", requireAuth, requireCompany, requireTenantCtx, asyncHandler(async (req, res) => {
  const visibility = await notificationVisibilityFilter(req);

  const [result] = await db
    .select({ count: count() })
    .from(notificationsTable)
    .where(and(visibility, eq(notificationsTable.isRead, false)));

  res.json({ count: result?.count ?? 0 });
}));

// PATCH /notifications/read-all — must be before /:id/read so Express matches correctly
router.patch("/notifications/read-all", requireAuth, asyncHandler(async (req, res) => {
  await db
    .update(notificationsTable)
    .set({ isRead: true })
    .where(eq(notificationsTable.userId, req.userId!));

  res.json({ ok: true });
}));

// PATCH /notifications/:id/read
router.patch("/notifications/:id/read", requireAuth, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  await db
    .update(notificationsTable)
    .set({ isRead: true })
    .where(and(eq(notificationsTable.id, id), eq(notificationsTable.userId, req.userId!)));

  res.json({ ok: true });
}));

export default router;
