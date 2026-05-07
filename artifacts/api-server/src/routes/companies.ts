import { Router } from "express";
import { db, usersTable, companiesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth, requireCompany, requireOwner } from "../lib/auth";
import { CreateCompanyBody, UpdateMemberRoleBody } from "@workspace/api-zod";
import crypto from "crypto";

const router = Router();

// POST /companies — create company and set requester as owner
router.post("/companies", requireAuth, async (req, res) => {
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

  const [company] = await db
    .insert(companiesTable)
    .values({ ...parsed.data, referralCode, referredByCode })
    .returning();

  // Assign requester as owner of this company
  await db
    .update(usersTable)
    .set({ companyId: company.id, role: "owner" })
    .where(eq(usersTable.id, req.userId!));

  res.status(201).json(company);
});

// GET /companies/:companyId
router.get("/companies/:companyId", requireAuth, requireCompany, async (req, res) => {
  const companyId = parseInt(req.params.companyId);
  if (companyId !== req.companyId) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const [company] = await db
    .select()
    .from(companiesTable)
    .where(eq(companiesTable.id, companyId))
    .limit(1);

  if (!company) {
    res.status(404).json({ error: "Company not found" });
    return;
  }

  res.json(company);
});

// PATCH /companies/:companyId — update company profile details
router.patch("/companies/:companyId", requireAuth, requireCompany, async (req, res) => {
  const companyId = parseInt(req.params.companyId as string);
  if (companyId !== req.companyId) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const allowed = ["name", "phone", "address", "city", "province", "website", "hstNumber"] as const;
  const update: Record<string, string> = {};
  for (const key of allowed) {
    if (typeof req.body?.[key] === "string") {
      update[key === "hstNumber" ? "hstNumber" : key] = req.body[key].trim();
    }
  }

  if (Object.keys(update).length === 0) {
    res.status(400).json({ error: "No updatable fields provided" });
    return;
  }

  const [updated] = await db
    .update(companiesTable)
    .set(update as any)
    .where(eq(companiesTable.id, companyId))
    .returning();

  res.json(updated);
});

// PATCH /companies/:companyId/logo — update company logo path
router.patch("/companies/:companyId/logo", requireAuth, requireCompany, async (req, res) => {
  const companyId = parseInt(req.params.companyId);
  if (companyId !== req.companyId) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const logoPath = typeof req.body?.logoPath === "string" ? req.body.logoPath : null;
  if (!logoPath) {
    res.status(400).json({ error: "logoPath is required" });
    return;
  }

  const [updated] = await db
    .update(companiesTable)
    .set({ logoPath })
    .where(eq(companiesTable.id, companyId))
    .returning();

  res.json(updated);
});

// PATCH /companies/:companyId/quote-template — set or clear quote template path
router.patch("/companies/:companyId/quote-template", requireAuth, requireCompany, async (req, res) => {
  const companyId = parseInt(req.params.companyId);
  if (companyId !== req.companyId) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const templatePath = typeof req.body?.templatePath === "string" ? req.body.templatePath || null : null;

  const [updated] = await db
    .update(companiesTable)
    .set({ quoteTemplatePath: templatePath })
    .where(eq(companiesTable.id, companyId))
    .returning();

  res.json(updated);
});

// PATCH /companies/:companyId/invoice-template — set or clear invoice template path
router.patch("/companies/:companyId/invoice-template", requireAuth, requireCompany, async (req, res) => {
  const companyId = parseInt(req.params.companyId);
  if (companyId !== req.companyId) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const templatePath = typeof req.body?.templatePath === "string" ? req.body.templatePath || null : null;

  const [updated] = await db
    .update(companiesTable)
    .set({ invoiceTemplatePath: templatePath })
    .where(eq(companiesTable.id, companyId))
    .returning();

  res.json(updated);
});

// GET /companies/:companyId/members
router.get(
  "/companies/:companyId/members",
  requireAuth,
  requireCompany,
  async (req, res) => {
    const companyId = parseInt(req.params.companyId);
    if (companyId !== req.companyId) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    const members = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.companyId, companyId));

    const result = members.map((m) => ({ ...m, company: null }));
    res.json(result);
  },
);

// DELETE /companies/:companyId/members/:userId
router.delete(
  "/companies/:companyId/members/:userId",
  requireAuth,
  requireCompany,
  requireOwner,
  async (req, res) => {
    const companyId = parseInt(req.params.companyId);
    const targetUserId = parseInt(req.params.userId);

    if (companyId !== req.companyId) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    if (targetUserId === req.userId) {
      res.status(400).json({ error: "Cannot remove yourself" });
      return;
    }

    await db
      .update(usersTable)
      .set({ companyId: null })
      .where(eq(usersTable.id, targetUserId));

    res.status(204).send();
  },
);

// PATCH /companies/:companyId/members/:userId — update role
router.patch(
  "/companies/:companyId/members/:userId",
  requireAuth,
  requireCompany,
  requireOwner,
  async (req, res) => {
    const companyId = parseInt(req.params.companyId);
    const targetUserId = parseInt(req.params.userId);

    if (companyId !== req.companyId) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    const parsed = UpdateMemberRoleBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid body" });
      return;
    }

    const [updated] = await db
      .update(usersTable)
      .set({ role: parsed.data.role })
      .where(eq(usersTable.id, targetUserId))
      .returning();

    res.json({ ...updated, company: null });
  },
);

// PATCH /companies/:companyId/members/:userId/name — update member name
router.patch(
  "/companies/:companyId/members/:userId/name",
  requireAuth,
  requireCompany,
  requireOwner,
  async (req, res) => {
    const companyId = parseInt(req.params.companyId);
    const targetUserId = parseInt(req.params.userId);

    if (companyId !== req.companyId) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    const { firstName, lastName } = req.body;
    if (typeof firstName !== "string" || typeof lastName !== "string") {
      res.status(400).json({ error: "firstName and lastName are required" });
      return;
    }

    const [updated] = await db
      .update(usersTable)
      .set({ firstName: firstName.trim(), lastName: lastName.trim() })
      .where(and(eq(usersTable.id, targetUserId), eq(usersTable.companyId, companyId)))
      .returning();

    if (!updated) {
      res.status(404).json({ error: "Member not found" });
      return;
    }

    res.json({ ...updated, company: null });
  },
);

// GET /companies/:companyId/features
// Returns the effective feature keys for a tenant (custom package or plan-based)
router.get(
  "/companies/:companyId/features",
  requireAuth,
  requireCompany,
  async (req, res) => {
    const companyId = parseInt(req.params.companyId);
    if (companyId !== req.companyId) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    const { getCompanyFeatureKeys } = await import("../lib/featureGate");
    const features = await getCompanyFeatureKeys(companyId);
    res.json({ features });
  },
);

export default router;
