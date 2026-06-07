/**
 * AI Compliance Analysis Service.
 *
 * Calls OpenAI to produce structured compliance directive suggestions for
 * complex semantic analysis that the static rules engine cannot cover.
 *
 * All LLM output is treated as untrusted: it is validated against a strict
 * Zod schema before use. If parsing fails for any reason (malformed JSON,
 * invalid enum, network error) the service returns null and the caller
 * falls back to the Rules Engine output exclusively.
 *
 * NOTE: The prompt explicitly tells the AI which forms the work-type rules
 * engine has already covered, so it focuses on semantic gaps rather than
 * duplicating deterministic output.
 */

import { z } from "zod";
import { openai } from "@workspace/integrations-openai-ai-server";
import type { RulesSuggestion } from "./rulesEngine";
import type { ComplianceEventPayload } from "./types";

// ── Zod schema for LLM output ─────────────────────────────────────────────────

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
  triggerKeywords: z.array(z.string()).min(1).max(10),
  confidenceScore: z.number().int().min(0).max(100),
});

const AiAnalysisResponseSchema = z.object({
  directives: z.array(AiDirectiveSuggestionSchema).max(5),
});

const AI_MODEL = "gpt-4.1-mini";

// ── Service ───────────────────────────────────────────────────────────────────

/**
 * Ask the AI to analyse the event payload and return directive suggestions.
 *
 * Returns null on any failure — the caller must fall back to the Rules Engine.
 */
export async function runAiAnalysis(
  payload: ComplianceEventPayload,
): Promise<(RulesSuggestion & { aiModel: string })[] | null> {
  const workTypeContext = payload.workType
    ? `Work type: ${payload.workType.replace(/_/g, " ")}`
    : "Work type: not specified";

  const systemPrompt = `You are an AI Compliance Officer for a Canadian construction company.
Your job is to analyse field activity text and identify safety compliance risks that require immediate worker action.

You must respond with a JSON object in this exact shape:
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
- Only include directives where there is genuine safety risk evidence in the text.
- Maximum 5 directives per response.
- If there are no additional risks beyond what the static rules engine already covers, return { "directives": [] }.
- Do NOT invent risks that are not in the text.
- AI recommendations are advisory only — never claim to complete forms or create legal records.
- This is a Canadian construction site; reference relevant Canadian safety standards (OHSA, CSA, WHMIS) where applicable.
- Focus on SEMANTIC risks the static keyword rules would miss — complex language, implied risks, contextual hazards.`;

  const userPrompt = `Source type: ${payload.sourceType}
${workTypeContext}
Project ID: ${payload.projectId}

Field activity text:
"""
${payload.text.slice(0, 3000)}
"""

Identify any additional safety compliance directives not already covered by standard ${payload.workType ?? "general"} work-type rules.`;

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

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      // LLM returned non-JSON — fall back to rules engine
      return null;
    }

    const result = AiAnalysisResponseSchema.safeParse(parsed);
    if (!result.success) {
      // LLM returned JSON with invalid shape or enum values — fall back
      return null;
    }

    return result.data.directives.map((d) => ({ ...d, aiModel: AI_MODEL }));
  } catch {
    // Network error, quota exceeded, etc. — fall back gracefully
    return null;
  }
}
