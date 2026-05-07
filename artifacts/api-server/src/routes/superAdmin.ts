import { Router } from "express";
import { db } from "@workspace/db";
import {
  plansTable,
  featuresTable,
  planFeaturesTable,
  subscriptionsTable,
  companiesTable,
  usersTable,
  insertPlanSchema,
  insertFeatureSchema,
} from "@workspace/db";
import { eq, and, inArray, sql } from "drizzle-orm";
import { requireAuth, requireSuperAdmin } from "../lib/auth";

const router = Router();
const guard = [requireAuth, requireSuperAdmin];

// ── Plans ──────────────────────────────────────────────────────────────────────

// GET /admin/plans
router.get("/admin/plans", ...guard, async (req, res) => {
  const plans = await db.select().from(plansTable).orderBy(plansTable.monthlyPrice);
  const features = await db.select().from(planFeaturesTable);
  const planList = plans.map((p) => ({
    ...p,
    featureIds: features.filter((f) => f.planId === p.id).map((f) => f.featureId),
  }));
  res.json(planList);
});

// POST /admin/plans
router.post("/admin/plans", ...guard, async (req, res) => {
  const body = insertPlanSchema.parse(req.body);
  const [plan] = await db.insert(plansTable).values(body).returning();
  res.status(201).json(plan);
});

// PATCH /admin/plans/:id
router.patch("/admin/plans/:id", ...guard, async (req, res) => {
  const id = Number(req.params.id);
  const body = insertPlanSchema.partial().parse(req.body);
  const [plan] = await db.update(plansTable).set(body).where(eq(plansTable.id, id)).returning();
  if (!plan) { res.status(404).json({ error: "Plan not found" }); return; }
  res.json(plan);
});

// DELETE /admin/plans/:id
router.delete("/admin/plans/:id", ...guard, async (req, res) => {
  const id = Number(req.params.id);
  await db.delete(plansTable).where(eq(plansTable.id, id));
  res.json({ ok: true });
});

// ── Features ───────────────────────────────────────────────────────────────────

// GET /admin/features
router.get("/admin/features", ...guard, async (req, res) => {
  const features = await db.select().from(featuresTable).orderBy(featuresTable.name);
  res.json(features);
});

// POST /admin/features
router.post("/admin/features", ...guard, async (req, res) => {
  const body = insertFeatureSchema.parse(req.body);
  const [feature] = await db.insert(featuresTable).values(body).returning();
  res.status(201).json(feature);
});

// PATCH /admin/features/:id
router.patch("/admin/features/:id", ...guard, async (req, res) => {
  const id = Number(req.params.id);
  const body = insertFeatureSchema.partial().parse(req.body);
  const [feature] = await db
    .update(featuresTable).set(body).where(eq(featuresTable.id, id)).returning();
  if (!feature) { res.status(404).json({ error: "Feature not found" }); return; }
  res.json(feature);
});

// DELETE /admin/features/:id
router.delete("/admin/features/:id", ...guard, async (req, res) => {
  const id = Number(req.params.id);
  await db.delete(featuresTable).where(eq(featuresTable.id, id));
  res.json({ ok: true });
});

// ── Plan ↔ Feature assignment ──────────────────────────────────────────────────

// GET /admin/plans/:id/features
router.get("/admin/plans/:id/features", ...guard, async (req, res) => {
  const planId = Number(req.params.id);
  const rows = await db
    .select({ feature: featuresTable })
    .from(planFeaturesTable)
    .innerJoin(featuresTable, eq(featuresTable.id, planFeaturesTable.featureId))
    .where(eq(planFeaturesTable.planId, planId));
  res.json(rows.map((r) => r.feature));
});

// PUT /admin/plans/:id/features  — replace feature set for a plan
router.put("/admin/plans/:id/features", ...guard, async (req, res) => {
  const planId = Number(req.params.id);
  const { featureIds } = req.body as { featureIds: number[] };
  if (!Array.isArray(featureIds)) {
    res.status(400).json({ error: "featureIds must be an array" });
    return;
  }
  await db.delete(planFeaturesTable).where(eq(planFeaturesTable.planId, planId));
  if (featureIds.length > 0) {
    await db.insert(planFeaturesTable).values(featureIds.map((fid) => ({ planId, featureId: fid })));
  }
  res.json({ ok: true, planId, featureIds });
});

// ── Tenants ────────────────────────────────────────────────────────────────────

// GET /admin/tenants
router.get("/admin/tenants", ...guard, async (req, res) => {
  const companies = await db.select().from(companiesTable).orderBy(companiesTable.name);
  const subs = await db.select().from(subscriptionsTable);
  const plans = await db.select().from(plansTable);

  const userCounts = await db
    .select({ companyId: usersTable.companyId, count: sql<number>`count(*)` })
    .from(usersTable)
    .groupBy(usersTable.companyId);

  const result = companies.map((c) => {
    const sub = subs.find((s) => s.companyId === c.id) ?? null;
    const plan = sub ? (plans.find((p) => p.id === sub.planId) ?? null) : null;
    const uc = userCounts.find((u) => u.companyId === c.id);
    return { ...c, subscription: sub, plan, userCount: Number(uc?.count ?? 0) };
  });
  res.json(result);
});

// PATCH /admin/tenants/:id/subscription — assign or update subscription
router.patch("/admin/tenants/:id/subscription", ...guard, async (req, res) => {
  const companyId = Number(req.params.id);
  const { planId, status, billingCycle } = req.body as {
    planId?: number; status?: string; billingCycle?: string;
  };

  const existing = await db
    .select().from(subscriptionsTable).where(eq(subscriptionsTable.companyId, companyId)).limit(1);

  if (existing.length === 0) {
    if (!planId) { res.status(400).json({ error: "planId required to create subscription" }); return; }
    const [sub] = await db.insert(subscriptionsTable).values({
      companyId,
      planId,
      status: status ?? "active",
      billingCycle: billingCycle ?? "monthly",
    }).returning();
    res.json(sub);
  } else {
    const updates: Record<string, unknown> = {};
    if (planId !== undefined) updates.planId = planId;
    if (status !== undefined) updates.status = status;
    if (billingCycle !== undefined) updates.billingCycle = billingCycle;
    updates.updatedAt = new Date();

    const [sub] = await db
      .update(subscriptionsTable)
      .set(updates)
      .where(eq(subscriptionsTable.companyId, companyId))
      .returning();
    res.json(sub);
  }
});

// ── Per-Tenant Feature Override ────────────────────────────────────────────────

// GET /admin/tenants/:id/features
// Returns the tenant's current activeFeatures (custom package) or empty array if using plan defaults
router.get("/admin/tenants/:id/features", ...guard, async (req, res) => {
  const companyId = Number(req.params.id);
  const [company] = await db
    .select({ activeFeatures: companiesTable.activeFeatures })
    .from(companiesTable)
    .where(eq(companiesTable.id, companyId))
    .limit(1);
  if (!company) { res.status(404).json({ error: "Tenant not found" }); return; }
  res.json({ activeFeatures: company.activeFeatures ?? [] });
});

// PATCH /admin/tenants/:id/features
// Set or clear custom feature override for a tenant
router.patch("/admin/tenants/:id/features", ...guard, async (req, res) => {
  const companyId = Number(req.params.id);
  const { activeFeatures } = req.body as { activeFeatures: string[] | null };

  if (activeFeatures !== null && !Array.isArray(activeFeatures)) {
    res.status(400).json({ error: "activeFeatures must be an array of strings or null" });
    return;
  }
  if (Array.isArray(activeFeatures) && activeFeatures.some((f) => typeof f !== "string")) {
    res.status(400).json({ error: "All activeFeatures entries must be strings" });
    return;
  }

  const [updated] = await db
    .update(companiesTable)
    .set({ activeFeatures: activeFeatures ?? null })
    .where(eq(companiesTable.id, companyId))
    .returning({ id: companiesTable.id, activeFeatures: companiesTable.activeFeatures });

  if (!updated) { res.status(404).json({ error: "Tenant not found" }); return; }
  res.json({ ok: true, companyId, activeFeatures: updated.activeFeatures ?? [] });
});

// ── Promote/demote super admin ─────────────────────────────────────────────────

// PATCH /admin/users/:id/system-role
router.patch("/admin/users/:id/system-role", ...guard, async (req, res) => {
  const id = Number(req.params.id);
  const { systemRole } = req.body as { systemRole: string | null };
  const [user] = await db
    .update(usersTable)
    .set({ systemRole: systemRole ?? null })
    .where(eq(usersTable.id, id))
    .returning();
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  res.json(user);
});

// ── Seed Data ──────────────────────────────────────────────────────────────────

router.post("/admin/seed", ...guard, async (req, res) => {
  const existingPlans = await db.select().from(plansTable);
  if (existingPlans.length === 0) {
    await db.insert(plansTable).values([
      { name: "Starter", slug: "starter", description: "For small crews just getting started", monthlyPrice: "49", yearlyPrice: "490", maxSeats: 5 },
      { name: "Pro", slug: "pro", description: "For growing construction companies", monthlyPrice: "99", yearlyPrice: "990", maxSeats: 20 },
      { name: "Enterprise", slug: "enterprise", description: "Unlimited scale for large operations", monthlyPrice: "249", yearlyPrice: "2490", maxSeats: 100 },
    ]);
  }

  const existingFeatures = await db.select().from(featuresTable);
  if (existingFeatures.length === 0) {
    await db.insert(featuresTable).values([
      { name: "Scheduling",              key: "SCHEDULING",      description: "Worker and project scheduling tools" },
      { name: "AI Estimating",           key: "AI_ESTIMATING",   description: "AI-powered cost estimating" },
      { name: "Client Portal",           key: "CLIENT_PORTAL",   description: "Shared client portal for project visibility" },
      { name: "Reporting",               key: "REPORTING",       description: "Advanced reports and analytics" },
      { name: "QuickBooks Integration",  key: "QUICKBOOKS",      description: "Sync invoices and costs with QuickBooks" },
      { name: "AI Chat",                 key: "AI_CHAT",         description: "AI assistant for construction queries" },
      { name: "Site Vision AI",          key: "SITE_VISION_AI",  description: "AI-powered photo analysis and OCR" },
      { name: "TradeHub",                key: "TRADEHUB",        description: "Marketplace for trade professionals" },
      { name: "Financials",              key: "FINANCIALS",      description: "Full financial tracking and management" },
      { name: "Risk Dashboard",          key: "RISK_DASHBOARD",  description: "AI risk scoring and inspection alerts" },
      { name: "Safety Forms",            key: "SAFETY_FORMS",    description: "Digital safety and incident reporting" },
      { name: "Daily Reports",           key: "DAILY_REPORTS",   description: "Field daily report submission" },
      { name: "RFIs",                    key: "RFIS",            description: "Request for Information tracking" },
      { name: "Team Management",         key: "TEAM_MANAGEMENT", description: "Crew and role management" },
      { name: "Invoices",                key: "INVOICES",        description: "Invoice creation and tracking" },
      { name: "Quotes & Proposals",      key: "QUOTES",          description: "Quote generation and approval" },
      { name: "CRM & Leads",             key: "CRM_LEADS",       description: "Lead management and CRM" },
      { name: "Smart Estimator",         key: "SMART_ESTIMATOR", description: "Hybrid AI + rule-based estimating" },
      { name: "Inspections",             key: "INSPECTIONS",     description: "Site inspection management" },
    ]);
  }

  const plans = await db.select().from(plansTable);
  const features = await db.select().from(featuresTable);
  const pf = await db.select().from(planFeaturesTable);

  if (pf.length === 0) {
    const starter = plans.find((p) => p.slug === "starter")!;
    const pro = plans.find((p) => p.slug === "pro")!;
    const enterprise = plans.find((p) => p.slug === "enterprise")!;

    const get = (key: string) => features.find((f) => f.key === key);

    // Starter: core essentials
    const starterFeatures = ["SCHEDULING", "DAILY_REPORTS", "TEAM_MANAGEMENT", "SAFETY_FORMS", "RFIS", "AI_CHAT"];
    if (starter) {
      const vals = starterFeatures.map((k) => get(k)).filter(Boolean);
      if (vals.length > 0) {
        await db.insert(planFeaturesTable).values(
          vals.map((f) => ({ planId: starter.id, featureId: f!.id }))
        ).onConflictDoNothing();
      }
    }

    // Pro: everything except Inspections, Risk Dashboard
    const proKeys = ["SCHEDULING", "AI_ESTIMATING", "CLIENT_PORTAL", "REPORTING", "QUICKBOOKS", "AI_CHAT",
      "SITE_VISION_AI", "TRADEHUB", "FINANCIALS", "SAFETY_FORMS", "DAILY_REPORTS", "RFIS",
      "TEAM_MANAGEMENT", "INVOICES", "QUOTES", "CRM_LEADS", "SMART_ESTIMATOR"];
    if (pro) {
      const vals = proKeys.map((k) => get(k)).filter(Boolean);
      if (vals.length > 0) {
        await db.insert(planFeaturesTable).values(
          vals.map((f) => ({ planId: pro.id, featureId: f!.id }))
        ).onConflictDoNothing();
      }
    }

    // Enterprise: all features
    if (enterprise) {
      await db.insert(planFeaturesTable).values(
        features.map((f) => ({ planId: enterprise.id, featureId: f.id }))
      ).onConflictDoNothing();
    }
  }

  res.json({ ok: true, message: "Seed data applied" });
});

// ── Feature Gate middleware (exported for use in other routes) ──────────────────
export { requireFeature } from "../lib/featureGate";

export default router;
