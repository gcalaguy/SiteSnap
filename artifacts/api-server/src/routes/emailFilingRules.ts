import { Router } from "express";
import { z } from "zod/v4";
import { requireAuth, requireCompany, requireTenantCtx } from "../lib/auth";
import { requireFeature } from "../lib/featureGate";
import { requirePermission } from "../lib/permissionGate";
import { asyncHandler } from "../lib/asyncHandler";
import { BadRequestError, NotFoundError } from "../lib/errors";
import {
  listFilingRules,
  createFilingRule,
  updateFilingRule,
  deleteFilingRule,
} from "../repositories/emailIntegrations";
import { logAuditEventFromRequest } from "../utils/logger";

/**
 * Admin-defined Automatic Filing Rules (Phase 2) — evaluated in priority
 * order during sync, before the statistical matching engine (see
 * emailFilingRulesService.ts / emailSyncService.ts's triageThread()).
 * Gated by the "manageFilingRules" permission (owner/foreman by default,
 * same tier as "manageEmailIntegrations") since a misconfigured rule can
 * silently misroute every incoming email company-wide.
 */
const router = Router();

router.use(
  requireAuth,
  requireCompany,
  requireTenantCtx,
  requireFeature("COMMS_HUB"),
  requirePermission("manageFilingRules"),
);

const FilingRuleCondition = z.object({
  field: z.enum(["subject", "from_email", "from_name", "to_emails", "cc_emails", "body_text"]),
  operator: z.enum(["contains", "equals", "starts_with"]),
  value: z.string().min(1),
});

const FilingRuleAction = z.union([
  z.object({ type: z.literal("move_to_project"), projectId: z.number().int() }),
  z.object({ type: z.literal("assign_category"), category: z.string().min(1) }),
]);

const FilingRuleBody = z.object({
  name: z.string().min(1),
  isEnabled: z.boolean().optional(),
  priority: z.number().int().optional(),
  conditionLogic: z.enum(["AND", "OR"]).optional(),
  conditions: z.array(FilingRuleCondition).min(1),
  actions: z.array(FilingRuleAction).min(1),
});

// ── GET /email-filing-rules ──────────────────────────────────────────────────
router.get(
  "/email-filing-rules",
  asyncHandler(async (req, res) => {
    const rules = await listFilingRules(req.companyId!);
    res.json({ data: rules });
  }),
);

// ── POST /email-filing-rules ─────────────────────────────────────────────────
router.post(
  "/email-filing-rules",
  asyncHandler(async (req, res) => {
    const parsed = FilingRuleBody.safeParse(req.body);
    if (!parsed.success) throw new BadRequestError("Invalid request body", parsed.error.issues);

    const rule = await createFilingRule({
      ...parsed.data,
      companyId: req.companyId!,
      createdByUserId: req.userId ?? null,
    });
    logAuditEventFromRequest(req, "Email Filing Rule Created", `Created rule "${rule.name}"`).catch(() => {});
    res.status(201).json(rule);
  }),
);

// ── PATCH /email-filing-rules/:ruleId ────────────────────────────────────────
router.patch(
  "/email-filing-rules/:ruleId",
  asyncHandler(async (req, res) => {
    const ruleId = parseInt(req.params.ruleId as string);
    if (isNaN(ruleId)) throw new BadRequestError("Invalid rule id");
    const parsed = FilingRuleBody.partial().safeParse(req.body);
    if (!parsed.success) throw new BadRequestError("Invalid request body", parsed.error.issues);

    const updated = await updateFilingRule(req.companyId!, ruleId, parsed.data);
    if (!updated) throw new NotFoundError("Filing rule not found");
    logAuditEventFromRequest(req, "Email Filing Rule Updated", `Updated rule "${updated.name}" (id ${ruleId})`).catch(() => {});
    res.json(updated);
  }),
);

// ── DELETE /email-filing-rules/:ruleId ───────────────────────────────────────
router.delete(
  "/email-filing-rules/:ruleId",
  asyncHandler(async (req, res) => {
    const ruleId = parseInt(req.params.ruleId as string);
    if (isNaN(ruleId)) throw new BadRequestError("Invalid rule id");
    const deleted = await deleteFilingRule(req.companyId!, ruleId);
    if (!deleted) throw new NotFoundError("Filing rule not found");
    logAuditEventFromRequest(req, "Email Filing Rule Deleted", `Deleted rule id ${ruleId}`).catch(() => {});
    res.status(204).send();
  }),
);

export default router;
