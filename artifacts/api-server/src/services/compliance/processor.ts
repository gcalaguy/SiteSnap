/**
 * Compliance Processor.
 *
 * Execution order (mirrors the three-pass rules engine design):
 *
 *  1. Rules Engine (work-type → keyword → source-type) runs first — instant,
 *     free, deterministic. No AI tokens consumed.
 *  2. AI Analysis runs for supplementary semantic analysis. Its output is
 *     merged with the rules output using "highest confidence wins per form
 *     type" — so a high-confidence work-type rule (95%) always beats a
 *     lower-confidence AI suggestion for the same form.
 *  3. Combined, deduplicated suggestions are inserted as PENDING directives.
 *
 * Call processComplianceEvent() directly from the test endpoint (bypassing
 * the debounce timer). The debounce wrapper lives in debouncer.ts and is
 * used by live field-log triggers.
 */

import { db, aiComplianceDirectivesTable } from "@workspace/db";
import { runRulesEngine, type RulesSuggestion } from "./rulesEngine";
import { runAiAnalysis } from "./aiAnalysis";
import type { ComplianceEventPayload } from "./types";
import type { AiComplianceDirective } from "@workspace/db";

export type { ComplianceEventPayload };

type MergedSuggestion = RulesSuggestion & { aiModel?: string };

export async function processComplianceEvent(
  payload: ComplianceEventPayload,
): Promise<AiComplianceDirective[]> {
  // ── Step 1: Deterministic rules engine (always runs, zero cost) ─────────────
  const rulesSuggestions = runRulesEngine({
    text: payload.text,
    sourceType: payload.sourceType,
    workType: payload.workType,
  });

  // ── Step 2: AI analysis (supplementary — may return null on failure) ────────
  const aiSuggestions = await runAiAnalysis(payload);

  // ── Step 3: Merge both streams, highest confidence wins per form type ───────
  // Build a map seeded with rules results, then layer AI suggestions on top.
  // Because work-type rules start at confidence 95, they survive unless the AI
  // is more confident about the same form — a healthy dynamic where structured
  // input reliably anchors the output.
  const seen = new Map<string, MergedSuggestion>();

  for (const s of rulesSuggestions) {
    const existing = seen.get(s.targetFormId);
    if (!existing || s.confidenceScore > existing.confidenceScore) {
      seen.set(s.targetFormId, s);
    }
  }

  if (aiSuggestions) {
    for (const s of aiSuggestions) {
      const existing = seen.get(s.targetFormId);
      if (!existing || s.confidenceScore > existing.confidenceScore) {
        seen.set(s.targetFormId, s);
      }
    }
  }

  const finalSuggestions = Array.from(seen.values());

  if (finalSuggestions.length === 0) {
    return [];
  }

  // ── Step 4: Insert all merged suggestions as PENDING directives ─────────────
  const rows = await db
    .insert(aiComplianceDirectivesTable)
    .values(
      finalSuggestions.map((s) => ({
        companyId: payload.companyId,
        projectId: payload.projectId,
        targetFormId: s.targetFormId,
        urgency: s.urgency,
        workerDirective: s.workerDirective,
        triggerKeywords: s.triggerKeywords,
        sourceType: payload.sourceType,
        sourceRecordId: payload.sourceRecordId ?? null,
        confidenceScore: s.confidenceScore,
        aiModel: "aiModel" in s ? (s.aiModel ?? null) : null,
        status: "PENDING" as const,
      })),
    )
    .returning();

  return rows;
}
