import { db, subscriptionsTable, planFeaturesTable, featuresTable, companiesTable, plansTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import type { Request, Response, NextFunction } from "express";

const ENTERPRISE_ONLY_FEATURES = ["RISK_DASHBOARD", "FINANCIALS", "AUDIT_VAULT"];

// ── In-memory TTL cache for feature keys ────────────────────────────────────
// Avoids 2 DB queries per gated request. Entries expire after 60 seconds so
// plan changes propagate quickly without hammering the DB on every request.
const TTL_MS = 60_000;
type CacheEntry = { keys: string[]; cachedAt: number };
const featureCache = new Map<number, CacheEntry>();

function getCached(companyId: number): string[] | null {
  const entry = featureCache.get(companyId);
  if (!entry) return null;
  if (Date.now() - entry.cachedAt > TTL_MS) {
    featureCache.delete(companyId);
    return null;
  }
  return entry.keys;
}

function setCache(companyId: number, keys: string[]): void {
  featureCache.set(companyId, { keys, cachedAt: Date.now() });
}

/** Invalidate the cached feature keys for a company (call after plan changes). */
export function invalidateFeatureCache(companyId: number): void {
  featureCache.delete(companyId);
}

/**
 * Returns whether the company's active subscription is on an Enterprise plan.
 */
export async function isEnterprisePlan(companyId: number): Promise<boolean> {
  const rows = await db
    .select({ planSlug: plansTable.slug })
    .from(subscriptionsTable)
    .innerJoin(plansTable, eq(plansTable.id, subscriptionsTable.planId))
    .where(
      and(
        eq(subscriptionsTable.companyId, companyId),
        eq(subscriptionsTable.status, "active"),
      ),
    )
    .limit(1);

  return rows[0]?.planSlug?.toLowerCase() === "enterprise";
}

/**
 * Returns the effective feature keys for a company.
 * Priority: custom activeFeatures override → plan-based features.
 * Enterprise-only features are stripped for non-Enterprise tenants.
 */
export async function getCompanyFeatureKeys(companyId: number): Promise<string[]> {
  const cached = getCached(companyId);
  if (cached) return cached;

  const [company] = await db
    .select({ activeFeatures: companiesTable.activeFeatures })
    .from(companiesTable)
    .where(eq(companiesTable.id, companyId))
    .limit(1);

  if (company?.activeFeatures && company.activeFeatures.length > 0) {
    setCache(companyId, company.activeFeatures);
    return company.activeFeatures;
  }

  const rows = await db
    .select({ key: featuresTable.key, planSlug: plansTable.slug })
    .from(subscriptionsTable)
    .innerJoin(planFeaturesTable, eq(planFeaturesTable.planId, subscriptionsTable.planId))
    .innerJoin(featuresTable, eq(featuresTable.id, planFeaturesTable.featureId))
    .innerJoin(plansTable, eq(plansTable.id, subscriptionsTable.planId))
    .where(
      and(
        eq(subscriptionsTable.companyId, companyId),
        eq(subscriptionsTable.status, "active"),
        eq(featuresTable.isEnabled, true),
      ),
    );

  // If no active subscription exists (e.g. newly created tenant), fall back
  // to a default Starter-equivalent feature set so the user isn't 403-blocked.
  if (rows.length === 0) {
    const defaultKeys = [
      "SCHEDULING", "DAILY_REPORTS", "TEAM_MANAGEMENT", "SAFETY_FORMS",
      "RFIS", "AI_CHAT", "INVOICES", "QUOTES", "CRM_LEADS", "SMART_ESTIMATOR",
      "CLIENT_PORTAL", "REPORTING", "QUICKBOOKS", "SITE_VISION_AI", "TRADEHUB",
    ].filter((k) => !ENTERPRISE_ONLY_FEATURES.includes(k));
    setCache(companyId, defaultKeys);
    return defaultKeys;
  }

  const planSlug = rows[0].planSlug;
  const isEnterprise = planSlug?.toLowerCase() === "enterprise";
  const keys = rows.map((r) => r.key);

  if (isEnterprise) {
    if (!keys.includes("RISK_DASHBOARD")) keys.push("RISK_DASHBOARD");
    if (!keys.includes("FINANCIALS")) keys.push("FINANCIALS");
    if (!keys.includes("AUDIT_VAULT")) keys.push("AUDIT_VAULT");
    setCache(companyId, keys);
    return keys;
  }

  const filtered = keys.filter((k) => !ENTERPRISE_ONLY_FEATURES.includes(k));
  setCache(companyId, filtered);
  return filtered;
}

/**
 * Middleware factory: blocks the request if the tenant's effective feature set
 * does not include the given feature key.
 *
 * Custom activeFeatures overrides the plan-based set when set.
 * Super admins bypass all feature gates.
 *
 * Usage:
 *   router.get("/ai/estimate", requireAuth, requireCompany, requireFeature("AI_ESTIMATING"), handler)
 */
export const requireFeature = (featureKey: string) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (req.systemRole === "super_admin") {
      next();
      return;
    }

    if (!req.userId) {
      next();
      return;
    }

    if (!req.companyId) {
      res.status(403).json({ error: "No company associated with this account" });
      return;
    }

    const keys = await getCompanyFeatureKeys(req.companyId);
    if (!keys.includes(featureKey)) {
      res.status(403).json({ error: `Feature "${featureKey}" is not included in your current plan` });
      return;
    }

    next();
  };
};
