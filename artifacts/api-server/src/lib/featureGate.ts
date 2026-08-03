import { db, subscriptionsTable, planFeaturesTable, featuresTable, companiesTable, plansTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import type { Request, Response, NextFunction } from "express";

const ENTERPRISE_ONLY_FEATURES = ["RISK_DASHBOARD", "FINANCIALS", "AUDIT_VAULT", "WORKER_DOCUMENTS"];

// ── In-memory TTL cache for feature keys ────────────────────────────────────
// Avoids 2 DB queries per gated request. Capped at MAX_CACHE_ENTRIES so the
// Map never grows unbounded in a long-running multi-tenant deployment.
// TTL is 5 s; LISTEN/NOTIFY (HIGH-003) handles instant cross-process invalidation.
const TTL_MS = 5_000;
const MAX_CACHE_ENTRIES = 2_000;
type CacheEntry = { keys: string[]; cachedAt: number };
const featureCache = new Map<number, CacheEntry>();

function getCached(companyId: number): string[] | null {
  const entry = featureCache.get(companyId);
  if (!entry) return null;
  if (Date.now() - entry.cachedAt > TTL_MS) {
    featureCache.delete(companyId);
    return null;
  }
  // Move to end of insertion order to maintain LRU eviction order.
  featureCache.delete(companyId);
  featureCache.set(companyId, entry);
  return entry.keys;
}

function setCache(companyId: number, keys: string[]): void {
  if (featureCache.size >= MAX_CACHE_ENTRIES) {
    // Evict the oldest (first) entry — Map iterates in insertion order.
    const oldest = featureCache.keys().next().value;
    if (oldest !== undefined) featureCache.delete(oldest);
  }
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
    // Still apply Enterprise-only features on top of the custom override so
    // Enterprise tenants always receive their full entitlement even when a
    // manual activeFeatures list is set.
    const isEnterprise = await isEnterprisePlan(companyId);
    const keys = [...company.activeFeatures];
    if (isEnterprise) {
      for (const f of ENTERPRISE_ONLY_FEATURES) {
        if (!keys.includes(f)) keys.push(f);
      }
    }
    setCache(companyId, keys);
    return keys;
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

  // P1 fix: If no active subscription exists, return only the minimal free-tier
  // feature set. Previously returned a full Starter-equivalent set which granted
  // access to paid features (INVOICES, QUOTES, SMART_ESTIMATOR, AI_CHAT etc.)
  // without a valid subscription — revenue enforcement was unreliable.
  // New tenants go through onboarding/billing before accessing paid features.
  if (rows.length === 0) {
    const defaultKeys = [
      "SCHEDULING",    // basic scheduling (free)
      "DAILY_REPORTS", // core field logging (free)
      "TEAM_MANAGEMENT", // invite workers (free, seat-limited)
      "SAFETY_FORMS",  // safety is always on
      "TRADEHUB",      // marketplace (free)
    ];
    setCache(companyId, defaultKeys);
    return defaultKeys;
  }

  const planSlug = rows[0].planSlug;
  const isEnterprise = planSlug?.toLowerCase() === "enterprise";
  // Normalize all keys to UPPER_SNAKE_CASE so comparisons are consistent
  const keys = rows.map((r) => r.key.toUpperCase());

  if (isEnterprise) {
    if (!keys.includes("RISK_DASHBOARD")) keys.push("RISK_DASHBOARD");
    if (!keys.includes("FINANCIALS")) keys.push("FINANCIALS");
    if (!keys.includes("AUDIT_VAULT")) keys.push("AUDIT_VAULT");
    if (!keys.includes("WORKER_DOCUMENTS")) keys.push("WORKER_DOCUMENTS");
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
    // P1 fix: case-insensitive match so mixed-case DB records (e.g. "Smart_Estimator")
    // and normalized code keys (e.g. "SMART_ESTIMATOR") both resolve correctly
    // during the transition period while the DB is being normalized.
    const normalizedRequest = featureKey.toUpperCase();
    const hasFeature = keys.some((k) => k.toUpperCase() === normalizedRequest);
    if (!hasFeature) {
      res.status(403).json({ error: `Feature "${featureKey}" is not included in your current plan` });
      return;
    }

    next();
  };
};
