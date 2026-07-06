import { Router } from "express";
import { requireAuth, requireCompany, requireTenantCtx, requireOwner } from "../lib/auth";
import { asyncHandler } from "../lib/asyncHandler";
import {
  CreateCompanyBody,
  UpdateMemberRoleBody,
  UpdateCompanyDocumentSettingsBody,
  UpdateCompanyLogoBody,
  UpdateCompanyQuoteTemplateBody,
  UpdateCompanyInvoiceTemplateBody,
} from "@workspace/api-zod";
import crypto from "crypto";
import { z } from "zod";
import { logAuditEventFromRequest } from "../utils/logger";
import {
  getCompanyById,
  getCompanySettings,
  updateCompanyProfile,
  updateCompanyLogo,
  updateCompanyQuoteTemplate,
  updateCompanyInvoiceTemplate,
  updateCompanyDocumentSettings,
  listCompanyMembers,
  getMembership,
} from "../repositories/companies";
import {
  createCompany,
  resolveClaimInviteToken,
  claimCompany,
} from "../services/companies/provisioningService";
import {
  removeMember,
  updateMemberRole,
  renameMember,
  getMemberPermissions,
  updateMemberPermissions,
} from "../services/companies/membershipService";
import { getAvailableFeatures, toggleFeature } from "../services/companies/featuresService";

const UpdateCompanyProfileBody = z.object({
  name: z.string().min(1).max(200).optional(),
  phone: z.string().max(50).optional(),
  address: z.string().max(300).optional(),
  city: z.string().max(100).optional(),
  province: z.string().max(100).optional(),
  website: z.string().url().or(z.literal("")).optional(),
  hstNumber: z.string().max(50).optional(),
  estimatorConfig: z.record(z.unknown()).optional(),
});

const router = Router();

// POST /companies — create company and set requester as owner
// Uses requireAuth but deliberately omits requireCompany: a brand-new user has
// no company yet and must be able to call this endpoint during onboarding.
router.post("/companies", requireAuth, asyncHandler(async (req, res) => {
  const parsed = CreateCompanyBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body", details: parsed.error });
    return;
  }

  // Pull optional referredByCode from request body (not part of CreateCompanyBody schema)
  const referredByCode = typeof req.body.referredByCode === "string"
    ? req.body.referredByCode.trim() || null
    : null;

  // Generate a unique 8-char referral code for this company
  const referralCode = crypto.randomBytes(4).toString("hex").toUpperCase();

  const company = await createCompany(req.userId!, parsed.data, referralCode, referredByCode);

  res.status(201).json(company);
}));

// GET /companies/:companyId
router.get("/companies/:companyId", requireAuth, requireCompany, requireTenantCtx, asyncHandler(async (req, res) => {
  const companyId = parseInt(req.params.companyId as string);
  if (companyId !== req.companyId) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const company = await getCompanyById(companyId);
  if (!company) {
    res.status(404).json({ error: "Company not found" });
    return;
  }

  res.json(company);
}));

// GET /companies/:companyId/settings
router.get("/companies/:companyId/settings", requireAuth, requireCompany, requireTenantCtx, asyncHandler(async (req, res) => {
  const companyId = parseInt(req.params.companyId as string);
  if (companyId !== req.companyId) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const row = await getCompanySettings(companyId);

  res.json({
    estimatorConfig: (row?.estimatorConfig ?? {}) as Record<string, unknown>,
    quoteNumberPrefix: row?.quoteNumberPrefix ?? "QUO",
    invoiceNumberPrefix: row?.invoiceNumberPrefix ?? "INV",
    quoteStartNumber: row?.quoteStartNumber ?? 1,
    invoiceStartNumber: row?.invoiceStartNumber ?? 1,
    defaultQuoteTerms: row?.defaultQuoteTerms ?? "",
    defaultInvoiceNotes: row?.defaultInvoiceNotes ?? "",
  });
}));

// PATCH /companies/:companyId — update company profile details
router.patch("/companies/:companyId", requireAuth, requireCompany, requireTenantCtx, asyncHandler(async (req, res) => {
  const companyId = parseInt(req.params.companyId as string);
  if (companyId !== req.companyId) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const parsed = UpdateCompanyProfileBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body", details: parsed.error.flatten() });
    return;
  }

  const body = parsed.data;
  const update: Record<string, unknown> = {};
  if (body.name !== undefined) update.name = body.name.trim();
  if (body.phone !== undefined) update.phone = body.phone.trim();
  if (body.address !== undefined) update.address = body.address.trim();
  if (body.city !== undefined) update.city = body.city.trim();
  if (body.province !== undefined) update.province = body.province.trim();
  if (body.website !== undefined) update.website = body.website.trim();
  if (body.hstNumber !== undefined) update.hstNumber = body.hstNumber.trim();
  if (body.estimatorConfig !== undefined) update.estimatorConfig = body.estimatorConfig;

  if (Object.keys(update).length === 0) {
    res.status(400).json({ error: "No updatable fields provided" });
    return;
  }

  const updated = await updateCompanyProfile(companyId, update);

  res.json(updated);
}));

// PATCH /companies/:companyId/logo — update company logo path
router.patch("/companies/:companyId/logo", requireAuth, requireCompany, requireTenantCtx, asyncHandler(async (req, res) => {
  const companyId = parseInt(req.params.companyId as string);
  if (companyId !== req.companyId) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const parsed = UpdateCompanyLogoBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body", details: parsed.error.flatten() });
    return;
  }

  // Empty string clears the logo (removes it); any non-empty path sets it
  const logoPath = parsed.data.logoPath || null;

  const updated = await updateCompanyLogo(companyId, logoPath);

  res.json(updated);
}));

// PATCH /companies/:companyId/quote-template — set or clear quote template path
router.patch("/companies/:companyId/quote-template", requireAuth, requireCompany, requireTenantCtx, asyncHandler(async (req, res) => {
  const companyId = parseInt(req.params.companyId as string);
  if (companyId !== req.companyId) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const parsed = UpdateCompanyQuoteTemplateBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body", details: parsed.error.flatten() });
    return;
  }

  // Empty string is treated the same as null — clears the template
  const templatePath = parsed.data.templatePath || null;

  const updated = await updateCompanyQuoteTemplate(companyId, templatePath);

  res.json(updated);
}));

// PATCH /companies/:companyId/invoice-template — set or clear invoice template path
router.patch("/companies/:companyId/invoice-template", requireAuth, requireCompany, requireTenantCtx, asyncHandler(async (req, res) => {
  const companyId = parseInt(req.params.companyId as string);
  if (companyId !== req.companyId) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const parsed = UpdateCompanyInvoiceTemplateBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body", details: parsed.error.flatten() });
    return;
  }

  // Empty string is treated the same as null — clears the template
  const templatePath = parsed.data.templatePath || null;

  const updated = await updateCompanyInvoiceTemplate(companyId, templatePath);

  res.json(updated);
}));

// PATCH /companies/:companyId/document-settings — update numbering + boilerplate
router.patch("/companies/:companyId/document-settings", requireAuth, requireCompany, requireTenantCtx, asyncHandler(async (req, res) => {
  const companyId = parseInt(req.params.companyId as string);
  if (companyId !== req.companyId) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const parsed = UpdateCompanyDocumentSettingsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body", details: parsed.error.flatten() });
    return;
  }

  const body = parsed.data;
  const update: Record<string, unknown> = {};

  if (typeof body.quoteNumberPrefix === "string") {
    update.quoteNumberPrefix = body.quoteNumberPrefix.trim() || "QUO";
  }
  if (typeof body.invoiceNumberPrefix === "string") {
    update.invoiceNumberPrefix = body.invoiceNumberPrefix.trim() || "INV";
  }
  if (typeof body.quoteStartNumber === "number") {
    update.quoteStartNumber = Math.max(1, Math.floor(body.quoteStartNumber));
  }
  if (typeof body.invoiceStartNumber === "number") {
    update.invoiceStartNumber = Math.max(1, Math.floor(body.invoiceStartNumber));
  }
  if (body.defaultQuoteTerms !== undefined) {
    update.defaultQuoteTerms = typeof body.defaultQuoteTerms === "string"
      ? body.defaultQuoteTerms.trim() || null
      : null;
  }
  if (body.defaultInvoiceNotes !== undefined) {
    update.defaultInvoiceNotes = typeof body.defaultInvoiceNotes === "string"
      ? body.defaultInvoiceNotes.trim() || null
      : null;
  }

  if (Object.keys(update).length === 0) {
    res.status(400).json({ error: "No updatable fields provided" });
    return;
  }

  const updated = await updateCompanyDocumentSettings(companyId, update);

  res.json(updated);
}));

// GET /companies/:companyId/members
router.get(
  "/companies/:companyId/members",
  requireAuth,
  requireCompany,
  requireTenantCtx,
  asyncHandler(async (req, res) => {
    const companyId = parseInt(req.params.companyId as string);
    if (companyId !== req.companyId) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    const members = await listCompanyMembers(companyId);

    const result = members.map((m) => ({ ...m, company: null }));
    res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.set("Pragma", "no-cache");
    res.set("Expires", "0");
    res.json(result);
  }),
);

// DELETE /companies/:companyId/members/:userId
router.delete(
  "/companies/:companyId/members/:userId",
  requireAuth,
  requireCompany,
  requireTenantCtx,
  requireOwner,
  asyncHandler(async (req, res) => {
    const companyId = parseInt(req.params.companyId as string);
    const targetUserId = parseInt(req.params.userId as string);

    if (companyId !== req.companyId) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    if (targetUserId === req.userId) {
      res.status(400).json({ error: "Cannot remove yourself" });
      return;
    }

    await removeMember(companyId, targetUserId);

    logAuditEventFromRequest(req, "Member Removed", `User ${targetUserId} removed from company ${companyId}`).catch(() => {});
    res.status(204).send();
  }),
);

// PATCH /companies/:companyId/members/:userId — update role
router.patch(
  "/companies/:companyId/members/:userId",
  requireAuth,
  requireCompany,
  requireTenantCtx,
  requireOwner,
  asyncHandler(async (req, res) => {
    const companyId = parseInt(req.params.companyId as string);
    const targetUserId = parseInt(req.params.userId as string);

    if (companyId !== req.companyId) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    const parsed = UpdateMemberRoleBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid body" });
      return;
    }

    // Dual-write role to memberships + legacy columns (Phase 0)
    const updated = await updateMemberRole(companyId, targetUserId, parsed.data.role);
    logAuditEventFromRequest(req, "Member Role Changed", `User ${targetUserId} role changed to ${parsed.data.role}`).catch(() => {});

    res.json({ ...updated, company: null });
  }),
);

// PATCH /companies/:companyId/members/:userId/name — update member name
router.patch(
  "/companies/:companyId/members/:userId/name",
  requireAuth,
  requireCompany,
  requireTenantCtx,
  requireOwner,
  asyncHandler(async (req, res) => {
    const companyId = parseInt(req.params.companyId as string);
    const targetUserId = parseInt(req.params.userId as string);

    if (companyId !== req.companyId) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    const { firstName, lastName } = req.body;
    if (typeof firstName !== "string" || typeof lastName !== "string") {
      res.status(400).json({ error: "firstName and lastName are required" });
      return;
    }

    const updated = await renameMember(companyId, targetUserId, firstName, lastName);

    if (!updated) {
      res.status(404).json({ error: "Member not found" });
      return;
    }

    res.json({ ...updated, company: null });
  }),
);

// GET /companies/:companyId/members/:userId/permissions — get member's custom permissions
router.get(
  "/companies/:companyId/members/:userId/permissions",
  requireAuth,
  requireCompany,
  requireTenantCtx,
  requireOwner,
  asyncHandler(async (req, res) => {
    const companyId = parseInt(req.params.companyId as string);
    const targetUserId = parseInt(req.params.userId as string);

    if (companyId !== req.companyId) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    // Owners cannot edit their own permissions
    if (targetUserId === req.userId) {
      res.status(400).json({ error: "Cannot modify your own permissions" });
      return;
    }

    const membership = await getMemberPermissions(companyId, targetUserId);

    if (!membership) {
      res.status(404).json({ error: "Member not found" });
      return;
    }

    res.json(membership.permissions ?? null);
  }),
);

// PUT /companies/:companyId/members/:userId/permissions — update member's custom permissions
router.put(
  "/companies/:companyId/members/:userId/permissions",
  requireAuth,
  requireCompany,
  requireTenantCtx,
  requireOwner,
  asyncHandler(async (req, res) => {
    const companyId = parseInt(req.params.companyId as string);
    const targetUserId = parseInt(req.params.userId as string);

    if (companyId !== req.companyId) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    // Owners cannot edit their own permissions
    if (targetUserId === req.userId) {
      res.status(400).json({ error: "Cannot modify your own permissions" });
      return;
    }

    // Verify target user is a member of this company
    const membership = await getMembership(companyId, targetUserId);
    if (!membership) {
      res.status(404).json({ error: "Member not found" });
      return;
    }

    // Accept any subset of MemberPermissions keys; merge into existing JSONB
    const { memberPermissionsSchema } = await import("@workspace/db");
    const parsed = memberPermissionsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid permissions body", details: parsed.error });
      return;
    }

    const updatedPermissions = await updateMemberPermissions(companyId, targetUserId, parsed.data);

    res.json(updatedPermissions ?? {});
  }),
);

// GET /companies/:companyId/features
// Returns the effective feature keys for a tenant (custom package or plan-based)
router.get(
  "/companies/:companyId/features",
  requireAuth,
  requireCompany,
  requireTenantCtx,
  asyncHandler(async (req, res) => {
    const companyId = parseInt(req.params.companyId as string);
    if (companyId !== req.companyId) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    const { getCompanyFeatureKeys } = await import("../lib/featureGate");
    const features = await getCompanyFeatureKeys(companyId);
    res.json({ features });
  }),
);

// GET /companies/claim-invite/:token — resolve a signup invite token to a company ID
// PUBLIC — no requireAuth. The new owner arrives via /sign-up?token=X before having a
// DB user record. This lets the frontend fetch the companyId without exposing it in the
// invite link itself.
router.get("/companies/claim-invite/:token", asyncHandler(async (req, res) => {
  const token = (req.params.token as string).trim();
  if (!token) {
    res.status(400).json({ error: "Token is required" });
    return;
  }

  const companyId = await resolveClaimInviteToken(token);

  if (!companyId) {
    res.status(404).json({ error: "Invalid or expired signup invite" });
    return;
  }

  res.json({ companyId });
}));

// POST /companies/:companyId/claim — claim a pre-created company as owner
// Requires the one-time claimToken set by the super-admin at tenant creation.
// All mutations are wrapped in a single transaction to prevent partial provisioning
// if a network failure occurs mid-stream.
router.post("/companies/:companyId/claim", requireAuth, asyncHandler(async (req, res) => {
  const companyId = parseInt(req.params.companyId as string);
  if (isNaN(companyId)) {
    res.status(400).json({ error: "Invalid companyId" });
    return;
  }

  // Require the caller to supply the claim token
  const suppliedToken = typeof req.body.claimToken === "string" ? req.body.claimToken.trim() : null;
  if (!suppliedToken) {
    res.status(400).json({ error: "claimToken is required" });
    return;
  }

  // Extract onboarding fields from request body
  const companyName = typeof req.body.companyName === "string"
    ? req.body.companyName.trim()
    : null;
  const planTier = typeof req.body.planTier === "string"
    ? req.body.planTier.trim().toLowerCase()
    : "starter";

  const result = await claimCompany({
    companyId,
    requestingUserId: req.userId!,
    suppliedToken,
    companyName,
    planTier,
  });

  if (!result.ok) {
    res.status(result.status).json({ error: result.error });
    return;
  }

  res.json({ company: result.company, user: result.user });
}));

// ── Self-service feature management (company owner) ─────────────────────────

// GET /companies/:companyId/features/available
// Returns all globally-enabled features with a flag showing whether each is
// currently active for this company (plan-based or via activeFeatures override).
router.get(
  "/companies/:companyId/features/available",
  requireAuth,
  requireCompany,
  requireTenantCtx,
  requireOwner,
  asyncHandler(async (req, res) => {
    const companyId = parseInt(req.params.companyId as string, 10);
    if (companyId !== req.companyId) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    const result = await getAvailableFeatures(companyId);

    res.json({ features: result });
  }),
);

// PATCH /companies/:companyId/features/toggle
// Lets an owner enable or disable a specific feature for their company.
// Builds (or updates) the company's custom activeFeatures override array.
router.patch(
  "/companies/:companyId/features/toggle",
  requireAuth,
  requireCompany,
  requireTenantCtx,
  requireOwner,
  asyncHandler(async (req, res) => {
    const companyId = parseInt(req.params.companyId as string, 10);
    if (companyId !== req.companyId) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    const { featureKey, enabled } = req.body as { featureKey: string; enabled: boolean };
    if (typeof featureKey !== "string" || !featureKey.trim()) {
      res.status(400).json({ error: "featureKey is required" });
      return;
    }
    if (typeof enabled !== "boolean") {
      res.status(400).json({ error: "enabled must be a boolean" });
      return;
    }

    const result = await toggleFeature(companyId, featureKey, enabled);
    if (!result) {
      res.status(404).json({ error: "Feature not found" });
      return;
    }

    res.json({ ok: true, featureKey: result.normalizedKey, enabled, activeFeatures: result.activeFeatures });
  }),
);

export default router;
