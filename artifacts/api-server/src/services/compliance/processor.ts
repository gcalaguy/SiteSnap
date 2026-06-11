/**
 * Compliance Processor.
 *
 * Full execution pipeline:
 *
 *  1. Gather live project context (schedule, field logs, crew, hazards).
 *  2. Rules Engine (work-type → keyword → source-type) — instant, free,
 *     deterministic. No AI tokens consumed.
 *  3. AI Analysis — enriched with real project context. Zod-validated.
 *     Falls back to null on any failure.
 *  4. Merge both streams: highest confidence wins per targetFormId.
 *  5. Supersede: mark existing PENDING directives for the same project +
 *     targetFormId as SUPERSEDED to preserve chronological history.
 *  6. Insert merged suggestions as new PENDING directives.
 *
 * Call processComplianceEvent() directly from the test endpoint (bypassing
 * the debounce timer). The debounce wrapper lives in debouncer.ts and is
 * used by live field-log triggers.
 */

import { db, aiComplianceDirectivesTable, projectsTable, userMembershipsTable } from "@workspace/db";
import { eq, and, inArray, sql } from "drizzle-orm";
import { notify } from "../../lib/notify";
import { logger } from "../../lib/logger";
import { runRulesEngine, type RulesSuggestion } from "./rulesEngine";
import { runAiAnalysis } from "./aiAnalysis";
import { gatherProjectContext } from "./contextGatherer";
import type { ComplianceEventPayload } from "./types";
import type { AiComplianceDirective } from "@workspace/db";

export type { ComplianceEventPayload };

type MergedSuggestion = RulesSuggestion & { aiModel?: string };

export interface ProcessOptions {
  /**
   * When true (default), gather live project context from the DB before
   * calling the AI. Set to false in unit tests or when the caller has
   * already supplied all context via the text payload.
   */
  enrichContext?: boolean;
}

export async function processComplianceEvent(
  payload: ComplianceEventPayload,
  options: ProcessOptions = {},
): Promise<AiComplianceDirective[]> {
  const enrichContext = options.enrichContext ?? true;

  // ── Step 1: Gather live project context (optional, default on) ───────────────
  let context;
  if (enrichContext) {
    // Fetch the project name for the context block
    const [project] = await db
      .select({ name: projectsTable.name })
      .from(projectsTable)
      .where(eq(projectsTable.id, payload.projectId))
      .limit(1);

    context = await gatherProjectContext(
      payload.projectId,
      payload.companyId,
      project?.name ?? `Project #${payload.projectId}`,
    );
  }

  // ── Step 2: Deterministic rules engine (always runs, zero cost) ─────────────
  const rulesSuggestions = runRulesEngine({
    text: payload.text,
    sourceType: payload.sourceType,
    workType: payload.workType,
  });

  // ── Step 3: AI analysis with enriched context ────────────────────────────────
  const aiSuggestions = await runAiAnalysis(payload, context);

  // ── Step 4: Merge both streams — highest confidence wins per form type ────────
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

  const targetFormIds = finalSuggestions.map((s) => s.targetFormId);

  // ── Step 5: Supersede existing PENDING directives for the same forms ─────────
  // Mark old PENDING directives for each targetFormId as SUPERSEDED so the
  // historical record is preserved while the UI only surfaces the latest ones.
  await db
    .update(aiComplianceDirectivesTable)
    .set({
      status: "SUPERSEDED",
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(aiComplianceDirectivesTable.projectId, payload.projectId),
        eq(aiComplianceDirectivesTable.status, "PENDING"),
        inArray(aiComplianceDirectivesTable.targetFormId, targetFormIds),
      ),
    );

  // ── Step 6: Insert merged suggestions as new PENDING directives ──────────────
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

  // ── Step 7: Push-notify foremen/owners for any HIGH urgency directives ───────
  const highRows = rows.filter((r) => r.urgency === "HIGH");
  if (highRows.length > 0) {
    notifyComplianceForemen(payload.companyId, highRows, payload.projectId).catch((err) => {
      logger.error({ err, companyId: payload.companyId, projectId: payload.projectId }, "Failed to notify foremen of HIGH compliance directives");
    });
  }

  return rows;
}

/** Fire-and-forget: push notify all foremen + owners about HIGH compliance alerts. */
async function notifyComplianceForemen(
  companyId: number,
  highDirectives: AiComplianceDirective[],
  projectId: number,
): Promise<void> {
  const members = await db
    .select({ userId: userMembershipsTable.userId })
    .from(userMembershipsTable)
    .where(
      and(
        eq(userMembershipsTable.companyId, companyId),
        sql`${userMembershipsTable.role} IN ('owner','foreman')`,
      ),
    );

  for (const { userId } of members) {
    for (const d of highDirectives) {
      await notify({
        userId,
        type: "inspection",
        title: "⚠️ Compliance Alert — Action Required",
        body: d.workerDirective.slice(0, 140),
        referenceId: d.id,
        projectId,
      }).catch((err) => {
        logger.warn({ err, userId, directiveId: d.id, projectId }, "Failed to deliver compliance push notification to user");
      });
    }
  }
}
