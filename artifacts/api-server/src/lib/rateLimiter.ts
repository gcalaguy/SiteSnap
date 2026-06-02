import { Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import { aiRateLimitsTable } from "@workspace/db/schema";
import { and, eq, sql } from "drizzle-orm";

const DAILY_AI_LIMIT = 15;

export async function aiRateLimiter(req: Request, res: Response, next: NextFunction) {
  const companyId = req.companyId;
  if (!companyId) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const todayStr = new Date().toISOString().split("T")[0];
    const [record] = await db.insert(aiRateLimitsTable).values({ companyId, dateKey: todayStr, count: 1 }).onConflictDoUpdate({ target: [aiRateLimitsTable.companyId, aiRateLimitsTable.dateKey], set: { count: sql`${aiRateLimitsTable.count} + 1`, updatedAt: new Date() } }).returning();
    if (record.count > DAILY_AI_LIMIT) { res.status(429).json({ error: "Daily AI rate limit quota exceeded", limit: DAILY_AI_LIMIT, current: record.count }); return; }
    next();
  } catch (error) {
    console.error("AI Rate Limiter Error:", error);
    next();
  }
}
