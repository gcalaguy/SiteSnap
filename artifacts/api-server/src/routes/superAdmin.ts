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
  tenantExportReceiptsTable,
  insertPlanSchema,
  insertFeatureSchema,
  insertCompanySchema,
} from "@workspace/db";
import { z } from "zod/v4";
import { eq, and, sql } from "drizzle-orm";
import { requireAuth, requireSuperAdmin } from "../lib/auth";
import { asyncHandler } from "../lib/asyncHandler";
import { getStripeClient } from "../lib/stripeClient";
import { sendEmail, ResendSandboxError, buildAppBase } from "../lib/mailer";
import { logger } from "../lib/logger";
import { buildTenantExport, deleteTenantData, purgeObjectStoragePaths } from "../services/tenantExport";
import crypto from "crypto";

const router = Router();
const guard = [requireAuth, requireSuperAdmin];

// ── Stripe price helpers ───────────────────────────────────────────────────────

type StripeClient = Awaited<ReturnType<typeof getStripeClient>>;

/** Create (or recreate) a monthly/yearly Stripe price for a plan product. */
async function createStripePrice(
  stripe: StripeClient,
  productId: string,
  amountCents: number,
  interval: "month" | "year",
  planName: string,
): Promise<string> {
  const price = await stripe.prices.create({
    product: productId,
    unit_amount: amountCents,
    currency: "cad",
    recurring: { interval },
    nickname: interval === "month" ? `${planName} Monthly` : `${planName} Annual`,
  });
  return price.id;
}

/** Deactivate an existing Stripe price and create a replacement. Returns the new price ID. */
async function replaceStripePrice(
  stripe: StripeClient,
  oldPriceId: string,
  productId: string,
  amountCents: number,
  interval: "month" | "year",
  planName: string,
): Promise<string> {
  await stripe.prices.update(oldPriceId, { active: false }).catch(() => {});
  return createStripePrice(stripe, productId, amountCents, interval, planName);
}

// ── Plans ──────────────────────────────────────────────────────────────────────

// GET /admin/plans
router.get("/admin/plans", ...guard, asyncHandler(async (req, res) => {
  const plans = await db.select().from(plansTable).orderBy(plansTable.monthlyPrice);
  const features = await db.select().from(planFeaturesTable);
  const planList = plans.map((p) => ({
    ...p,
    featureIds: features.filter((f) => f.planId === p.id).map((f) => f.featureId),
  }));
  res.json(planList);
}));

// POST /admin/plans — create plan in DB then auto-create Stripe product + prices
router.post("/admin/plans", ...guard, asyncHandler(async (req, res) => {
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
    const stripe = await getStripeClient();
    const product = await stripe.products.create({
      name: plan.name,
      description: plan.description ?? undefined,
      metadata: { plan: plan.slug, slug: plan.slug, maxSeats: String(plan.maxSeats), source: "site_snap_admin" },
    });

    const stripeUpdates: Record<string, string | null> = { stripeProductId: product.id };

    const monthlyAmount = Math.round(Number(plan.monthlyPrice) * 100);
    if (monthlyAmount > 0) {
      stripeUpdates.stripeMonthlyPriceId = await createStripePrice(stripe, product.id, monthlyAmount, "month", plan.name);
    }

    const yearlyAmount = Math.round(Number(plan.yearlyPrice) * 100);
    if (yearlyAmount > 0) {
      stripeUpdates.stripeYearlyPriceId = await createStripePrice(stripe, product.id, yearlyAmount, "year", plan.name);
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
}));

// PATCH /admin/plans/:id — update plan and sync changes to Stripe
router.patch("/admin/plans/:id", ...guard, asyncHandler(async (req, res) => {
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
      const stripe = await getStripeClient();
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
          if (newAmount > 0) {
            stripeUpdates.stripeMonthlyPriceId = existing.stripeMonthlyPriceId
              ? await replaceStripePrice(stripe, existing.stripeMonthlyPriceId, plan.stripeProductId, newAmount, "month", plan.name)
              : await createStripePrice(stripe, plan.stripeProductId, newAmount, "month", plan.name);
          } else {
            if (existing.stripeMonthlyPriceId) {
              await stripe.prices.update(existing.stripeMonthlyPriceId, { active: false }).catch(() => {});
            }
            stripeUpdates.stripeMonthlyPriceId = null;
          }
        }
      }

      if (body.yearlyPrice !== undefined) {
        const newAmount = Math.round(Number(plan.yearlyPrice) * 100);
        const oldAmount = Math.round(Number(existing.yearlyPrice) * 100);
        if (newAmount !== oldAmount) {
          if (newAmount > 0) {
            stripeUpdates.stripeYearlyPriceId = existing.stripeYearlyPriceId
              ? await replaceStripePrice(stripe, existing.stripeYearlyPriceId, plan.stripeProductId, newAmount, "year", plan.name)
              : await createStripePrice(stripe, plan.stripeProductId, newAmount, "year", plan.name);
          } else {
            if (existing.stripeYearlyPriceId) {
              await stripe.prices.update(existing.stripeYearlyPriceId, { active: false }).catch(() => {});
            }
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
}));

// DELETE /admin/plans/:id — archive Stripe product then delete plan
router.delete("/admin/plans/:id", ...guard, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);

  const [plan] = await db.select().from(plansTable).where(eq(plansTable.id, id)).limit(1);

  if (plan?.stripeProductId) {
    try {
      const stripe = await getStripeClient();
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
}));

// POST /admin/plans/:id/sync-stripe — manually sync an existing plan to Stripe
router.post("/admin/plans/:id/sync-stripe", ...guard, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const [plan] = await db.select().from(plansTable).where(eq(plansTable.id, id)).limit(1);
  if (!plan) { res.status(404).json({ error: "Plan not found" }); return; }

  const stripeUpdates: Record<string, string | null> = {};
  const warnings: string[] = [];
  const stripe = await getStripeClient().catch((err) => {
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
        const existingPrice = await stripe.prices.retrieve(plan.stripeMonthlyPriceId).catch(() => null);
        if (existingPrice && existingPrice.unit_amount !== monthlyAmount) {
          await replaceStripePrice(stripe, plan.stripeMonthlyPriceId, productId, monthlyAmount, "month", plan.name)
            .then((id) => { stripeUpdates.stripeMonthlyPriceId = id; })
            .catch((err: unknown) => { warnings.push(`monthly price update failed: ${(err as Error)?.message ?? String(err)}`); });
        }
      } else {
        await createStripePrice(stripe, productId, monthlyAmount, "month", plan.name)
          .then((id) => { stripeUpdates.stripeMonthlyPriceId = id; })
          .catch((err: unknown) => { warnings.push(`monthly price create failed: ${(err as Error)?.message ?? String(err)}`); });
      }
    }

    const yearlyAmount = Math.round(Number(plan.yearlyPrice) * 100);
    if (yearlyAmount > 0) {
      if (plan.stripeYearlyPriceId) {
        const existingPrice = await stripe.prices.retrieve(plan.stripeYearlyPriceId).catch(() => null);
        if (existingPrice && existingPrice.unit_amount !== yearlyAmount) {
          await replaceStripePrice(stripe, plan.stripeYearlyPriceId, productId, yearlyAmount, "year", plan.name)
            .then((id) => { stripeUpdates.stripeYearlyPriceId = id; })
            .catch((err: unknown) => { warnings.push(`yearly price update failed: ${(err as Error)?.message ?? String(err)}`); });
        }
      } else {
        await createStripePrice(stripe, productId, yearlyAmount, "year", plan.name)
          .then((id) => { stripeUpdates.stripeYearlyPriceId = id; })
          .catch((err: unknown) => { warnings.push(`yearly price create failed: ${(err as Error)?.message ?? String(err)}`); });
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
}));

// ── Features ───────────────────────────────────────────────────────────────────

// GET /admin/features
router.get("/admin/features", ...guard, asyncHandler(async (req, res) => {
  const features = await db.select().from(featuresTable).orderBy(featuresTable.name);
  res.json(features);
}));

// POST /admin/features
router.post("/admin/features", ...guard, asyncHandler(async (req, res) => {
  const body = insertFeatureSchema.parse(req.body);
  const [feature] = await db.insert(featuresTable).values(body).returning();
  res.status(201).json(feature);
}));

// PATCH /admin/features/:id
const UpdateFeatureBody = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  slug: z.string().min(1).optional(),
  category: z.string().optional(),
});

router.patch("/admin/features/:id", ...guard, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const body = UpdateFeatureBody.parse(req.body);
  const [feature] = await db
    .update(featuresTable).set(body).where(eq(featuresTable.id, id)).returning();
  if (!feature) { res.status(404).json({ error: "Feature not found" }); return; }
  res.json(feature);
}));

// DELETE /admin/features/:id
router.delete("/admin/features/:id", ...guard, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  await db.delete(featuresTable).where(eq(featuresTable.id, id));
  res.json({ ok: true });
}));

// ── Plan ↔ Feature assignment ───────────────────────────────────────────────────

// GET /admin/plans/:id/features
router.get("/admin/plans/:id/features", ...guard, asyncHandler(async (req, res) => {
  const planId = Number(req.params.id);
  const rows = await db
    .select({ feature: featuresTable })
    .from(planFeaturesTable)
    .innerJoin(featuresTable, eq(featuresTable.id, planFeaturesTable.featureId))
    .where(eq(planFeaturesTable.planId, planId));
  res.json(rows.map((r) => r.feature));
}));

// PUT /admin/plans/:id/features  — replace feature set for a plan
router.put("/admin/plans/:id/features", ...guard, asyncHandler(async (req, res) => {
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
}));

// POST /admin/plans/:planId/features — replace feature set for a plan (validated)
const PlanFeaturesBody = z.object({
  featureIds: z.array(z.number().int().positive()),
});

router.post("/admin/plans/:planId/features", ...guard, asyncHandler(async (req, res) => {
  const planId = Number(req.params.planId);
  const { featureIds } = PlanFeaturesBody.parse(req.body);
  await db.delete(planFeaturesTable).where(eq(planFeaturesTable.planId, planId));
  if (featureIds.length > 0) {
    await db.insert(planFeaturesTable).values(featureIds.map((fid) => ({ planId, featureId: fid })));
  }
  res.status(200).json({ ok: true, planId, featureIds });
}));

// ── Tenants ─────────────────────────────────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Best-effort, fire-and-forget — mirrors sendInviteEmail in routes/invitations.ts. */
function sendTenantInviteEmail(opts: {
  to: string;
  token: string;
  appBase: string;
}): void {
  const claimUrl = `${opts.appBase}/sign-up?token=${opts.token}`;
  sendEmail({
    to: [opts.to],
    subject: `You're invited to set up your company on Site Snap`,
    html: `
<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;background:#f8fafc;border-radius:12px;">
  <div style="text-align:center;margin-bottom:28px;">
    <span style="font-size:32px;">🏗️</span>
    <h1 style="margin:12px 0 4px;font-size:22px;color:#172034;">Welcome to Site Snap</h1>
    <p style="color:#64748b;margin:0;">Set up your company and become its owner</p>
  </div>
  <div style="background:#fff;border-radius:10px;padding:24px;border:1px solid #e2e8f0;margin-bottom:20px;">
    <p style="color:#334155;margin:0 0 16px;">Click the button below to create your account and claim ownership of your new company:</p>
    <a href="${claimUrl}" style="display:inline-block;background:#FF6600;color:#fff;font-weight:700;padding:14px 28px;border-radius:8px;text-decoration:none;font-size:15px;">Claim Your Company</a>
    <p style="color:#94a3b8;font-size:13px;margin:20px 0 0;">Or paste this token manually in the app:</p>
    <code style="display:block;background:#f1f5f9;padding:10px 14px;border-radius:6px;font-size:13px;color:#172034;word-break:break-all;margin-top:6px;">${opts.token}</code>
  </div>
</div>`,
  }).catch((err: unknown) => {
    if (err instanceof ResendSandboxError) {
      logger.warn({ allowedEmail: err.allowedEmail }, "Tenant invite email skipped — Resend sandbox mode");
    } else {
      logger.error({ err }, "Failed to send tenant invite email");
    }
  });
}

// POST /admin/tenants — super-admin invites a prospective owner by email only.
// A placeholder company row is created to hold the claim token; the owner
// supplies the real name, contact details, and plan when they claim it via
// POST /companies/:id/claim (see routes/companies.ts).
router.post("/admin/tenants", ...guard, asyncHandler(async (req, res) => {
  const raw = req.body as Record<string, unknown>;
  const province = typeof raw.province === "string" ? raw.province.trim() : "";
  const city = typeof raw.city === "string" ? raw.city.trim() : "";
  const ownerEmail = typeof raw.ownerEmail === "string" ? raw.ownerEmail.trim() : "";
  if (!ownerEmail || !EMAIL_RE.test(ownerEmail)) {
    res.status(400).json({ error: "ownerEmail is required and must be a valid email address" });
    return;
  }
  const appBase = buildAppBase(req);
  if (!appBase) {
    res.status(500).json({ error: "Server misconfiguration: invitation base URL not set" });
    return;
  }
  const referralCode = crypto.randomBytes(4).toString("hex").toUpperCase();
  // Generate a secure one-time claim token, emailed to the prospective owner below.
  // Required by POST /companies/:id/claim.
  const claimToken = crypto.randomBytes(24).toString("hex");
  const body = insertCompanySchema.parse({
    // Placeholder — the owner sets the real name at claim time (claimCompanyTransaction).
    name: "Pending Setup",
    province,
    city,
    referralCode,
  });
  const [company] = await db
    .insert(companiesTable)
    .values({ ...body, claimToken, claimOwnerEmail: ownerEmail })
    .returning();

  sendTenantInviteEmail({ to: ownerEmail, token: claimToken, appBase });

  res.status(201).json(company);
}));

// GET /admin/tenants
router.get("/admin/tenants", ...guard, asyncHandler(async (req, res) => {
  const [rows, userCounts] = await Promise.all([
    db
      .select({
        company: companiesTable,
        subscription: subscriptionsTable,
        plan: plansTable,
      })
      .from(companiesTable)
      .leftJoin(subscriptionsTable, eq(subscriptionsTable.companyId, companiesTable.id))
      .leftJoin(plansTable, eq(plansTable.id, subscriptionsTable.planId))
      .orderBy(companiesTable.name),
    db
      .select({ companyId: userMembershipsTable.companyId, count: sql<number>`count(*)` })
      .from(userMembershipsTable)
      .groupBy(userMembershipsTable.companyId),
  ]);

  const countMap = new Map(userCounts.map((u) => [u.companyId, Number(u.count)]));
  const result = rows.map(({ company, subscription, plan }) => ({
    ...company,
    subscription: subscription ?? null,
    plan: plan ?? null,
    userCount: countMap.get(company.id) ?? 0,
  }));
  res.json(result);
}));

// POST /admin/tenants/:id/reissue-link — regenerate signup invite link for an existing tenant
router.post("/admin/tenants/:id/reissue-link", ...guard, asyncHandler(async (req, res) => {
  const companyId = Number(req.params.id);
  const [company] = await db.select().from(companiesTable).where(eq(companiesTable.id, companyId)).limit(1);
  if (!company) { res.status(404).json({ error: "Tenant not found" }); return; }

  const appBase = buildAppBase(req);
  if (!appBase) {
    res.status(500).json({ error: "Server misconfiguration: invitation base URL not set" });
    return;
  }

  // Rotate the claim token on every reissue so old links are invalidated
  const newClaimToken = crypto.randomBytes(24).toString("hex");
  await db
    .update(companiesTable)
    .set({ claimToken: newClaimToken })
    .where(eq(companiesTable.id, companyId));

  res.json({ companyId, link: `${appBase}/sign-up?token=${newClaimToken}` });
}));

// GET /admin/tenants/:id — tenant detail with users
router.get("/admin/tenants/:id", ...guard, asyncHandler(async (req, res) => {
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
}));

// PATCH /admin/tenants/:id/subscription — assign or update subscription
router.patch("/admin/tenants/:id/subscription", ...guard, asyncHandler(async (req, res) => {
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
}));

// POST /admin/tenants/:id/export
// Generates a ZIP of every row belonging to this tenant (plus referenced
// attachment files) and a receipt proving the export happened. DELETE
// /admin/tenants/:id below requires this receipt's id before it will run.
router.post("/admin/tenants/:id/export", ...guard, asyncHandler(async (req, res) => {
  const companyId = Number(req.params.id);
  const [company] = await db.select().from(companiesTable).where(eq(companiesTable.id, companyId)).limit(1);
  if (!company) { res.status(404).json({ error: "Tenant not found" }); return; }

  const { zipBuffer, sha256, rowCounts } = await buildTenantExport(db, companyId, Number(req.userId));

  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
  const [receipt] = await db.insert(tenantExportReceiptsTable).values({
    companyId,
    sha256,
    rowCounts,
    createdByUserId: Number(req.userId),
    expiresAt,
  }).returning();

  logger.info({ companyId, companyName: company.name, sha256, rowCounts, exportedByUserId: req.userId }, "Tenant data exported ahead of deletion");

  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="tenant_${companyId}_export_${new Date().toISOString().slice(0, 10)}.zip"`);
  res.setHeader("Content-Length", String(zipBuffer.length));
  res.setHeader("X-Export-Receipt-Id", String(receipt.id));
  res.setHeader("X-Export-Sha256", sha256);
  res.send(zipBuffer);
}));

// DELETE /admin/tenants/:id
// Requires a fresh, unconsumed export receipt (see POST .../export above) for
// this same tenant — the server-side proof the data was exported first.
router.delete("/admin/tenants/:id", ...guard, asyncHandler(async (req, res) => {
  const companyId = Number(req.params.id);
  const receiptId = Number(req.query.receiptId ?? req.body?.receiptId);
  if (!receiptId) {
    res.status(400).json({ error: "Export receipt required — export tenant data before deleting." });
    return;
  }

  const [company] = await db.select().from(companiesTable).where(eq(companiesTable.id, companyId)).limit(1);
  if (!company) { res.status(404).json({ error: "Tenant not found" }); return; }

  const [receipt] = await db.select().from(tenantExportReceiptsTable)
    .where(and(eq(tenantExportReceiptsTable.id, receiptId), eq(tenantExportReceiptsTable.companyId, companyId)))
    .limit(1);
  if (!receipt || receipt.consumedAt || receipt.expiresAt < new Date()) {
    res.status(409).json({ error: "Export is missing or expired — re-export before deleting." });
    return;
  }

  // MED-007: cancel active Stripe subscription before deleting DB rows so the
  // customer is not billed for a tenant that no longer exists.
  if (company.stripeSubscriptionId) {
    try {
      const stripe = await getStripeClient();
      await stripe.subscriptions.cancel(company.stripeSubscriptionId);
    } catch (stripeErr: any) {
      // Log but do not block deletion — billing failure must not leave orphaned tenant data.
      req.log?.warn({ stripeErr, companyId }, "Stripe subscription cancel failed during tenant delete");
    }
  }

  let deletedObjectPaths: string[] = [];

  // Wrap everything in a transaction so partial failures are rolled back
  await db.transaction(async (tx) => {
    await tx.update(tenantExportReceiptsTable).set({ consumedAt: new Date() }).where(eq(tenantExportReceiptsTable.id, receiptId));
    await tx.execute(sql`UPDATE users SET active_company_id = NULL WHERE active_company_id = ${companyId}`);

    const result = await deleteTenantData(tx, companyId);
    deletedObjectPaths = result.deletedObjectPaths;

    // Deleting the company cascades every remaining tenant-scoped table
    // (see DIRECT_TENANT_TABLES in services/tenantExport.ts) plus this receipt.
    await tx.execute(sql`DELETE FROM companies WHERE id = ${companyId}`);
  });

  // audit_logs.company_id cascades on company delete, so a normal audit-log
  // row scoped to this tenant would vanish along with everything else — log
  // durably via pino instead so the deletion is traceable after the fact.
  logger.info({ companyId, companyName: company.name, deletedByUserId: req.userId, exportSha256: receipt.sha256, rowCounts: receipt.rowCounts }, "Tenant deleted by super admin");

  purgeObjectStoragePaths(deletedObjectPaths).catch((err) => {
    logger.warn({ err, companyId }, "Tenant deleted but some object storage cleanup failed");
  });

  res.json({ ok: true });
}));

// ── Per-Tenant Feature Override ─────────────────────────────────────────────────

// GET /admin/tenants/:id/features
router.get("/admin/tenants/:id/features", ...guard, asyncHandler(async (req, res) => {
  const companyId = Number(req.params.id);
  const [company] = await db
    .select({ activeFeatures: companiesTable.activeFeatures })
    .from(companiesTable)
    .where(eq(companiesTable.id, companyId))
    .limit(1);
  if (!company) { res.status(404).json({ error: "Tenant not found" }); return; }
  res.json({ activeFeatures: company.activeFeatures ?? [] });
}));

// PATCH /admin/tenants/:id/features
router.patch("/admin/tenants/:id/features", ...guard, asyncHandler(async (req, res) => {
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
}));

// ── Promote/demote super admin ──────────────────────────────────────────────────

// PATCH /admin/users/:id/system-role
router.patch("/admin/users/:id/system-role", ...guard, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const { systemRole } = req.body as { systemRole: string | null };
  const [user] = await db
    .update(usersTable)
    .set({ systemRole: systemRole ?? null })
    .where(eq(usersTable.id, id))
    .returning();
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  res.json(user);
}));

// PATCH /admin/users/:id/company-role — update a user's company role (owner/foreman/worker)
router.patch("/admin/users/:id/company-role", ...guard, asyncHandler(async (req, res) => {
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
}));

// DELETE /admin/tenants/:companyId/users/:userId — remove a user from a tenant (super-admin)
router.delete("/admin/tenants/:companyId/users/:userId", ...guard, asyncHandler(async (req, res) => {
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
}));

// PATCH /admin/users/:id — update a user's name and email (super-admin)
router.patch("/admin/users/:id", ...guard, asyncHandler(async (req, res) => {
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
}));

// ── Seed Data ───────────────────────────────────────────────────────────────────

router.post("/admin/seed", ...guard, asyncHandler(async (req, res) => {
  const existingPlans = await db.select().from(plansTable);
  if (existingPlans.length === 0) {
    await db.insert(plansTable).values([
      { name: "Starter", slug: "starter", description: "For small crews just getting started", monthlyPrice: "49", yearlyPrice: "490", maxSeats: 5 },
      { name: "Pro", slug: "pro", description: "For growing construction companies", monthlyPrice: "99", yearlyPrice: "990", maxSeats: 20 },
      { name: "Enterprise", slug: "enterprise", description: "Unlimited scale for large operations", monthlyPrice: "249", yearlyPrice: "2490", maxSeats: 100 },
    ]);
  }

  // Always upsert features so new entries added here are picked up on re-seed
  // without wiping existing data. onConflictDoNothing keeps existing rows intact.
  await db.insert(featuresTable).values([
    { name: "Scheduling",              key: "SCHEDULING",         description: "Worker and project scheduling tools" },
    { name: "AI Estimating",           key: "AI_ESTIMATING",      description: "AI-powered cost estimating" },
    { name: "Client Portal",           key: "CLIENT_PORTAL",      description: "Shared client portal for project visibility" },
    { name: "Reporting",               key: "REPORTING",          description: "Advanced reports and analytics" },
    { name: "QuickBooks Integration",  key: "QUICKBOOKS",         description: "Sync invoices and costs with QuickBooks" },
    { name: "AI Chat",                 key: "AI_CHAT",            description: "AI assistant for construction queries" },
    { name: "Site Vision AI",          key: "SITE_VISION_AI",     description: "AI-powered photo analysis and OCR" },
    { name: "TradeHub",                key: "TRADEHUB",           description: "Marketplace for trade professionals" },
    { name: "Financials",              key: "FINANCIALS",         description: "Full financial tracking and management" },
    { name: "Risk Dashboard",          key: "RISK_DASHBOARD",     description: "AI risk scoring and inspection alerts" },
    { name: "AI Compliance Monitor",   key: "AI_COMPLIANCE",      description: "AI-powered compliance directive monitoring and ministry audit exports" },
    { name: "Safety Forms",            key: "SAFETY_FORMS",       description: "Digital safety and incident reporting" },
    { name: "Daily Reports",           key: "DAILY_REPORTS",      description: "Field daily report submission" },
    { name: "RFIs",                    key: "RFIS",               description: "Request for Information tracking" },
    { name: "Team Management",         key: "TEAM_MANAGEMENT",    description: "Crew and role management" },
    { name: "Invoices",                key: "INVOICES",           description: "Invoice creation and tracking" },
    { name: "Quotes & Proposals",      key: "QUOTES",             description: "Quote generation and approval" },
    { name: "CRM & Leads",             key: "CRM_LEADS",          description: "Lead management and CRM" },
    { name: "Smart Estimator",         key: "SMART_ESTIMATOR",    description: "Hybrid AI + rule-based estimating" },
    { name: "Inspections",             key: "INSPECTIONS",        description: "Site inspection management" },
    { name: "Worker Documents",        key: "WORKER_DOCUMENTS",   description: "Enterprise worker document management and compliance" },
    { name: "RFI & Submittal",         key: "RFI_SUBMITTAL",      description: "RFI and submittal workflow tracking" },
  ]).onConflictDoNothing();

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
      "TEAM_MANAGEMENT", "INVOICES", "QUOTES", "CRM_LEADS", "SMART_ESTIMATOR",
      "RISK_DASHBOARD", "AI_COMPLIANCE", "RFI_SUBMITTAL"];
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
}));

export { requireFeature } from "../lib/featureGate";

export default router;
