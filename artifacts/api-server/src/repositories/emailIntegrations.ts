import {
  db,
  pool,
  emailAccountsTable,
  emailThreadsTable,
  emailMessagesTable,
  emailAttachmentsTable,
  emailFilingRulesTable,
  communicationSearchTemplatesTable,
  communicationTimelineEventsTable,
  type EmailAccount,
  type EmailThread,
  type EmailMessage,
  type EmailAttachment,
  type EmailFilingRule,
  type CommunicationSearchTemplate,
  type CommunicationTimelineEvent,
  type InsertEmailAccount,
  type InsertEmailThread,
  type InsertEmailMessage,
  type InsertEmailAttachment,
  type InsertEmailFilingRule,
  type InsertCommunicationSearchTemplate,
  type MatchReason,
  type CommunicationSearchCriteria,
  type EmailAiEntities,
  type SearchCondition,
  type SearchConditionGroup,
  type SearchConditionLeafGroup,
} from "@workspace/db";
import { eq, and, desc, asc, sql, lte, or, inArray, isNull, lt } from "drizzle-orm";
import { reclassifyFromEntities } from "../services/attachmentClassifier";
import { encryptSecret, decryptOrPassthrough } from "../lib/crypto";

const TOKEN_KEY_ENV_VAR = "EMAIL_TOKEN_ENCRYPTION_KEY";

/**
 * Encryption boundary for email OAuth tokens (Phase 4) — lives entirely here
 * so emailOAuthService.ts/emailSyncService.ts/routes stay unaware encryption
 * exists at all; they just read/write plain accessToken/refreshToken strings.
 * No bulk migration of existing plaintext tokens: decryptAccountTokens()
 * transparently passes through legacy plaintext (see crypto.ts's
 * decryptOrPassthrough), and every account re-encrypts on its next token
 * write (createOrUpdateEmailAccount on reconnect, or updateEmailAccountTokens
 * on its next refresh — within hours/days per syncFrequency).
 */
function encryptAccountTokens<T extends { accessToken?: string | null; refreshToken?: string | null }>(
  patch: T,
): T {
  return {
    ...patch,
    accessToken: patch.accessToken != null ? encryptSecret(patch.accessToken, TOKEN_KEY_ENV_VAR) : patch.accessToken,
    refreshToken: patch.refreshToken != null ? encryptSecret(patch.refreshToken, TOKEN_KEY_ENV_VAR) : patch.refreshToken,
  };
}

function decryptAccountTokens(account: EmailAccount): EmailAccount {
  return {
    ...account,
    accessToken: account.accessToken != null ? decryptOrPassthrough(account.accessToken, TOKEN_KEY_ENV_VAR) : account.accessToken,
    refreshToken: account.refreshToken != null ? decryptOrPassthrough(account.refreshToken, TOKEN_KEY_ENV_VAR) : account.refreshToken,
  };
}

// ── Email accounts ──────────────────────────────────────────────────────────

export async function listEmailAccounts(companyId: number): Promise<EmailAccount[]> {
  const rows = await db
    .select()
    .from(emailAccountsTable)
    .where(eq(emailAccountsTable.companyId, companyId))
    .orderBy(desc(emailAccountsTable.createdAt));
  return rows.map(decryptAccountTokens);
}

export async function getEmailAccount(
  companyId: number,
  accountId: number,
): Promise<EmailAccount | null> {
  const [row] = await db
    .select()
    .from(emailAccountsTable)
    .where(and(eq(emailAccountsTable.companyId, companyId), eq(emailAccountsTable.id, accountId)));
  return row ? decryptAccountTokens(row) : null;
}

/**
 * Upsert on (companyId, provider, emailAddress): reconnecting the same mailbox
 * updates the existing row (fresh tokens, status reset to active) instead of
 * creating a duplicate account with orphaned thread/message history.
 */
export async function createOrUpdateEmailAccount(
  account: InsertEmailAccount,
): Promise<EmailAccount> {
  const encrypted = encryptAccountTokens(account);
  const [row] = await db
    .insert(emailAccountsTable)
    .values(encrypted)
    .onConflictDoUpdate({
      target: [emailAccountsTable.companyId, emailAccountsTable.provider, emailAccountsTable.emailAddress],
      set: {
        connectedByUserId: encrypted.connectedByUserId,
        displayName: encrypted.displayName,
        status: "active",
        accessToken: encrypted.accessToken,
        refreshToken: encrypted.refreshToken,
        tokenExpiresAt: encrypted.tokenExpiresAt,
        scopes: encrypted.scopes,
        lastSyncError: null,
        updatedAt: new Date(),
      },
    })
    .returning();
  return decryptAccountTokens(row);
}

export async function updateEmailAccountSettings(
  companyId: number,
  accountId: number,
  patch: Partial<Pick<InsertEmailAccount, "selectedFolders" | "syncFrequency">>,
): Promise<EmailAccount | null> {
  const [row] = await db
    .update(emailAccountsTable)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(emailAccountsTable.companyId, companyId), eq(emailAccountsTable.id, accountId)))
    .returning();
  return row ?? null;
}

/** Soft-disconnect: clears tokens and marks disconnected, but keeps the row (and its
 * synced thread/message history) intact rather than cascading a hard delete. */
export async function disconnectEmailAccount(
  companyId: number,
  accountId: number,
): Promise<boolean> {
  const [row] = await db
    .update(emailAccountsTable)
    .set({
      status: "disconnected",
      accessToken: null,
      refreshToken: null,
      tokenExpiresAt: null,
      updatedAt: new Date(),
    })
    .where(and(eq(emailAccountsTable.companyId, companyId), eq(emailAccountsTable.id, accountId)))
    .returning({ id: emailAccountsTable.id });
  return !!row;
}

export async function updateEmailAccountTokens(
  accountId: number,
  patch: Pick<InsertEmailAccount, "accessToken" | "refreshToken" | "tokenExpiresAt"> & {
    status?: EmailAccount["status"];
  },
): Promise<void> {
  await db
    .update(emailAccountsTable)
    .set({ ...encryptAccountTokens(patch), updatedAt: new Date() })
    .where(eq(emailAccountsTable.id, accountId));
}

export async function recordSyncResult(
  accountId: number,
  patch: {
    status?: EmailAccount["status"];
    deltaCursor?: string | null;
    lastSyncError?: string | null;
    nextSyncDueAt: Date;
  },
): Promise<void> {
  await db
    .update(emailAccountsTable)
    .set({ ...patch, lastSyncAt: new Date(), updatedAt: new Date() })
    .where(eq(emailAccountsTable.id, accountId));
}

/** Accounts due for a sync pass — active, and either never synced or past nextSyncDueAt. */
export async function getDueEmailAccounts(
  limit: number,
  offset: number,
): Promise<EmailAccount[]> {
  const rows = await db
    .select()
    .from(emailAccountsTable)
    .where(
      and(
        eq(emailAccountsTable.status, "active"),
        or(isNull(emailAccountsTable.nextSyncDueAt), lte(emailAccountsTable.nextSyncDueAt, new Date())),
      ),
    )
    .limit(limit)
    .offset(offset);
  return rows.map(decryptAccountTokens);
}

// ── Threads ──────────────────────────────────────────────────────────────────

/** Idempotent create — a re-synced thread (overlapping poll window) updates in place. */
export async function upsertThread(thread: InsertEmailThread): Promise<EmailThread> {
  const [row] = await db
    .insert(emailThreadsTable)
    .values(thread)
    .onConflictDoUpdate({
      target: [emailThreadsTable.emailAccountId, emailThreadsTable.providerThreadId],
      set: {
        subject: thread.subject,
        participantEmails: thread.participantEmails,
        lastMessageAt: thread.lastMessageAt,
        messageCount: thread.messageCount,
        updatedAt: new Date(),
      },
    })
    .returning();
  return row;
}

export async function assignThreadToProject(
  companyId: number,
  threadId: number,
  projectId: number | null,
): Promise<EmailThread | null> {
  const [row] = await db
    .update(emailThreadsTable)
    .set({ projectId, updatedAt: new Date() })
    .where(and(eq(emailThreadsTable.companyId, companyId), eq(emailThreadsTable.id, threadId)))
    .returning();
  return row ?? null;
}

export type EmailThreadWithAi = EmailThread & {
  latestAiSummary: string | null;
  latestAiTrade: string | null;
};

export async function listThreadsForProject(
  companyId: number,
  projectId: number,
  opts: { limit?: number; offset?: number } = {},
): Promise<{ data: EmailThreadWithAi[]; total: number }> {
  const where = and(eq(emailThreadsTable.companyId, companyId), eq(emailThreadsTable.projectId, projectId));
  const [threads, [{ total }]] = await Promise.all([
    db
      .select()
      .from(emailThreadsTable)
      .where(where)
      .orderBy(desc(emailThreadsTable.lastMessageAt))
      .limit(opts.limit ?? 50)
      .offset(opts.offset ?? 0),
    db.select({ total: sql<number>`count(*)::int` }).from(emailThreadsTable).where(where),
  ]);

  if (threads.length === 0) return { data: [], total };

  // Phase 3: hydrate each thread with its latest message's AI summary/trade
  // (not stored on the thread itself — email_messages is where extraction
  // writes) so CommunicationsTab.tsx has something to render without an N+1.
  const latestByThread = await pool.query<{ thread_id: number; ai_summary: string | null; ai_trade: string | null }>(
    `SELECT DISTINCT ON (thread_id) thread_id, ai_summary, ai_trade
     FROM email_messages
     WHERE thread_id = ANY($1::int[])
     ORDER BY thread_id, sent_at DESC`,
    [threads.map((t) => t.id)],
  );
  const aiByThreadId = new Map(latestByThread.rows.map((r) => [r.thread_id, r]));

  const data = threads.map((t) => ({
    ...t,
    latestAiSummary: aiByThreadId.get(t.id)?.ai_summary ?? null,
    latestAiTrade: aiByThreadId.get(t.id)?.ai_trade ?? null,
  }));

  return { data, total };
}

export async function getThread(companyId: number, threadId: number): Promise<EmailThread | null> {
  const [row] = await db
    .select()
    .from(emailThreadsTable)
    .where(and(eq(emailThreadsTable.companyId, companyId), eq(emailThreadsTable.id, threadId)));
  return row ?? null;
}

// ── Uncategorized Emails inbox (Phase 2) ──────────────────────────────────────

const INBOX_STATUSES: EmailThread["triageStatus"][] = ["unassigned", "suggested"];

export async function listInboxThreads(
  companyId: number,
  opts: {
    status?: EmailThread["triageStatus"][];
    limit?: number;
    offset?: number;
    // Phase 4 mobile "Suggested Matches" tab — scopes the global uncategorized
    // inbox down to threads the matching engine already suggested for one
    // specific project, rather than a new endpoint.
    suggestedProjectId?: number;
  } = {},
): Promise<{ data: EmailThread[]; total: number }> {
  const statuses = opts.status?.length ? opts.status : INBOX_STATUSES;
  const where = and(
    eq(emailThreadsTable.companyId, companyId),
    inArray(emailThreadsTable.triageStatus, statuses),
    opts.suggestedProjectId != null ? eq(emailThreadsTable.suggestedProjectId, opts.suggestedProjectId) : undefined,
  );
  const [data, [{ total }]] = await Promise.all([
    db
      .select()
      .from(emailThreadsTable)
      .where(where)
      .orderBy(desc(emailThreadsTable.lastMessageAt))
      .limit(opts.limit ?? 50)
      .offset(opts.offset ?? 0),
    db.select({ total: sql<number>`count(*)::int` }).from(emailThreadsTable).where(where),
  ]);
  return { data, total };
}

/** Persists the matching engine's / a filing rule's triage decision for a thread. */
export async function applyThreadMatch(
  companyId: number,
  threadId: number,
  patch: {
    triageStatus: EmailThread["triageStatus"];
    suggestedProjectId: number | null;
    matchConfidence: number | null;
    matchReasons: MatchReason[] | null;
    matchSource: EmailThread["matchSource"];
  },
): Promise<EmailThread | null> {
  const [row] = await db
    .update(emailThreadsTable)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(emailThreadsTable.companyId, companyId), eq(emailThreadsTable.id, threadId)))
    .returning();
  return row ?? null;
}

export async function archiveThread(companyId: number, threadId: number): Promise<EmailThread | null> {
  const [row] = await db
    .update(emailThreadsTable)
    .set({ triageStatus: "archived", updatedAt: new Date() })
    .where(and(eq(emailThreadsTable.companyId, companyId), eq(emailThreadsTable.id, threadId)))
    .returning();
  return row ?? null;
}

export async function ignoreThread(companyId: number, threadId: number): Promise<EmailThread | null> {
  const [row] = await db
    .update(emailThreadsTable)
    .set({ triageStatus: "ignored", updatedAt: new Date() })
    .where(and(eq(emailThreadsTable.companyId, companyId), eq(emailThreadsTable.id, threadId)))
    .returning();
  return row ?? null;
}

export async function updateThreadFlags(
  companyId: number,
  threadId: number,
  patch: { flagged?: boolean; priority?: EmailThread["priority"]; category?: string | null },
): Promise<EmailThread | null> {
  const [row] = await db
    .update(emailThreadsTable)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(emailThreadsTable.companyId, companyId), eq(emailThreadsTable.id, threadId)))
    .returning();
  return row ?? null;
}

/**
 * Combines two threads that turned out to be the same real conversation
 * (e.g. a forwarded copy landed as a separate provider thread): moves all of
 * the source thread's messages onto the target, recomputes the target's
 * rollups, and marks the source as merged rather than deleting it (so a
 * provider thread id already seen never gets re-created from scratch).
 */
export async function mergeThreads(
  companyId: number,
  sourceThreadId: number,
  targetThreadId: number,
): Promise<EmailThread | null> {
  return db.transaction(async (tx) => {
    const [source] = await tx
      .select()
      .from(emailThreadsTable)
      .where(and(eq(emailThreadsTable.companyId, companyId), eq(emailThreadsTable.id, sourceThreadId)));
    const [target] = await tx
      .select()
      .from(emailThreadsTable)
      .where(and(eq(emailThreadsTable.companyId, companyId), eq(emailThreadsTable.id, targetThreadId)));
    if (!source || !target) return null;

    await tx
      .update(emailMessagesTable)
      .set({ threadId: targetThreadId })
      .where(and(eq(emailMessagesTable.companyId, companyId), eq(emailMessagesTable.threadId, sourceThreadId)));

    const [{ count, lastAt }] = await tx
      .select({
        count: sql<number>`count(*)::int`,
        lastAt: sql<Date>`max(${emailMessagesTable.sentAt})`,
      })
      .from(emailMessagesTable)
      .where(eq(emailMessagesTable.threadId, targetThreadId));

    const [updatedTarget] = await tx
      .update(emailThreadsTable)
      .set({ messageCount: count, lastMessageAt: lastAt, updatedAt: new Date() })
      .where(eq(emailThreadsTable.id, targetThreadId))
      .returning();

    await tx
      .update(emailThreadsTable)
      .set({ triageStatus: "merged", mergedIntoThreadId: targetThreadId, updatedAt: new Date() })
      .where(eq(emailThreadsTable.id, sourceThreadId));

    return updatedTarget ?? null;
  });
}

// ── Messages ─────────────────────────────────────────────────────────────────

/** Idempotent create — dedupes on (emailAccountId, providerMessageId) since polling
 * windows overlap by design (delta/history cursors can replay a message once). */
export async function upsertMessage(message: InsertEmailMessage): Promise<EmailMessage> {
  const [existing] = await db
    .select({ id: emailMessagesTable.id })
    .from(emailMessagesTable)
    .where(
      and(
        eq(emailMessagesTable.emailAccountId, message.emailAccountId),
        eq(emailMessagesTable.providerMessageId, message.providerMessageId),
      ),
    );
  if (existing) {
    const [row] = await db
      .select()
      .from(emailMessagesTable)
      .where(eq(emailMessagesTable.id, existing.id));
    return row;
  }

  const [row] = await db
    .insert(emailMessagesTable)
    .values(message)
    .onConflictDoNothing({
      target: [emailMessagesTable.emailAccountId, emailMessagesTable.providerMessageId],
    })
    .returning();
  if (row) return row;

  // Lost the race against a concurrent insert of the same message — re-select.
  const [fallback] = await db
    .select()
    .from(emailMessagesTable)
    .where(
      and(
        eq(emailMessagesTable.emailAccountId, message.emailAccountId),
        eq(emailMessagesTable.providerMessageId, message.providerMessageId),
      ),
    );
  return fallback;
}

export async function listMessagesForThread(
  companyId: number,
  threadId: number,
): Promise<EmailMessage[]> {
  return db
    .select()
    .from(emailMessagesTable)
    .where(and(eq(emailMessagesTable.companyId, companyId), eq(emailMessagesTable.threadId, threadId)))
    .orderBy(emailMessagesTable.sentAt);
}

// ── AI intelligence (Phase 3) ─────────────────────────────────────────────────

const MAX_AI_EXTRACTION_ATTEMPTS = 3;

/** Work queue for the extraction cron job — never-processed or not-yet-exhausted messages. */
export async function getMessagesDueForAiExtraction(limit: number): Promise<EmailMessage[]> {
  return db
    .select()
    .from(emailMessagesTable)
    .where(
      and(
        isNull(emailMessagesTable.aiExtractedAt),
        lt(emailMessagesTable.aiExtractionAttempts, MAX_AI_EXTRACTION_ATTEMPTS),
      ),
    )
    .orderBy(emailMessagesTable.createdAt)
    .limit(limit);
}

export async function saveMessageIntelligence(
  messageId: number,
  patch: {
    aiTrade?: EmailMessage["aiTrade"];
    aiSummary?: string;
    aiEntities?: EmailAiEntities;
    aiExtractedAt?: Date;
    aiExtractionAttempts?: number;
    aiExtractionError?: string | null;
  },
): Promise<void> {
  await db.update(emailMessagesTable).set(patch).where(eq(emailMessagesTable.id, messageId));
}

// ── Attachments ──────────────────────────────────────────────────────────────

export async function insertAttachment(attachment: InsertEmailAttachment): Promise<EmailAttachment> {
  const [row] = await db.insert(emailAttachmentsTable).values(attachment).returning();
  return row;
}

export async function listAttachmentsForMessage(
  companyId: number,
  messageId: number,
): Promise<EmailAttachment[]> {
  return db
    .select()
    .from(emailAttachmentsTable)
    .where(and(eq(emailAttachmentsTable.companyId, companyId), eq(emailAttachmentsTable.messageId, messageId)));
}

export async function getAttachment(
  companyId: number,
  attachmentId: number,
): Promise<EmailAttachment | null> {
  const [row] = await db
    .select()
    .from(emailAttachmentsTable)
    .where(and(eq(emailAttachmentsTable.companyId, companyId), eq(emailAttachmentsTable.id, attachmentId)));
  return row ?? null;
}

/**
 * Upgrades any still-generic-category attachments on this message using its
 * just-extracted aiEntities (Phase 4) — see attachmentClassifier.ts. Called
 * right after saveMessageIntelligence() persists a message's extraction.
 */
export async function reclassifyAttachmentsForMessage(
  messageId: number,
  entities: EmailAiEntities,
): Promise<void> {
  const attachments = await db
    .select()
    .from(emailAttachmentsTable)
    .where(eq(emailAttachmentsTable.messageId, messageId));
  if (attachments.length === 0) return;

  for (const att of attachments) {
    const upgrade = reclassifyFromEntities({ currentCategory: att.category, entities });
    if (!upgrade) continue;
    await db
      .update(emailAttachmentsTable)
      .set({ category: upgrade.category, categorySource: upgrade.categorySource })
      .where(eq(emailAttachmentsTable.id, att.id));
  }
}

export interface ProjectAttachment extends EmailAttachment {
  threadId: number;
  documentId: number | null;
}

/** Attachments across every thread assigned to a project, with promotion status (Phase 4). */
export async function listAttachmentsForProject(
  companyId: number,
  projectId: number,
  opts: { limit?: number; offset?: number } = {},
): Promise<{ data: ProjectAttachment[]; total: number }> {
  const params: unknown[] = [companyId, projectId];
  const result = await pool.query<{
    id: number; company_id: number; message_id: number; filename: string;
    content_type: string | null; size_bytes: number | null; object_path: string;
    category: string | null; category_source: string | null; created_at: Date;
    thread_id: number; document_id: number | null;
  }>(
    `SELECT a.*, m.thread_id, pd.id AS document_id
     FROM email_attachments a
     JOIN email_messages m ON m.id = a.message_id
     JOIN email_threads t ON t.id = m.thread_id
     LEFT JOIN project_documents pd ON pd.source_email_attachment_id = a.id
     WHERE a.company_id = $1 AND t.project_id = $2
     ORDER BY a.created_at DESC
     LIMIT ${opts.limit ?? 50} OFFSET ${opts.offset ?? 0}`,
    params,
  );
  const [{ total }] = (
    await pool.query<{ total: number }>(
      `SELECT count(*)::int AS total
       FROM email_attachments a
       JOIN email_messages m ON m.id = a.message_id
       JOIN email_threads t ON t.id = m.thread_id
       WHERE a.company_id = $1 AND t.project_id = $2`,
      params,
    )
  ).rows;

  const data: ProjectAttachment[] = result.rows.map((r) => ({
    id: r.id,
    companyId: r.company_id,
    messageId: r.message_id,
    filename: r.filename,
    contentType: r.content_type,
    sizeBytes: r.size_bytes,
    objectPath: r.object_path,
    category: r.category as EmailAttachment["category"],
    categorySource: r.category_source as EmailAttachment["categorySource"],
    createdAt: r.created_at,
    threadId: r.thread_id,
    documentId: r.document_id,
  }));
  return { data, total };
}

/**
 * Promotes every not-yet-promoted attachment on a thread's messages into the
 * project's document library (Phase 4) — reuses the existing GCS objectPath,
 * no re-upload. Left as `status: "pending"` (no auto-triggered analysis) so
 * AI-analysis cost stays opt-in, same as any manual upload.
 */
export async function promoteThreadAttachmentsToDocuments(
  companyId: number,
  threadId: number,
  projectId: number,
): Promise<number> {
  const result = await pool.query<{
    id: number; filename: string; content_type: string | null; size_bytes: number | null; object_path: string;
  }>(
    `SELECT a.id, a.filename, a.content_type, a.size_bytes, a.object_path
     FROM email_attachments a
     JOIN email_messages m ON m.id = a.message_id
     LEFT JOIN project_documents pd ON pd.source_email_attachment_id = a.id
     WHERE m.thread_id = $1 AND a.company_id = $2 AND pd.id IS NULL`,
    [threadId, companyId],
  );
  if (result.rows.length === 0) return 0;

  for (const att of result.rows) {
    await pool.query(
      `INSERT INTO project_documents
         (company_id, project_id, uploaded_by_user_id, filename, file_type, object_path, file_size, status, source_email_attachment_id)
       VALUES ($1, $2, NULL, $3, $4, $5, $6, 'pending', $7)`,
      [companyId, projectId, att.filename, att.content_type, att.object_path, att.size_bytes, att.id],
    );
  }
  return result.rows.length;
}

// ── Search (FTS against the indexed generated tsvector column) ───────────────

export interface EmailSearchResult {
  id: number;
  thread_id: number;
  subject: string | null;
  from_email: string | null;
  from_name: string | null;
  sent_at: Date;
  rank: number;
}

/**
 * Keyword search via websearch_to_tsquery against the indexed search_vector
 * column (GIN-indexed, computed at write time) — unlike documents.ts's FTS
 * helpers, which compute to_tsvector() per-row at query time; that pattern
 * doesn't scale to a table the size email_messages can grow to.
 */
export async function searchEmails(
  companyId: number,
  projectId: number | null,
  query: string,
  limit: number,
): Promise<EmailSearchResult[]> {
  const params: unknown[] = [query, companyId];
  let projectFilter = "";
  if (projectId != null) {
    params.push(projectId);
    projectFilter = `AND t.project_id = $${params.length}`;
  }
  params.push(limit);

  const result = await pool.query<EmailSearchResult>(
    `SELECT m.id, m.thread_id, m.subject, m.from_email, m.from_name, m.sent_at,
       ts_rank(m.search_vector, websearch_to_tsquery('english', $1))::float AS rank
     FROM email_messages m
     JOIN email_threads t ON t.id = m.thread_id
     WHERE m.company_id = $2
       ${projectFilter}
       AND m.search_vector @@ websearch_to_tsquery('english', $1)
     ORDER BY rank DESC, m.sent_at DESC
     LIMIT $${params.length}`,
    params,
  );
  return result.rows;
}

export interface StructuredEmailSearchResult {
  id: number;
  thread_id: number;
  subject: string | null;
  from_email: string | null;
  from_name: string | null;
  sent_at: Date;
  project_id: number | null;
}

// Prefers the persisted category column (set at ingest — see
// attachmentClassifier.ts) with the old ILIKE/content-type heuristic as a
// fallback for any row where category is still NULL (e.g. a row synced before
// Phase 4 that a backfill missed) — so old and new data both search correctly.
const ATTACHMENT_TYPE_HEURISTIC_SQL: Record<string, string> = {
  pdf: `(a.content_type = 'application/pdf' OR a.filename ILIKE '%.pdf')`,
  word: `(a.content_type IN ('application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document') OR a.filename ILIKE '%.doc' OR a.filename ILIKE '%.docx')`,
  excel: `(a.content_type IN ('application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') OR a.filename ILIKE '%.xls' OR a.filename ILIKE '%.xlsx')`,
  image: `(a.content_type ILIKE 'image/%')`,
  cad: `(a.filename ILIKE '%.dwg' OR a.filename ILIKE '%.dxf' OR a.content_type ILIKE '%dwg%')`,
  blueprint: `(a.filename ILIKE '%blueprint%' OR a.filename ILIKE '%plan%')`,
  quote: `false`,
  invoice: `false`,
  inspection_report: `false`,
  permit: `false`,
  other: `false`,
};

function attachmentTypeSql(type: string, p: (v: unknown) => string): string {
  const heuristic = ATTACHMENT_TYPE_HEURISTIC_SQL[type] ?? "false";
  return `(a.category = ${p(type)} OR (a.category IS NULL AND ${heuristic}))`;
}

/**
 * Advanced Search Builder v2 (Phase 4) — translates a one-level-deep
 * field/operator/value condition tree (mirrors email_filing_rules' condition
 * shape for UI consistency — see ConditionBuilder.tsx) into a parenthesized
 * boolean SQL expression. All values are bound via the shared `p()`
 * parameterizer — never interpolated directly — since these values originate
 * from an end-user-authored search, unlike the fixed lookup-table keys used
 * elsewhere in this file.
 */
function conditionToSql(cond: SearchCondition, p: (v: unknown) => string): string {
  const v = cond.value ?? "";
  const like = (col: string, negate = false) =>
    cond.operator === "starts_with"
      ? `${col} ${negate ? "NOT ILIKE" : "ILIKE"} ${p(`${v}%`)}`
      : `${col} ${negate ? "NOT ILIKE" : "ILIKE"} ${p(`%${v}%`)}`;

  switch (cond.field) {
    case "subject":
      return cond.operator === "equals" ? `m.subject = ${p(v)}` : like("m.subject", cond.operator === "not_contains");
    case "from_email":
      return cond.operator === "equals" ? `m.from_email = ${p(v)}` : like("m.from_email", cond.operator === "not_contains");
    case "from_name":
      return cond.operator === "equals" ? `m.from_name = ${p(v)}` : like("m.from_name", cond.operator === "not_contains");
    case "body_text":
      return like("m.body_text", cond.operator === "not_contains");
    case "to_emails":
      return `EXISTS (SELECT 1 FROM unnest(m.to_emails) e WHERE e ILIKE ${p(`%${v}%`)})`;
    case "cc_emails":
      return `EXISTS (SELECT 1 FROM unnest(m.cc_emails) e WHERE e ILIKE ${p(`%${v}%`)})`;
    case "thread_category":
      return cond.operator === "equals" ? `t.category = ${p(v)}` : like("t.category", cond.operator === "not_contains");
    case "priority":
      return `t.priority = ${p(v)}`;
    case "flagged":
      return cond.operator === "is_false" ? `t.flagged = false` : `t.flagged = true`;
    case "project_number":
      return like("pr.project_number");
    case "date_sent":
      return cond.operator === "after" ? `m.sent_at >= ${p(new Date(v))}` : `m.sent_at <= ${p(new Date(v))}`;
    case "attachment_type":
      return `EXISTS (SELECT 1 FROM email_attachments a WHERE a.message_id = m.id AND ${attachmentTypeSql(v, p)})`;
    default:
      return "true";
  }
}

function buildConditionTreeSql(
  group: SearchConditionGroup,
  p: (v: unknown) => string,
): string {
  if (group.conditions.length === 0) return "true";
  const parts = group.conditions.map((item) =>
    "logic" in item ? buildLeafGroupSql(item, p) : conditionToSql(item, p),
  );
  return `(${parts.join(` ${group.logic} `)})`;
}

function buildLeafGroupSql(group: SearchConditionLeafGroup, p: (v: unknown) => string): string {
  if (group.conditions.length === 0) return "true";
  const parts = group.conditions.map((c) => conditionToSql(c, p));
  return `(${parts.join(` ${group.logic} `)})`;
}

/**
 * Structured Search Builder query — widens searchEmails() with the full set
 * of criteria the mobile Search Builder screen exposes (sender/recipient,
 * date range, attachment type, priority/flagged/conversation, project
 * number). Company-wide (no project scoping required), unlike searchEmails()
 * which is used by the existing project-scoped search endpoint.
 */
export async function searchEmailsStructured(
  companyId: number,
  criteria: CommunicationSearchCriteria,
  limit: number,
): Promise<StructuredEmailSearchResult[]> {
  const clauses: string[] = [`m.company_id = $1`];
  const params: unknown[] = [companyId];
  const p = (v: unknown) => {
    params.push(v);
    return `$${params.length}`;
  };

  if (criteria.keywords?.trim()) {
    clauses.push(`m.search_vector @@ websearch_to_tsquery('english', ${p(criteria.keywords.trim())})`);
  }
  if (criteria.subject?.trim()) {
    clauses.push(`m.subject ILIKE ${p(`%${criteria.subject.trim()}%`)}`);
  }
  if (criteria.sender?.trim()) {
    const v = `%${criteria.sender.trim()}%`;
    clauses.push(`(m.from_email ILIKE ${p(v)} OR m.from_name ILIKE ${p(v)})`);
  }
  if (criteria.recipient?.trim()) {
    const v = `%${criteria.recipient.trim()}%`;
    clauses.push(
      `(EXISTS (SELECT 1 FROM unnest(m.to_emails) e WHERE e ILIKE ${p(v)}) OR EXISTS (SELECT 1 FROM unnest(m.cc_emails) e WHERE e ILIKE ${p(v)}))`,
    );
  }
  if (criteria.client?.trim()) {
    const v = `%${criteria.client.trim()}%`;
    clauses.push(`(m.from_email ILIKE ${p(v)} OR m.from_name ILIKE ${p(v)})`);
  }
  if (criteria.vendor?.trim()) {
    const v = `%${criteria.vendor.trim()}%`;
    clauses.push(`(m.from_email ILIKE ${p(v)} OR m.from_name ILIKE ${p(v)})`);
  }
  if (criteria.address?.trim()) {
    const v = `%${criteria.address.trim()}%`;
    clauses.push(`(m.subject ILIKE ${p(v)} OR m.body_text ILIKE ${p(v)})`);
  }
  if (criteria.projectNumber?.trim()) {
    clauses.push(`pr.project_number ILIKE ${p(`%${criteria.projectNumber.trim()}%`)}`);
  }
  if (criteria.dateFrom) clauses.push(`m.sent_at >= ${p(new Date(criteria.dateFrom))}`);
  if (criteria.dateTo) clauses.push(`m.sent_at <= ${p(new Date(criteria.dateTo))}`);
  if (criteria.priority) clauses.push(`t.priority = ${p(criteria.priority)}`);
  if (criteria.flagged != null) clauses.push(`t.flagged = ${p(criteria.flagged)}`);
  if (criteria.hasConversation) clauses.push(`t.message_count > 1`);
  if (criteria.projectId != null) clauses.push(`t.project_id = ${p(criteria.projectId)}`);
  if (criteria.attachmentTypes?.length) {
    const typeSql = criteria.attachmentTypes.map((t) => attachmentTypeSql(t, p)).join(" OR ");
    clauses.push(`EXISTS (SELECT 1 FROM email_attachments a WHERE a.message_id = m.id AND (${typeSql}))`);
  }
  if (criteria.conditionTree) {
    clauses.push(buildConditionTreeSql(criteria.conditionTree, p));
  }

  const limitPlaceholder = p(limit);
  const result = await pool.query<StructuredEmailSearchResult>(
    `SELECT m.id, m.thread_id, m.subject, m.from_email, m.from_name, m.sent_at, t.project_id
     FROM email_messages m
     JOIN email_threads t ON t.id = m.thread_id
     LEFT JOIN projects pr ON pr.id = t.project_id
     WHERE ${clauses.join(" AND ")}
     ORDER BY m.sent_at DESC
     LIMIT ${limitPlaceholder}`,
    params,
  );
  return result.rows;
}

export type AiSearchEntityType =
  | "permit"
  | "invoice"
  | "quote"
  | "po"
  | "changeOrder"
  | "inspection"
  | "risk"
  | "deadline"
  | "actionItem";

const ENTITY_TYPE_SQL: Record<AiSearchEntityType, string> = {
  permit: `jsonb_array_length(coalesce(m.ai_entities->'permitNumbers', '[]'::jsonb)) > 0`,
  invoice: `jsonb_array_length(coalesce(m.ai_entities->'invoiceNumbers', '[]'::jsonb)) > 0`,
  quote: `jsonb_array_length(coalesce(m.ai_entities->'quoteNumbers', '[]'::jsonb)) > 0`,
  po: `jsonb_array_length(coalesce(m.ai_entities->'poNumbers', '[]'::jsonb)) > 0`,
  changeOrder: `jsonb_array_length(coalesce(m.ai_entities->'changeOrderMentions', '[]'::jsonb)) > 0`,
  inspection: `coalesce((m.ai_entities->>'inspectionMentioned')::boolean, false) = true`,
  risk: `jsonb_array_length(coalesce(m.ai_entities->'risks', '[]'::jsonb)) > 0`,
  deadline: `jsonb_array_length(coalesce(m.ai_entities->'deadlines', '[]'::jsonb)) > 0`,
  actionItem: `jsonb_array_length(coalesce(m.ai_entities->'actionItems', '[]'::jsonb)) > 0`,
};

export interface AiSearchResult extends StructuredEmailSearchResult {
  ai_summary: string | null;
  ai_trade: string | null;
}

export interface AiSearchFilters {
  trade?: string;
  entityType?: AiSearchEntityType;
  dateFrom?: string;
  dateTo?: string;
  keywords?: string;
}

/**
 * Retrieval half of the Natural Language Search flow (Phase 3) —
 * routes/communicationsAiSearch.ts parses the free-text query into these
 * filters via an LLM call first, then this runs a plain structured+FTS query
 * (no embeddings/vector search — emails are short and now entity-tagged, so
 * this maps cleanly onto every example query in the spec without a new
 * chunking/embeddings pipeline).
 */
export async function searchEmailsByIntelligence(
  companyId: number,
  filters: AiSearchFilters,
  limit: number,
): Promise<AiSearchResult[]> {
  const clauses: string[] = [`m.company_id = $1`];
  const params: unknown[] = [companyId];
  const p = (v: unknown) => {
    params.push(v);
    return `$${params.length}`;
  };

  if (filters.trade) clauses.push(`m.ai_trade = ${p(filters.trade)}`);
  if (filters.entityType) clauses.push(ENTITY_TYPE_SQL[filters.entityType]);
  if (filters.dateFrom) clauses.push(`m.sent_at >= ${p(new Date(filters.dateFrom))}`);
  if (filters.dateTo) clauses.push(`m.sent_at <= ${p(new Date(filters.dateTo))}`);
  if (filters.keywords?.trim()) {
    clauses.push(`m.search_vector @@ websearch_to_tsquery('english', ${p(filters.keywords.trim())})`);
  }

  const limitPlaceholder = p(limit);
  const result = await pool.query<AiSearchResult>(
    `SELECT m.id, m.thread_id, m.subject, m.from_email, m.from_name, m.sent_at, t.project_id,
            m.ai_summary, m.ai_trade
     FROM email_messages m
     JOIN email_threads t ON t.id = m.thread_id
     WHERE ${clauses.join(" AND ")}
     ORDER BY m.sent_at DESC
     LIMIT ${limitPlaceholder}`,
    params,
  );
  return result.rows;
}

// ── Automatic filing rules (Phase 2) ──────────────────────────────────────────

export async function listFilingRules(companyId: number): Promise<EmailFilingRule[]> {
  return db
    .select()
    .from(emailFilingRulesTable)
    .where(eq(emailFilingRulesTable.companyId, companyId))
    .orderBy(asc(emailFilingRulesTable.priority));
}

export async function createFilingRule(rule: InsertEmailFilingRule): Promise<EmailFilingRule> {
  const [row] = await db.insert(emailFilingRulesTable).values(rule).returning();
  return row;
}

export async function updateFilingRule(
  companyId: number,
  ruleId: number,
  patch: Partial<InsertEmailFilingRule>,
): Promise<EmailFilingRule | null> {
  const [row] = await db
    .update(emailFilingRulesTable)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(emailFilingRulesTable.companyId, companyId), eq(emailFilingRulesTable.id, ruleId)))
    .returning();
  return row ?? null;
}

export async function deleteFilingRule(companyId: number, ruleId: number): Promise<boolean> {
  const [row] = await db
    .delete(emailFilingRulesTable)
    .where(and(eq(emailFilingRulesTable.companyId, companyId), eq(emailFilingRulesTable.id, ruleId)))
    .returning({ id: emailFilingRulesTable.id });
  return !!row;
}

// ── Saved search templates (Phase 2) ──────────────────────────────────────────

export async function listSearchTemplates(companyId: number): Promise<CommunicationSearchTemplate[]> {
  return db
    .select()
    .from(communicationSearchTemplatesTable)
    .where(eq(communicationSearchTemplatesTable.companyId, companyId))
    .orderBy(asc(communicationSearchTemplatesTable.name));
}

export async function createSearchTemplate(
  template: InsertCommunicationSearchTemplate,
): Promise<CommunicationSearchTemplate> {
  const [row] = await db
    .insert(communicationSearchTemplatesTable)
    .values(template)
    .onConflictDoUpdate({
      target: [communicationSearchTemplatesTable.companyId, communicationSearchTemplatesTable.name],
      set: { criteria: template.criteria, updatedAt: new Date() },
    })
    .returning();
  return row;
}

export async function deleteSearchTemplate(companyId: number, templateId: number): Promise<boolean> {
  const [row] = await db
    .delete(communicationSearchTemplatesTable)
    .where(and(eq(communicationSearchTemplatesTable.companyId, companyId), eq(communicationSearchTemplatesTable.id, templateId)))
    .returning({ id: communicationSearchTemplatesTable.id });
  return !!row;
}

// ── AI Timeline (Phase 4) ──────────────────────────────────────────────────────

export interface TimelineEventInput {
  eventType: CommunicationTimelineEvent["eventType"];
  eventDate: Date | null;
  description: string;
  confidence: number | null;
}

/**
 * Replaces every timeline event derived from this message (transactional
 * delete-then-insert, not a fine-grained diff) — simple and correct even
 * when a message is re-extracted on retry and the LLM refines a date or
 * description the second time around.
 */
export async function saveMessageTimelineEvents(
  companyId: number,
  threadId: number,
  messageId: number,
  projectId: number | null,
  events: TimelineEventInput[],
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(communicationTimelineEventsTable).where(eq(communicationTimelineEventsTable.messageId, messageId));
    if (events.length === 0) return;
    await tx.insert(communicationTimelineEventsTable).values(
      events.map((e) => ({
        companyId,
        projectId,
        threadId,
        messageId,
        eventType: e.eventType,
        eventDate: e.eventDate,
        description: e.description,
        confidence: e.confidence,
      })),
    );
  });
}

/**
 * Called from threadAssignmentHooks.ts when a thread is assigned to a project
 * after its messages already went through AI extraction — fills in the
 * projectId on any orphaned (projectId IS NULL) timeline events for that
 * thread, rather than waiting for the next extraction pass to fix it up.
 */
export async function backfillTimelineEventsProjectId(
  companyId: number,
  threadId: number,
  projectId: number,
): Promise<void> {
  await db
    .update(communicationTimelineEventsTable)
    .set({ projectId })
    .where(
      and(
        eq(communicationTimelineEventsTable.companyId, companyId),
        eq(communicationTimelineEventsTable.threadId, threadId),
        isNull(communicationTimelineEventsTable.projectId),
      ),
    );
}

export interface MessageSummary {
  id: number;
  thread_id: number;
  subject: string | null;
  from_email: string | null;
  from_name: string | null;
  sent_at: Date;
  ai_summary: string;
  ai_trade: string | null;
}

/** AI summaries feed for a project's Communications Hub (Phase 4 mobile "AI Summaries" tab). */
export async function listMessageSummariesForProject(
  companyId: number,
  projectId: number,
  opts: { limit?: number; offset?: number } = {},
): Promise<{ data: MessageSummary[]; total: number }> {
  const params = [companyId, projectId];
  const [dataResult, totalResult] = await Promise.all([
    pool.query<MessageSummary>(
      `SELECT m.id, m.thread_id, m.subject, m.from_email, m.from_name, m.sent_at, m.ai_summary, m.ai_trade
       FROM email_messages m
       JOIN email_threads t ON t.id = m.thread_id
       WHERE m.company_id = $1 AND t.project_id = $2 AND m.ai_summary IS NOT NULL
       ORDER BY m.sent_at DESC
       LIMIT ${opts.limit ?? 50} OFFSET ${opts.offset ?? 0}`,
      params,
    ),
    pool.query<{ total: number }>(
      `SELECT count(*)::int AS total
       FROM email_messages m
       JOIN email_threads t ON t.id = m.thread_id
       WHERE m.company_id = $1 AND t.project_id = $2 AND m.ai_summary IS NOT NULL`,
      params,
    ),
  ]);
  return { data: dataResult.rows, total: totalResult.rows[0].total };
}

export async function listTimelineEventsForProject(
  companyId: number,
  projectId: number,
  opts: { limit?: number; offset?: number; eventType?: CommunicationTimelineEvent["eventType"] } = {},
): Promise<{ data: CommunicationTimelineEvent[]; total: number }> {
  const where = and(
    eq(communicationTimelineEventsTable.companyId, companyId),
    eq(communicationTimelineEventsTable.projectId, projectId),
    opts.eventType ? eq(communicationTimelineEventsTable.eventType, opts.eventType) : undefined,
  );
  const [data, [{ total }]] = await Promise.all([
    db
      .select()
      .from(communicationTimelineEventsTable)
      .where(where)
      .orderBy(desc(communicationTimelineEventsTable.eventDate), desc(communicationTimelineEventsTable.createdAt))
      .limit(opts.limit ?? 50)
      .offset(opts.offset ?? 0),
    db.select({ total: sql<number>`count(*)::int` }).from(communicationTimelineEventsTable).where(where),
  ]);
  return { data, total };
}
