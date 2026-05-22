import { Router } from "express";
import { eq, and, desc, sql, count, avg } from "drizzle-orm";
import {
  db,
  usersTable,
  tradeReviewsTable,
} from "@workspace/db";
import { requireAuth } from "../lib/auth";
import { z } from "zod/v4";

const router = Router();

const TARGET_TYPES = ["company", "user_owner", "user_foreman", "user_worker"] as const;

const submitBodySchema = z.object({
  targetType: z.enum(TARGET_TYPES),
  targetCompanyId: z.number().int().optional(),
  targetUserId: z.number().int().optional(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(2000).optional(),
});

const listQuerySchema = z.object({
  targetType: z.enum(TARGET_TYPES),
  targetCompanyId: z.coerce.number().int().optional(),
  targetUserId: z.coerce.number().int().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

const summaryQuerySchema = z.object({
  targetType: z.enum(TARGET_TYPES),
  targetCompanyId: z.coerce.number().int().optional(),
  targetUserId: z.coerce.number().int().optional(),
});

// POST /reviews/submit
router.post("/reviews/submit", requireAuth, async (req, res) => {
  try {
    const parsed = submitBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid review data", details: parsed.error.flatten() });
      return;
    }

    const { targetType, targetCompanyId, targetUserId, rating, comment } = parsed.data;

    // Validate target presence based on type
    if (targetType === "company" && !targetCompanyId) {
      res.status(400).json({ error: "targetCompanyId required for company reviews" });
      return;
    }
    if (targetType !== "company" && !targetUserId) {
      res.status(400).json({ error: "targetUserId required for user reviews" });
      return;
    }

    // Prevent self-reviews
    if (targetUserId && targetUserId === req.userId) {
      res.status(400).json({ error: "You cannot review yourself" });
      return;
    }

    // Check for duplicate review (one per reviewer per target)
    const existingConditions = [
      eq(tradeReviewsTable.reviewerId, req.userId!),
      eq(tradeReviewsTable.targetType, targetType),
    ];
    if (targetCompanyId) {
      existingConditions.push(eq(tradeReviewsTable.targetCompanyId, targetCompanyId));
    }
    if (targetUserId) {
      existingConditions.push(eq(tradeReviewsTable.targetUserId, targetUserId));
    }
    const [existing] = await db
      .select()
      .from(tradeReviewsTable)
      .where(and(...existingConditions))
      .limit(1);

    if (existing) {
      res.status(409).json({ error: "You have already reviewed this target" });
      return;
    }

    const [review] = await db
      .insert(tradeReviewsTable)
      .values({
        reviewerId: req.userId!,
        targetType,
        targetCompanyId: targetCompanyId ?? null,
        targetUserId: targetUserId ?? null,
        rating,
        comment: comment ?? null,
      })
      .returning();

    res.status(201).json(review);
  } catch (err: any) {
    req.log.error({ err }, "reviews/submit error");
    res.status(500).json({ error: "Failed to submit review" });
  }
});

// GET /reviews/summary
router.get("/reviews/summary", async (req, res) => {
  try {
    const parsed = summaryQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid query", details: parsed.error.flatten() });
      return;
    }

    const { targetType, targetCompanyId, targetUserId } = parsed.data;
    const conditions = [eq(tradeReviewsTable.targetType, targetType)];
    if (targetCompanyId) conditions.push(eq(tradeReviewsTable.targetCompanyId, targetCompanyId));
    if (targetUserId) conditions.push(eq(tradeReviewsTable.targetUserId, targetUserId));

    const result = await db
      .select({
        total: count(tradeReviewsTable.id),
        average: avg(tradeReviewsTable.rating),
      })
      .from(tradeReviewsTable)
      .where(and(...conditions));

    // Star distribution
    const distribution = await db
      .select({
        rating: tradeReviewsTable.rating,
        count: count(tradeReviewsTable.id),
      })
      .from(tradeReviewsTable)
      .where(and(...conditions))
      .groupBy(tradeReviewsTable.rating)
      .orderBy(desc(tradeReviewsTable.rating));

    const distMap = new Map<number, number>();
    for (const d of distribution) {
      distMap.set(d.rating, Number(d.count));
    }

    const total = Number(result[0]?.total ?? 0);
    const average = result[0]?.average ? parseFloat(result[0].average) : 0;

    res.json({
      average: total > 0 ? Math.round(average * 10) / 10 : 0,
      total,
      distribution: {
        5: distMap.get(5) ?? 0,
        4: distMap.get(4) ?? 0,
        3: distMap.get(3) ?? 0,
        2: distMap.get(2) ?? 0,
        1: distMap.get(1) ?? 0,
      },
    });
  } catch (err: any) {
    req.log.error({ err }, "reviews/summary error");
    res.status(500).json({ error: "Failed to load summary" });
  }
});

// GET /reviews/list
router.get("/reviews/list", async (req, res) => {
  try {
    const parsed = listQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid query", details: parsed.error.flatten() });
      return;
    }

    const { targetType, targetCompanyId, targetUserId, page, limit } = parsed.data;
    const conditions = [eq(tradeReviewsTable.targetType, targetType)];
    if (targetCompanyId) conditions.push(eq(tradeReviewsTable.targetCompanyId, targetCompanyId));
    if (targetUserId) conditions.push(eq(tradeReviewsTable.targetUserId, targetUserId));

    const reviews = await db
      .select()
      .from(tradeReviewsTable)
      .where(and(...conditions))
      .orderBy(desc(tradeReviewsTable.createdAt))
      .limit(limit)
      .offset((page - 1) * limit);

    // Enrich with reviewer names
    const reviewerIds = [...new Set(reviews.map((r) => r.reviewerId))];
    let users: Array<{ id: number; firstName: string | null; lastName: string | null }> = [];
    if (reviewerIds.length) {
      for (const id of reviewerIds) {
        const [u] = await db.select().from(usersTable).where(eq(usersTable.id, id));
        if (u) users.push(u);
      }
    }
    const userMap = new Map(users.map((u) => [u.id, u]));

    const enriched = reviews.map((r) => {
      const user = userMap.get(r.reviewerId);
      return {
        ...r,
        reviewerName: user ? `${user.firstName} ${user.lastName}`.trim() : "Anonymous",
      };
    });

    res.json({
      reviews: enriched,
      page,
      limit,
      hasMore: reviews.length === limit,
    });
  } catch (err: any) {
    req.log.error({ err }, "reviews/list error");
    res.status(500).json({ error: "Failed to load reviews" });
  }
});

export default router;
