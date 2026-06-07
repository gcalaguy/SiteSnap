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
  sourceRecordId: z.string().optional(),
  text: z.string().min(1).max(5000),
});

/**
 * POST /api/compliance/test
 *
 * Runs the full compliance engine (Rules Engine + AI Analysis) against a
 * test payload, writes resulting directives to the database, and returns
 * them. Bypasses the 15-minute debounce window by design.
 *
 * Example body:
 * {
 *   "companyId": 1,
 *   "projectId": 42,
 *   "sourceType": "FIELD_LOG",
 *   "text": "Worker fell from scaffolding on the second floor. No harness worn."
 * }
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
