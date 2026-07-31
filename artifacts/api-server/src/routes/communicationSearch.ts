import { Router } from "express";
import { z } from "zod/v4";
import type { CommunicationSearchCriteria } from "@workspace/db";
import { requireAuth, requireCompany, requireTenantCtx } from "../lib/auth";
import { requireFeature } from "../lib/featureGate";
import { requirePermission } from "../lib/permissionGate";
import { asyncHandler } from "../lib/asyncHandler";
import { BadRequestError, NotFoundError } from "../lib/errors";
import {
  searchEmailsStructured,
  listSearchTemplates,
  createSearchTemplate,
  deleteSearchTemplate,
} from "../repositories/emailIntegrations";
import { logAuditEventFromRequest } from "../utils/logger";

/**
 * Search Builder (Phase 2) — structured, company-wide email search plus
 * named saved-search templates. Distinct from the existing project-scoped
 * free-text GET /projects/:projectId/communications/search, which stays as
 * the simple in-project search box.
 */
const router = Router();

router.use(
  requireAuth,
  requireCompany,
  requireTenantCtx,
  requireFeature("COMMS_HUB"),
  requirePermission("viewProjectCommunications"),
);

const ATTACHMENT_TYPE_VALUES = [
  "pdf", "word", "excel", "image", "cad", "blueprint", "quote", "invoice", "inspection_report", "permit", "other",
] as const;

// ── Advanced Search Builder v2 (Phase 4) ────────────────────────────────────
// Nesting is capped at exactly one level (a SearchConditionGroup's conditions
// can include a SearchConditionLeafGroup, which cannot itself nest further) —
// see repositories/emailIntegrations.ts's buildConditionTreeSql. This means no
// z.lazy/self-reference is needed: the leaf-group schema is fully flat.
const SearchFieldEnum = z.enum([
  "subject", "from_email", "from_name", "to_emails", "cc_emails", "body_text",
  "thread_category", "priority", "flagged", "attachment_type", "project_number", "date_sent",
]);
const SearchOperatorEnum = z.enum([
  "contains", "not_contains", "equals", "starts_with", "before", "after", "is_true", "is_false",
]);
const SearchConditionSchema = z.object({
  field: SearchFieldEnum,
  operator: SearchOperatorEnum,
  value: z.string().optional(),
});
const SearchConditionLeafGroupSchema = z.object({
  logic: z.enum(["AND", "OR"]),
  conditions: z.array(SearchConditionSchema),
});
const SearchConditionGroupSchema = z.object({
  logic: z.enum(["AND", "OR"]),
  conditions: z.array(z.union([SearchConditionSchema, SearchConditionLeafGroupSchema])),
});

const SearchCriteriaBody = z.object({
  keywords: z.string().optional(),
  subject: z.string().optional(),
  sender: z.string().optional(),
  recipient: z.string().optional(),
  client: z.string().optional(),
  vendor: z.string().optional(),
  address: z.string().optional(),
  projectNumber: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  attachmentTypes: z.array(z.enum(ATTACHMENT_TYPE_VALUES)).optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
  flagged: z.boolean().optional(),
  hasConversation: z.boolean().optional(),
  projectId: z.number().int().nullable().optional(),
  conditionTree: SearchConditionGroupSchema.optional(),
}) satisfies z.ZodType<CommunicationSearchCriteria>;

// ── POST /communications/search ─────────────────────────────────────────────
// A POST (not GET+query-string) since the criteria object is multi-field and
// nests an array (attachmentTypes) — mirrors how the mobile Search Builder
// form submits its state directly as the request body.
router.post(
  "/communications/search",
  asyncHandler(async (req, res) => {
    const parsed = SearchCriteriaBody.safeParse(req.body);
    if (!parsed.success) throw new BadRequestError("Invalid search criteria", parsed.error.issues);
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;

    const results = await searchEmailsStructured(req.companyId!, parsed.data, limit);
    res.json({ results });
  }),
);

// ── GET /communications/search-templates ────────────────────────────────────
router.get(
  "/communications/search-templates",
  asyncHandler(async (req, res) => {
    const templates = await listSearchTemplates(req.companyId!);
    res.json({ data: templates });
  }),
);

// ── POST /communications/search-templates ───────────────────────────────────
const CreateTemplateBody = z.object({
  name: z.string().min(1),
  criteria: SearchCriteriaBody,
});

router.post(
  "/communications/search-templates",
  asyncHandler(async (req, res) => {
    const parsed = CreateTemplateBody.safeParse(req.body);
    if (!parsed.success) throw new BadRequestError("Invalid request body", parsed.error.issues);

    const template = await createSearchTemplate({
      companyId: req.companyId!,
      createdByUserId: req.userId ?? null,
      name: parsed.data.name,
      criteria: parsed.data.criteria,
    });
    logAuditEventFromRequest(req, "Communication Search Template Created", `Created search template "${template.name}"`).catch(() => {});
    res.status(201).json(template);
  }),
);

// ── DELETE /communications/search-templates/:templateId ────────────────────
router.delete(
  "/communications/search-templates/:templateId",
  asyncHandler(async (req, res) => {
    const templateId = parseInt(req.params.templateId as string);
    if (isNaN(templateId)) throw new BadRequestError("Invalid template id");
    const deleted = await deleteSearchTemplate(req.companyId!, templateId);
    if (!deleted) throw new NotFoundError("Search template not found");
    logAuditEventFromRequest(req, "Communication Search Template Deleted", `Deleted search template id ${templateId}`).catch(() => {});
    res.status(204).send();
  }),
);

export default router;
