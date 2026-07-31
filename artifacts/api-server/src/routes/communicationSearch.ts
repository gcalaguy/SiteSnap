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
  attachmentTypes: z.array(z.enum(["pdf", "word", "excel", "image", "cad"])).optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
  flagged: z.boolean().optional(),
  hasConversation: z.boolean().optional(),
  projectId: z.number().int().nullable().optional(),
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
    res.status(204).send();
  }),
);

export default router;
