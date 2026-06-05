import { Router } from "express";
import { db } from "@workspace/db";
import {
  plansTable,
  featuresTable,
  planFeaturesTable,
  subscriptionsTable,
  companiesTable,
  usersTable,
  userMembershipsTable,
  invitationsTable,
  projectsTable,
  inspectionsTable,
  inspectionItemsTable,
  inspectionAlertsTable,
  timesheetsTable,
  quotesTable,
  invoicesTable,
  timeEntriesTable,
  changeOrdersTable,
  notificationsTable,
  dailyReportPhotosTable,
  dailyReportsTable,
  costAnalysesTable,
  rfisTable,
  tasksTable,
  projectDocumentsTable,
  workerSchedulesTable,
  builderEstimatesTable,
  leadsTable,
  contactsTable,
  paymentsTable,
  leadActivitiesTable,
  fileAttachmentsTable,
  quickbooksConnectionsTable,
  estimatorActualsTable,
  estimateTemplatesTable,
  insertPlanSchema,
  insertFeatureSchema,
  insertCompanySchema,
} from "@workspace/db";
import { z } from "zod/v4";
import { eq, and, sql } from "drizzle-orm";
import { requireAuth, requireSuperAdmin } from "../lib/auth";
import { getUncachableStripeClient } from "../lib/stripeClient";
import crypto from "crypto";

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

// POST /admin/plans — create plan in DB then auto-create Stripe product + prices
router.post("/admin/plans", ...guard, async (req, res) => {
  const raw = req.body as Record<string, unknown>;
  if (!raw.monthlyPrice || isNaN(Number(raw.monthlyPrice)) || !raw.yearlyPrice || isNaN(Number(raw.yearlyPrice))) {
    res.status(400).json({ error: "monthlyPrice and yearlyPrice are required and must be valid numbers" });
    return;
  }
  const PlanCreateBody = insertPlanSchema.pick({
    name: true,
    slug: true,
    description: true,
    monthlyPrice: true,
    yearlyPrice: true,
    maxSeats: true,
    isActive: true,
    customConfig: true,
  });
  const body = PlanCreateBody.parse(raw);
  const [plan] = await db.insert(plansTable).values(body).returning();

  try {
    const stripe = await getUncachableStripeClient();
    const product = await stripe.products.create({
      name: plan.name,
      description: plan.description ?? undefined,
      metadata: { plan: plan.slug, slug: plan.slug, maxSeats: String(plan.maxSeats), source: "site_snap_admin" },
    });

    const stripeUpdates: Record<string, string | null> = { stripeProductId: product.id };

    const monthlyAmount = Math.round(Number(plan.monthlyPrice) * 100);
    if (monthlyAmount > 0) {
      const monthlyPrice = await stripe.prices.create({
        product: product.id,
        unit_amount: monthlyAmount,
        currency: "cad",
        recurring: { interval: "month" },
        nickname: `${plan.name} Monthly`,
      });
      stripeUpdates.stripeMonthlyPriceId = monthlyPrice.id;
    }

    const yearlyAmount = Math.round(Number(plan.yearlyPrice) * 100);
    if (yearlyAmount > 0) {
      const yearlyPrice = await stripe.prices.create({
        product: product.id,
        unit_amount: yearlyAmount,
        currency: "cad",
        recurring: { interval: "year" },
        nickname: `${plan.name} Annual`,
      });
      stripeUpdates.stripeYearlyPriceId = yearlyPrice.id;
    }

    const [updated] = await db
      .update(plansTable)
      .set(stripeUpdates)
      .where(eq(plansTable.id, plan.id))
      .returning();

    res.status(201).json({ ...updated, featureIds: [] });
  } catch (stripeErr) {
    req.log.warn({ err: stripeErr }, "Stripe sync failed; plan created without Stripe product");
    res.status(201).json({ ...plan, featureIds: [] });
  }
});

// PATCH /admin/plans/:id — update plan and sync changes to Stripe
router.patch("/admin/plans/:id", ...guard, async (req, res) => {
  const id = Number(req.params.id);
  const raw = req.body as Record<string, unknown>;
  // Reject empty-string numeric fields before Zod / DB
  if ("monthlyPrice" in raw && (raw.monthlyPrice === "" || isNaN(Number(raw.monthlyPrice)))) {
    res.status(400).json({ error: "monthlyPrice must be a valid number" });
    return;
  }
  if ("yearlyPrice" in raw && (raw.yearlyPrice === "" || isNaN(Number(raw.yearlyPrice)))) {
    res.status(400).json({ error: "yearlyPrice must be a valid number" });
    return;
  }
  const PlanUpdateBody = insertPlanSchema.partial().pick({
    name: true,
    slug: true,
    description: true,
    monthlyPrice: true,
    yearlyPrice: true,
    maxSeats: true,
    isActive: true,
    stripeProductId: true,
    stripeMonthlyPriceId: true,
    stripeYearlyPriceId: true,
    customConfig: true,
  });
  const body = PlanUpdateBody.parse(raw);

  const [existing] = await db.select().from(plansTable).where(eq(plansTable.id, id)).limit(1);
  if (!existing) { res.status(404).json({ error: "Plan not found" }); return; }

  const [plan] = await db.update(plansTable).set(body).where(eq(plansTable.id, id)).returning();

  if (plan.stripeProductId) {
    try {
      const stripe = await getUncachableStripeClient();
      const stripeUpdates: Record<string, string | null> = {};

      await stripe.products.update(plan.stripeProductId, {
        name: plan.name,
        description: plan.description ?? undefined,
        metadata: { plan: plan.slug, slug: plan.slug, maxSeats: String(plan.maxSeats), source: "site_snap_admin" },
        ...(body.isActive !== undefined ? { active: plan.isActive } : {}),
      });

      if (body.monthlyPrice !== undefined) {
        const newAmount = Math.round(Number(plan.monthlyPrice) * 100);
        const oldAmount = Math.round(Number(existing.monthlyPrice) * 100);
        if (newAmount !== oldAmount) {
          if (existing.stripeMonthlyPriceId) {
            await stripe.prices.update(existing.stripeMonthlyPriceId, { active: false }).catch(() => {});
          }
          if (newAmount > 0) {
            const newPrice = await stripe.prices.create({
              product: plan.stripeProductId,
              unit_amount: newAmount,
              currency: "cad",
              recurring: { interval: "month" },
              nickname: `${plan.name} Monthly`,
            });
            stripeUpdates.stripeMonthlyPriceId = newPrice.id;
          } else {
            stripeUpdates.stripeMonthlyPriceId = null;
          }
        }
      }

      if (body.yearlyPrice !== undefined) {
        const newAmount = Math.round(Number(plan.yearlyPrice) * 100);
        const oldAmount = Math.round(Number(existing.yearlyPrice) * 100);
        if (newAmount !== oldAmount) {
          if (existing.stripeYearlyPriceId) {
            await stripe.prices.update(existing.stripeYearlyPriceId, { active: false }).catch(() => {});
          }
          if (newAmount > 0) {
            const newPrice = await stripe.prices.create({
              product: plan.stripeProductId,
              unit_amount: newAmount,
              currency: "cad",
              recurring: { interval: "year" },
              nickname: `${plan.name} Annual`,
            });
            stripeUpdates.stripeYearlyPriceId = newPrice.id;
          } else {
            stripeUpdates.stripeYearlyPriceId = null;
          }
        }
      }

      if (Object.keys(stripeUpdates).length > 0) {
        const [updated] = await db
          .update(plansTable)
          .set(stripeUpdates)
          .where(eq(plansTable.id, plan.id))
          .returning();
        res.json(updated);
        return;
      }
    } catch (stripeErr) {
      req.log.warn({ err: stripeErr }, "Stripe sync failed during plan update");
    }
  }

  res.json(plan);
});

// DELETE /admin/plans/:id — archive Stripe product then delete plan
router.delete("/admin/plans/:id", ...guard, async (req, res) => {
  const id = Number(req.params.id);

  const [plan] = await db.select().from(plansTable).where(eq(plansTable.id, id)).limit(1);

  if (plan?.stripeProductId) {
    try {
      const stripe = await getUncachableStripeClient();
      if (plan.stripeMonthlyPriceId) {
        await stripe.prices.update(plan.stripeMonthlyPriceId, { active: false }).catch(() => {});
      }
      if (plan.stripeYearlyPriceId) {
        await stripe.prices.update(plan.stripeYearlyPriceId, { active: false }).catch(() => {});
      }
      await stripe.products.update(plan.stripeProductId, { active: false }).catch(() => {});
    } catch (stripeErr) {
      req.log.warn({ err: stripeErr }, "Stripe archive failed during plan delete");
    }
  }

  await db.delete(plansTable).where(eq(plansTable.id, id));
  res.json({ ok: true });
});

// POST /admin/plans/:id/sync-stripe — manually sync an existing plan to Stripe
router.post("/admin/plans/:id/sync-stripe", ...guard, async (req, res) => {
  const id = Number(req.params.id);
  const [plan] = await db.select().from(plansTable).where(eq(plansTable.id, id)).limit(1);
  if (!plan) { res.status(404).json({ error: "Plan not found" }); return; }

  const stripeUpdates: Record<string, string | null> = {};
  const warnings: string[] = [];
  const stripe = await getUncachableStripeClient().catch((err) => {
    warnings.push(`stripe client unavailable: ${err?.message ?? String(err)}`);
    return null;
  });

  let productId = plan.stripeProductId;
  if (stripe) {
    if (productId) {
      await stripe.products.update(productId, {
        name: plan.name,
        description: plan.description ?? undefined,
        metadata: { plan: plan.slug, slug: plan.slug, maxSeats: String(plan.maxSeats), source: "site_snap_admin" },
        active: plan.isActive,
      }).catch((err) => {
        warnings.push(`product update failed: ${err?.message ?? String(err)}`);
      });
    } else {
      await stripe.products.create({
        name: plan.name,
        description: plan.description ?? undefined,
        metadata: { plan: plan.slug, slug: plan.slug, maxSeats: String(plan.maxSeats), source: "site_snap_admin" },
      }).then((product) => {
        productId = product.id;
        stripeUpdates.stripeProductId = productId;
      }).catch((err) => {
        warnings.push(`product create failed: ${err?.message ?? String(err)}`);
      });
    }
  }

  if (!productId) {
    const [updated] = await db
      .update(plansTable)
      .set(stripeUpdates)
      .where(eq(plansTable.id, plan.id))
      .returning();
    if (warnings.length > 0) req.log.warn({ warnings }, "Stripe sync completed with warnings");
    res.json({ ...(updated ?? plan), warnings });
    return;
  }

  if (stripe) {
    const monthlyAmount = Math.round(Number(plan.monthlyPrice) * 100);
    if (monthlyAmount > 0) {
      if (plan.stripeMonthlyPriceId) {
        const existing = await stripe.prices.retrieve(plan.stripeMonthlyPriceId).catch(() => null);
        if (existing && existing.unit_amount !== monthlyAmount) {
          await stripe.prices.update(plan.stripeMonthlyPriceId, { active: false }).catch(() => {});
          await stripe.prices.create({
            product: productId,
            unit_amount: monthlyAmount,
            currency: "cad",
            recurring: { interval: "month" },
            nickname: `${plan.name} Monthly`,
          }).then((newPrice) => {
            stripeUpdates.stripeMonthlyPriceId = newPrice.id;
          }).catch((err) => {
            warnings.push(`monthly price create failed: ${err?.message ?? String(err)}`);
          });
        }
      } else {
        await stripe.prices.create({
          product: productId,
          unit_amount: monthlyAmount,
          currency: "cad",
          recurring: { interval: "month" },
          nickname: `${plan.name} Monthly`,
        }).then((newPrice) => {
          stripeUpdates.stripeMonthlyPriceId = newPrice.id;
        }).catch((err) => {
          warnings.push(`monthly price create failed: ${err?.message ?? String(err)}`);
        });
      }
    }

    const yearlyAmount = Math.round(Number(plan.yearlyPrice) * 100);
    if (yearlyAmount > 0) {
      if (plan.stripeYearlyPriceId) {
        const existing = await stripe.prices.retrieve(plan.stripeYearlyPriceId).catch(() => null);
        if (existing && existing.unit_amount !== yearlyAmount) {
          await stripe.prices.update(plan.stripeYearlyPriceId, { active: false }).catch(() => {});
          await stripe.prices.create({
            product: productId,
            unit_amount: yearlyAmount,
            currency: "cad",
            recurring: { interval: "year" },
            nickname: `${plan.name} Annual`,
          }).then((newPrice) => {
            stripeUpdates.stripeYearlyPriceId = newPrice.id;
          }).catch((err) => {
            warnings.push(`yearly price create failed: ${err?.message ?? String(err)}`);
          });
        }
      } else {
        await stripe.prices.create({
          product: productId,
          unit_amount: yearlyAmount,
          currency: "cad",
          recurring: { interval: "year" },
          nickname: `${plan.name} Annual`,
        }).then((newPrice) => {
          stripeUpdates.stripeYearlyPriceId = newPrice.id;
        }).catch((err) => {
          warnings.push(`yearly price create failed: ${err?.message ?? String(err)}`);
        });
      }
    }
  }

  const [updated] = await db
    .update(plansTable)
    .set(stripeUpdates)
    .where(eq(plansTable.id, plan.id))
    .returning();

  if (warnings.length > 0) {
    req.log.warn({ warnings }, "Stripe sync completed with warnings");
    res.json({ ...(updated ?? plan), warnings });
    return;
  }

  res.json(updated ?? plan);
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
const UpdateFeatureBody = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  slug: z.string().min(1).optional(),
  category: z.string().optional(),
});

router.patch("/admin/features/:id", ...guard, async (req, res) => {
  const id = Number(req.params.id);
  const body = UpdateFeatureBody.parse(req.body);
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

// ── Plan ↔ Feature assignment ───────────────────────────────────────────────────

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

// POST /admin/plans/:planId/features — replace feature set for a plan (validated)
const PlanFeaturesBody = z.object({
  featureIds: z.array(z.number().int().positive()),
});

router.post("/admin/plans/:planId/features", ...guard, async (req, res) => {
  const planId = Number(req.params.planId);
  const { featureIds } = PlanFeaturesBody.parse(req.body);
  await db.delete(planFeaturesTable).where(eq(planFeaturesTable.planId, planId));
  if (featureIds.length > 0) {
    await db.insert(planFeaturesTable).values(featureIds.map((fid) => ({ planId, featureId: fid })));
  }
  res.status(200).json({ ok: true, planId, featureIds });
});

// ── Tenants ─────────────────────────────────────────────────────────────────────

// POST /admin/tenants — super-admin creates a company (no owner yet)
router.post("/admin/tenants", ...guard, async (req, res) => {
  const raw = req.body as Record<string, unknown>;
  if (!raw.name || typeof raw.name !== "string" || !raw.province || typeof raw.province !== "string" || !raw.city || typeof raw.city !== "string") {
    res.status(400).json({ error: "name, province, and city are required" });
    return;
  }
  const referralCode = crypto.randomBytes(4).toString("hex").toUpperCase();
  const body = insertCompanySchema.parse({
    name: raw.name,
    province: raw.province,
    city: raw.city,
    phone: raw.phone ?? null,
    address: raw.address ?? null,
    website: raw.website ?? null,
    hstNumber: raw.hstNumber ?? null,
    referralCode,
  });
  const [company] = await db.insert(companiesTable).values(body).returning();

  const planTier = typeof raw.planTier === "string" ? raw.planTier.trim().toLowerCase() : "starter";
  const [matchedPlan] = await db.select().from(plansTable).where(eq(plansTable.slug, planTier)).limit(1);
  const fallbackPlan = matchedPlan
    ? matchedPlan
    : (await db.select().from(plansTable).where(eq(plansTable.slug, "starter")).limit(1))[0];

  if (fallbackPlan) {
    await db.insert(subscriptionsTable).values({
      companyId: company.id,
      planId: fallbackPlan.id,
      status: "active",
      billingCycle: "monthly",
    });
  }

  res.status(201).json(company);
});

// GET /admin/tenants
router.get("/admin/tenants", ...guard, async (req, res) => {
  const companies = await db.select().from(companiesTable).orderBy(companiesTable.name);
  const subs = await db.select().from(subscriptionsTable);
  const plans = await db.select().from(plansTable);

  const userCounts = await db
    .select({ companyId: userMembershipsTable.companyId, count: sql<number>`count(*)` })
    .from(userMembershipsTable)
    .groupBy(userMembershipsTable.companyId);

  const result = companies.map((c) => {
    const sub = subs.find((s) => s.companyId === c.id) ?? null;
    const plan = sub ? (plans.find((p) => p.id === sub.planId) ?? null) : null;
    const uc = userCounts.find((u) => u.companyId === c.id);
    return { ...c, subscription: sub, plan, userCount: Number(uc?.count ?? 0) };
  });
  res.json(result);
});

// POST /admin/tenants/:id/reissue-link — regenerate onboarding link for an existing tenant
router.post("/admin/tenants/:id/reissue-link", ...guard, async (req, res) => {
  const companyId = Number(req.params.id);
  const [company] = await db.select().from(companiesTable).where(eq(companiesTable.id, companyId)).limit(1);
  if (!company) { res.status(404).json({ error: "Tenant not found" }); return; }
  res.json({ companyId, link: `${req.protocol}://${req.get("host")}/onboarding?companyId=${companyId}` });
});

// GET /admin/tenants/:id — tenant detail with users
router.get("/admin/tenants/:id", ...guard, async (req, res) => {
  const companyId = Number(req.params.id);
  const [company] = await db.select().from(companiesTable).where(eq(companiesTable.id, companyId)).limit(1);
  if (!company) { res.status(404).json({ error: "Tenant not found" }); return; }

  const [subscription] = await db.select().from(subscriptionsTable).where(eq(subscriptionsTable.companyId, companyId)).limit(1);
  const [plan] = subscription
    ? await db.select().from(plansTable).where(eq(plansTable.id, subscription.planId)).limit(1)
    : [null];
  const users = await db
    .select({
      id: usersTable.id,
      email: usersTable.email,
      firstName: usersTable.firstName,
      lastName: usersTable.lastName,
      role: userMembershipsTable.role,
      systemRole: usersTable.systemRole,
    })
    .from(usersTable)
    .innerJoin(
      userMembershipsTable,
      and(
        eq(userMembershipsTable.userId, usersTable.id),
        eq(userMembershipsTable.companyId, companyId),
      ),
    )
    .orderBy(usersTable.lastName, usersTable.firstName);

  res.json({ ...company, subscription: subscription ?? null, plan: plan ?? null, users });
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

// DELETE /admin/tenants/:id
router.delete("/admin/tenants/:id", ...guard, async (req, res) => {
  const companyId = Number(req.params.id);
  const [company] = await db.select().from(companiesTable).where(eq(companiesTable.id, companyId)).limit(1);
  if (!company) { res.status(404).json({ error: "Tenant not found" }); return; }

  // Wrap everything in a transaction so partial failures are rolled back
  await db.transaction(async (tx) => {
    // Gather all project IDs for this company up-front
    const projectRows = await tx.select({ id: projectsTable.id }).from(projectsTable).where(eq(projectsTable.companyId, companyId));
    const projectIds = projectRows.map((r) => r.id);

    // Step 1: Null out nullable FKs that point at this company's projects
    if (projectIds.length > 0) {
      await tx.execute(sql`UPDATE leads SET converted_project_id = NULL WHERE converted_project_id IN (SELECT id FROM projects WHERE company_id = ${companyId})`);
      await tx.execute(sql`UPDATE quotes SET project_id = NULL WHERE project_id IN (SELECT id FROM projects WHERE company_id = ${companyId})`);
      await tx.execute(sql`UPDATE invoices SET project_id = NULL WHERE project_id IN (SELECT id FROM projects WHERE company_id = ${companyId})`);
      await tx.execute(sql`UPDATE builder_estimates SET project_id = NULL WHERE project_id IN (SELECT id FROM projects WHERE company_id = ${companyId})`);
    }

    // Step 2: Delete child rows that reference this company's projects.
    // Use raw SQL so every subquery resolves the same set of project IDs,
    // avoiding the subtle subquery-inlining bugs that can break Drizzle.
    if (projectIds.length > 0) {
      // Deep child tables (photos of reports, items/alerts of inspections)
      await tx.execute(sql`DELETE FROM daily_report_photos WHERE report_id IN (SELECT id FROM daily_reports WHERE project_id IN (SELECT id FROM projects WHERE company_id = ${companyId}))`);
      await tx.execute(sql`DELETE FROM inspection_items    WHERE inspection_id IN (SELECT id FROM inspections WHERE project_id IN (SELECT id FROM projects WHERE company_id = ${companyId}))`);
      await tx.execute(sql`DELETE FROM inspection_alerts   WHERE inspection_id IN (SELECT id FROM inspections WHERE project_id IN (SELECT id FROM projects WHERE company_id = ${companyId}))`);

      // Project-scoped tables — ordered so no FK is violated
      await tx.execute(sql`DELETE FROM inspections        WHERE project_id IN (SELECT id FROM projects WHERE company_id = ${companyId})`);
      await tx.execute(sql`DELETE FROM notifications      WHERE project_id IN (SELECT id FROM projects WHERE company_id = ${companyId})`);
      await tx.execute(sql`DELETE FROM change_orders      WHERE project_id IN (SELECT id FROM projects WHERE company_id = ${companyId})`);
      await tx.execute(sql`DELETE FROM worker_schedules   WHERE project_id IN (SELECT id FROM projects WHERE company_id = ${companyId})`);
      await tx.execute(sql`DELETE FROM time_entries       WHERE project_id IN (SELECT id FROM projects WHERE company_id = ${companyId})`);
      await tx.execute(sql`DELETE FROM daily_reports      WHERE project_id IN (SELECT id FROM projects WHERE company_id = ${companyId})`);
      await tx.execute(sql`DELETE FROM cost_analyses      WHERE project_id IN (SELECT id FROM projects WHERE company_id = ${companyId})`);
      await tx.execute(sql`DELETE FROM rfis               WHERE project_id IN (SELECT id FROM projects WHERE company_id = ${companyId})`);
      await tx.execute(sql`DELETE FROM tasks              WHERE project_id IN (SELECT id FROM projects WHERE company_id = ${companyId})`);
      await tx.execute(sql`DELETE FROM project_documents  WHERE project_id IN (SELECT id FROM projects WHERE company_id = ${companyId})`);
      await tx.execute(sql`DELETE FROM timesheets         WHERE project_id IN (SELECT id FROM projects WHERE company_id = ${companyId})`);
      await tx.execute(sql`DELETE FROM quotes             WHERE project_id IN (SELECT id FROM projects WHERE company_id = ${companyId})`);
      await tx.execute(sql`DELETE FROM invoices           WHERE project_id IN (SELECT id FROM projects WHERE company_id = ${companyId})`);
    }

    // Step 3: Delete projects (project_members, project_notes cascade via FK)
    await tx.execute(sql`DELETE FROM projects WHERE company_id = ${companyId}`);

    // Step 4: Delete company-level rows without cascade
    await tx.execute(sql`UPDATE users SET active_company_id = NULL WHERE active_company_id = ${companyId}`);

    await tx.execute(sql`DELETE FROM payments WHERE company_id = ${companyId}`);
    await tx.execute(sql`DELETE FROM lead_activities WHERE lead_id IN (SELECT id FROM leads WHERE company_id = ${companyId})`);
    await tx.execute(sql`DELETE FROM leads WHERE company_id = ${companyId}`);
    await tx.execute(sql`DELETE FROM contacts WHERE company_id = ${companyId}`);

    // Financial records (project_id already nulled above)
    await tx.execute(sql`DELETE FROM invoices WHERE company_id = ${companyId}`);
    await tx.execute(sql`DELETE FROM quotes WHERE company_id = ${companyId}`);

    // Estimates and templates
    await tx.execute(sql`DELETE FROM builder_estimates WHERE company_id = ${companyId}`);
    await tx.execute(sql`DELETE FROM estimate_templates WHERE company_id = ${companyId}`);

    // Misc company-scoped tables
    await tx.execute(sql`DELETE FROM file_attachments WHERE company_id = ${companyId}`);
    await tx.execute(sql`DELETE FROM quickbooks_connections WHERE company_id = ${companyId}`);
    await tx.execute(sql`DELETE FROM estimator_actuals WHERE company_id = ${companyId}`);

    // Step 5: Delete subscriptions and invitations, then the company
    await tx.execute(sql`DELETE FROM invitations WHERE company_id = ${companyId}`);
    await tx.execute(sql`DELETE FROM subscriptions WHERE company_id = ${companyId}`);
    await tx.execute(sql`DELETE FROM companies WHERE id = ${companyId}`);
  });

  res.json({ ok: true });
});

// ── Per-Tenant Feature Override ─────────────────────────────────────────────────

// GET /admin/tenants/:id/features
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

// ── Promote/demote super admin ──────────────────────────────────────────────────

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

// PATCH /admin/users/:id/company-role — update a user's company role (owner/foreman/worker)
router.patch("/admin/users/:id/company-role", ...guard, async (req, res) => {
  const id = Number(req.params.id);
  const { role, companyId } = req.body as { role: "owner" | "foreman" | "worker"; companyId?: number };
  if (!["owner", "foreman", "worker"].includes(role)) {
    res.status(400).json({ error: "Invalid role. Must be owner, foreman, or worker." });
    return;
  }
  // Phase 4: update role in memberships only; legacy columns removed
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, id))
    .limit(1);
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  if (companyId) {
    // Scoped to a specific tenant — safe for multi-tenancy
    await db
      .update(userMembershipsTable)
      .set({ role })
      .where(and(eq(userMembershipsTable.userId, id), eq(userMembershipsTable.companyId, companyId)));
  } else {
    // Update role in all of the user's memberships (legacy behaviour for single-tenant users)
    await db
      .update(userMembershipsTable)
      .set({ role })
      .where(eq(userMembershipsTable.userId, id));
  }
  res.json(user);
});

// DELETE /admin/tenants/:companyId/users/:userId — remove a user from a tenant (super-admin)
router.delete("/admin/tenants/:companyId/users/:userId", ...guard, async (req, res) => {
  const companyId = Number(req.params.companyId);
  const userId = Number(req.params.userId);

  const [membership] = await db
    .select()
    .from(userMembershipsTable)
    .where(and(eq(userMembershipsTable.userId, userId), eq(userMembershipsTable.companyId, companyId)))
    .limit(1);
  if (!membership) {
    res.status(404).json({ error: "Membership not found" });
    return;
  }

  // Remove the membership link; historical data is preserved for audit
  await db
    .delete(userMembershipsTable)
    .where(and(eq(userMembershipsTable.userId, userId), eq(userMembershipsTable.companyId, companyId)));

  // Clear activeCompanyId if it points to this company so the user isn't stranded
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  if (user && user.activeCompanyId === companyId) {
    await db
      .update(usersTable)
      .set({ activeCompanyId: null })
      .where(eq(usersTable.id, userId));
  }

  res.status(204).send();
});

// PATCH /admin/users/:id — update a user's name and email (super-admin)
router.patch("/admin/users/:id", ...guard, async (req, res) => {
  const id = Number(req.params.id);
  const { firstName, lastName, email } = req.body as {
    firstName?: string;
    lastName?: string;
    email?: string;
  };

  const [existing] = await db.select().from(usersTable).where(eq(usersTable.id, id)).limit(1);
  if (!existing) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const updates: Record<string, string | null> = {};
  if (firstName !== undefined) updates.firstName = firstName.trim();
  if (lastName !== undefined) updates.lastName = lastName.trim();
  if (email !== undefined) updates.email = email.trim();

  if (Object.keys(updates).length === 0) {
    res.json(existing);
    return;
  }

  const [updated] = await db.update(usersTable).set(updates).where(eq(usersTable.id, id)).returning();
  res.json(updated);
});

// ── Seed Data ───────────────────────────────────────────────────────────────────

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

    const starterFeatures = ["SCHEDULING", "DAILY_REPORTS", "TEAM_MANAGEMENT", "SAFETY_FORMS", "RFIS", "AI_CHAT"];
    if (starter) {
      const vals = starterFeatures.map((k) => get(k)).filter(Boolean);
      if (vals.length > 0) {
        await db.insert(planFeaturesTable).values(
          vals.map((f) => ({ planId: starter.id, featureId: f!.id }))
        ).onConflictDoNothing();
      }
    }

    const proKeys = ["SCHEDULING", "AI_ESTIMATING", "CLIENT_PORTAL", "REPORTING", "QUICKBOOKS", "AI_CHAT",
      "SITE_VISION_AI", "TRADEHUB", "SAFETY_FORMS", "DAILY_REPORTS", "RFIS",
      "TEAM_MANAGEMENT", "INVOICES", "QUOTES", "CRM_LEADS", "SMART_ESTIMATOR"];
    if (pro) {
      const vals = proKeys.map((k) => get(k)).filter(Boolean);
      if (vals.length > 0) {
        await db.insert(planFeaturesTable).values(
          vals.map((f) => ({ planId: pro.id, featureId: f!.id }))
        ).onConflictDoNothing();
      }
    }

    if (enterprise) {
      await db.insert(planFeaturesTable).values(
        features.map((f) => ({ planId: enterprise.id, featureId: f.id }))
      ).onConflictDoNothing();
    }
  }

  res.json({ ok: true, message: "Seed data applied" });
});

export { requireFeature } from "../lib/featureGate";

export default router;
