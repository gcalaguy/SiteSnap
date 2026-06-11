import { Router } from "express";
import { db, notificationsTable } from "@workspace/db";
import { eq, and, desc, count } from "drizzle-orm";
import { requireAuth } from "../lib/auth";
import { asyncHandler } from "../lib/asyncHandler";

const router = Router();

// GET /notifications
router.get("/notifications", requireAuth, asyncHandler(async (req, res) => {
  const notifications = await db
    .select()
    .from(notificationsTable)
    .where(eq(notificationsTable.userId, req.userId!))
    .orderBy(desc(notificationsTable.createdAt))
    .limit(50);

  res.json(notifications);
}));

// GET /notifications/unread-count
router.get("/notifications/unread-count", requireAuth, asyncHandler(async (req, res) => {
  const [result] = await db
    .select({ count: count() })
    .from(notificationsTable)
    .where(
      and(
        eq(notificationsTable.userId, req.userId!),
        eq(notificationsTable.isRead, false),
      ),
    );

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
