import { Router } from "express";
import { eq, and, desc, sql, inArray, ne } from "drizzle-orm";
import {
  db,
  usersTable,
  companiesTable,
  tradehubProfilesTable,
  tradehubPostsTable,
  tradehubPostMediaTable,
  tradehubCommentsTable,
  tradehubReactionsTable,
  tradehubJobApplicationsTable,
  tradehubReportsTable,
  tradehubNotificationsTable,
} from "@workspace/db";
import { requireAuth, requireCompany } from "../lib/auth";
import { logger } from "../lib/logger";

const router = Router();

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
router.get("/tradehub/feed", requireAuth, async (req, res) => {
  try {
    const { type, province, trade, page = "1" } = req.query as Record<string, string>;
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limit = 20;
    const offset = (pageNum - 1) * limit;

    const conditions: any[] = [eq(tradehubPostsTable.visibility, "public")];
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
});

// ── POSTS ─────────────────────────────────────────────────────────────────────

// POST /tradehub/posts
router.post("/tradehub/posts", requireAuth, async (req, res) => {
  try {
    if (!checkPostRateLimit(req.userId!)) {
      res.status(429).json({ error: "Post limit reached (20/day). Try again tomorrow." });
      return;
    }

    const { type = "discussion", title, content, trade, location, province, budget, jobType, visibility = "public" } = req.body as {
      type?: string; title: string; content: string; trade?: string;
      location?: string; province?: string; budget?: string; jobType?: string; visibility?: string;
    };

    if (!title?.trim() || !content?.trim()) {
      res.status(400).json({ error: "title and content are required" }); return;
    }

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
});

// GET /tradehub/posts/:id
router.get("/tradehub/posts/:id", requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
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
});

// DELETE /tradehub/posts/:id
router.delete("/tradehub/posts/:id", requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [post] = await db.select().from(tradehubPostsTable).where(eq(tradehubPostsTable.id, id)).limit(1);
    if (!post) { res.status(404).json({ error: "Post not found" }); return; }
    if (post.userId !== req.userId && req.systemRole !== "super_admin") {
      res.status(403).json({ error: "You can only delete your own posts" }); return;
    }
    await db.delete(tradehubPostsTable).where(eq(tradehubPostsTable.id, id));
    res.json({ success: true });
  } catch (err: any) {
    req.log.error({ err }, "tradehub/posts/:id DELETE error");
    res.status(500).json({ error: "Failed to delete post" });
  }
});

// ── COMMENTS ─────────────────────────────────────────────────────────────────

// POST /tradehub/posts/:id/comments
router.post("/tradehub/posts/:id/comments", requireAuth, async (req, res) => {
  try {
    const postId = parseInt(req.params.id);
    const { content } = req.body as { content: string };
    if (!content?.trim()) { res.status(400).json({ error: "content required" }); return; }

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
    }

    res.json({ ...comment, author: author ?? null, profile: profile ?? null });
  } catch (err: any) {
    req.log.error({ err }, "tradehub/posts/:id/comments error");
    res.status(500).json({ error: "Failed to add comment" });
  }
});

// ── REACTIONS ────────────────────────────────────────────────────────────────

// POST /tradehub/posts/:id/react — toggle like
router.post("/tradehub/posts/:id/react", requireAuth, async (req, res) => {
  try {
    const postId = parseInt(req.params.id);
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
});

// ── JOBS ──────────────────────────────────────────────────────────────────────

// GET /tradehub/jobs?province=&trade=&page=
router.get("/tradehub/jobs", requireAuth, async (req, res) => {
  try {
    const { province, trade, page = "1" } = req.query as Record<string, string>;
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limit = 20;
    const offset = (pageNum - 1) * limit;

    const conditions: any[] = [
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
});

// POST /tradehub/jobs/:id/apply
router.post("/tradehub/jobs/:id/apply", requireAuth, async (req, res) => {
  try {
    const postId = parseInt(req.params.id);
    const { message } = req.body as { message?: string };

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
});

// PATCH /tradehub/applications/:id — update application status
router.patch("/tradehub/applications/:id", requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { status } = req.body as { status: string };
    if (!["reviewed", "accepted", "rejected"].includes(status)) {
      res.status(400).json({ error: "Invalid status" }); return;
    }

    const [app] = await db.select().from(tradehubJobApplicationsTable).where(eq(tradehubJobApplicationsTable.id, id)).limit(1);
    if (!app) { res.status(404).json({ error: "Application not found" }); return; }

    const [post] = await db.select().from(tradehubPostsTable).where(eq(tradehubPostsTable.id, app.postId)).limit(1);
    if (post?.userId !== req.userId) { res.status(403).json({ error: "Not your job post" }); return; }

    const [updated] = await db
      .update(tradehubJobApplicationsTable)
      .set({ status })
      .where(eq(tradehubJobApplicationsTable.id, id))
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
});

// ── PROFILES ─────────────────────────────────────────────────────────────────

// GET /tradehub/profile/me
router.get("/tradehub/profile/me", requireAuth, async (req, res) => {
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
});

// GET /tradehub/profile/:userId
router.get("/tradehub/profile/:userId", requireAuth, async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    const [profile] = await db
      .select()
      .from(tradehubProfilesTable)
      .where(eq(tradehubProfilesTable.userId, userId))
      .limit(1);
    if (!profile) { res.status(404).json({ error: "Profile not found" }); return; }

    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
    const posts = await db
      .select()
      .from(tradehubPostsTable)
      .where(and(eq(tradehubPostsTable.userId, userId), eq(tradehubPostsTable.visibility, "public")))
      .orderBy(desc(tradehubPostsTable.createdAt))
      .limit(10);

    res.json({ ...profile, user: user ?? null, recentPosts: posts });
  } catch (err: any) {
    req.log.error({ err }, "tradehub/profile/:userId error");
    res.status(500).json({ error: "Failed to load profile" });
  }
});

// PUT /tradehub/profile — upsert my profile
router.put("/tradehub/profile", requireAuth, async (req, res) => {
  try {
    const { displayName, trade, location, province, bio, website, avatarUrl } = req.body as {
      displayName: string; trade?: string; location?: string; province?: string;
      bio?: string; website?: string; avatarUrl?: string;
    };

    if (!displayName?.trim()) { res.status(400).json({ error: "displayName required" }); return; }

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
      }).returning();
      res.json(created);
    }
  } catch (err: any) {
    req.log.error({ err }, "tradehub/profile PUT error");
    res.status(500).json({ error: "Failed to save profile" });
  }
});

// ── NOTIFICATIONS ─────────────────────────────────────────────────────────────

// GET /tradehub/notifications
router.get("/tradehub/notifications", requireAuth, async (req, res) => {
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
});

// POST /tradehub/notifications/read-all
router.post("/tradehub/notifications/read-all", requireAuth, async (req, res) => {
  try {
    await db
      .update(tradehubNotificationsTable)
      .set({ isRead: true })
      .where(eq(tradehubNotificationsTable.userId, req.userId!));
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to mark notifications read" });
  }
});

// ── REPORTS ───────────────────────────────────────────────────────────────────

// POST /tradehub/reports
router.post("/tradehub/reports", requireAuth, async (req, res) => {
  try {
    const { targetType, targetId, reason } = req.body as { targetType: string; targetId: number; reason: string };
    if (!targetType || !targetId || !reason?.trim()) {
      res.status(400).json({ error: "targetType, targetId, and reason required" }); return;
    }
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
});

// ── MY POSTS ─────────────────────────────────────────────────────────────────

// GET /tradehub/my-posts
router.get("/tradehub/my-posts", requireAuth, async (req, res) => {
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
});

// GET /tradehub/my-applications
router.get("/tradehub/my-applications", requireAuth, async (req, res) => {
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
});

export default router;
