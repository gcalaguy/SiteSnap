/**
 * Compliance Processor.
 *
 * Composes the Rules Engine and AI Analysis Service, inserts validated
 * aiComplianceDirectives rows, and returns the inserted records.
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

export async function processComplianceEvent(
  payload: ComplianceEventPayload,
): Promise<AiComplianceDirective[]> {
  // 1. Always run the deterministic rules engine first (free, instant, reliable)
  const rulesSuggestions = runRulesEngine({
    text: payload.text,
    sourceType: payload.sourceType,
  });

  // 2. Attempt AI analysis — fall back to rules if it fails or returns null
  const aiSuggestions = await runAiAnalysis(payload);
  const usedAi = aiSuggestions !== null;

  // 3. Merge: prefer AI suggestions when available; supplement with any rules
  //    suggestions for targetFormIds the AI didn't cover.
  let finalSuggestions: (RulesSuggestion & { aiModel?: string })[];

  if (usedAi && aiSuggestions.length > 0) {
    const aiCoveredForms = new Set(aiSuggestions.map((s) => s.targetFormId));
    const rulesOnlyGaps = rulesSuggestions.filter(
      (s) => !aiCoveredForms.has(s.targetFormId),
    );
    finalSuggestions = [...aiSuggestions, ...rulesOnlyGaps];
  } else {
    // AI unavailable or returned no directives — use rules exclusively
    finalSuggestions = rulesSuggestions;
  }

  if (finalSuggestions.length === 0) {
    return [];
  }

  // 4. Insert all suggestions as PENDING directives
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
