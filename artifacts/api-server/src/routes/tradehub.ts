import { Router } from "express";
import { createReadStream } from "fs";
import { requireAuth, requireCompany, requireTenantCtx } from "../lib/auth";
import { asyncHandler } from "../lib/asyncHandler";
import { notify } from "../lib/notify";
import { diskUpload, cleanupUpload } from "../lib/upload.js";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage.js";
import { ObjectPermission } from "../lib/objectAcl.js";
import { z } from "zod";

import {
  getUserById,
  getPublicUserById,
  getProfileByUserId,
  insertNotification,
  listFeedPosts,
  listPublicPosts,
  insertPost,
  getPostById,
  deletePost,
  listPostsByUser,
  listPostsByIds,
  listCommentsForPost,
  listUsersNamesByIds,
  listProfilesByUserIds,
  listJobApplicationsForPost,
  insertComment,
  getUserReactionForPost,
  deleteReaction,
  insertReaction,
  listJobPosts,
  getJobApplication,
  insertJobApplication,
  getJobApplicationById,
  updateJobApplicationStatus,
  listMyJobApplications,
  insertJobPosting,
  getJobPostingById,
  getJobPostingApplication,
  insertJobPostingApplication,
  insertPostMedia,
  listNotificationsForUser,
  markAllNotificationsRead,
  insertReport,
  listProfileMediaForUser,
  insertProfileMedia,
  getOwnedProfileMedia,
  deleteProfileMedia,
  listSavedCalculationIdsForUser,
  deleteSavedCalculationById,
  insertSavedCalculation,
  listSavedCalculationsForUser,
  listPublicSavedCalculationsForUser,
  getOwnedSavedCalculation,
  updateSavedCalculationPin,
  deleteSavedCalculation,
  searchProfiles,
} from "../repositories/tradehub";
import { checkPostRateLimit, enrichPost } from "../services/tradehub/feedService";
import { listJobPostingsWithMeta } from "../services/tradehub/jobsService";
import { getPublicProfile, upsertProfile, saveVoiceIntro, clearVoiceIntro } from "../services/tradehub/profileService";
import {
  startOrContinueConversation,
  listConversationsWithMeta,
  isConversationParticipant,
  listMessagesForConversation,
  sendConversationMessage,
  markConversationAsRead,
} from "../services/tradehub/messagingService";

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

// ── FEED ─────────────────────────────────────────────────────────────────────

// GET /tradehub/feed?type=&province=&trade=&page=
router.get("/tradehub/feed", requireAuth, asyncHandler(async (req, res) => {
  try {
    const { type, province, trade, page = "1" } = req.query as Record<string, string>;
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limit = 20;
    const offset = (pageNum - 1) * limit;

    const posts = await listFeedPosts({ companyId: req.companyId ?? null, type, province, trade, limit, offset });

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

    const posts = await listPublicPosts({ kind, limit, offset });

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

    const post = await insertPost({
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
    });

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
    const post = await getPostById(id, req.companyId ?? null);
    if (!post) { res.status(404).json({ error: "Post not found" }); return; }

    const enriched = await enrichPost(post, req.userId);

    // Get comments with authors
    const rawComments = await listCommentsForPost(id);

    const commentUserIds = [...new Set(rawComments.map((c) => c.userId))];
    const commentUsers = await listUsersNamesByIds(commentUserIds);
    const commentProfiles = await listProfilesByUserIds(commentUserIds);
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
      applications = await listJobApplicationsForPost(id);
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
    const isSuperAdmin = req.systemRole === "super_admin";
    // Super admins moderate posts across every company, so they must bypass
    // the same-company visibility scoping getPostById applies to everyone else.
    const post = isSuperAdmin
      ? (await listPostsByIds([id]))[0]
      : await getPostById(id, req.companyId ?? null);
    if (!post) { res.status(404).json({ error: "Post not found" }); return; }
    if (post.userId !== req.userId && !isSuperAdmin) {
      res.status(403).json({ error: "You can only delete your own posts" }); return;
    }
    await deletePost(id, isSuperAdmin ? null : (req.companyId ?? null));
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

    const post = await getPostById(postId, req.companyId ?? null);
    if (!post) { res.status(404).json({ error: "Post not found" }); return; }

    const comment = await insertComment({
      postId,
      userId: req.userId!,
      content: content.trim(),
    });

    // getPublicUserById, not getUserById — this author object is returned
    // directly in the response below, so it must never carry email/
    // clerkUserId/systemRole/pushToken.
    const author = await getPublicUserById(req.userId!);
    const profile = await getProfileByUserId(req.userId!);

    // Notify post author
    if (post.userId !== req.userId) {
      await insertNotification({
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
    const post = await getPostById(postId, req.companyId ?? null);
    if (!post) { res.status(404).json({ error: "Post not found" }); return; }

    const existing = await getUserReactionForPost(postId, req.userId!);

    if (existing) {
      await deleteReaction(existing.id);
      res.json({ reacted: false });
    } else {
      await insertReaction({ postId, userId: req.userId!, type: "like" });

      // Notify post author
      if (post.userId !== req.userId) {
        const liker = await getUserById(req.userId!);
        await insertNotification({
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

    const posts = await listJobPosts({ province, trade, limit, offset });

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

    const post = await getPostById(postId, req.companyId ?? null);
    if (!post) { res.status(404).json({ error: "Post not found" }); return; }
    if (post.type !== "job") { res.status(400).json({ error: "This is not a job post" }); return; }
    if (post.userId === req.userId) { res.status(400).json({ error: "Cannot apply to your own job" }); return; }

    const existing = await getJobApplication(postId, req.userId!);
    if (existing) { res.status(400).json({ error: "Already applied to this job" }); return; }

    const application = await insertJobApplication({
      postId,
      applicantId: req.userId!,
      message: message?.trim() ?? null,
    });

    // Notify job poster
    const applicant = await getUserById(req.userId!);
    await insertNotification({
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

    const app = await getJobApplicationById(id);
    if (!app) { res.status(404).json({ error: "Application not found" }); return; }

    const post = await getPostById(app.postId, req.companyId ?? null);
    if (!post || post.userId !== req.userId) { res.status(403).json({ error: "Not your job post" }); return; }

    const updated = await updateJobApplicationStatus(id, app.postId, status);

    // Notify applicant
    await insertNotification({
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
    const result = await listJobPostingsWithMeta({ province, trade, search, userId: req.userId });
    res.json(result);
  } catch (err: any) {
    req.log.error({ err }, "tradehub/job-postings error");
    res.status(500).json({ error: "Failed to load job postings" });
  }
}));

// POST /tradehub/job-postings
router.post("/tradehub/job-postings", requireAuth, requireCompany, requireTenantCtx, asyncHandler(async (req, res) => {
  try {
    const parsed = CreateJobPostingBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "Malformed request payload", details: parsed.error.flatten() }); return; }
    const { projectTitle, description, scopeOfWork, budgetEstimate, targetedStartDate, location, province, trade } = parsed.data;
    const created = await insertJobPosting({
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
    });
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

    const jp = await getJobPostingById(jobPostingId);
    if (!jp) { res.status(404).json({ error: "Job posting not found" }); return; }
    if (jp.status !== "open") { res.status(400).json({ error: "This tender is closed" }); return; }
    if (jp.createdBy === req.userId) { res.status(400).json({ error: "Cannot apply to your own posting" }); return; }

    // Compliance gate: check applicant's tradehub profile compliance status
    const profile = await getProfileByUserId(req.userId!);
    if (profile && profile.complianceStatus === "non_compliant") {
      res.status(409).json({ code: "COMPLIANCE_ERROR", error: "You must update your liability insurance in settings to bid on projects." });
      return;
    }

    const existing = await getJobPostingApplication(jobPostingId, req.userId!);
    if (existing) { res.status(400).json({ error: "Already applied to this tender" }); return; }

    const application = await insertJobPostingApplication({
      jobPostingId,
      applicantId: req.userId!,
      applicantProfileId: profile?.id ?? null,
      message: message?.trim() ?? null,
    });

    const applicant = await getUserById(req.userId!);
    const applicantProfile = await getProfileByUserId(req.userId!);
    const appName = applicantProfile?.displayName ?? `${applicant?.firstName ?? "Someone"}`;
    await insertNotification({
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
    const post = await getPostById(postId, req.companyId ?? null);
    if (!post) { res.status(404).json({ error: "Post not found" }); return; }
    if (post.userId !== req.userId) { res.status(403).json({ error: "Forbidden" }); return; }

    const parsed = PostMediaBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "Invalid request body", details: parsed.error.flatten() }); return; }
    const { url, objectPath, mediaType } = parsed.data;

    const media = await insertPostMedia({
      postId,
      url,
      objectPath: objectPath ?? null,
      mediaType,
    });
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
    const profile = await getProfileByUserId(req.userId!);
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
    const result = await getPublicProfile(userId);
    if (!result) { res.status(404).json({ error: "User not found" }); return; }
    res.json(result);
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

    const result = await upsertProfile(req.userId!, req.companyId ?? null, parsed.data);
    res.json(result);
  } catch (err: any) {
    req.log.error({ err }, "tradehub/profile PUT error");
    res.status(500).json({ error: "Failed to save profile" });
  }
}));

// ── NOTIFICATIONS ─────────────────────────────────────────────────────────────

// GET /tradehub/notifications
router.get("/tradehub/notifications", requireAuth, asyncHandler(async (req, res) => {
  try {
    const notifications = await listNotificationsForUser(req.userId!, 30);
    res.json(notifications);
  } catch (err: any) {
    req.log.error({ err }, "tradehub/notifications error");
    res.status(500).json({ error: "Failed to load notifications" });
  }
}));

// POST /tradehub/notifications/read-all
router.post("/tradehub/notifications/read-all", requireAuth, asyncHandler(async (req, res) => {
  try {
    await markAllNotificationsRead(req.userId!);
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
    const report = await insertReport({
      reporterId: req.userId!,
      targetType,
      targetId,
      reason: reason.trim(),
    });
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
    const posts = await listPostsByUser(req.userId!, 50);
    const enriched = await Promise.all(posts.map((p) => enrichPost(p, req.userId)));
    res.json(enriched);
  } catch (err: any) {
    res.status(500).json({ error: "Failed to load posts" });
  }
}));

// GET /tradehub/my-applications
router.get("/tradehub/my-applications", requireAuth, asyncHandler(async (req, res) => {
  try {
    const apps = await listMyJobApplications(req.userId!, 50);

    const postIds = apps.map((a) => a.postId);
    const posts = await listPostsByIds(postIds);
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
    const media = await listProfileMediaForUser(req.userId!);
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
    const media = await listProfileMediaForUser(userId);
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

    const media = await insertProfileMedia({
      userId: req.userId!,
      url,
      objectPath: objectPath ?? null,
      mediaType,
      fileName: fileName ?? null,
    });
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
    const item = await getOwnedProfileMedia(id, req.userId!);
    if (!item) { res.status(404).json({ error: "Not found" }); return; }
    await deleteProfileMedia(id, req.userId!);
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
    const existing = await listSavedCalculationIdsForUser(req.userId!);
    if (existing.length >= 20) {
      const toDelete = existing.slice(19).map((r) => r.id);
      for (const id of toDelete) {
        await deleteSavedCalculationById(id);
      }
    }
    const saved = await insertSavedCalculation({
      userId: req.userId!,
      calculatorId,
      calculatorName,
      category,
      inputs: inputs ?? {},
      results: results ?? [],
      summary: summary ?? "",
      aiSummary: aiSummary ?? null,
      isPinned: false,
    });
    res.json(saved);
  } catch (err: any) {
    req.log.error({ err }, "tradehub/profile/calculations POST error");
    res.status(500).json({ error: "Failed to save calculation" });
  }
}));

// GET /tradehub/profile/me/calculations — own saved calculations
router.get("/tradehub/profile/me/calculations", requireAuth, asyncHandler(async (req, res) => {
  try {
    const calcs = await listSavedCalculationsForUser(req.userId!);
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
    const calcs = await listPublicSavedCalculationsForUser(profileUserId, 10);
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
    const calc = await getOwnedSavedCalculation(id, req.userId!);
    if (!calc) { res.status(404).json({ error: "Not found" }); return; }
    const updated = await updateSavedCalculationPin(id, req.userId!, !calc.isPinned);
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
    await deleteSavedCalculation(id, req.userId!);
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

    const result = await saveVoiceIntro(req.userId!, req.companyId ?? null, objectPath, duration);
    res.json(result);
  } catch (err: any) {
    req.log.error({ err }, "tradehub/profile/voice PUT error");
    res.status(500).json({ error: "Failed to save voice intro" });
  }
}));

// DELETE /tradehub/profile/voice
router.delete("/tradehub/profile/voice", requireAuth, asyncHandler(async (req, res) => {
  try {
    await clearVoiceIntro(req.userId!);
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

    const profiles = await searchProfiles(q.toLowerCase(), 15);

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

    const conversationId = await startOrContinueConversation(req.userId!, recipientId, message);

    res.json({ conversationId });
  } catch (err: any) {
    req.log.error({ err }, "tradehub/conversations POST error");
    res.status(500).json({ error: "Failed to create conversation" });
  }
}));

// GET /tradehub/conversations — list my conversations
router.get("/tradehub/conversations", requireAuth, asyncHandler(async (req, res) => {
  try {
    const result = await listConversationsWithMeta(req.userId!);
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
    const isMember = await isConversationParticipant(convId, req.userId!);
    if (!isMember) { res.status(403).json({ error: "Not a participant" }); return; }

    const messages = await listMessagesForConversation(convId);

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

    const msg = await sendConversationMessage(convId, req.userId!, content);
    if (!msg) { res.status(403).json({ error: "Not a participant" }); return; }

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
    await markConversationAsRead(convId, req.userId!);
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: "Failed to mark read" });
  }
}));

export default router;
