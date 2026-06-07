/* TEST ONLY — this router is not connected to any live field-user triggers.
 * It exists solely for validating the compliance engine with test payloads.
 * Remove or gate behind a super-admin check before production launch.
 */

import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../lib/asyncHandler";
import { processComplianceEvent } from "../services/compliance/processor";
import { BadRequestError } from "../lib/errors";

const router = Router();

const TestPayloadSchema = z.object({
  companyId: z.number().int().positive(),
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
  workType: z
    .enum([
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
    ])
    .optional(),
  sourceRecordId: z.string().optional(),
  text: z.string().min(1).max(5000),
});

/**
 * POST /api/compliance/test
 *
 * Runs the full compliance engine against a test payload and returns the
 * resulting directives. Bypasses the 15-minute debounce window by design.
 *
 * Examples:
 *
 * Work-type only (rules engine, no AI tokens):
 * { "companyId": 4, "projectId": 1, "sourceType": "FIELD_LOG",
 *   "workType": "excavation", "text": "Starting dig today." }
 *
 * Work-type + semantic text (rules + AI):
 * { "companyId": 4, "projectId": 1, "sourceType": "FIELD_LOG",
 *   "workType": "roofing",
 *   "text": "Worker fell from scaffolding. No harness worn." }
 *
 * Text only (keyword rules + AI):
 * { "companyId": 4, "projectId": 1, "sourceType": "FIELD_LOG",
 *   "text": "Near miss — crane load swung into exclusion zone." }
 */
router.post(
  "/compliance/test",
  asyncHandler(async (req, res) => {
    const parsed = TestPayloadSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError(parsed.error.message);
    }

    const directives = await processComplianceEvent(parsed.data);

    res.json({
      ok: true,
      count: directives.length,
      directives,
    });
  }),
);

export default router;
