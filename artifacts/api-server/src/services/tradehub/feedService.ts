import {
  getUserById,
  getProfileByUserId,
  getPostMedia,
  getPostCommentCount,
  getPostReactionCount,
  getUserReactionForPost,
  getJobApplicationCountForPost,
  type TradehubPost,
} from "../../repositories/tradehub";

// ── Rate limiting (simple in-memory, per process) ─────────────────────────────
const postCounts = new Map<string, { count: number; resetAt: number }>();
export function checkPostRateLimit(userId: number): boolean {
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

// ── Post enrichment (author, profile, media, counts, reaction state) ─────────
export async function enrichPost(post: TradehubPost, currentUserId?: number) {
  const [author, profile, media, commentCount, reactionCount] = await Promise.all([
    getUserById(post.userId).then((u) => (u ? { id: u.id, firstName: u.firstName, lastName: u.lastName } : null)),
    getProfileByUserId(post.userId).then((p) => p ?? null),
    getPostMedia(post.id),
    getPostCommentCount(post.id),
    getPostReactionCount(post.id),
  ]);

  let hasReacted = false;
  if (currentUserId) {
    hasReacted = !!(await getUserReactionForPost(post.id, currentUserId));
  }

  let applicationCount = 0;
  if (post.type === "job") {
    applicationCount = await getJobApplicationCountForPost(post.id);
  }

  return {
    ...post,
    author,
    profile,
    media,
    commentCount,
    reactionCount,
    applicationCount,
    hasReacted,
  };
}
