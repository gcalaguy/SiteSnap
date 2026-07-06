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

export type TradehubPost = typeof tradehubPostsTable.$inferSelect;
export type TradehubProfile = typeof tradehubProfilesTable.$inferSelect;
export type TradehubComment = typeof tradehubCommentsTable.$inferSelect;
export type TradehubJobApplication = typeof tradehubJobApplicationsTable.$inferSelect;
export type JobPosting = typeof jobPostingsTable.$inferSelect;
export type JobPostingApplication = typeof jobPostingApplicationsTable.$inferSelect;
export type TradehubConversation = typeof tradehubConversationsTable.$inferSelect;
export type TradehubConversationParticipant = typeof tradehubConversationParticipantsTable.$inferSelect;
export type TradehubMessage = typeof tradehubMessagesTable.$inferSelect;
export type TradehubSavedCalculation = typeof tradehubSavedCalculationsTable.$inferSelect;
export type TradehubProfileMedia = typeof tradehubProfileMediaTable.$inferSelect;
export type TradehubNotification = typeof tradehubNotificationsTable.$inferSelect;

// ── Shared lookups ─────────────────────────────────────────────────────────────

export async function getUserById(userId: number) {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  return user;
}

// Public-safe projection for user data exposed to other users (e.g. profile pages).
// Never select email, clerkUserId, systemRole, pushToken, or other sensitive columns here.
export async function getPublicUserById(userId: number) {
  const [user] = await db
    .select({
      id: usersTable.id,
      firstName: usersTable.firstName,
      lastName: usersTable.lastName,
      createdAt: usersTable.createdAt,
    })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  return user;
}

export async function getProfileByUserId(userId: number): Promise<TradehubProfile | undefined> {
  const [profile] = await db.select().from(tradehubProfilesTable).where(eq(tradehubProfilesTable.userId, userId)).limit(1);
  return profile;
}

export async function listProfilesByUserIds(ids: number[]) {
  if (!ids.length) return [];
  return db.select().from(tradehubProfilesTable).where(inArray(tradehubProfilesTable.userId, ids));
}

export async function insertNotification(data: typeof tradehubNotificationsTable.$inferInsert): Promise<void> {
  await db.insert(tradehubNotificationsTable).values(data);
}

// ── Posts / Feed ─────────────────────────────────────────────────────────────

export async function listFeedPosts(opts: {
  companyId: number | null;
  type?: string;
  province?: string;
  trade?: string;
  limit: number;
  offset: number;
}): Promise<TradehubPost[]> {
  const conditions: SQL[] = [];
  if (opts.companyId) {
    conditions.push(
      or(
        eq(tradehubPostsTable.visibility, "public"),
        and(
          eq(tradehubPostsTable.visibility, "internal"),
          eq(tradehubPostsTable.companyId, opts.companyId),
        ),
      )!,
    );
  } else {
    conditions.push(eq(tradehubPostsTable.visibility, "public"));
  }
  if (opts.type) conditions.push(eq(tradehubPostsTable.type, opts.type));
  if (opts.province) conditions.push(eq(tradehubPostsTable.province, opts.province));
  if (opts.trade) conditions.push(eq(tradehubPostsTable.trade, opts.trade));

  return db
    .select()
    .from(tradehubPostsTable)
    .where(and(...conditions))
    .orderBy(desc(tradehubPostsTable.createdAt))
    .limit(opts.limit)
    .offset(opts.offset);
}

export async function listPublicPosts(opts: { kind?: string; limit: number; offset: number }): Promise<TradehubPost[]> {
  const conditions: SQL[] = [eq(tradehubPostsTable.visibility, "public")];
  if (opts.kind && opts.kind !== "all") conditions.push(eq(tradehubPostsTable.type, opts.kind));

  return db
    .select()
    .from(tradehubPostsTable)
    .where(and(...conditions))
    .orderBy(desc(tradehubPostsTable.createdAt))
    .limit(opts.limit)
    .offset(opts.offset);
}

export async function insertPost(data: typeof tradehubPostsTable.$inferInsert): Promise<TradehubPost> {
  const [post] = await db.insert(tradehubPostsTable).values(data).returning();
  return post;
}

export async function getPostById(id: number): Promise<TradehubPost | undefined> {
  const [post] = await db.select().from(tradehubPostsTable).where(eq(tradehubPostsTable.id, id)).limit(1);
  return post;
}

export async function deletePost(id: number, companyId: number | null): Promise<void> {
  if (companyId) {
    await db.delete(tradehubPostsTable).where(and(eq(tradehubPostsTable.id, id), eq(tradehubPostsTable.companyId, companyId)));
  } else {
    await db.delete(tradehubPostsTable).where(eq(tradehubPostsTable.id, id));
  }
}

export async function listPostsByUser(userId: number, limit: number): Promise<TradehubPost[]> {
  return db
    .select()
    .from(tradehubPostsTable)
    .where(eq(tradehubPostsTable.userId, userId))
    .orderBy(desc(tradehubPostsTable.createdAt))
    .limit(limit);
}

export async function listPublicPostsByUser(userId: number, limit: number): Promise<TradehubPost[]> {
  return db
    .select()
    .from(tradehubPostsTable)
    .where(and(eq(tradehubPostsTable.userId, userId), eq(tradehubPostsTable.visibility, "public")))
    .orderBy(desc(tradehubPostsTable.createdAt))
    .limit(limit);
}

export async function listPostsByIds(ids: number[]): Promise<TradehubPost[]> {
  if (!ids.length) return [];
  return db.select().from(tradehubPostsTable).where(inArray(tradehubPostsTable.id, ids));
}

// ── Post enrichment primitives ────────────────────────────────────────────────

export async function getPostMedia(postId: number) {
  return db.select().from(tradehubPostMediaTable).where(eq(tradehubPostMediaTable.postId, postId));
}

export async function getPostCommentCount(postId: number): Promise<number> {
  const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(tradehubCommentsTable).where(eq(tradehubCommentsTable.postId, postId));
  return row.count;
}

export async function getPostReactionCount(postId: number): Promise<number> {
  const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(tradehubReactionsTable).where(eq(tradehubReactionsTable.postId, postId));
  return row.count;
}

export async function getUserReactionForPost(postId: number, userId: number) {
  const [reaction] = await db
    .select()
    .from(tradehubReactionsTable)
    .where(and(eq(tradehubReactionsTable.postId, postId), eq(tradehubReactionsTable.userId, userId)))
    .limit(1);
  return reaction;
}

export async function getJobApplicationCountForPost(postId: number): Promise<number> {
  const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(tradehubJobApplicationsTable).where(eq(tradehubJobApplicationsTable.postId, postId));
  return row.count;
}

// ── Comments ───────────────────────────────────────────────────────────────────

export async function listCommentsForPost(postId: number): Promise<TradehubComment[]> {
  return db.select().from(tradehubCommentsTable).where(eq(tradehubCommentsTable.postId, postId)).orderBy(tradehubCommentsTable.createdAt);
}

export async function insertComment(data: typeof tradehubCommentsTable.$inferInsert): Promise<TradehubComment> {
  const [comment] = await db.insert(tradehubCommentsTable).values(data).returning();
  return comment;
}

// ── Reactions ──────────────────────────────────────────────────────────────────

export async function deleteReaction(id: number): Promise<void> {
  await db.delete(tradehubReactionsTable).where(eq(tradehubReactionsTable.id, id));
}

export async function insertReaction(data: typeof tradehubReactionsTable.$inferInsert): Promise<void> {
  await db.insert(tradehubReactionsTable).values(data);
}

// ── Jobs (job-type posts + applications) ──────────────────────────────────────

export async function listJobPosts(opts: { province?: string; trade?: string; limit: number; offset: number }): Promise<TradehubPost[]> {
  const conditions: SQL[] = [
    eq(tradehubPostsTable.visibility, "public"),
    eq(tradehubPostsTable.type, "job"),
  ];
  if (opts.province) conditions.push(eq(tradehubPostsTable.province, opts.province));
  if (opts.trade) conditions.push(eq(tradehubPostsTable.trade, opts.trade));

  return db
    .select()
    .from(tradehubPostsTable)
    .where(and(...conditions))
    .orderBy(desc(tradehubPostsTable.createdAt))
    .limit(opts.limit)
    .offset(opts.offset);
}

export async function getJobApplication(postId: number, applicantId: number): Promise<TradehubJobApplication | undefined> {
  const [existing] = await db
    .select()
    .from(tradehubJobApplicationsTable)
    .where(and(eq(tradehubJobApplicationsTable.postId, postId), eq(tradehubJobApplicationsTable.applicantId, applicantId)))
    .limit(1);
  return existing;
}

export async function insertJobApplication(data: typeof tradehubJobApplicationsTable.$inferInsert): Promise<TradehubJobApplication> {
  const [application] = await db.insert(tradehubJobApplicationsTable).values(data).returning();
  return application;
}

export async function getJobApplicationById(id: number): Promise<TradehubJobApplication | undefined> {
  const [app] = await db.select().from(tradehubJobApplicationsTable).where(eq(tradehubJobApplicationsTable.id, id)).limit(1);
  return app;
}

export async function updateJobApplicationStatus(
  id: number,
  postId: number,
  status: string,
): Promise<TradehubJobApplication | undefined> {
  const [updated] = await db
    .update(tradehubJobApplicationsTable)
    .set({ status: status as any })
    .where(and(eq(tradehubJobApplicationsTable.id, id), eq(tradehubJobApplicationsTable.postId, postId)))
    .returning();
  return updated;
}

export async function listMyJobApplications(userId: number, limit: number): Promise<TradehubJobApplication[]> {
  return db
    .select()
    .from(tradehubJobApplicationsTable)
    .where(eq(tradehubJobApplicationsTable.applicantId, userId))
    .orderBy(desc(tradehubJobApplicationsTable.createdAt))
    .limit(limit);
}

export async function listJobApplicationsForPost(postId: number): Promise<TradehubJobApplication[]> {
  return db
    .select()
    .from(tradehubJobApplicationsTable)
    .where(eq(tradehubJobApplicationsTable.postId, postId))
    .orderBy(desc(tradehubJobApplicationsTable.createdAt));
}

// ── Job Postings (open tenders) ───────────────────────────────────────────────

export async function listOpenJobPostings(opts: { province?: string; trade?: string }): Promise<JobPosting[]> {
  const conditions: SQL[] = [eq(jobPostingsTable.status, "open")];
  if (opts.province) conditions.push(eq(jobPostingsTable.province, opts.province));
  if (opts.trade) conditions.push(eq(jobPostingsTable.trade, opts.trade));

  return db.select().from(jobPostingsTable).where(and(...conditions)).orderBy(desc(jobPostingsTable.createdAt));
}

export async function listUsersNamesByIds(ids: number[]) {
  if (!ids.length) return [];
  return db.select({ id: usersTable.id, firstName: usersTable.firstName, lastName: usersTable.lastName }).from(usersTable).where(inArray(usersTable.id, ids));
}

export async function listCompaniesByIds(ids: number[]) {
  if (!ids.length) return [];
  return db.select({ id: companiesTable.id, name: companiesTable.name }).from(companiesTable).where(inArray(companiesTable.id, ids));
}

export async function getJobPostingApplicationCounts(postingIds: number[]) {
  if (!postingIds.length) return [];
  return db
    .select({ jobPostingId: jobPostingApplicationsTable.jobPostingId, count: sql<number>`count(*)::int` })
    .from(jobPostingApplicationsTable)
    .where(inArray(jobPostingApplicationsTable.jobPostingId, postingIds))
    .groupBy(jobPostingApplicationsTable.jobPostingId);
}

export async function listMyJobPostingApplicationIds(postingIds: number[], userId: number) {
  if (!postingIds.length) return [];
  return db
    .select({ jobPostingId: jobPostingApplicationsTable.jobPostingId })
    .from(jobPostingApplicationsTable)
    .where(and(
      inArray(jobPostingApplicationsTable.jobPostingId, postingIds),
      eq(jobPostingApplicationsTable.applicantId, userId),
    ));
}

export async function insertJobPosting(data: typeof jobPostingsTable.$inferInsert): Promise<JobPosting> {
  const [created] = await db.insert(jobPostingsTable).values(data).returning();
  return created;
}

export async function getJobPostingById(id: number): Promise<JobPosting | undefined> {
  const [jp] = await db.select().from(jobPostingsTable).where(eq(jobPostingsTable.id, id)).limit(1);
  return jp;
}

export async function getJobPostingApplication(jobPostingId: number, applicantId: number): Promise<JobPostingApplication | undefined> {
  const [existing] = await db
    .select()
    .from(jobPostingApplicationsTable)
    .where(and(eq(jobPostingApplicationsTable.jobPostingId, jobPostingId), eq(jobPostingApplicationsTable.applicantId, applicantId)))
    .limit(1);
  return existing;
}

export async function insertJobPostingApplication(data: typeof jobPostingApplicationsTable.$inferInsert): Promise<JobPostingApplication> {
  const [application] = await db.insert(jobPostingApplicationsTable).values(data).returning();
  return application;
}

// ── Post Media ─────────────────────────────────────────────────────────────────

export async function insertPostMedia(data: typeof tradehubPostMediaTable.$inferInsert) {
  const [media] = await db.insert(tradehubPostMediaTable).values(data).returning();
  return media;
}

// ── Profiles ───────────────────────────────────────────────────────────────────

export async function updateProfile(userId: number, data: Record<string, unknown>): Promise<TradehubProfile | undefined> {
  const [updated] = await db
    .update(tradehubProfilesTable)
    .set({ ...data, updatedAt: new Date() } as any)
    .where(eq(tradehubProfilesTable.userId, userId))
    .returning();
  return updated;
}

export async function insertProfile(data: typeof tradehubProfilesTable.$inferInsert): Promise<TradehubProfile> {
  const [created] = await db.insert(tradehubProfilesTable).values(data).returning();
  return created;
}

export async function searchProfiles(query: string, limit: number): Promise<TradehubProfile[]> {
  return db
    .select()
    .from(tradehubProfilesTable)
    .where(
      sql`(lower(${tradehubProfilesTable.displayName}) LIKE ${`%${query}%`} OR lower(${tradehubProfilesTable.trade}) LIKE ${`%${query}%`})`
    )
    .limit(limit);
}

// ── Notifications ──────────────────────────────────────────────────────────────

export async function listNotificationsForUser(userId: number, limit: number): Promise<TradehubNotification[]> {
  return db
    .select()
    .from(tradehubNotificationsTable)
    .where(eq(tradehubNotificationsTable.userId, userId))
    .orderBy(desc(tradehubNotificationsTable.createdAt))
    .limit(limit);
}

export async function markAllNotificationsRead(userId: number): Promise<void> {
  await db.update(tradehubNotificationsTable).set({ isRead: true }).where(eq(tradehubNotificationsTable.userId, userId));
}

// ── Reports ────────────────────────────────────────────────────────────────────

export async function insertReport(data: typeof tradehubReportsTable.$inferInsert) {
  const [report] = await db.insert(tradehubReportsTable).values(data).returning();
  return report;
}

// ── Profile Media ──────────────────────────────────────────────────────────────

export async function listProfileMediaForUser(userId: number): Promise<TradehubProfileMedia[]> {
  return db.select().from(tradehubProfileMediaTable).where(eq(tradehubProfileMediaTable.userId, userId)).orderBy(desc(tradehubProfileMediaTable.createdAt));
}

export async function insertProfileMedia(data: typeof tradehubProfileMediaTable.$inferInsert) {
  const [media] = await db.insert(tradehubProfileMediaTable).values(data).returning();
  return media;
}

export async function getOwnedProfileMedia(id: number, userId: number): Promise<TradehubProfileMedia | undefined> {
  const [item] = await db
    .select()
    .from(tradehubProfileMediaTable)
    .where(and(eq(tradehubProfileMediaTable.id, id), eq(tradehubProfileMediaTable.userId, userId)))
    .limit(1);
  return item;
}

export async function deleteProfileMedia(id: number, userId: number): Promise<void> {
  await db.delete(tradehubProfileMediaTable).where(and(eq(tradehubProfileMediaTable.id, id), eq(tradehubProfileMediaTable.userId, userId)));
}

// ── Saved Calculations ─────────────────────────────────────────────────────────

export async function listSavedCalculationIdsForUser(userId: number): Promise<{ id: number }[]> {
  return db
    .select({ id: tradehubSavedCalculationsTable.id })
    .from(tradehubSavedCalculationsTable)
    .where(eq(tradehubSavedCalculationsTable.userId, userId))
    .orderBy(desc(tradehubSavedCalculationsTable.createdAt));
}

export async function deleteSavedCalculationById(id: number): Promise<void> {
  await db.delete(tradehubSavedCalculationsTable).where(eq(tradehubSavedCalculationsTable.id, id));
}

export async function insertSavedCalculation(data: typeof tradehubSavedCalculationsTable.$inferInsert): Promise<TradehubSavedCalculation> {
  const [saved] = await db.insert(tradehubSavedCalculationsTable).values(data).returning();
  return saved;
}

export async function listSavedCalculationsForUser(userId: number): Promise<TradehubSavedCalculation[]> {
  return db
    .select()
    .from(tradehubSavedCalculationsTable)
    .where(eq(tradehubSavedCalculationsTable.userId, userId))
    .orderBy(desc(tradehubSavedCalculationsTable.isPinned), desc(tradehubSavedCalculationsTable.createdAt));
}

export async function listPublicSavedCalculationsForUser(userId: number, limit: number): Promise<TradehubSavedCalculation[]> {
  return db
    .select()
    .from(tradehubSavedCalculationsTable)
    .where(eq(tradehubSavedCalculationsTable.userId, userId))
    .orderBy(desc(tradehubSavedCalculationsTable.isPinned), desc(tradehubSavedCalculationsTable.createdAt))
    .limit(limit);
}

export async function getOwnedSavedCalculation(id: number, userId: number): Promise<TradehubSavedCalculation | undefined> {
  const [calc] = await db
    .select()
    .from(tradehubSavedCalculationsTable)
    .where(and(eq(tradehubSavedCalculationsTable.id, id), eq(tradehubSavedCalculationsTable.userId, userId)));
  return calc;
}

export async function updateSavedCalculationPin(id: number, userId: number, isPinned: boolean): Promise<TradehubSavedCalculation | undefined> {
  const [updated] = await db
    .update(tradehubSavedCalculationsTable)
    .set({ isPinned })
    .where(and(eq(tradehubSavedCalculationsTable.id, id), eq(tradehubSavedCalculationsTable.userId, userId)))
    .returning();
  return updated;
}

export async function deleteSavedCalculation(id: number, userId: number): Promise<void> {
  await db.delete(tradehubSavedCalculationsTable).where(and(eq(tradehubSavedCalculationsTable.id, id), eq(tradehubSavedCalculationsTable.userId, userId)));
}

// ── Voice Intro (part of profile) ─────────────────────────────────────────────

export async function updateProfileVoiceIntro(
  userId: number,
  fields: { voiceIntroUrl: string | null; voiceIntroObjectPath: string | null; voiceIntroDuration: number | null },
): Promise<TradehubProfile | undefined> {
  const [updated] = await db
    .update(tradehubProfilesTable)
    .set({ ...fields, updatedAt: new Date() })
    .where(eq(tradehubProfilesTable.userId, userId))
    .returning();
  return updated;
}

export async function clearProfileVoiceIntro(userId: number): Promise<void> {
  await db
    .update(tradehubProfilesTable)
    .set({ voiceIntroUrl: null, voiceIntroObjectPath: null, voiceIntroDuration: null, updatedAt: new Date() })
    .where(eq(tradehubProfilesTable.userId, userId));
}

// ── Messaging ──────────────────────────────────────────────────────────────────

export async function findExistingConversationId(userId: number, recipientId: number): Promise<number | null> {
  const existing = await db.execute(
    sql`SELECT cp1.conversation_id FROM tradehub_conversation_participants cp1
        JOIN tradehub_conversation_participants cp2 ON cp1.conversation_id = cp2.conversation_id
        WHERE cp1.user_id = ${userId} AND cp2.user_id = ${recipientId}
        LIMIT 1`
  );
  if (existing.rows.length === 0) return null;
  return (existing.rows[0] as any).conversation_id;
}

export async function insertConversation(): Promise<TradehubConversation> {
  const [conv] = await db.insert(tradehubConversationsTable).values({}).returning();
  return conv;
}

export async function insertConversationParticipants(conversationId: number, userIds: number[]): Promise<void> {
  await db.insert(tradehubConversationParticipantsTable).values(userIds.map((userId) => ({ conversationId, userId })));
}

export async function insertMessage(data: typeof tradehubMessagesTable.$inferInsert): Promise<TradehubMessage> {
  const [msg] = await db.insert(tradehubMessagesTable).values(data).returning();
  return msg;
}

export async function touchConversation(conversationId: number): Promise<void> {
  await db.update(tradehubConversationsTable).set({ updatedAt: new Date() }).where(eq(tradehubConversationsTable.id, conversationId));
}

export async function listMyConversationIds(userId: number): Promise<number[]> {
  const rows = await db
    .select({ conversationId: tradehubConversationParticipantsTable.conversationId })
    .from(tradehubConversationParticipantsTable)
    .where(eq(tradehubConversationParticipantsTable.userId, userId));
  return rows.map((r) => r.conversationId);
}

export async function listConversationsByIds(ids: number[]): Promise<TradehubConversation[]> {
  if (!ids.length) return [];
  return db.select().from(tradehubConversationsTable).where(inArray(tradehubConversationsTable.id, ids)).orderBy(desc(tradehubConversationsTable.updatedAt));
}

export async function getOtherParticipant(conversationId: number, userId: number): Promise<TradehubConversationParticipant | undefined> {
  const [otherPart] = await db
    .select()
    .from(tradehubConversationParticipantsTable)
    .where(
      and(
        eq(tradehubConversationParticipantsTable.conversationId, conversationId),
        sql`${tradehubConversationParticipantsTable.userId} != ${userId}`
      )
    )
    .limit(1);
  return otherPart;
}

export async function getLastMessage(conversationId: number): Promise<TradehubMessage | undefined> {
  const [lastMessage] = await db
    .select()
    .from(tradehubMessagesTable)
    .where(eq(tradehubMessagesTable.conversationId, conversationId))
    .orderBy(desc(tradehubMessagesTable.createdAt))
    .limit(1);
  return lastMessage;
}

export async function getMyParticipant(conversationId: number, userId: number): Promise<TradehubConversationParticipant | undefined> {
  const [part] = await db
    .select()
    .from(tradehubConversationParticipantsTable)
    .where(
      and(
        eq(tradehubConversationParticipantsTable.conversationId, conversationId),
        eq(tradehubConversationParticipantsTable.userId, userId)
      )
    )
    .limit(1);
  return part;
}

export async function getUnreadMessageCount(conversationId: number, userId: number, lastReadAt: Date | null | undefined): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(tradehubMessagesTable)
    .where(
      and(
        eq(tradehubMessagesTable.conversationId, conversationId),
        sql`${tradehubMessagesTable.senderId} != ${userId}`,
        lastReadAt
          ? sql`${tradehubMessagesTable.createdAt} > ${lastReadAt}`
          : sql`1=1`
      )
    );
  return row.count;
}

export async function listMessagesForConversation(conversationId: number, limit: number): Promise<TradehubMessage[]> {
  return db
    .select()
    .from(tradehubMessagesTable)
    .where(eq(tradehubMessagesTable.conversationId, conversationId))
    .orderBy(tradehubMessagesTable.createdAt)
    .limit(limit);
}

export async function listParticipants(conversationId: number): Promise<TradehubConversationParticipant[]> {
  return db.select().from(tradehubConversationParticipantsTable).where(eq(tradehubConversationParticipantsTable.conversationId, conversationId));
}

export async function markConversationRead(conversationId: number, userId: number): Promise<void> {
  await db
    .update(tradehubConversationParticipantsTable)
    .set({ lastReadAt: new Date() })
    .where(
      and(
        eq(tradehubConversationParticipantsTable.conversationId, conversationId),
        eq(tradehubConversationParticipantsTable.userId, userId)
      )
    );
}
