import { Router } from "express";
import { diskUpload, cleanupUpload } from "../lib/upload.js";
import { randomUUID } from "crypto";
import { z } from "zod";
import { requireAuth, requireCompany, requireTenantCtx, requireOwner, requireOwnerOrForeman } from "../lib/auth";
import { requireFeature } from "../lib/featureGate";

import { asyncHandler } from "../lib/asyncHandler";
import { BadRequestError, NotFoundError, ConflictError } from "../lib/errors";
import { requireAiQuota } from "../middlewares/requireAiQuota.js";

import {
  listCostModelsForCompany,
  listAddonsForCompany,
  insertCostModel,
  insertImportedCostModel,
  updateCostModel,
  deleteCostModel,
  countCostModelReferences,
  insertAddon,
  updateAddon,
  deleteAddon,
  countAddonReferences,
  getCostModelByTypeAndFinish,
  getAddonsByKeysForCompany,
  insertEstimate,
  listSmartEstimatesForCompany,
  getEstimateById,
  insertActual,
  listActualsForCompany,
  insertQuote,
} from "../repositories/estimator";
import { seedPricingData, getProjectTypeLabels } from "../services/estimator/pricingService";
import { runPricingEngine } from "../services/estimator/pricingEngine";
import { parsePromptToParams, extractTextFromUploadedFile } from "../services/estimator/aiParserService";
import { getNextQuoteNumber, calcQuoteTotals } from "../services/estimator/quoteService";

export { countCostModelReferences, countAddonReferences };

const router = Router();
router.use(requireFeature("SMART_ESTIMATOR"));

// ── Routes ────────────────────────────────────────────────────────────────────

// GET /api/estimator/cost-models — readable by any authenticated company member
// (foremen and crew use this data in the smart estimator; owner-only for writes below)
router.get(
  "/estimator/cost-models",
  requireAuth,
  requireCompany,
  requireTenantCtx,
  asyncHandler(async (req, res) => {
    await seedPricingData(req.companyId!);
    const [models, addons, projectTypes] = await Promise.all([
      listCostModelsForCompany(req.companyId!),
      listAddonsForCompany(req.companyId!),
      getProjectTypeLabels(req.companyId!),
    ]);
    res.json({ models, addons, projectTypes });
  }),
);

// POST /api/estimator/cost-models — create a new cost model
const CostModelBody = z.object({
  projectType:         z.string().min(1, "projectType is required").max(100, "projectType must be at most 100 characters"),
  finishLevel:         z.enum(["basic", "standard", "premium", "luxury"]),
  name:                z.string().min(1, "name is required").max(200, "name must be at most 200 characters"),
  baseCostPerSqft:     z.string().max(20, "baseCostPerSqft must be at most 20 characters"),
  laborCostPerSqft:    z.string().max(20, "laborCostPerSqft must be at most 20 characters"),
  materialCostPerSqft: z.string().max(20, "materialCostPerSqft must be at most 20 characters"),
  overheadPct:         z.string().max(10, "overheadPct must be at most 10 characters").default("10"),
  contingencyPct:      z.string().max(10, "contingencyPct must be at most 10 characters").default("10"),
  notes:               z.string().max(1000, "notes must be at most 1 000 characters").optional(),
});

const ImportItemBody = z.object({
  projectType:         z.string().min(1, "projectType is required").max(100, "projectType must be at most 100 characters"),
  finishLevel:         z.enum(["basic", "standard", "premium", "luxury"]),
  name:                z.string().min(1, "name is required").max(200, "name must be at most 200 characters"),
  baseCostPerSqft:     z.string().max(20, "baseCostPerSqft must be at most 20 characters"),
  laborCostPerSqft:    z.string().max(20, "laborCostPerSqft must be at most 20 characters"),
  materialCostPerSqft: z.string().max(20, "materialCostPerSqft must be at most 20 characters"),
  overheadPct:         z.string().max(10, "overheadPct must be at most 10 characters").default("10"),
  contingencyPct:      z.string().max(10, "contingencyPct must be at most 10 characters").default("10"),
  notes:               z.string().max(1000, "notes must be at most 1 000 characters").optional(),
  sourceType:          z.enum(["manual", "quote", "invoice"]).default("manual"),
  sourceId:            z.string().max(100, "sourceId must be at most 100 characters").optional(),
});

router.post(
  "/estimator/cost-models",
  requireAuth,
  requireCompany,
  requireTenantCtx,
  requireOwner,
  asyncHandler(async (req, res) => {
    const parsed = CostModelBody.safeParse(req.body);
    if (!parsed.success) throw new BadRequestError("Malformed request payload", parsed.error.issues);
    const { notes, ...rest } = parsed.data;
    const model = await insertCostModel(req.companyId!, { ...rest, notes: notes ?? null });
    res.status(201).json(model);
  }),
);

// POST /api/estimator/cost-models/import-item — import a line item from quote/invoice into Pricing DB
router.post(
  "/estimator/cost-models/import-item",
  requireAuth,
  requireCompany,
  requireTenantCtx,
  requireOwnerOrForeman,
  asyncHandler(async (req, res) => {
    const parsed = ImportItemBody.safeParse(req.body);
    if (!parsed.success) throw new BadRequestError("Malformed request payload", parsed.error.issues);
    const { notes, sourceType, sourceId, ...rest } = parsed.data;
    const model = await insertImportedCostModel(req.companyId!, {
      ...rest,
      notes: notes ?? null,
      sourceType,
      sourceId: sourceId ?? null,
    });
    res.status(201).json(model);
  }),
);

// PUT /api/estimator/cost-models/:id — update a cost model
router.put(
  "/estimator/cost-models/:id",
  requireAuth,
  requireCompany,
  requireTenantCtx,
  requireOwner,
  asyncHandler(async (req, res) => {
    const id = parseInt(String(req.params.id));
    if (isNaN(id)) throw new BadRequestError("Invalid ID");
    const parsed = CostModelBody.partial().safeParse(req.body);
    if (!parsed.success) throw new BadRequestError("Malformed request payload", parsed.error.issues);
    const { notes, ...rest } = parsed.data;
    const updateData: Record<string, unknown> = { ...rest };
    if ("notes" in parsed.data) updateData.notes = notes ?? null;
    const model = await updateCostModel(id, req.companyId!, updateData);
    if (!model) throw new NotFoundError("Cost model not found");
    res.json(model);
  }),
);

// DELETE /api/estimator/cost-models/:id — delete a cost model
router.delete(
  "/estimator/cost-models/:id",
  requireAuth,
  requireCompany,
  requireTenantCtx,
  requireOwner,
  asyncHandler(async (req, res) => {
    const id = parseInt(String(req.params.id));
    if (isNaN(id)) throw new BadRequestError("Invalid ID");
    const force = String(req.query.force) === "true";

    if (!force) {
      const refCount = await countCostModelReferences(id, req.companyId!);
      if (refCount > 0) {
        throw new ConflictError(
          `This cost model was used in ${refCount} saved estimate${refCount === 1 ? "" : "s"}. Delete anyway?`,
          { usedInEstimates: refCount }
        );
      }
    }

    const deletedId = await deleteCostModel(id, req.companyId!);
    if (!deletedId) throw new NotFoundError("Cost model not found");
    res.json({ success: true });
  }),
);

// POST /api/estimator/addons — create a new add-on
const AddonBody = z.object({
  name:            z.string().min(1, "name is required").max(200, "name must be at most 200 characters"),
  addonKey:        z.string().min(1, "addonKey is required").max(100, "addonKey must be at most 100 characters"),
  description:     z.string().max(500, "description must be at most 500 characters").optional(),
  costType:        z.enum(["flat", "per_sqft"]).default("flat"),
  amount:          z.string().min(1, "amount is required").max(20, "amount must be at most 20 characters"),
  applicableTypes: z.string().max(500, "applicableTypes must be at most 500 characters").optional(),
});

router.post(
  "/estimator/addons",
  requireAuth,
  requireCompany,
  requireTenantCtx,
  requireOwner,
  asyncHandler(async (req, res) => {
    await seedPricingData(req.companyId!);
    const parsed = AddonBody.safeParse(req.body);
    if (!parsed.success) throw new BadRequestError("Malformed request payload", parsed.error.issues);
    const { description, applicableTypes, ...rest } = parsed.data;
    const addon = await insertAddon(req.companyId!, {
      ...rest,
      description: description ?? null,
      applicableTypes: applicableTypes ?? null,
    });
    res.status(201).json(addon);
  }),
);

// PUT /api/estimator/addons/:id — update an add-on
router.put(
  "/estimator/addons/:id",
  requireAuth,
  requireCompany,
  requireTenantCtx,
  requireOwner,
  asyncHandler(async (req, res) => {
    const id = parseInt(String(req.params.id));
    if (isNaN(id)) throw new BadRequestError("Invalid ID");
    const parsed = AddonBody.partial().safeParse(req.body);
    if (!parsed.success) throw new BadRequestError("Malformed request payload", parsed.error.issues);
    const { description, applicableTypes, ...rest } = parsed.data;
    const updateData: Record<string, unknown> = { ...rest };
    if ("description" in parsed.data) updateData.description = description ?? null;
    if ("applicableTypes" in parsed.data) updateData.applicableTypes = applicableTypes ?? null;
    const addon = await updateAddon(id, req.companyId!, updateData);
    if (!addon) throw new NotFoundError("Add-on not found");
    res.json(addon);
  }),
);

// DELETE /api/estimator/addons/:id — delete an add-on
router.delete(
  "/estimator/addons/:id",
  requireAuth,
  requireCompany,
  requireTenantCtx,
  requireOwner,
  asyncHandler(async (req, res) => {
    const id = parseInt(String(req.params.id));
    if (isNaN(id)) throw new BadRequestError("Invalid ID");
    const force = String(req.query.force) === "true";

    if (!force) {
      const refCount = await countAddonReferences(id, req.companyId!);
      if (refCount > 0) {
        throw new ConflictError(
          `This add-on was used in ${refCount} saved estimate${refCount === 1 ? "" : "s"}. Delete anyway?`,
          { usedInEstimates: refCount }
        );
      }
    }

    const deleted = await deleteAddon(id, req.companyId!);
    if (!deleted) throw new NotFoundError("Add-on not found");
    res.json({ success: true });
  }),
);

// POST /api/estimator/parse — AI: free text → structured params
const ParseBody = z.object({
  prompt: z.string().min(10, "Please describe the project (min 10 characters)").max(5000, "Prompt must be at most 5 000 characters"),
});

router.post(
  "/estimator/parse",
  requireAuth,
  requireCompany,
  requireTenantCtx,
  requireAiQuota,
  asyncHandler(async (req, res) => {
    const parsed = ParseBody.safeParse(req.body);
    if (!parsed.success) throw new BadRequestError("Malformed request payload", parsed.error.issues);

    await seedPricingData(req.companyId!);
    const params = await parsePromptToParams(parsed.data.prompt);
    res.json(params);
  }),
);

// POST /api/estimator/parse-from-file — upload file → extract text → AI parse params
router.post(
  "/estimator/parse-from-file",
  requireAuth,
  requireCompany,
  requireTenantCtx,
  requireAiQuota,
  diskUpload.single("file"),
  asyncHandler(async (req, res) => {
    const file = req.file;
    if (!file) throw new BadRequestError("No file uploaded");

    const extractedText = await extractTextFromUploadedFile(file);

    const rawHint = typeof req.body.hint === "string" ? req.body.hint.trim() : "";
    const hintParsed = z.string().max(2000, "Hint must be at most 2 000 characters").safeParse(rawHint);
    if (!hintParsed.success) throw new BadRequestError("Malformed request payload", hintParsed.error.issues);
    const hint = hintParsed.data;
    const fullPrompt = hint ? `${extractedText}\n\nAdditional context: ${hint}` : extractedText;
    await seedPricingData(req.companyId!);
    const params = await parsePromptToParams(fullPrompt);
    res.json(params);
    await cleanupUpload(file.path);
  }),
);

// POST /api/estimator/calculate — rule engine: params → estimate
const CalculateBody = z.object({
  project_type: z.string().min(1).max(100, "project_type must be at most 100 characters"),
  square_feet: z.number().positive("square_feet must be positive").max(1_000_000, "square_feet must be at most 1 000 000"),
  finish_level: z.string().min(1).max(50, "finish_level must be at most 50 characters"),
  addons: z.array(z.string().max(100)).max(50, "addons must have at most 50 items").optional().default([]),
  margin_pct: z.number().min(0).max(100).optional().default(15),
});

router.post(
  "/estimator/calculate",
  requireAuth,
  requireCompany,
  requireTenantCtx,
  asyncHandler(async (req, res) => {
    const parsed = CalculateBody.safeParse(req.body);
    if (!parsed.success) throw new BadRequestError("Malformed request payload", parsed.error.issues);

    await seedPricingData(req.companyId!);
    const { project_type, square_feet, finish_level, addons, margin_pct } = parsed.data;

    // Look up cost model from DB — scoped to this company
    const costModel = await getCostModelByTypeAndFinish(req.companyId!, project_type, finish_level);
    if (!costModel) {
      throw new NotFoundError(`No pricing model found for project_type="${project_type}" finish_level="${finish_level}"`);
    }

    const selectedAddons = await getAddonsByKeysForCompany(req.companyId!, addons);

    const result = runPricingEngine({ project_type, square_feet, finish_level, addons, margin_pct }, costModel, selectedAddons);
    res.json(result);
  }),
);

// POST /api/estimator/smart-estimates — save a smart estimate
const SaveSmartEstimateBody = z.object({
  title: z.string().min(1).max(200, "title must be at most 200 characters"),
  params: z.object({
    project_type: z.string().min(1).max(100, "project_type must be at most 100 characters"),
    square_feet: z.number().positive().max(1_000_000, "square_feet must be at most 1 000 000"),
    finish_level: z.string().min(1).max(50, "finish_level must be at most 50 characters"),
    addons: z.array(z.string().max(100)).max(50, "addons must have at most 50 items"),
    margin_pct: z.number().min(0).max(100).optional(),
  }),
  result: z.record(z.unknown()),
  sourcePrompt: z.string().max(5000, "sourcePrompt must be at most 5 000 characters").optional(),
});

router.post(
  "/estimator/smart-estimates",
  requireAuth,
  requireCompany,
  requireTenantCtx,
  requireOwnerOrForeman,
  asyncHandler(async (req, res) => {
    const parsed = SaveSmartEstimateBody.safeParse(req.body);
    if (!parsed.success) throw new BadRequestError("Malformed request payload", parsed.error.issues);

    const { title, params, result, sourcePrompt } = parsed.data;

    const estimate = await insertEstimate({
      companyId: req.companyId!,
      createdByUserId: req.userId!,
      title,
      scopeText: sourcePrompt ?? null,
      sourceType: "smart",
      status: "ready",
      result: { ...result, _params: params },
    });

    res.status(201).json(estimate);
  }),
);

// GET /api/estimator/smart-estimates — list saved smart estimates (all roles)
router.get(
  "/estimator/smart-estimates",
  requireAuth,
  requireCompany,
  requireTenantCtx,
  asyncHandler(async (req, res) => {
    const estimates = await listSmartEstimatesForCompany(req.companyId!);
    res.json(estimates);
  }),
);

// ── POST /api/estimator/to-quote ─────────────────────────────────────────────
const ToQuoteBody = z.object({
  title: z.string().min(1),
  clientName: z.string().min(1),
  clientEmail: z.string().email().optional(),
  notes: z.string().optional(),
  sourcePrompt: z.string().optional(),
  lineItems: z.array(z.object({
    description: z.string(),
    quantity: z.number(),
    unit: z.string(),
    unitPrice: z.number(),
    total: z.number(),
  })),
});

router.post(
  "/estimator/to-quote",
  requireAuth,
  requireCompany,
  requireTenantCtx,
  requireOwnerOrForeman,
  asyncHandler(async (req, res) => {
    const parsed = ToQuoteBody.safeParse(req.body);
    if (!parsed.success) throw new BadRequestError(parsed.error.issues[0]?.message ?? "Invalid body");

    const { title, clientName, clientEmail, notes, sourcePrompt, lineItems } = parsed.data;

    const quoteNumber = await getNextQuoteNumber(req.companyId!);
    const { subtotal, taxAmount, total } = calcQuoteTotals(lineItems);

    const quote = await insertQuote({
      companyId: req.companyId!,
      projectId: null,
      quoteNumber,
      title,
      clientName,
      clientEmail: clientEmail ?? null,
      clientCompanyName: null,
      clientAddress: null,
      clientPhone: null,
      voiceInput: sourcePrompt ?? null,
      notes: notes ? `${notes}\n\n[Generated by Smart Estimator]` : "[Generated by Smart Estimator]",
      lineItems: lineItems as { description: string; quantity: number; unit: string; unitPrice: number; total: number }[],
      subtotal,
      taxRate: "0.1300",
      taxAmount,
      total,
      validUntil: null,
      createdByUserId: req.userId!,
      status: "draft",
      publicToken: randomUUID(),
    });

    res.status(201).json(quote);
  }),
);

const RecordActualBody = z.object({
  estimate_id: z.number().int().positive(),
  estimated_cost: z.number().positive(),
  actual_cost: z.number().positive(),
  notes: z.string().optional(),
});

router.post(
  "/estimator/actuals",
  requireAuth,
  requireCompany,
  requireTenantCtx,
  requireOwnerOrForeman,
  asyncHandler(async (req, res) => {
    const parsed = RecordActualBody.safeParse(req.body);
    if (!parsed.success) throw new BadRequestError(parsed.error.issues[0]?.message ?? "Invalid body");

    const { estimate_id, estimated_cost, actual_cost, notes } = parsed.data;

    // Verify estimate belongs to company
    const estimate = await getEstimateById(estimate_id, req.companyId!);
    if (!estimate) throw new NotFoundError("Estimate not found");

    const variancePct = ((actual_cost - estimated_cost) / estimated_cost) * 100;

    const actual = await insertActual({
      estimateId: estimate_id,
      companyId: req.companyId!,
      estimatedCost: String(estimated_cost),
      actualCost: String(actual_cost),
      variancePct: String(Math.round(variancePct * 100) / 100),
      notes: notes ?? null,
      recordedAt: new Date(),
    });

    res.status(201).json(actual);
  }),
);

// GET /api/estimator/actuals — list all actuals for learning insights
router.get(
  "/estimator/actuals",
  requireAuth,
  requireCompany,
  requireTenantCtx,
  requireOwnerOrForeman,
  asyncHandler(async (req, res) => {
    const actuals = await listActualsForCompany(req.companyId!);
    res.json(actuals);
  }),
);

export default router;
