/* TEST ONLY — this router is not connected to any live field-user triggers.
 * It exists solely for validating the compliance engine with test payloads.
 * Remove or gate behind a super-admin check before production launch.
 */

import { Router } from "express";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, projectsTable } from "@workspace/db";
import { asyncHandler } from "../lib/asyncHandler";
import { processComplianceEvent } from "../services/compliance/processor";
import { BadRequestError } from "../lib/errors";
import { requireAuth, requireCompany, requireTenantCtx } from "../lib/auth";
import { requirePermission } from "../lib/permissionGate";

const router = Router();

const WorkTypeEnum = z.enum([
  "excavation",
  "roofing",
  "electrical",
  "plumbing",
  "concrete",
  "framing",
  "demolition",
  "confined_space",
  "scaffolding",
  "crane_lifting",
  "welding_cutting",
  "trenching",
  "asbestos_abatement",
  "painting_coatings",
  "hvac",
  "masonry",
  "general_labour",
]);

const TestPayloadSchema = z.object({
  projectId: z.number().int().positive(),
  sourceType: z.enum([
    "FIELD_LOG",
    "DAILY_REPORT",
    "SCHEDULE",
    "RULE_ENGINE",
    "WEATHER",
    "INCIDENT",
    "TRAINING",
  ]),
  workType: WorkTypeEnum.optional(),
  sourceRecordId: z.string().optional(),
  text: z.string().min(1).max(5000),
  /**
   * Whether to gather live project context (schedule, crew, hazards) before
   * calling the AI. Defaults to true. Set to false to run the engine against
   * the text payload alone without any DB reads beyond the directive insert.
   */
  enrichContext: z.boolean().optional().default(true),
});

/**
 * POST /api/compliance/test
 *
 * Runs the full compliance pipeline:
 *   1. Gathers live project context (schedule, reports, crew, hazards)
 *   2. Runs the deterministic rules engine (work-type + keyword + source-type)
 *   3. Runs AI analysis with enriched context + Zod validation
 *   4. Supersedes any existing PENDING directives for the same forms
 *   5. Inserts and returns new PENDING directives
 *
 * Bypasses the 15-minute debounce window by design.
 *
 * companyId is never taken from the request — it's always the caller's own
 * req.companyId, and projectId is verified to belong to that company before
 * the pipeline runs. This prevents a caller from targeting another tenant's
 * project or writing directives into another company (P0 fix).
 *
 * Example — work-type only (rules engine, zero AI tokens):
 * { "projectId": 1, "sourceType": "FIELD_LOG",
 *   "workType": "excavation", "text": "Starting dig today." }
 *
 * Example — full pipeline with context enrichment (default):
 * { "projectId": 1, "sourceType": "FIELD_LOG",
 *   "workType": "roofing",
 *   "text": "Worker fell from scaffolding. No harness worn." }
 *
 * Example — text only, no DB context:
 * { "projectId": 1, "sourceType": "FIELD_LOG",
 *   "enrichContext": false,
 *   "text": "Near miss — crane load swung into exclusion zone." }
 */
router.post(
  "/compliance/test",
  requireAuth,
  requireCompany,
  requireTenantCtx,
  requirePermission("viewRiskTab"),
  asyncHandler(async (req, res) => {
    const parsed = TestPayloadSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError(parsed.error.message);
    }

    const { enrichContext, ...rest } = parsed.data;

    // P0: never trust a client-supplied companyId, and verify the project
    // actually belongs to the caller's company before running the pipeline
    // against it — otherwise a caller could target another tenant's project.
    const [project] = await db
      .select({ companyId: projectsTable.companyId })
      .from(projectsTable)
      .where(eq(projectsTable.id, rest.projectId))
      .limit(1);
    if (!project || project.companyId !== req.companyId) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    const eventPayload = { ...rest, companyId: req.companyId! };

    const directives = await processComplianceEvent(eventPayload, {
      enrichContext,
    });

    res.json({
      ok: true,
      count: directives.length,
      directives,
    });
  }),
);

export default router;
