import { Router } from "express";
import { z } from "zod/v4";
import { openai } from "@workspace/integrations-openai-ai-server";
import { subcontractorTradeTypeEnum } from "@workspace/db";
import { requireAuth, requireCompany, requireTenantCtx } from "../lib/auth";
import { requireFeature } from "../lib/featureGate";
import { requirePermission } from "../lib/permissionGate";
import { requireAiQuota } from "../middlewares/requireAiQuota";
import { asyncHandler } from "../lib/asyncHandler";
import { BadRequestError } from "../lib/errors";
import {
  searchEmailsByIntelligence,
  type AiSearchFilters,
  type AiSearchResult,
} from "../repositories/emailIntegrations";

/**
 * Natural Language Search (Phase 3) — "Show all plumbing emails," "Find
 * permit discussions," "What invoices arrived this month?" Two-stage,
 * mirroring qaService.ts's retrieve-then-synthesize shape, but with
 * structured+FTS retrieval instead of vector RAG: emails are short and now
 * entity-tagged (see emailIntelligenceService.ts), so every example query
 * maps cleanly onto aiTrade/aiEntities/date-range/keyword filters without a
 * new embeddings pipeline.
 */
const router = Router();

router.use(
  requireAuth,
  requireCompany,
  requireTenantCtx,
  requireFeature("COMMS_HUB"),
  requirePermission("viewProjectCommunications"),
  requireAiQuota,
);

/** Returns an AbortSignal that fires after `ms` milliseconds — same convention as routes/ai.ts. */
function aiSignal(ms: number): AbortSignal {
  const ctrl = new AbortController();
  setTimeout(() => ctrl.abort(new Error(`OpenAI request timed out after ${ms}ms`)), ms).unref();
  return ctrl.signal;
}

const TRADE_VALUES = subcontractorTradeTypeEnum.enumValues;
const ENTITY_TYPES = [
  "permit", "invoice", "quote", "po", "changeOrder", "inspection", "risk", "deadline", "actionItem",
] as const;

const QueryFilterSchema = z.object({
  intent: z.enum(["list", "summarize"]).default("list"),
  trade: z.enum(TRADE_VALUES as [string, ...string[]]).nullable().default(null),
  entityType: z.enum(ENTITY_TYPES).nullable().default(null),
  dateFrom: z.string().nullable().default(null),
  dateTo: z.string().nullable().default(null),
  keywords: z.string().nullable().default(null),
});

async function parseQuery(query: string): Promise<z.infer<typeof QueryFilterSchema>> {
  const today = new Date().toISOString().slice(0, 10);
  const response = await openai.chat.completions.create(
    {
      model: "gpt-5.4",
      max_completion_tokens: 300,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You translate a construction-project-manager's plain-English question about their
synced emails into a structured search filter. Today's date is ${today}. Respond with ONLY a JSON
object with these exact fields:
- intent: "summarize" if the question asks to summarize/explain, else "list".
- trade: one of ${JSON.stringify(TRADE_VALUES)} if a specific trade is mentioned, else null.
- entityType: one of ${JSON.stringify(ENTITY_TYPES)} if the question is about a specific entity type
  (e.g. "invoices" -> "invoice", "permit discussions" -> "permit", "mentions delays" -> "risk"), else null.
- dateFrom / dateTo: YYYY-MM-DD if a date range is implied (e.g. "this month"), else null.
- keywords: a short free-text search string for anything not covered above, else null.`,
        },
        { role: "user", content: query },
      ],
    },
    { signal: aiSignal(20_000) },
  );

  const raw = response.choices[0]?.message?.content ?? "{}";
  let parsedRaw: unknown = {};
  try {
    parsedRaw = JSON.parse(raw);
  } catch {
    // fall through to schema defaults below
  }
  const parsed = QueryFilterSchema.safeParse(parsedRaw);
  return parsed.success ? parsed.data : QueryFilterSchema.parse({});
}

async function synthesizeAnswer(query: string, results: AiSearchResult[]): Promise<string> {
  const context = results
    .slice(0, 15)
    .map((r, i) => `[${i + 1}] ${r.subject ?? "(no subject)"} — ${r.ai_summary ?? "(not yet summarized)"}`)
    .join("\n");

  const response = await openai.chat.completions.create(
    {
      model: "gpt-5.4",
      max_completion_tokens: 500,
      messages: [
        {
          role: "system",
          content: "Answer the user's question about their project emails using only the numbered list below. Be concise.",
        },
        { role: "user", content: `Question: ${query}\n\nEmails:\n${context || "(no matching emails found)"}` },
      ],
    },
    { signal: aiSignal(30_000) },
  );

  return response.choices[0]?.message?.content ?? "";
}

const AiSearchBody = z.object({ query: z.string().min(1).max(500) });

// ── POST /communications/ai-search ──────────────────────────────────────────
router.post(
  "/communications/ai-search",
  asyncHandler(async (req, res) => {
    const parsed = AiSearchBody.safeParse(req.body);
    if (!parsed.success) throw new BadRequestError("Invalid request body", parsed.error.issues);

    const filters = await parseQuery(parsed.data.query);
    const searchFilters: AiSearchFilters = {
      trade: filters.trade ?? undefined,
      entityType: (filters.entityType as AiSearchFilters["entityType"]) ?? undefined,
      dateFrom: filters.dateFrom ?? undefined,
      dateTo: filters.dateTo ?? undefined,
      keywords: filters.keywords ?? undefined,
    };

    const results = await searchEmailsByIntelligence(req.companyId!, searchFilters, 50);
    const answer = filters.intent === "summarize" ? await synthesizeAnswer(parsed.data.query, results) : null;

    res.json({ answer, results });
  }),
);

export default router;
