import { Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import { and, eq, gte } from "drizzle-orm";
import { airRateLimitsTable } from "@workspace/db/schema";

const DAILY_LIMIT = 50; 

export async function aiRateLimiter(req: Request, res: Response, next: NextFunction) {
  const trackingKey = req.companyId || (req as any).auth?.userId;
  
  if (!trackingKey) {
    return res.status(401).json({ error: "Unauthenticated traffic blocked by rate limiter." });
  }

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  try {
    const [record] = await db
      .select()
      .from(airRateLimitsTable)
      .where(
        and(
          eq(airRateLimitsTable.key, trackingKey),
          gte(airRateLimitsTable.expireAt, today)
        )
      )
      .limit(1);

    if (record) {
      if (record.points >= DAILY_LIMIT) {
        return res.status(429).json({
          error: "Daily AI usage limit reached.",
          message: "Your workspace has consumed its daily allocation of AI actions. Resets tomorrow."
        });
      }

      await db
        .update(airRateLimitsTable)
        .set({ 
          points: record.points + 1,
          expireAt: new Date()
        })
        .where(eq(airRateLimitsTable.id, record.id));

    } else {
      const tomorrow = new Date(today);
      tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);

      await db.insert(airRateLimitsTable).values({
        key: trackingKey,
        points: 1,
        expireAt: tomorrow
      });
    }

    return next();
  } catch (error) {
    console.error("AI Rate Limiter database operational failure:", error);
    return res.status(500).json({ error: "Internal validation layer failure." });
  }
}