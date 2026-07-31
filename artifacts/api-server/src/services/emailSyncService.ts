import axios from "axios";
import { google } from "googleapis";
import { OAuth2Client } from "google-auth-library";
import sanitizeHtml from "sanitize-html";
import type { EmailAccount, EmailThread } from "@workspace/db";
import { getValidToken } from "./emailOAuthService";
import {
  upsertThread,
  upsertMessage,
  insertAttachment,
  recordSyncResult,
  getThread,
  listMessagesForThread,
  assignThreadToProject,
  applyThreadMatch,
  updateThreadFlags,
} from "../repositories/emailIntegrations";
import { evaluateRules } from "./emailFilingRulesService";
import { scoreProjectsForThread, decideTriage } from "./projectMatchingService";
import { ObjectStorageService } from "../lib/objectStorage";
import { logger } from "../lib/logger";

/**
 * Polling-based sync engine for the two Project Communications Hub providers.
 * Phase 1 has no webhooks (matches existing infra — cron.ts polling is the
 * established pattern, see the EMAIL_SYNC job).
 *
 * Phase 2: every thread that's still `unassigned`/`suggested` gets re-run
 * through triageThread() below after each of its messages is upserted —
 * filing rules first (an explicit admin-authored match wins outright), then
 * the deterministic matching engine as a fallback. Re-running on every sync
 * (rather than only on first insert) means a later message that reveals a PO
 * number can upgrade an initially weak match.
 */

const TRIAGEABLE_STATUSES: EmailThread["triageStatus"][] = ["unassigned", "suggested"];

/**
 * Exported so emailIntelligenceService.ts's extraction cron job can re-run
 * the same rules+engine triage path after newly extracted entities land on a
 * still-undecided thread's messages (Phase 3) — no duplicated orchestration.
 */
export async function triageThread(companyId: number, threadId: number): Promise<void> {
  const thread = await getThread(companyId, threadId);
  if (!thread || !TRIAGEABLE_STATUSES.includes(thread.triageStatus)) return;

  const messages = await listMessagesForThread(companyId, threadId);
  const latest = messages[messages.length - 1];
  if (!latest) return;

  const ruleActions = await evaluateRules(companyId, latest);
  const moveAction = ruleActions.find(
    (a): a is { type: "move_to_project"; projectId: number } => a.type === "move_to_project",
  );
  const categoryAction = ruleActions.find(
    (a): a is { type: "assign_category"; category: string } => a.type === "assign_category",
  );

  if (categoryAction) {
    await updateThreadFlags(companyId, threadId, { category: categoryAction.category });
  }

  if (moveAction) {
    await assignThreadToProject(companyId, threadId, moveAction.projectId);
    await applyThreadMatch(companyId, threadId, {
      triageStatus: "assigned",
      suggestedProjectId: moveAction.projectId,
      matchConfidence: 100,
      matchReasons: [{ signal: "filing_rule", value: "matched an automatic filing rule", points: 100 }],
      matchSource: "rule",
    });
    return;
  }

  const bodyText = messages.map((m) => m.bodyText ?? "").join(" \n ");
  const aiMentions = messages.flatMap((m) =>
    m.aiEntities
      ? [...m.aiEntities.projectMentions, ...m.aiEntities.clientMentions, ...m.aiEntities.vendorMentions]
      : [],
  );
  const candidates = await scoreProjectsForThread(companyId, {
    subject: thread.subject,
    participantEmails: thread.participantEmails,
    bodyText,
    senderEmail: latest.fromEmail,
    aiMentions,
  });
  const decision = decideTriage(candidates);

  if (decision.triageStatus === "assigned" && decision.projectId != null) {
    await assignThreadToProject(companyId, threadId, decision.projectId);
  }
  await applyThreadMatch(companyId, threadId, {
    triageStatus: decision.triageStatus,
    suggestedProjectId: decision.suggestedProjectId,
    matchConfidence: decision.matchConfidence,
    matchReasons: decision.matchReasons,
    matchSource: decision.matchConfidence != null ? "engine" : null,
  });
}

const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024; // skip larger attachments to bound sync time
const GMAIL_INITIAL_LOOKBACK_DAYS = 90;

const FREQUENCY_MS: Record<EmailAccount["syncFrequency"], number> = {
  "15min": 15 * 60 * 1000,
  hourly: 60 * 60 * 1000,
  daily: 24 * 60 * 60 * 1000,
};

function nextDueAt(frequency: EmailAccount["syncFrequency"]): Date {
  return new Date(Date.now() + (FREQUENCY_MS[frequency] ?? FREQUENCY_MS.hourly));
}

/** Sanitizes untrusted provider HTML before it's ever persisted or rendered. */
function sanitizeBody(html: string | null | undefined): string | null {
  if (!html) return null;
  return sanitizeHtml(html, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(["img"]),
    allowedAttributes: {
      ...sanitizeHtml.defaults.allowedAttributes,
      img: ["src", "alt"],
    },
    allowedSchemes: ["http", "https", "mailto"],
  });
}

interface SyncOutcome {
  synced: number;
  deltaCursor: string | null;
}

export interface SyncResult {
  synced: number;
  error?: string;
}

export async function syncEmailAccount(account: EmailAccount): Promise<SyncResult> {
  try {
    const valid = await getValidToken(account);
    const objectStorage = new ObjectStorageService();
    const outcome =
      valid.provider === "outlook"
        ? await syncOutlookAccount(valid, objectStorage)
        : await syncGmailAccount(valid, objectStorage);

    await recordSyncResult(account.id, {
      status: "active",
      deltaCursor: outcome.deltaCursor,
      lastSyncError: null,
      nextSyncDueAt: nextDueAt(account.syncFrequency),
    });
    return { synced: outcome.synced };
  } catch (err: any) {
    const message = err?.message ?? "sync_failed";
    logger.error({ err, accountId: account.id }, "Email sync failed");
    await recordSyncResult(account.id, {
      lastSyncError: message,
      nextSyncDueAt: nextDueAt(account.syncFrequency),
    });
    return { synced: 0, error: message };
  }
}

async function storeAttachments(
  companyId: number,
  messageId: number,
  objectStorage: ObjectStorageService,
  attachments: Array<{ filename: string; contentType: string | null; base64: string }>,
): Promise<void> {
  for (const att of attachments) {
    const buffer = Buffer.from(att.base64, "base64");
    if (buffer.byteLength > MAX_ATTACHMENT_BYTES) {
      logger.warn({ messageId, filename: att.filename, size: buffer.byteLength }, "Skipping oversized email attachment");
      continue;
    }
    const objectPath = await objectStorage.uploadBuffer(buffer, att.contentType ?? "application/octet-stream");
    await objectStorage.trySetCompanyReadAcl(objectPath, "system", String(companyId));
    await insertAttachment({
      companyId,
      messageId,
      filename: att.filename,
      contentType: att.contentType,
      sizeBytes: buffer.byteLength,
      objectPath,
    });
  }
}

// ── Outlook (Microsoft Graph) ────────────────────────────────────────────────

const OUTLOOK_MESSAGE_SELECT =
  "subject,from,toRecipients,ccRecipients,body,conversationId,sentDateTime,hasAttachments";

async function syncOutlookAccount(
  account: EmailAccount,
  objectStorage: ObjectStorageService,
): Promise<SyncOutcome> {
  const folders = ((account.selectedFolders as string[] | null) ?? ["inbox"]).filter(Boolean);
  // deltaCursor stores one Graph deltaLink per folder as a JSON map, since Graph's
  // delta query is scoped per-folder — there's no single account-wide delta token.
  const cursors: Record<string, string> = account.deltaCursor ? JSON.parse(account.deltaCursor) : {};
  let synced = 0;

  for (const folderId of folders) {
    const { messages, deltaLink } = await deltaSyncOutlookFolder(
      account.accessToken!,
      folderId,
      cursors[folderId],
    );
    if (deltaLink) cursors[folderId] = deltaLink;

    for (const msg of messages) {
      if (msg["@removed"]) continue; // deleted since last sync — nothing to ingest
      const conversationId: string = msg.conversationId ?? msg.id;
      const sentAt = msg.sentDateTime ? new Date(msg.sentDateTime) : new Date();

      const thread = await upsertThread({
        companyId: account.companyId,
        emailAccountId: account.id,
        projectId: null,
        providerThreadId: conversationId,
        subject: msg.subject ?? null,
        participantEmails: extractOutlookParticipants(msg),
        lastMessageAt: sentAt,
        messageCount: 1,
      });

      const bodyHtml = msg.body?.contentType === "html" ? sanitizeBody(msg.body?.content) : null;
      const bodyText = msg.body?.contentType === "text" ? (msg.body?.content ?? null) : null;

      const message = await upsertMessage({
        companyId: account.companyId,
        emailAccountId: account.id,
        threadId: thread.id,
        providerMessageId: msg.id,
        fromEmail: msg.from?.emailAddress?.address ?? null,
        fromName: msg.from?.emailAddress?.name ?? null,
        toEmails: (msg.toRecipients ?? []).map((r: any) => r.emailAddress?.address).filter(Boolean),
        ccEmails: (msg.ccRecipients ?? []).map((r: any) => r.emailAddress?.address).filter(Boolean),
        subject: msg.subject ?? null,
        bodyText,
        bodyHtml,
        hasAttachments: !!msg.hasAttachments,
        sentAt,
      });
      synced++;

      if (msg.hasAttachments) {
        const attachments = await fetchOutlookAttachments(account.accessToken!, msg.id);
        await storeAttachments(account.companyId, message.id, objectStorage, attachments);
      }

      await triageThread(account.companyId, thread.id);
    }
  }

  return { synced, deltaCursor: JSON.stringify(cursors) };
}

async function deltaSyncOutlookFolder(
  accessToken: string,
  folderId: string,
  cursorUrl: string | undefined,
): Promise<{ messages: any[]; deltaLink?: string }> {
  const initialUrl = `https://graph.microsoft.com/v1.0/me/mailFolders/${folderId}/messages/delta?$select=${OUTLOOK_MESSAGE_SELECT}`;
  let url: string | null = cursorUrl || initialUrl;
  const messages: any[] = [];
  let deltaLink: string | undefined;

  while (url) {
    let resp: any;
    try {
      resp = await axios.get(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    } catch (err: any) {
      if (err?.response?.status === 410) {
        // Delta token expired (>~30 days stale or folder changed) — restart with a fresh delta.
        url = initialUrl;
        continue;
      }
      throw err;
    }
    const data = resp.data;
    messages.push(...(data.value ?? []));
    if (data["@odata.nextLink"]) {
      url = data["@odata.nextLink"];
    } else {
      deltaLink = data["@odata.deltaLink"];
      url = null;
    }
  }

  return { messages, deltaLink };
}

function extractOutlookParticipants(msg: any): string[] {
  const addrs = new Set<string>();
  if (msg.from?.emailAddress?.address) addrs.add(msg.from.emailAddress.address);
  for (const r of msg.toRecipients ?? []) if (r.emailAddress?.address) addrs.add(r.emailAddress.address);
  for (const r of msg.ccRecipients ?? []) if (r.emailAddress?.address) addrs.add(r.emailAddress.address);
  return [...addrs];
}

async function fetchOutlookAttachments(
  accessToken: string,
  messageId: string,
): Promise<Array<{ filename: string; contentType: string | null; base64: string }>> {
  const resp = await axios.get(`https://graph.microsoft.com/v1.0/me/messages/${messageId}/attachments`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const items = (resp.data.value ?? []) as any[];
  return items
    .filter((a) => a["@odata.type"] === "#microsoft.graph.fileAttachment" && a.contentBytes)
    .map((a) => ({
      filename: a.name ?? "attachment",
      contentType: a.contentType ?? null,
      base64: a.contentBytes,
    }));
}

// ── Gmail ─────────────────────────────────────────────────────────────────────

function buildGmailClient(accessToken: string) {
  const auth = new OAuth2Client();
  auth.setCredentials({ access_token: accessToken });
  return google.gmail({ version: "v1", auth });
}

async function syncGmailAccount(
  account: EmailAccount,
  objectStorage: ObjectStorageService,
): Promise<SyncOutcome> {
  const gmail = buildGmailClient(account.accessToken!);
  let messageIds: string[] = [];
  let historyId = account.deltaCursor;

  if (!historyId) {
    const afterTs = Math.floor((Date.now() - GMAIL_INITIAL_LOOKBACK_DAYS * 24 * 60 * 60 * 1000) / 1000);
    let pageToken: string | undefined;
    do {
      const listResp = await gmail.users.messages.list({
        userId: "me",
        q: `after:${afterTs}`,
        pageToken,
        maxResults: 100,
      });
      messageIds.push(...(listResp.data.messages ?? []).map((m) => m.id!).filter(Boolean));
      pageToken = listResp.data.nextPageToken ?? undefined;
    } while (pageToken);

    const profile = await gmail.users.getProfile({ userId: "me" });
    historyId = profile.data.historyId ?? null;
  } else {
    try {
      let pageToken: string | undefined;
      let cursor: string = historyId;
      do {
        const histResp = await gmail.users.history.list({
          userId: "me",
          startHistoryId: cursor,
          historyTypes: ["messageAdded"],
          pageToken,
        });
        for (const h of histResp.data.history ?? []) {
          for (const added of h.messagesAdded ?? []) {
            if (added.message?.id) messageIds.push(added.message.id);
          }
        }
        pageToken = histResp.data.nextPageToken ?? undefined;
        if (histResp.data.historyId) historyId = histResp.data.historyId;
      } while (pageToken);
    } catch (err: any) {
      if (err?.code === 404 || err?.response?.status === 404) {
        // Gmail only retains ~1 week of history — fall back to a fresh bounded re-sync.
        return syncGmailAccount({ ...account, deltaCursor: null }, objectStorage);
      }
      throw err;
    }
  }

  messageIds = [...new Set(messageIds)];
  let synced = 0;

  for (const id of messageIds) {
    const msgResp = await gmail.users.messages.get({ userId: "me", id, format: "full" });
    const payload = msgResp.data.payload;
    if (!payload) continue;

    const headers = payload.headers ?? [];
    const getHeader = (name: string) =>
      headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? null;

    const { text: bodyText, html: bodyHtmlRaw } = extractGmailBody(payload);
    const bodyHtml = sanitizeBody(bodyHtmlRaw);
    const sentAt = msgResp.data.internalDate ? new Date(Number(msgResp.data.internalDate)) : new Date();
    const threadProviderId = msgResp.data.threadId ?? id;
    const fromHeader = parseEmailAddress(getHeader("from"));
    const toEmails = parseEmailAddressList(getHeader("to"));
    const ccEmails = parseEmailAddressList(getHeader("cc"));

    const thread = await upsertThread({
      companyId: account.companyId,
      emailAccountId: account.id,
      projectId: null,
      providerThreadId: threadProviderId,
      subject: getHeader("subject"),
      participantEmails: [...new Set([fromHeader?.email, ...toEmails, ...ccEmails].filter(Boolean) as string[])],
      lastMessageAt: sentAt,
      messageCount: 1,
    });

    const attachmentParts = collectGmailAttachmentParts(payload);
    const message = await upsertMessage({
      companyId: account.companyId,
      emailAccountId: account.id,
      threadId: thread.id,
      providerMessageId: id,
      fromEmail: fromHeader?.email ?? null,
      fromName: fromHeader?.name ?? null,
      toEmails,
      ccEmails,
      subject: getHeader("subject"),
      bodyText,
      bodyHtml,
      hasAttachments: attachmentParts.length > 0,
      sentAt,
    });
    synced++;

    if (attachmentParts.length > 0) {
      const attachments = await fetchGmailAttachments(gmail, id, attachmentParts);
      await storeAttachments(account.companyId, message.id, objectStorage, attachments);
    }

    await triageThread(account.companyId, thread.id);
  }

  return { synced, deltaCursor: historyId ?? null };
}

function base64UrlDecode(data: string): string {
  return Buffer.from(data, "base64url").toString("utf-8");
}

function extractGmailBody(payload: any): { text: string | null; html: string | null } {
  let text: string | null = null;
  let html: string | null = null;

  function walk(part: any) {
    if (!part) return;
    if (part.mimeType === "text/plain" && part.body?.data && !text) {
      text = base64UrlDecode(part.body.data);
    } else if (part.mimeType === "text/html" && part.body?.data && !html) {
      html = base64UrlDecode(part.body.data);
    }
    for (const child of part.parts ?? []) walk(child);
  }
  walk(payload);
  return { text, html };
}

function collectGmailAttachmentParts(payload: any): Array<{ filename: string; mimeType: string; attachmentId: string }> {
  const parts: Array<{ filename: string; mimeType: string; attachmentId: string }> = [];
  function walk(part: any) {
    if (!part) return;
    if (part.filename && part.body?.attachmentId) {
      parts.push({ filename: part.filename, mimeType: part.mimeType ?? "application/octet-stream", attachmentId: part.body.attachmentId });
    }
    for (const child of part.parts ?? []) walk(child);
  }
  walk(payload);
  return parts;
}

async function fetchGmailAttachments(
  gmail: ReturnType<typeof buildGmailClient>,
  messageId: string,
  parts: Array<{ filename: string; mimeType: string; attachmentId: string }>,
): Promise<Array<{ filename: string; contentType: string | null; base64: string }>> {
  const results: Array<{ filename: string; contentType: string | null; base64: string }> = [];
  for (const part of parts) {
    const resp = await gmail.users.messages.attachments.get({
      userId: "me",
      messageId,
      id: part.attachmentId,
    });
    const data = resp.data.data;
    if (!data) continue;
    // Gmail attachment bytes are base64url-encoded; re-encode to standard base64
    // so storeAttachments' Buffer.from(..., "base64") decodes correctly.
    const base64 = Buffer.from(data, "base64url").toString("base64");
    results.push({ filename: part.filename, contentType: part.mimeType, base64 });
  }
  return results;
}

function parseEmailAddress(header: string | null): { name: string | null; email: string } | null {
  if (!header) return null;
  const match = header.match(/^(.*?)<(.+?)>$/);
  if (match) {
    const name = match[1].trim().replace(/^"|"$/g, "");
    return { name: name || null, email: match[2].trim() };
  }
  return { name: null, email: header.trim() };
}

function parseEmailAddressList(header: string | null): string[] {
  if (!header) return [];
  return header
    .split(",")
    .map((part) => parseEmailAddress(part)?.email)
    .filter((e): e is string => !!e);
}
