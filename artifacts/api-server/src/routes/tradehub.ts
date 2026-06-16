import { Router } from "express";
import { createReadStream } from "fs";
import { eq, and, or, desc, sql, inArray, type SQL } from "drizzle-orm";
import {
  db,
  usersTable,
  companiesTable,
  tradehubProfilesTable,
  tradehubPostsTable,
  tradehubPostMediaTable,
  tradehubProfileMediaTable,
  tradehubCommentsTable,
  tradehubReactionsTable,
  tradehubJobApplicationsTable,
  tradehubReportsTable,
  tradehubNotificationsTable,
  tradehubConversationsTable,
  tradehubConversationParticipantsTable,
  tradehubMessagesTable,
  tradehubSavedCalculationsTable,
  jobPostingsTable,
  jobPostingApplicationsTable,
} from "@workspace/db";
import { requireAuth, requireCompany } from "../lib/auth";
import { asyncHandler } from "../lib/asyncHandler";
import { notify } from "../lib/notify";
import { diskUpload, cleanupUpload } from "../lib/upload.js";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage.js";
import { ObjectPermission } from "../lib/objectAcl.js";
import { z } from "zod";

const objectStorageService = new ObjectStorageService();

const router = Router();

const CreatePostBody = z.object({
  type: z.enum(["discussion", "job", "showcase", "safety_alert", "tool_review", "calculation"]).optional(),
  title: z.string().min(1).max(200),
  content: z.string().min(1).max(5000),
  trade: z.string().max(100).optional(),
  location: z.string().max(200).optional(),
  province: z.string().max(50).optional(),
  budget: z.string().max(50).optional(),
  jobType: z.string().max(50).optional(),
  visibility: z.enum(["public", "internal"]).optional(),
});

const CreateJobPostingBody = z.object({
  projectTitle: z.string().min(1).max(200),
  description: z.string().min(1).max(5000),
  scopeOfWork: z.string().max(5000).optional(),
  budgetEstimate: z.string().max(100).optional(),
  targetedStartDate: z.string().optional(),
  location: z.string().max(200).optional(),
  province: z.string().max(50).optional(),
  trade: z.string().max(100).optional(),
});

const CreateCommentBody = z.object({
  content: z.string().min(1).max(2000),
});

const UpdateProfileBody = z.object({
  displayName: z.string().min(1).max(200),
  trade: z.string().max(100).optional(),
  location: z.string().max(200).optional(),
  province: z.string().max(50).optional(),
  bio: z.string().max(2000).optional(),
  website: z.string().max(500).optional(),
  avatarUrl: z.string().max(500).optional(),
});

const CreateReportBody = z.object({
  targetType: z.enum(["post", "comment", "profile", "job"]),
  targetId: z.number().int().positive(),
  reason: z.string().min(1).max(1000),
});

// ── Rate limiting (simple in-memory, per process) ─────────────────────────────
const postCounts = new Map<string, { count: number; resetAt: number }>();
function checkPostRateLimit(userId: number): boolean {
  const key = String(userId);
  const now = Date.now();
  const entry = postCounts.get(key);
  if (!entry || entry.resetAt < now) {
    postCounts.set(key, { count: 1, resetAt: now + 24 * 60 * 60 * 1000 });
    return true;
  }
  if (entry.count >= 20) return false;
  entry.count++;
  return true;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
async function enrichPost(post: any, currentUserId?: number) {
  const [author] = await db
    .select({ id: usersTable.id, firstName: usersTable.firstName, lastName: usersTable.lastName, email: usersTable.email })
    .from(usersTable)
    .where(eq(usersTable.id, post.userId));

  const [profile] = await db
    .select()
    .from(tradehubProfilesTable)
    .where(eq(tradehubProfilesTable.userId, post.userId));

  const media = await db
    .select()
    .from(tradehubPostMediaTable)
    .where(eq(tradehubPostMediaTable.postId, post.id));

  const [{ count: commentCount }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(tradehubCommentsTable)
    .where(eq(tradehubCommentsTable.postId, post.id));

  const [{ count: reactionCount }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(tradehubReactionsTable)
    .where(eq(tradehubReactionsTable.postId, post.id));

  let hasReacted = false;
  if (currentUserId) {
    const [reaction] = await db
      .select()
      .from(tradehubReactionsTable)
      .where(and(eq(tradehubReactionsTable.postId, post.id), eq(tradehubReactionsTable.userId, currentUserId)))
      .limit(1);
    hasReacted = !!reaction;
  }

  let applicationCount = 0;
  if (post.type === "job") {
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(tradehubJobApplicationsTable)
      .where(eq(tradehubJobApplicationsTable.postId, post.id));
    applicationCount = count;
  }

  return {
    ...post,
    author: author ?? null,
    profile: profile ?? null,
    media,
    commentCount,
    reactionCount,
    applicationCount,
    hasReacted,
  };
}

// ── FEED ─────────────────────────────────────────────────────────────────────

// GET /tradehub/feed?type=&province=&trade=&page=
router.get("/tradehub/feed", requireAuth, asyncHandler(async (req, res) => {
  try {
    const { type, province, trade, page = "1" } = req.query as Record<string, string>;
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limit = 20;
    const offset = (pageNum - 1) * limit;

    const conditions: SQL[] = [];
    if (req.companyId) {
      conditions.push(
        or(
          eq(tradehubPostsTable.visibility, "public"),
          and(
            eq(tradehubPostsTable.visibility, "internal"),
            eq(tradehubPostsTable.companyId, req.companyId),
          ),
        )!,
      );
    } else {
      conditions.push(eq(tradehubPostsTable.visibility, "public"));
    }
    if (type) conditions.push(eq(tradehubPostsTable.type, type));
    if (province) conditions.push(eq(tradehubPostsTable.province, province));
    if (trade) conditions.push(eq(tradehubPostsTable.trade, trade));

    const posts = await db
      .select()
      .from(tradehubPostsTable)
      .where(and(...conditions))
      .orderBy(desc(tradehubPostsTable.createdAt))
      .limit(limit)
      .offset(offset);

    const enriched = await Promise.all(posts.map((p) => enrichPost(p, req.userId)));
    res.json({ posts: enriched, page: pageNum, hasMore: posts.length === limit });
  } catch (err: any) {
    req.log.error({ err }, "tradehub/feed error");
    res.status(500).json({ error: "Failed to load feed" });
  }
}));

// ── POSTS ─────────────────────────────────────────────────────────────────────

// GET /tradehub/posts?kind=&page=
router.get("/tradehub/posts", requireAuth, asyncHandler(async (req, res) => {
  try {
    const { kind, page = "1" } = req.query as Record<string, string>;
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limit = 30;
    const offset = (pageNum - 1) * limit;

    const conditions: SQL[] = [eq(tradehubPostsTable.visibility, "public")];
    if (kind && kind !== "all") conditions.push(eq(tradehubPostsTable.type, kind));

    const posts = await db
      .select()
      .from(tradehubPostsTable)
      .where(and(...conditions))
      .orderBy(desc(tradehubPostsTable.createdAt))
      .limit(limit)
      .offset(offset);

    const enriched = await Promise.all(posts.map((p) => enrichPost(p, req.userId)));
    res.json(enriched);
  } catch (err: any) {
    req.log.error({ err }, "tradehub/posts GET error");
    res.status(500).json({ error: "Failed to load posts" });
  }
}));

// POST /tradehub/posts
router.post("/tradehub/posts", requireAuth, asyncHandler(async (req, res) => {
  try {
    if (!checkPostRateLimit(req.userId!)) {
      res.status(429).json({ error: "Post limit reached (20/day). Try again tomorrow." });
      return;
    }

    const parsed = CreatePostBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Malformed request payload", details: parsed.error.flatten() });
      return;
    }
    const { type = "discussion", title, content, trade, location, province, budget, jobType, visibility = "public" } = parsed.data;

    const [post] = await db.insert(tradehubPostsTable).values({
      userId: req.userId!,
      companyId: req.companyId ?? null,
      type,
      title: title.trim(),
      content: content.trim(),
      trade: trade ?? null,
      location: location ?? null,
      province: province ?? null,
      budget: budget ?? null,
      jobType: jobType ?? null,
      visibility,
    }).returning();

    res.json(await enrichPost(post, req.userId));
  } catch (err: any) {
    req.log.error({ err }, "tradehub/posts POST error");
    res.status(500).json({ error: "Failed to create post" });
  }
}));

// GET /tradehub/posts/:id
router.get("/tradehub/posts/:id", requireAuth, asyncHandler(async (req, res) => {
  try {
    const id = parseInt(req.params.id as string);
    const [post] = await db.select().from(tradehubPostsTable).where(eq(tradehubPostsTable.id, id)).limit(1);
    if (!post) { res.status(404).json({ error: "Post not found" }); return; }

    const enriched = await enrichPost(post, req.userId);

    // Get comments with authors
    const rawComments = await db
      .select()
      .from(tradehubCommentsTable)
      .where(eq(tradehubCommentsTable.postId, id))
      .orderBy(tradehubCommentsTable.createdAt);

    const commentUserIds = [...new Set(rawComments.map((c) => c.userId))];
    const commentUsers = commentUserIds.length
      ? await db.select().from(usersTable).where(inArray(usersTable.id, commentUserIds))
      : [];
    const commentProfiles = commentUserIds.length
      ? await db.select().from(tradehubProfilesTable).where(inArray(tradehubProfilesTable.userId, commentUserIds))
      : [];
    const userMap = Object.fromEntries(commentUsers.map((u) => [u.id, u]));
    const profileMap = Object.fromEntries(commentProfiles.map((p) => [p.userId, p]));

    const comments = rawComments.map((c) => ({
      ...c,
      author: userMap[c.userId] ?? null,
      profile: profileMap[c.userId] ?? null,
    }));

    // Job applications summary (only for post owner)
    let applications: any[] = [];
    if (post.type === "job" && post.userId === req.userId) {
      applications = await db
        .select()
        .from(tradehubJobApplicationsTable)
        .where(eq(tradehubJobApplicationsTable.postId, id))
        .orderBy(desc(tradehubJobApplicationsTable.createdAt));
    }

    res.json({ ...enriched, comments, applications });
  } catch (err: any) {
    req.log.error({ err }, "tradehub/posts/:id GET error");
    res.status(500).json({ error: "Failed to load post" });
  }
}));

// DELETE /tradehub/posts/:id
router.delete("/tradehub/posts/:id", requireAuth, asyncHandler(async (req, res) => {
  try {
    const id = parseInt(req.params.id as string);
    const [post] = await db.select().from(tradehubPostsTable).where(eq(tradehubPostsTable.id, id)).limit(1);
    if (!post) { res.status(404).json({ error: "Post not found" }); return; }
    if (post.userId !== req.userId && req.systemRole !== "super_admin") {
      res.status(403).json({ error: "You can only delete your own posts" }); return;
    }
    if (req.companyId) {
      await db.delete(tradehubPostsTable).where(
        and(eq(tradehubPostsTable.id, id), eq(tradehubPostsTable.companyId, req.companyId))
      );
    } else {
      await db.delete(tradehubPostsTable).where(eq(tradehubPostsTable.id, id));
    }
    res.json({ success: true });
  } catch (err: any) {
    req.log.error({ err }, "tradehub/posts/:id DELETE error");
    res.status(500).json({ error: "Failed to delete post" });
  }
}));

// ── COMMENTS ─────────────────────────────────────────────────────────────────

// POST /tradehub/posts/:id/comments
router.post("/tradehub/posts/:id/comments", requireAuth, asyncHandler(async (req, res) => {
  try {
    const postId = parseInt(req.params.id as string);
    const parsed = CreateCommentBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "Malformed request payload", details: parsed.error.flatten() }); return; }
    const { content } = parsed.data;

    const [post] = await db.select().from(tradehubPostsTable).where(eq(tradehubPostsTable.id, postId)).limit(1);
    if (!post) { res.status(404).json({ error: "Post not found" }); return; }

    const [comment] = await db.insert(tradehubCommentsTable).values({
      postId,
      userId: req.userId!,
      content: content.trim(),
    }).returning();

    const [author] = await db.select().from(usersTable).where(eq(usersTable.id, req.userId!));
    const [profile] = await db.select().from(tradehubProfilesTable).where(eq(tradehubProfilesTable.userId, req.userId!));

    // Notify post author
    if (post.userId !== req.userId) {
      await db.insert(tradehubNotificationsTable).values({
        userId: post.userId,
        type: "comment",
        referenceId: postId,
        message: `${author?.firstName ?? "Someone"} commented on your post: "${post.title}"`,
      }).catch(() => {});
      notify({
        userId: post.userId,
        actorUserId: req.userId,
        type: "tradehub_post",
        title: "New comment on your TradeHub post",
        body: `${author?.firstName ?? "Someone"} commented on your post: "${post.title}"`,
        referenceId: postId,
      }).catch(() => {});
    }

    res.json({ ...comment, author: author ?? null, profile: profile ?? null });
  } catch (err: any) {
    req.log.error({ err }, "tradehub/posts/:id/comments error");
    res.status(500).json({ error: "Failed to add comment" });
  }
}));

// ── REACTIONS ────────────────────────────────────────────────────────────────

// POST /tradehub/posts/:id/react — toggle like
router.post("/tradehub/posts/:id/react", requireAuth, asyncHandler(async (req, res) => {
  try {
    const postId = parseInt(req.params.id as string);
    const [post] = await db.select().from(tradehubPostsTable).where(eq(tradehubPostsTable.id, postId)).limit(1);
    if (!post) { res.status(404).json({ error: "Post not found" }); return; }

    const [existing] = await db
      .select()
      .from(tradehubReactionsTable)
      .where(and(eq(tradehubReactionsTable.postId, postId), eq(tradehubReactionsTable.userId, req.userId!)))
      .limit(1);

    if (existing) {
      await db.delete(tradehubReactionsTable).where(eq(tradehubReactionsTable.id, existing.id));
      res.json({ reacted: false });
    } else {
      await db.insert(tradehubReactionsTable).values({ postId, userId: req.userId!, type: "like" });

      // Notify post author
      if (post.userId !== req.userId) {
        const [liker] = await db.select().from(usersTable).where(eq(usersTable.id, req.userId!));
        await db.insert(tradehubNotificationsTable).values({
          userId: post.userId,
          type: "reaction",
          referenceId: postId,
          message: `${liker?.firstName ?? "Someone"} liked your post: "${post.title}"`,
        }).catch(() => {});
      }

      res.json({ reacted: true });
    }
  } catch (err: any) {
    req.log.error({ err }, "tradehub/posts/:id/react error");
    res.status(500).json({ error: "Failed to toggle reaction" });
  }
}));

// ── JOBS ──────────────────────────────────────────────────────────────────────

// GET /tradehub/jobs?province=&trade=&page=
router.get("/tradehub/jobs", requireAuth, asyncHandler(async (req, res) => {
  try {
    const { province, trade, page = "1" } = req.query as Record<string, string>;
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limit = 20;
    const offset = (pageNum - 1) * limit;

    const conditions: SQL[] = [
      eq(tradehubPostsTable.visibility, "public"),
      eq(tradehubPostsTable.type, "job"),
    ];
    if (province) conditions.push(eq(tradehubPostsTable.province, province));
    if (trade) conditions.push(eq(tradehubPostsTable.trade, trade));

    const posts = await db
      .select()
      .from(tradehubPostsTable)
      .where(and(...conditions))
      .orderBy(desc(tradehubPostsTable.createdAt))
      .limit(limit)
      .offset(offset);

    const enriched = await Promise.all(posts.map((p) => enrichPost(p, req.userId)));
    res.json({ posts: enriched, page: pageNum, hasMore: posts.length === limit });
  } catch (err: any) {
    req.log.error({ err }, "tradehub/jobs error");
    res.status(500).json({ error: "Failed to load jobs" });
  }
}));

const ApplyToJobBody = z.object({
  message: z.string().max(2000).optional(),
});

// POST /tradehub/jobs/:id/apply
router.post("/tradehub/jobs/:id/apply", requireAuth, asyncHandler(async (req, res) => {
  try {
    const postId = parseInt(req.params.id as string);
    const parsed = ApplyToJobBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "Malformed request payload", details: parsed.error.flatten() }); return; }
    const { message } = parsed.data;

    const [post] = await db.select().from(tradehubPostsTable).where(eq(tradehubPostsTable.id, postId)).limit(1);
    if (!post) { res.status(404).json({ error: "Post not found" }); return; }
    if (post.type !== "job") { res.status(400).json({ error: "This is not a job post" }); return; }
    if (post.userId === req.userId) { res.status(400).json({ error: "Cannot apply to your own job" }); return; }

    const [existing] = await db
      .select()
      .from(tradehubJobApplicationsTable)
      .where(and(eq(tradehubJobApplicationsTable.postId, postId), eq(tradehubJobApplicationsTable.applicantId, req.userId!)))
      .limit(1);
    if (existing) { res.status(400).json({ error: "Already applied to this job" }); return; }

    const [application] = await db.insert(tradehubJobApplicationsTable).values({
      postId,
      applicantId: req.userId!,
      message: message?.trim() ?? null,
    }).returning();

    // Notify job poster
    const [applicant] = await db.select().from(usersTable).where(eq(usersTable.id, req.userId!));
    await db.insert(tradehubNotificationsTable).values({
      userId: post.userId,
      type: "application",
      referenceId: postId,
      message: `${applicant?.firstName ?? "Someone"} applied to your job: "${post.title}"`,
    }).catch(() => {});

    res.json(application);
  } catch (err: any) {
    req.log.error({ err }, "tradehub/jobs/:id/apply error");
    res.status(500).json({ error: "Failed to apply" });
  }
}));

const UpdateApplicationBody = z.object({
  status: z.enum(["reviewed", "accepted", "rejected"]),
});

// PATCH /tradehub/applications/:id — update application status
router.patch("/tradehub/applications/:id", requireAuth, asyncHandler(async (req, res) => {
  try {
    const id = parseInt(req.params.id as string);
    const parsed = UpdateApplicationBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "Malformed request payload", details: parsed.error.flatten() }); return; }
    const { status } = parsed.data;

    const [app] = await db.select().from(tradehubJobApplicationsTable).where(eq(tradehubJobApplicationsTable.id, id)).limit(1);
    if (!app) { res.status(404).json({ error: "Application not found" }); return; }

    const [post] = await db.select().from(tradehubPostsTable).where(eq(tradehubPostsTable.id, app.postId)).limit(1);
    if (post?.userId !== req.userId) { res.status(403).json({ error: "Not your job post" }); return; }

    const [updated] = await db
      .update(tradehubJobApplicationsTable)
      .set({ status })
      .where(and(eq(tradehubJobApplicationsTable.id, id), eq(tradehubJobApplicationsTable.postId, app.postId)))
      .returning();

    // Notify applicant
    await db.insert(tradehubNotificationsTable).values({
      userId: app.applicantId,
      type: "application_update",
      referenceId: app.postId,
      message: `Your application for "${post.title}" has been ${status}.`,
    }).catch(() => {});

    res.json(updated);
  } catch (err: any) {
    req.log.error({ err }, "tradehub/applications/:id error");
    res.status(500).json({ error: "Failed to update application" });
  }
}));

// ── JOB POSTINGS (Open Tenders) ──────────────────────────────────────────────

// GET /tradehub/job-postings
router.get("/tradehub/job-postings", requireAuth, asyncHandler(async (req, res) => {
  try {
    const { province, trade, search } = req.query as Record<string, string>;
    const conditions: SQL[] = [eq(jobPostingsTable.status, "open")];
    if (province) conditions.push(eq(jobPostingsTable.province, province));
    if (trade) conditions.push(eq(jobPostingsTable.trade, trade));

    const rows = await db
      .select()
      .from(jobPostingsTable)
      .where(and(...conditions))
      .orderBy(desc(jobPostingsTable.createdAt));

    if (rows.length === 0) { res.json([]); return; }

    // Batch all ancillary lookups — one query each instead of N per posting.
    const postingIds = rows.map((r) => r.id);
    const posterIds = [...new Set(rows.map((r) => r.createdBy).filter(Boolean))] as number[];
    const companyIds = [...new Set(rows.map((r) => r.companyId).filter(Boolean))] as number[];

    const [posters, companies, appCounts, myApps] = await Promise.all([
      posterIds.length
        ? db.select({ id: usersTable.id, firstName: usersTable.firstName, lastName: usersTable.lastName })
            .from(usersTable).where(inArray(usersTable.id, posterIds))
        : [],
      companyIds.length
        ? db.select({ id: companiesTable.id, name: companiesTable.name })
            .from(companiesTable).where(inArray(companiesTable.id, companyIds))
        : [],
      db.select({ jobPostingId: jobPostingApplicationsTable.jobPostingId, count: sql<number>`count(*)::int` })
        .from(jobPostingApplicationsTable)
        .where(inArray(jobPostingApplicationsTable.jobPostingId, postingIds))
        .groupBy(jobPostingApplicationsTable.jobPostingId),
      req.userId
        ? db.select({ jobPostingId: jobPostingApplicationsTable.jobPostingId })
            .from(jobPostingApplicationsTable)
            .where(and(
              inArray(jobPostingApplicationsTable.jobPostingId, postingIds),
              eq(jobPostingApplicationsTable.applicantId, req.userId),
            ))
        : [],
    ]);

    const posterMap = new Map(posters.map((u) => [u.id, `${u.firstName} ${u.lastName}`]));
    const companyMap = new Map(companies.map((c) => [c.id, c.name]));
    const appCountMap = new Map(appCounts.map((r) => [r.jobPostingId, r.count]));
    const appliedSet = new Set(myApps.map((r) => r.jobPostingId));

    const result = rows.map((jp) => ({
      ...jp,
      posterName: posterMap.get(jp.createdBy) ?? "Unknown",
      companyName: companyMap.get(jp.companyId) ?? "Unknown",
      applicationCount: appCountMap.get(jp.id) ?? 0,
      hasApplied: appliedSet.has(jp.id),
    }));

    if (search) {
      const q = search.toLowerCase();
      res.json(result.filter((r) => r.projectTitle.toLowerCase().includes(q) || r.description.toLowerCase().includes(q)));
      return;
    }
    res.json(result);
  } catch (err: any) {
    req.log.error({ err }, "tradehub/job-postings error");
    res.status(500).json({ error: "Failed to load job postings" });
  }
}));

// POST /tradehub/job-postings
router.post("/tradehub/job-postings", requireAuth, requireCompany, asyncHandler(async (req, res) => {
  try {
    const parsed = CreateJobPostingBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "Malformed request payload", details: parsed.error.flatten() }); return; }
    const { projectTitle, description, scopeOfWork, budgetEstimate, targetedStartDate, location, province, trade } = parsed.data;
    const [created] = await db.insert(jobPostingsTable).values({
      companyId: req.companyId!,
      createdBy: req.userId!,
      projectTitle: projectTitle.trim(),
      description: description.trim(),
      scopeOfWork: scopeOfWork?.trim() ?? null,
      budgetEstimate: budgetEstimate?.trim() ?? null,
      targetedStartDate: targetedStartDate ?? null,
      location: location?.trim() ?? null,
      province: province ?? null,
      trade: trade ?? null,
    }).returning();
    res.status(201).json(created);
  } catch (err: any) {
    req.log.error({ err }, "tradehub/job-postings POST error");
    res.status(500).json({ error: "Failed to create job posting" });
  }
}));

const JobApplyBody = z.object({
  message: z.string().max(2000).optional(),
});

// POST /tradehub/job-postings/:id/apply
router.post("/tradehub/job-postings/:id/apply", requireAuth, asyncHandler(async (req, res) => {
  try {
    const jobPostingId = parseInt(req.params.id as string);
    const parsed = JobApplyBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "Invalid request body", details: parsed.error.flatten() }); return; }
    const { message } = parsed.data;

    const [jp] = await db.select().from(jobPostingsTable).where(eq(jobPostingsTable.id, jobPostingId)).limit(1);
    if (!jp) { res.status(404).json({ error: "Job posting not found" }); return; }
    if (jp.status !== "open") { res.status(400).json({ error: "This tender is closed" }); return; }
    if (jp.createdBy === req.userId) { res.status(400).json({ error: "Cannot apply to your own posting" }); return; }

    // Compliance gate: check applicant's tradehub profile compliance status
    const [profile] = await db
      .select()
      .from(tradehubProfilesTable)
      .where(eq(tradehubProfilesTable.userId, req.userId!))
      .limit(1);
    if (profile && profile.complianceStatus === "non_compliant") {
      res.status(409).json({ code: "COMPLIANCE_ERROR", error: "You must update your liability insurance in settings to bid on projects." });
      return;
    }

    const [existing] = await db
      .select()
      .from(jobPostingApplicationsTable)
      .where(and(eq(jobPostingApplicationsTable.jobPostingId, jobPostingId), eq(jobPostingApplicationsTable.applicantId, req.userId!)))
      .limit(1);
    if (existing) { res.status(400).json({ error: "Already applied to this tender" }); return; }

    const [application] = await db.insert(jobPostingApplicationsTable).values({
      jobPostingId,
      applicantId: req.userId!,
      applicantProfileId: profile?.id ?? null,
      message: message?.trim() ?? null,
    }).returning();

    const [applicant] = await db.select().from(usersTable).where(eq(usersTable.id, req.userId!));
    const [applicantProfile] = await db.select().from(tradehubProfilesTable).where(eq(tradehubProfilesTable.userId, req.userId!));
    const appName = applicantProfile?.displayName ?? `${applicant?.firstName ?? "Someone"}`;
    await db.insert(tradehubNotificationsTable).values({
      userId: jp.createdBy,
      type: "application",
      referenceId: jobPostingId,
      message: `${appName} applied to your tender: "${jp.projectTitle}"`,
    }).catch(() => {});

    res.json(application);
  } catch (err: any) {
    req.log.error({ err }, "tradehub/job-postings/:id/apply error");
    res.status(500).json({ error: "Failed to apply" });
  }
}));

// ── TRADEHUB FILE UPLOADS ─────────────────────────────────────────────────────

const TRADEHUB_ALLOWED_MIME = new Set([
  "image/jpeg", "image/png", "image/gif", "image/webp", "image/heic", "image/heif",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
]);
const TRADEHUB_MAX_BYTES = 10 * 1024 * 1024; // 10 MB

// POST /tradehub/uploads/file — auth only (no company required)
// Used for profile photos and profile documents in the cross-company social feed.
router.post(
  "/tradehub/uploads/file",
  requireAuth,
  diskUpload.single("file"),
  asyncHandler(async (req, res) => {
    if (!req.file) { res.status(400).json({ error: "No file uploaded" }); return; }
    const mimeType = req.file.mimetype || "";
    if (!TRADEHUB_ALLOWED_MIME.has(mimeType)) {
      await cleanupUpload(req.file.path);
      res.status(400).json({ error: "File type not permitted", code: "INVALID_FILE_TYPE" });
      return;
    }
    if (req.file.size > TRADEHUB_MAX_BYTES) {
      await cleanupUpload(req.file.path);
      res.status(400).json({ error: "File exceeds 10 MB limit", code: "FILE_TOO_LARGE" });
      return;
    }
    try {
      const rawPath = await objectStorageService.uploadStream(createReadStream(req.file.path), mimeType);
      // Set visibility=public so any authenticated user can retrieve it via
      // GET /tradehub/objects/:path/signed-url (cross-company social network).
      await objectStorageService.trySetObjectEntityAclPolicy(rawPath, {
        owner: String(req.userId!),
        visibility: "public",
      });
      // Strip leading slash and "objects/" to store a stable prefix
      const suffix = rawPath.replace(/^\/objects\//, "");
      res.json({ objectPath: `tradehub-objects/${suffix}`, fileName: req.file.originalname });
    } catch (err: any) {
      req.log.error({ err }, "tradehub/uploads/file error");
      res.status(500).json({ error: "Upload failed" });
    } finally {
      await cleanupUpload(req.file?.path);
    }
  }),
);

// GET /tradehub/objects/:path/signed-url — auth only, no company required
// Resolves a tradehub-objects/ path to a short-lived GCS signed URL.
router.get("/tradehub/objects/*path/signed-url", requireAuth, asyncHandler(async (req, res) => {
  try {
    const raw = req.params.path as string | string[];
    const suffix = Array.isArray(raw) ? raw.join("/") : raw;
    const objectPath = `/objects/${suffix}`;
    const objectFile = await objectStorageService.getObjectEntityFile(objectPath);
    const canAccess = await objectStorageService.canAccessObjectEntity({
      userId: String(req.userId!),
      objectFile,
      requestedPermission: ObjectPermission.READ,
    });
    if (!canAccess) { res.status(404).json({ error: "Object not found" }); return; }
    const signedUrl = await objectStorageService.getObjectEntityReadURL(objectPath, 900);
    res.json({ url: signedUrl, objectPath: `tradehub-objects/${suffix}` });
  } catch (err: any) {
    if (err instanceof ObjectNotFoundError) { res.status(404).json({ error: "Object not found" }); return; }
    req.log.error({ err }, "tradehub/objects/signed-url error");
    res.status(500).json({ error: "Failed to generate signed URL" });
  }
}));

// ── POST MEDIA ────────────────────────────────────────────────────────────────

const PostMediaBody = z.object({
  url: z.string().url().max(2048),
  objectPath: z.string().max(1024).optional(),
  mediaType: z.enum(["image", "video", "document"]).default("image"),
});

// POST /tradehub/posts/:id/media — attach a media item to a post (owner only)
router.post("/tradehub/posts/:id/media", requireAuth, asyncHandler(async (req, res) => {
  try {
    const postId = parseInt(req.params.id as string);
    const [post] = await db.select().from(tradehubPostsTable).where(eq(tradehubPostsTable.id, postId)).limit(1);
    if (!post) { res.status(404).json({ error: "Post not found" }); return; }
    if (post.userId !== req.userId) { res.status(403).json({ error: "Forbidden" }); return; }

    const parsed = PostMediaBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "Invalid request body", details: parsed.error.flatten() }); return; }
    const { url, objectPath, mediaType } = parsed.data;

    const [media] = await db.insert(tradehubPostMediaTable).values({
      postId,
      url,
      objectPath: objectPath ?? null,
      mediaType,
    }).returning();
    res.json(media);
  } catch (err: any) {
    req.log.error({ err }, "tradehub/posts/:id/media POST error");
    res.status(500).json({ error: "Failed to attach media" });
  }
}));

// ── PROFILES ─────────────────────────────────────────────────────────────────

// GET /tradehub/profile/me
router.get("/tradehub/profile/me", requireAuth, asyncHandler(async (req, res) => {
  try {
    const [profile] = await db
      .select()
      .from(tradehubProfilesTable)
      .where(eq(tradehubProfilesTable.userId, req.userId!))
      .limit(1);
    res.json(profile ?? null);
  } catch (err: any) {
    req.log.error({ err }, "tradehub/profile/me error");
    res.status(500).json({ error: "Failed to load profile" });
  }
}));

// GET /tradehub/profile/:userId
router.get("/tradehub/profile/:userId", requireAuth, asyncHandler(async (req, res) => {
  try {
    const userId = parseInt(req.params.userId as string);
    const [profile] = await db
      .select()
      .from(tradehubProfilesTable)
      .where(eq(tradehubProfilesTable.userId, userId))
      .limit(1);

    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
    if (!user) { res.status(404).json({ error: "User not found" }); return; }

    const posts = await db
      .select()
      .from(tradehubPostsTable)
      .where(and(eq(tradehubPostsTable.userId, userId), eq(tradehubPostsTable.visibility, "public")))
      .orderBy(desc(tradehubPostsTable.createdAt))
      .limit(10);

    if (profile) {
      res.json({ ...profile, user, recentPosts: posts });
    } else {
      // Synthetic minimal profile for users who haven't set up their TradeHub profile yet
      res.json({
        id: null,
        userId,
        displayName: [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email,
        trade: null,
        location: null,
        province: null,
        bio: null,
        website: null,
        avatarUrl: null,
        isVerified: false,
        memberSince: user.createdAt ?? null,
        createdAt: user.createdAt ?? null,
        updatedAt: null,
        user,
        recentPosts: posts,
      });
    }
  } catch (err: any) {
    req.log.error({ err }, "tradehub/profile/:userId error");
    res.status(500).json({ error: "Failed to load profile" });
  }
}));

// PUT /tradehub/profile — upsert my profile
router.put("/tradehub/profile", requireAuth, asyncHandler(async (req, res) => {
  try {
    const parsed = UpdateProfileBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "Malformed request payload", details: parsed.error.flatten() }); return; }
    const { displayName, trade, location, province, bio, website, avatarUrl } = parsed.data;

    const [existing] = await db
      .select()
      .from(tradehubProfilesTable)
      .where(eq(tradehubProfilesTable.userId, req.userId!))
      .limit(1);

    if (existing) {
      const [updated] = await db
        .update(tradehubProfilesTable)
        .set({ displayName: displayName.trim(), trade: trade ?? null, location: location ?? null, province: province ?? null, bio: bio ?? null, website: website ?? null, avatarUrl: avatarUrl ?? null, updatedAt: new Date() })
        .where(eq(tradehubProfilesTable.userId, req.userId!))
        .returning();
      res.json(updated);
    } else {
      const [created] = await db.insert(tradehubProfilesTable).values({
        userId: req.userId!,
        companyId: req.companyId ?? null,
        displayName: displayName.trim(),
        trade: trade ?? null,
        location: location ?? null,
        province: province ?? null,
        bio: bio ?? null,
        website: website ?? null,
        avatarUrl: avatarUrl ?? null,
        complianceStatus: "compliant",
      }).returning();
      res.json(created);
    }
  } catch (err: any) {
    req.log.error({ err }, "tradehub/profile PUT error");
    res.status(500).json({ error: "Failed to save profile" });
  }
}));

// ── NOTIFICATIONS ─────────────────────────────────────────────────────────────

// GET /tradehub/notifications
router.get("/tradehub/notifications", requireAuth, asyncHandler(async (req, res) => {
  try {
    const notifications = await db
      .select()
      .from(tradehubNotificationsTable)
      .where(eq(tradehubNotificationsTable.userId, req.userId!))
      .orderBy(desc(tradehubNotificationsTable.createdAt))
      .limit(30);
    res.json(notifications);
  } catch (err: any) {
    req.log.error({ err }, "tradehub/notifications error");
    res.status(500).json({ error: "Failed to load notifications" });
  }
}));

// POST /tradehub/notifications/read-all
router.post("/tradehub/notifications/read-all", requireAuth, asyncHandler(async (req, res) => {
  try {
    await db
      .update(tradehubNotificationsTable)
      .set({ isRead: true })
      .where(eq(tradehubNotificationsTable.userId, req.userId!));
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to mark notifications read" });
  }
}));

// ── REPORTS ───────────────────────────────────────────────────────────────────

// POST /tradehub/reports
router.post("/tradehub/reports", requireAuth, asyncHandler(async (req, res) => {
  try {
    const parsed = CreateReportBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "Malformed request payload", details: parsed.error.flatten() }); return; }
    const { targetType, targetId, reason } = parsed.data;
    const [report] = await db.insert(tradehubReportsTable).values({
      reporterId: req.userId!,
      targetType,
      targetId,
      reason: reason.trim(),
    }).returning();
    res.json(report);
  } catch (err: any) {
    req.log.error({ err }, "tradehub/reports error");
    res.status(500).json({ error: "Failed to submit report" });
  }
}));

// ── MY POSTS ─────────────────────────────────────────────────────────────────

// GET /tradehub/my-posts
router.get("/tradehub/my-posts", requireAuth, asyncHandler(async (req, res) => {
  try {
    const posts = await db
      .select()
      .from(tradehubPostsTable)
      .where(eq(tradehubPostsTable.userId, req.userId!))
      .orderBy(desc(tradehubPostsTable.createdAt))
      .limit(50);
    const enriched = await Promise.all(posts.map((p) => enrichPost(p, req.userId)));
    res.json(enriched);
  } catch (err: any) {
    res.status(500).json({ error: "Failed to load posts" });
  }
}));

// GET /tradehub/my-applications
router.get("/tradehub/my-applications", requireAuth, asyncHandler(async (req, res) => {
  try {
    const apps = await db
      .select()
      .from(tradehubJobApplicationsTable)
      .where(eq(tradehubJobApplicationsTable.applicantId, req.userId!))
      .orderBy(desc(tradehubJobApplicationsTable.createdAt))
      .limit(50);

    const postIds = apps.map((a) => a.postId);
    const posts = postIds.length
      ? await db.select().from(tradehubPostsTable).where(inArray(tradehubPostsTable.id, postIds))
      : [];
    const postMap = Object.fromEntries(posts.map((p) => [p.id, p]));

    res.json(apps.map((a) => ({ ...a, post: postMap[a.postId] ?? null })));
  } catch (err: any) {
    res.status(500).json({ error: "Failed to load applications" });
  }
}));

// ── SAVED CALCULATIONS ────────────────────────────────────────────────────────

const SaveCalculationBody = z.object({
  calculatorId: z.string().min(1).max(100),
  calculatorName: z.string().min(1).max(200),
  category: z.string().min(1).max(100),
  inputs: z.record(z.unknown()).optional(),
  results: z.array(z.unknown()).optional(),
  summary: z.string().max(2000).optional(),
  aiSummary: z.string().max(2000).optional(),
});

// ── PROFILE MEDIA (photos + documents) ───────────────────────────────────────

// GET /tradehub/profile/me/media — list my profile media
router.get("/tradehub/profile/me/media", requireAuth, asyncHandler(async (req, res) => {
  try {
    const media = await db
      .select()
      .from(tradehubProfileMediaTable)
      .where(eq(tradehubProfileMediaTable.userId, req.userId!))
      .orderBy(desc(tradehubProfileMediaTable.createdAt));
    res.json(media);
  } catch (err: any) {
    req.log.error({ err }, "tradehub/profile/me/media GET error");
    res.status(500).json({ error: "Failed to load media" });
  }
}));

// GET /tradehub/profile/:userId/media — list another user's profile media
router.get("/tradehub/profile/:userId/media", requireAuth, asyncHandler(async (req, res) => {
  try {
    const userId = parseInt(req.params.userId as string);
    const media = await db
      .select()
      .from(tradehubProfileMediaTable)
      .where(eq(tradehubProfileMediaTable.userId, userId))
      .orderBy(desc(tradehubProfileMediaTable.createdAt));
    res.json(media);
  } catch (err: any) {
    req.log.error({ err }, "tradehub/profile/:userId/media GET error");
    res.status(500).json({ error: "Failed to load media" });
  }
}));

const ProfileMediaBody = z.object({
  url: z.string().url().max(2048),
  objectPath: z.string().max(1024).optional(),
  mediaType: z.enum(["image", "document"]).default("document"),
  fileName: z.string().max(255).optional(),
});

// POST /tradehub/profile/me/media — add a photo or document to my profile
router.post("/tradehub/profile/me/media", requireAuth, asyncHandler(async (req, res) => {
  try {
    const parsed = ProfileMediaBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "Invalid request body", details: parsed.error.flatten() }); return; }
    const { url, objectPath, mediaType, fileName } = parsed.data;

    const [media] = await db.insert(tradehubProfileMediaTable).values({
      userId: req.userId!,
      url,
      objectPath: objectPath ?? null,
      mediaType,
      fileName: fileName ?? null,
    }).returning();
    res.json(media);
  } catch (err: any) {
    req.log.error({ err }, "tradehub/profile/me/media POST error");
    res.status(500).json({ error: "Failed to add media" });
  }
}));

// DELETE /tradehub/profile/media/:id — remove a media item (owner only)
router.delete("/tradehub/profile/media/:id", requireAuth, asyncHandler(async (req, res) => {
  try {
    const id = parseInt(req.params.id as string);
    const [item] = await db
      .select()
      .from(tradehubProfileMediaTable)
      .where(and(eq(tradehubProfileMediaTable.id, id), eq(tradehubProfileMediaTable.userId, req.userId!)))
      .limit(1);
    if (!item) { res.status(404).json({ error: "Not found" }); return; }
    await db.delete(tradehubProfileMediaTable).where(and(eq(tradehubProfileMediaTable.id, id), eq(tradehubProfileMediaTable.userId, req.userId!)));
    res.json({ ok: true });
  } catch (err: any) {
    req.log.error({ err }, "tradehub/profile/media DELETE error");
    res.status(500).json({ error: "Failed to delete media" });
  }
}));

// POST /tradehub/profile/calculations — save a calculation to own profile
router.post("/tradehub/profile/calculations", requireAuth, asyncHandler(async (req, res) => {
  try {
    const parsed = SaveCalculationBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() }); return; }
    const { calculatorId, calculatorName, category, inputs, results, summary, aiSummary } = parsed.data;
    // Cap at 20 saved calculations per user — delete oldest if needed
    const existing = await db
      .select({ id: tradehubSavedCalculationsTable.id })
      .from(tradehubSavedCalculationsTable)
      .where(eq(tradehubSavedCalculationsTable.userId, req.userId!))
      .orderBy(desc(tradehubSavedCalculationsTable.createdAt));
    if (existing.length >= 20) {
      const toDelete = existing.slice(19).map((r) => r.id);
      for (const id of toDelete) {
        await db.delete(tradehubSavedCalculationsTable).where(eq(tradehubSavedCalculationsTable.id, id));
      }
    }
    const [saved] = await db.insert(tradehubSavedCalculationsTable).values({
      userId: req.userId!,
      calculatorId,
      calculatorName,
      category,
      inputs: inputs ?? {},
      results: results ?? [],
      summary: summary ?? "",
      aiSummary: aiSummary ?? null,
      isPinned: false,
    }).returning();
    res.json(saved);
  } catch (err: any) {
    req.log.error({ err }, "tradehub/profile/calculations POST error");
    res.status(500).json({ error: "Failed to save calculation" });
  }
}));

// GET /tradehub/profile/me/calculations — own saved calculations
router.get("/tradehub/profile/me/calculations", requireAuth, asyncHandler(async (req, res) => {
  try {
    const calcs = await db
      .select()
      .from(tradehubSavedCalculationsTable)
      .where(eq(tradehubSavedCalculationsTable.userId, req.userId!))
      .orderBy(desc(tradehubSavedCalculationsTable.isPinned), desc(tradehubSavedCalculationsTable.createdAt));
    res.json(calcs);
  } catch (err: any) {
    req.log.error({ err }, "tradehub/profile/me/calculations GET error");
    res.status(500).json({ error: "Failed to fetch calculations" });
  }
}));

// GET /tradehub/profile/:userId/calculations — public calculations for another user
router.get("/tradehub/profile/:userId/calculations", requireAuth, asyncHandler(async (req, res) => {
  try {
    const profileUserId = parseInt(req.params.userId as string);
    if (isNaN(profileUserId)) { res.status(400).json({ error: "Invalid userId" }); return; }
    const calcs = await db
      .select()
      .from(tradehubSavedCalculationsTable)
      .where(eq(tradehubSavedCalculationsTable.userId, profileUserId))
      .orderBy(desc(tradehubSavedCalculationsTable.isPinned), desc(tradehubSavedCalculationsTable.createdAt))
      .limit(10);
    res.json(calcs);
  } catch (err: any) {
    req.log.error({ err }, "tradehub/profile/:userId/calculations GET error");
    res.status(500).json({ error: "Failed to fetch calculations" });
  }
}));

// PATCH /tradehub/profile/calculations/:id/pin — toggle pin
router.patch("/tradehub/profile/calculations/:id/pin", requireAuth, asyncHandler(async (req, res) => {
  try {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
    const [calc] = await db.select().from(tradehubSavedCalculationsTable)
      .where(and(eq(tradehubSavedCalculationsTable.id, id), eq(tradehubSavedCalculationsTable.userId, req.userId!)));
    if (!calc) { res.status(404).json({ error: "Not found" }); return; }
    const [updated] = await db.update(tradehubSavedCalculationsTable)
      .set({ isPinned: !calc.isPinned })
      .where(and(eq(tradehubSavedCalculationsTable.id, id), eq(tradehubSavedCalculationsTable.userId, req.userId!)))
      .returning();
    res.json(updated);
  } catch (err: any) {
    req.log.error({ err }, "tradehub/profile/calculations PATCH pin error");
    res.status(500).json({ error: "Failed to toggle pin" });
  }
}));

// DELETE /tradehub/profile/calculations/:id
router.delete("/tradehub/profile/calculations/:id", requireAuth, asyncHandler(async (req, res) => {
  try {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
    await db.delete(tradehubSavedCalculationsTable)
      .where(and(eq(tradehubSavedCalculationsTable.id, id), eq(tradehubSavedCalculationsTable.userId, req.userId!)));
    res.json({ success: true });
  } catch (err: any) {
    req.log.error({ err }, "tradehub/profile/calculations DELETE error");
    res.status(500).json({ error: "Failed to delete calculation" });
  }
}));

// ── VOICE INTRO ──────────────────────────────────────────────────────────────

const VoiceIntroBody = z.object({
  objectPath: z.string().min(1).max(500),
  duration: z.number().int().positive().optional(),
});

// PUT /tradehub/profile/voice — save voice intro objectPath to profile
router.put("/tradehub/profile/voice", requireAuth, asyncHandler(async (req, res) => {
  try {
    const parsedVoice = VoiceIntroBody.safeParse(req.body);
    if (!parsedVoice.success) { res.status(400).json({ error: "Invalid body", details: parsedVoice.error.flatten() }); return; }
    const { objectPath, duration } = parsedVoice.data;

    // Build a serve URL from the objectPath (e.g. /objects/uploads/uuid)
    const voiceIntroUrl = objectPath.startsWith("/objects/")
      ? `/api/storage${objectPath}`
      : objectPath;

    const [existing] = await db
      .select()
      .from(tradehubProfilesTable)
      .where(eq(tradehubProfilesTable.userId, req.userId!))
      .limit(1);

    if (existing) {
      const [updated] = await db
        .update(tradehubProfilesTable)
        .set({ voiceIntroUrl, voiceIntroObjectPath: objectPath, voiceIntroDuration: duration ?? null, updatedAt: new Date() })
        .where(eq(tradehubProfilesTable.userId, req.userId!))
        .returning();
      res.json(updated);
    } else {
      // Create a minimal profile if none exists yet
      const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.userId!));
      const [created] = await db.insert(tradehubProfilesTable).values({
        userId: req.userId!,
        companyId: req.companyId ?? null,
        displayName: `${user?.firstName ?? ""} ${user?.lastName ?? ""}`.trim() || "TradeHub User",
        voiceIntroUrl,
        voiceIntroObjectPath: objectPath,
        voiceIntroDuration: duration ?? null,
      }).returning();
      res.json(created);
    }
  } catch (err: any) {
    req.log.error({ err }, "tradehub/profile/voice PUT error");
    res.status(500).json({ error: "Failed to save voice intro" });
  }
}));

// DELETE /tradehub/profile/voice
router.delete("/tradehub/profile/voice", requireAuth, asyncHandler(async (req, res) => {
  try {
    await db
      .update(tradehubProfilesTable)
      .set({ voiceIntroUrl: null, voiceIntroObjectPath: null, voiceIntroDuration: null, updatedAt: new Date() })
      .where(eq(tradehubProfilesTable.userId, req.userId!));
    res.json({ success: true });
  } catch (err: any) {
    req.log.error({ err }, "tradehub/profile/voice DELETE error");
    res.status(500).json({ error: "Failed to remove voice intro" });
  }
}));

// ── MESSAGING ─────────────────────────────────────────────────────────────────

// GET /tradehub/users/search?q=
router.get("/tradehub/users/search", requireAuth, asyncHandler(async (req, res) => {
  try {
    const q = (req.query.q as string ?? "").trim();
    if (q.length < 2) { res.json([]); return; }

    const profiles = await db
      .select()
      .from(tradehubProfilesTable)
      .where(
        sql`(lower(${tradehubProfilesTable.displayName}) LIKE ${`%${q.toLowerCase()}%`} OR lower(${tradehubProfilesTable.trade}) LIKE ${`%${q.toLowerCase()}%`})`
      )
      .limit(15);

    // Exclude self
    const filtered = profiles.filter((p) => p.userId !== req.userId);
    res.json(filtered);
  } catch (err: any) {
    req.log.error({ err }, "tradehub/users/search error");
    res.status(500).json({ error: "Search failed" });
  }
}));

const CreateConversationBody = z.object({
  recipientId: z.number().int().positive(),
  message: z.string().min(1).max(2000),
});

// POST /tradehub/conversations — start or find existing conversation
router.post("/tradehub/conversations", requireAuth, asyncHandler(async (req, res) => {
  try {
    const parsedConv = CreateConversationBody.safeParse(req.body);
    if (!parsedConv.success) { res.status(400).json({ error: "Invalid body", details: parsedConv.error.flatten() }); return; }
    const { recipientId, message } = parsedConv.data;
    if (recipientId === req.userId) {
      res.status(400).json({ error: "Cannot message yourself" }); return;
    }

    // Check if a conversation already exists between these two users
    const existing = await db.execute(
      sql`SELECT cp1.conversation_id FROM tradehub_conversation_participants cp1
          JOIN tradehub_conversation_participants cp2 ON cp1.conversation_id = cp2.conversation_id
          WHERE cp1.user_id = ${req.userId} AND cp2.user_id = ${recipientId}
          LIMIT 1`
    );

    let conversationId: number;
    if (existing.rows.length > 0) {
      conversationId = (existing.rows[0] as any).conversation_id;
    } else {
      const [conv] = await db.insert(tradehubConversationsTable).values({}).returning();
      conversationId = conv.id;
      await db.insert(tradehubConversationParticipantsTable).values([
        { conversationId, userId: req.userId! },
        { conversationId, userId: recipientId },
      ]);
    }

    // Send the first message
    await db.insert(tradehubMessagesTable).values({
      conversationId,
      senderId: req.userId!,
      content: message.trim(),
    });

    // Update conversation timestamp
    await db.update(tradehubConversationsTable)
      .set({ updatedAt: new Date() })
      .where(eq(tradehubConversationsTable.id, conversationId));

    // Notify recipient
    const [sender] = await db.select().from(usersTable).where(eq(usersTable.id, req.userId!));
    const [senderProfile] = await db.select().from(tradehubProfilesTable).where(eq(tradehubProfilesTable.userId, req.userId!));
    const senderName = senderProfile?.displayName ?? `${sender?.firstName ?? ""} ${sender?.lastName ?? ""}`.trim();
    await db.insert(tradehubNotificationsTable).values({
      userId: recipientId,
      type: "message",
      referenceId: conversationId,
      message: `${senderName} sent you a message on TradeHub`,
    }).catch(() => {});
    notify({
      userId: recipientId,
      actorUserId: req.userId,
      type: "tradehub_message",
      title: "New TradeHub message",
      body: `${senderName} sent you a message on TradeHub`,
      referenceId: conversationId,
    }).catch(() => {});

    res.json({ conversationId });
  } catch (err: any) {
    req.log.error({ err }, "tradehub/conversations POST error");
    res.status(500).json({ error: "Failed to create conversation" });
  }
}));

// GET /tradehub/conversations — list my conversations
router.get("/tradehub/conversations", requireAuth, asyncHandler(async (req, res) => {
  try {
    const myConvIds = await db
      .select({ conversationId: tradehubConversationParticipantsTable.conversationId })
      .from(tradehubConversationParticipantsTable)
      .where(eq(tradehubConversationParticipantsTable.userId, req.userId!));

    if (myConvIds.length === 0) { res.json([]); return; }

    const ids = myConvIds.map((r) => r.conversationId);
    const conversations = await db
      .select()
      .from(tradehubConversationsTable)
      .where(inArray(tradehubConversationsTable.id, ids))
      .orderBy(desc(tradehubConversationsTable.updatedAt));

    const result = await Promise.all(
      conversations.map(async (conv) => {
        // Get other participant
        const [otherPart] = await db
          .select()
          .from(tradehubConversationParticipantsTable)
          .where(
            and(
              eq(tradehubConversationParticipantsTable.conversationId, conv.id),
              sql`${tradehubConversationParticipantsTable.userId} != ${req.userId}`
            )
          )
          .limit(1);

        let otherParticipant = null;
        if (otherPart) {
          const [profile] = await db
            .select()
            .from(tradehubProfilesTable)
            .where(eq(tradehubProfilesTable.userId, otherPart.userId))
            .limit(1);
          otherParticipant = profile ?? { userId: otherPart.userId, displayName: "Unknown" };
        }

        // Last message
        const [lastMessage] = await db
          .select()
          .from(tradehubMessagesTable)
          .where(eq(tradehubMessagesTable.conversationId, conv.id))
          .orderBy(desc(tradehubMessagesTable.createdAt))
          .limit(1);

        // Unread count
        const myPart = await db
          .select()
          .from(tradehubConversationParticipantsTable)
          .where(
            and(
              eq(tradehubConversationParticipantsTable.conversationId, conv.id),
              eq(tradehubConversationParticipantsTable.userId, req.userId!)
            )
          )
          .limit(1);

        const lastReadAt = myPart[0]?.lastReadAt;
        const [{ count: unreadCount }] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(tradehubMessagesTable)
          .where(
            and(
              eq(tradehubMessagesTable.conversationId, conv.id),
              sql`${tradehubMessagesTable.senderId} != ${req.userId}`,
              lastReadAt
                ? sql`${tradehubMessagesTable.createdAt} > ${lastReadAt}`
                : sql`1=1`
            )
          );

        return { ...conv, otherParticipant, lastMessage: lastMessage ?? null, unreadCount };
      })
    );

    res.json(result);
  } catch (err: any) {
    req.log.error({ err }, "tradehub/conversations GET error");
    res.status(500).json({ error: "Failed to load conversations" });
  }
}));

// GET /tradehub/conversations/:id/messages
router.get("/tradehub/conversations/:id/messages", requireAuth, asyncHandler(async (req, res) => {
  try {
    const convId = parseInt(req.params.id as string);

    // Verify participant
    const [part] = await db
      .select()
      .from(tradehubConversationParticipantsTable)
      .where(
        and(
          eq(tradehubConversationParticipantsTable.conversationId, convId),
          eq(tradehubConversationParticipantsTable.userId, req.userId!)
        )
      )
      .limit(1);
    if (!part) { res.status(403).json({ error: "Not a participant" }); return; }

    const messages = await db
      .select()
      .from(tradehubMessagesTable)
      .where(eq(tradehubMessagesTable.conversationId, convId))
      .orderBy(tradehubMessagesTable.createdAt)
      .limit(100);

    res.json(messages);
  } catch (err: any) {
    req.log.error({ err }, "tradehub/conversations/:id/messages GET error");
    res.status(500).json({ error: "Failed to load messages" });
  }
}));

const ConversationMessageBody = z.object({
  content: z.string().min(1).max(10000).transform((s) => s.trim()),
});

// POST /tradehub/conversations/:id/messages — send a message
router.post("/tradehub/conversations/:id/messages", requireAuth, asyncHandler(async (req, res) => {
  try {
    const convId = parseInt(req.params.id as string);
    const parsed = ConversationMessageBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "content required and must be non-empty", details: parsed.error.flatten() }); return; }
    const { content } = parsed.data;

    // Verify participant
    const participants = await db
      .select()
      .from(tradehubConversationParticipantsTable)
      .where(eq(tradehubConversationParticipantsTable.conversationId, convId));

    const isMember = participants.some((p) => p.userId === req.userId);
    if (!isMember) { res.status(403).json({ error: "Not a participant" }); return; }

    const [msg] = await db.insert(tradehubMessagesTable).values({
      conversationId: convId,
      senderId: req.userId!,
      content: content.trim(),
    }).returning();

    // Update conversation timestamp
    await db.update(tradehubConversationsTable)
      .set({ updatedAt: new Date() })
      .where(eq(tradehubConversationsTable.id, convId));

    // Notify the other participant
    const other = participants.find((p) => p.userId !== req.userId);
    if (other) {
      const [senderProfile] = await db.select().from(tradehubProfilesTable).where(eq(tradehubProfilesTable.userId, req.userId!));
      const [senderUser] = await db.select().from(usersTable).where(eq(usersTable.id, req.userId!));
      const name = senderProfile?.displayName ?? `${senderUser?.firstName ?? ""}`.trim();
      const preview = `${content.trim().slice(0, 60)}${content.trim().length > 60 ? "…" : ""}`;
      await db.insert(tradehubNotificationsTable).values({
        userId: other.userId,
        type: "message",
        referenceId: convId,
        message: `${name}: ${preview}`,
      }).catch(() => {});
      notify({
        userId: other.userId,
        actorUserId: req.userId,
        type: "tradehub_message",
        title: "New TradeHub message",
        body: `${name}: ${preview}`,
        referenceId: convId,
      }).catch(() => {});
    }

    res.json(msg);
  } catch (err: any) {
    req.log.error({ err }, "tradehub/conversations/:id/messages POST error");
    res.status(500).json({ error: "Failed to send message" });
  }
}));

// POST /tradehub/conversations/:id/read — mark as read
router.post("/tradehub/conversations/:id/read", requireAuth, asyncHandler(async (req, res) => {
  try {
    const convId = parseInt(req.params.id as string);
    await db
      .update(tradehubConversationParticipantsTable)
      .set({ lastReadAt: new Date() })
      .where(
        and(
          eq(tradehubConversationParticipantsTable.conversationId, convId),
          eq(tradehubConversationParticipantsTable.userId, req.userId!)
        )
      );
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: "Failed to mark read" });
  }
}));

export default router;
