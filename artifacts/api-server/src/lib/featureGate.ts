import { db, subscriptionsTable, planFeaturesTable, featuresTable, companiesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import type { Request, Response, NextFunction } from "express";

/**
 * Returns the effective feature keys for a company.
 * Priority: custom activeFeatures override → plan-based features.
 */
export async function getCompanyFeatureKeys(companyId: number): Promise<string[]> {
  const [company] = await db
    .select({ activeFeatures: companiesTable.activeFeatures })
    .from(companiesTable)
    .where(eq(companiesTable.id, companyId))
    .limit(1);

  if (company?.activeFeatures && company.activeFeatures.length > 0) {
    return company.activeFeatures;
  }

  const rows = await db
    .select({ key: featuresTable.key })
    .from(subscriptionsTable)
    .innerJoin(planFeaturesTable, eq(planFeaturesTable.planId, subscriptionsTable.planId))
    .innerJoin(featuresTable, eq(featuresTable.id, planFeaturesTable.featureId))
    .where(
      and(
        eq(subscriptionsTable.companyId, companyId),
        eq(subscriptionsTable.status, "active"),
        eq(featuresTable.isEnabled, true),
      ),
    );
  return rows.map((r) => r.key);
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
