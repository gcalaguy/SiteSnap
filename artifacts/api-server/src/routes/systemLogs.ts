import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { getAuth } from "@clerk/express";
import { db, usersTable, systemLogsTable } from "@workspace/db";
import { eq, desc, gt, sql } from "drizzle-orm";
import { requireAuth, requireSuperAdmin } from "../lib/auth";
import { asyncHandler } from "../lib/asyncHandler";
import { logSystemEvent } from "../lib/systemLog";
import { logger } from "../lib/logger";

const router = Router();

// ── Ingestion (public-ish — must accept a crash on the sign-in page before
// any session exists, so it deliberately does NOT use requireAuth) ───────────

const reportRateLimiter = rateLimit({
  windowMs: 60_000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many error reports, please try again shortly." },
});

const ReportBody = z.object({
  logType: z.string().min(1).max(64),
  platform: z.enum(["Web", "iOS", "Android"]),
  message: z.string().min(1).max(2_000),
  stackTrace: z.string().max(20_000).optional(),
  metadata: z.record(z.unknown()).optional(),
});

/**
 * Best-effort identity resolution — mirrors requireAuth's clerkUserId -> DB
 * user lookup, but never rejects the request. Any missing/invalid session or
 * DB hiccup just yields { userId: null, tenantId: null } so a genuinely
 * unauthenticated crash report (e.g. from the sign-in page) still succeeds.
 */
async function tryResolveIdentity(req: import("express").Request): Promise<{ userId: number | null; tenantId: number | null }> {
  try {
    const clerkUserId = getAuth(req)?.userId;
    if (!clerkUserId) return { userId: null, tenantId: null };
    const [user] = await db
      .select({ id: usersTable.id, activeCompanyId: usersTable.activeCompanyId })
      .from(usersTable)
      .where(eq(usersTable.clerkUserId, clerkUserId))
      .limit(1);
    if (!user) return { userId: null, tenantId: null };
    return { userId: user.id, tenantId: user.activeCompanyId ?? null };
  } catch (err) {
    logger.warn({ err }, "system-logs/report: identity resolution failed, logging as anonymous");
    return { userId: null, tenantId: null };
  }
}

// POST /system-logs/report — client-side (web/mobile) crash ingestion.
// Never trust client-supplied userId/tenantId — identity is always resolved
// server-side from the caller's own session, exactly like every other route
// in this app never trusts a client-asserted identity for another user.
router.post("/system-logs/report", reportRateLimiter, asyncHandler(async (req, res) => {
  const parsed = ReportBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const { userId, tenantId } = await tryResolveIdentity(req);

  await logSystemEvent({
    logType: parsed.data.logType,
    platform: parsed.data.platform,
    userId,
    tenantId,
    message: parsed.data.message,
    stackTrace: parsed.data.stackTrace ?? null,
    metadata: parsed.data.metadata ?? null,
  });

  res.status(202).json({ ok: true });
}));

// ── Super Admin read/aggregation ──────────────────────────────────────────────

const guard = [requireAuth, requireSuperAdmin];

// GET /system-logs — recent raw log rows
router.get("/system-logs", ...guard, asyncHandler(async (req, res) => {
  const logs = await db
    .select()
    .from(systemLogsTable)
    .orderBy(desc(systemLogsTable.createdAt))
    .limit(500);
  res.json(logs);
}));

// GET /system-logs/summary — basic aggregation for a Super Admin dashboard
// widget: counts per (logType, platform) over the last 7 days, ordered by
// most-recently-seen first.
router.get("/system-logs/summary", ...guard, asyncHandler(async (req, res) => {
  const summary = await db
    .select({
      logType: systemLogsTable.logType,
      platform: systemLogsTable.platform,
      count: sql<number>`count(*)::int`,
      lastSeen: sql<Date>`max(${systemLogsTable.createdAt})`,
    })
    .from(systemLogsTable)
    .where(gt(systemLogsTable.createdAt, sql`now() - interval '7 days'`))
    .groupBy(systemLogsTable.logType, systemLogsTable.platform)
    .orderBy(desc(sql`max(${systemLogsTable.createdAt})`));

  res.json(summary);
}));

export default router;
