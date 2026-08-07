import { z } from "zod";
import { batchProcess, extractJson } from "@workspace/integrations-openai-ai-server";
import {
  subcontractorTradeTypeEnum,
  communicationTimelineEventTypeEnum,
  type EmailMessage,
  type EmailAiEntities,
  type CommunicationTimelineEvent,
} from "@workspace/db";
import { checkAiQuota, recordAiCall } from "../lib/aiRateLimiter";
import {
  getMessagesDueForAiExtraction,
  saveMessageIntelligence,
  reclassifyAttachmentsForMessage,
  saveMessageTimelineEvents,
  getThread,
} from "../repositories/emailIntegrations";
import { triageThread } from "./emailSyncService";
import { logger, alertOnHighErrorRate } from "../lib/logger";

/**
 * Phase 3 — AI Communications Intelligence. Runs as a background cron job
 * (see cron.ts's EMAIL_AI_EXTRACTION job), fully decoupled from the sync loop
 * so an LLM call never adds latency to email polling.
 *
 * Deliberately deviates from this codebase's usual "JSON.parse + hand-written
 * fallback, no validation of LLM output" convention (see extractJson in
 * @workspace/integrations-openai-ai-server) — Zod-validates the parsed result
 * before persisting, since bad extraction data would otherwise silently
 * corrupt search/matching rather than just a single UI card.
 */

const TRADE_VALUES = subcontractorTradeTypeEnum.enumValues;
const TIMELINE_EVENT_TYPE_VALUES = communicationTimelineEventTypeEnum.enumValues;
const BATCH_SIZE = 25;
const MAX_BODY_CHARS = 6000;
const MAX_ATTEMPTS = 3;

const EmailAiExtractionSchema = z.object({
  summary: z.string().min(1).max(1000),
  trade: z.enum(TRADE_VALUES as [string, ...string[]]).nullable(),
  projectMentions: z.array(z.string()).default([]),
  clientMentions: z.array(z.string()).default([]),
  vendorMentions: z.array(z.string()).default([]),
  inspectionMentioned: z.boolean().default(false),
  permitNumbers: z.array(z.string()).default([]),
  invoiceNumbers: z.array(z.string()).default([]),
  quoteNumbers: z.array(z.string()).default([]),
  poNumbers: z.array(z.string()).default([]),
  changeOrderMentions: z.array(z.string()).default([]),
  deadlines: z.array(z.object({ description: z.string(), date: z.string().nullable() })).default([]),
  risks: z.array(z.string()).default([]),
  actionItems: z.array(z.string()).default([]),
  // Phase 4 — AI Timeline. Same LLM call as the rest of this extraction (no
  // second AI pass): the model additionally classifies whether this single
  // email itself represents a discrete, datable project lifecycle event.
  timelineEvents: z
    .array(
      z.object({
        type: z.enum(TIMELINE_EVENT_TYPE_VALUES as [string, ...string[]]),
        date: z.string().nullable(),
        description: z.string().min(1).max(300),
      }),
    )
    .default([]),
});

const SYSTEM_PROMPT = `You extract structured metadata from construction-project emails for a project
management tool. Read the email and identify what it's about. Respond with ONLY a JSON object —
no prose, no markdown fences.`;

function buildPrompt(message: EmailMessage): string {
  const body = (message.bodyText ?? "").slice(0, MAX_BODY_CHARS);
  return `Email:
From: ${message.fromName ?? ""} <${message.fromEmail ?? ""}>
To: ${(message.toEmails ?? []).join(", ")}
Subject: ${message.subject ?? "(no subject)"}
Body:
${body || "(no body text)"}

Return a JSON object with exactly these fields:
- summary: string, a 2-3 sentence summary of what this email is about.
- trade: one of ${JSON.stringify(TRADE_VALUES)} if the email is clearly about a specific trade, else null.
- projectMentions: string[] of any project names/nicknames/addresses mentioned.
- clientMentions: string[] of any client/customer names mentioned.
- vendorMentions: string[] of any vendor/supplier/subcontractor company names mentioned.
- inspectionMentioned: boolean, true if an inspection is discussed or scheduled.
- permitNumbers: string[] of any permit numbers mentioned.
- invoiceNumbers: string[] of any invoice numbers mentioned.
- quoteNumbers: string[] of any quote numbers mentioned.
- poNumbers: string[] of any purchase order numbers mentioned.
- changeOrderMentions: string[] of any change order references mentioned.
- deadlines: array of {description, date} for any deadlines/due dates mentioned (date as YYYY-MM-DD if determinable, else null).
- risks: string[] of any risks, delays, problems, or concerns mentioned.
- actionItems: string[] of any action items or next steps mentioned.
- timelineEvents: array of {type, date, description} — ONLY include an entry if
  this email itself represents one of these discrete project events: ${JSON.stringify(TIMELINE_EVENT_TYPE_VALUES)}.
  Most emails are not a timeline event at all — return an empty array unless
  the email clearly IS one (e.g. an inspector confirming a scheduled date, a
  city confirming permit approval, an invoice being sent). date as YYYY-MM-DD
  if determinable, else null. description: a short (<15 word) human-readable
  label for this specific event, e.g. "Permit #4471 approved by city".
Use empty arrays / false / null for anything not present — do not guess.`;
}

export interface ExtractionResult {
  summary: string;
  trade: EmailMessage["aiTrade"];
  entities: EmailAiEntities;
  timelineEvents: { type: string; date: string | null; description: string }[];
}

export async function extractMessageIntelligence(message: EmailMessage): Promise<ExtractionResult | null> {
  const raw = await extractJson<Record<string, unknown>>({
    prompt: buildPrompt(message),
    systemPrompt: SYSTEM_PROMPT,
    jsonMode: true,
    maxTokens: 1024,
    fallback: {},
  });

  const parsed = EmailAiExtractionSchema.safeParse(raw);
  if (!parsed.success) {
    logger.warn(
      { messageId: message.id, issues: parsed.error.issues },
      "Email AI extraction failed validation — discarding rather than persisting unvalidated data",
    );
    return null;
  }

  const { summary, trade, timelineEvents, ...entities } = parsed.data;
  return { summary, trade: trade as EmailMessage["aiTrade"], entities, timelineEvents };
}

/**
 * Cron entry point (see cron.ts). Uses a quota key distinct from interactive
 * AI features ("c:{companyId}:ai-extract" rather than "c:{companyId}") so a
 * busy inbox never starves a user's Ask AI / scope-extraction quota — the
 * "c:" prefix specifically is what makes aiRateLimiter.ts track it in the DB
 * (cross-instance-safe) rather than in-process memory.
 */
export async function extractDueEmailIntelligence(): Promise<{
  processed: number;
  failed: number;
  skippedQuota: number;
}> {
  const messages = await getMessagesDueForAiExtraction(BATCH_SIZE);
  if (messages.length === 0) return { processed: 0, failed: 0, skippedQuota: 0 };

  let processed = 0;
  let failed = 0;
  let skippedQuota = 0;

  await batchProcess(
    messages,
    async (message) => {
      const quotaKey = `c:${message.companyId}:ai-extract`;
      const quota = await checkAiQuota(quotaKey);
      if (!quota.allowed) {
        skippedQuota++;
        return;
      }
      await recordAiCall(quotaKey);

      try {
        const result = await extractMessageIntelligence(message);
        if (!result) {
          await saveMessageIntelligence(message.id, {
            aiExtractionAttempts: message.aiExtractionAttempts + 1,
            aiExtractionError: "validation_failed",
          });
          if (message.aiExtractionAttempts + 1 >= MAX_ATTEMPTS) {
            logger.warn({ messageId: message.id }, "Email AI extraction giving up after max attempts");
          }
          failed++;
          return;
        }

        await saveMessageIntelligence(message.id, {
          aiTrade: result.trade,
          aiSummary: result.summary,
          aiEntities: result.entities,
          aiExtractedAt: new Date(),
          aiExtractionError: null,
        });
        processed++;

        // Phase 4: upgrade any still-generic attachment categories on this
        // message using the entities we just extracted — no new LLM call.
        await reclassifyAttachmentsForMessage(message.id, result.entities);

        // Newly extracted entities (project/client/vendor mentions) can
        // upgrade a weak match — re-run the same rules+engine triage path
        // Phase 2 built. triageThread() itself no-ops for threads that are
        // no longer unassigned/suggested, so this is always safe to call.
        await triageThread(message.companyId, message.threadId);

        // Phase 4: save timeline events with whatever projectId the thread
        // has *now* — triageThread() above may have just auto-assigned it
        // using these same entities, so re-fetch rather than use a stale
        // pre-triage value. If the thread gets assigned later instead,
        // threadAssignmentHooks.ts's backfillTimelineEventsProjectId fills
        // this in at that point. Always called (even with an empty array) so
        // a re-extraction that no longer detects an event clears the stale one.
        const thread = await getThread(message.companyId, message.threadId);
        await saveMessageTimelineEvents(
          message.companyId,
          message.threadId,
          message.id,
          thread?.projectId ?? null,
          result.timelineEvents.map((e) => ({
            eventType: e.type as CommunicationTimelineEvent["eventType"],
            eventDate: e.date ? new Date(e.date) : null,
            description: e.description,
            confidence: null,
          })),
        );
      } catch (err: any) {
        await saveMessageIntelligence(message.id, {
          aiExtractionAttempts: message.aiExtractionAttempts + 1,
          aiExtractionError: err?.message ?? "extraction_failed",
        });
        failed++;
      }
    },
    { concurrency: 3, retries: 1 },
  );

  alertOnHighErrorRate("Email AI extraction", { processed, failed, skippedQuota }, failed, processed + failed + skippedQuota);

  return { processed, failed, skippedQuota };
}
