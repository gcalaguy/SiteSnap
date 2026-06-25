/**
 * AI Compliance Analysis Service.
 *
 * Calls OpenAI to produce structured compliance directive suggestions for
 * complex semantic analysis that the static rules engine cannot cover.
 *
 * All LLM output is treated as untrusted: it is validated against a strict
 * Zod schema before use. If parsing fails for any reason (malformed JSON,
 * invalid enum, network error, quota) the service returns null and the
 * caller falls back to the Rules Engine output exclusively.
 *
 * The prompt is enriched with live project context (schedule, field logs,
 * active crew, open hazards) gathered by contextGatherer.ts so the AI
 * reasons about the real site situation rather than bare text alone.
 */

import { z } from "zod";
import { openai } from "@workspace/integrations-openai-ai-server";
import type { RulesSuggestion } from "./rulesEngine";
import type { ComplianceEventPayload } from "./types";
import type { ProjectComplianceContext } from "./contextGatherer";

// ── Strict Zod schema for LLM output ─────────────────────────────────────────
// Treat every field as potentially wrong — validate all enum values explicitly.

const TargetFormEnum = z.enum([
  "toolbox_talk",
  "site_inspection",
  "hazard_id",
  "incident_investigation",
  "training_record",
  "audit_prep",
]);

const UrgencyEnum = z.enum(["HIGH", "MEDIUM", "LOW"]);

const AiDirectiveSuggestionSchema = z.object({
  targetFormId: TargetFormEnum,
  urgency: UrgencyEnum,
  workerDirective: z.string().min(10).max(500),
  triggerKeywords: z.array(z.string().max(80)).min(1).max(10),
  confidenceScore: z.number().int().min(0).max(100),
});

const AiAnalysisResponseSchema = z.object({
  directives: z.array(AiDirectiveSuggestionSchema).max(5),
});

const AI_MODEL = "gpt-4o-mini";

// ── Service ───────────────────────────────────────────────────────────────────

/**
 * Ask the AI to analyse the event payload using enriched project context.
 * Returns null on any failure — the caller must fall back to the Rules Engine.
 */
export async function runAiAnalysis(
  payload: ComplianceEventPayload,
  context?: ProjectComplianceContext,
): Promise<(RulesSuggestion & { aiModel: string })[] | null> {
  const workTypeContext = payload.workType
    ? `Work type: ${payload.workType.replace(/_/g, " ")}`
    : "Work type: not specified";

  const projectSection = context
    ? `
PROJECT CONTEXT
===============
Project: ${context.projectName}

TODAY'S SCHEDULE:
${context.todayScheduleText}

RECENT FIELD LOGS / DAILY REPORTS (last 3 days):
${context.recentDailyReportsText}

ACTIVE CREW THIS WEEK:
${context.activeCrewText}

OPEN HAZARDS & HIGH-PRIORITY TASKS:
${context.openHazardsText}
`
    : "";

  const systemPrompt = `You are an AI Compliance Officer for a Canadian construction company.
Your job is to analyse field activity text — enriched with real project context — and identify safety compliance risks that require immediate worker action.

You must respond with a JSON object in this EXACT shape and no other text:
{
  "directives": [
    {
      "targetFormId": "<one of: toolbox_talk | site_inspection | hazard_id | incident_investigation | training_record | audit_prep>",
      "urgency": "<HIGH | MEDIUM | LOW>",
      "workerDirective": "<clear plain-English instruction for the field worker, 10-500 chars>",
      "triggerKeywords": ["<keyword1>", "<keyword2>"],
      "confidenceScore": <integer 0-100>
    }
  ]
}

Rules:
- Only include directives where there is genuine safety risk evidence in the text or context.
- Maximum 5 directives per response.
- If there are no additional semantic risks, return { "directives": [] }.
- Do NOT invent risks not supported by the text or context.
- Focus on SEMANTIC and CONTEXTUAL risks the static keyword rules would miss.
- AI recommendations are advisory only — never claim to complete forms or create legal records.
- Reference relevant Canadian safety standards (OHSA, CSA, WHMIS) where applicable.
- The static rules engine already covers structured work-type requirements; focus on gaps.`;

  const userPrompt =
    `Source type: ${payload.sourceType}
${workTypeContext}
${projectSection}
TRIGGERING FIELD TEXT:
"""
${payload.text.slice(0, 3000)}
"""

Identify safety compliance directives not already covered by standard ${payload.workType ?? "general"} work-type rules.`.trim();

  try {
    const response = await openai.chat.completions.create({
      model: AI_MODEL,
      max_completion_tokens: 1024,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    const raw = response.choices[0]?.message?.content?.trim() ?? "";

    // ── VALIDATION LAYER: treat LLM output as hostile ─────────────────────────
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      // Non-JSON response — fall back silently
      return null;
    }

    const result = AiAnalysisResponseSchema.safeParse(parsed);
    if (!result.success) {
      // Invalid shape or enum values — fall back silently
      return null;
    }

    return result.data.directives.map((d) => ({ ...d, aiModel: AI_MODEL }));
  } catch {
    // Network error, quota exceeded, timeout — fall back gracefully
    return null;
  }
}
