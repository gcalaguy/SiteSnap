import { db, subscriptionsTable, planFeaturesTable, featuresTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import type { Request, Response, NextFunction } from "express";

export async function getCompanyFeatureKeys(companyId: number): Promise<string[]> {
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
 * Middleware factory: blocks the request if the tenant's plan does not include
 * the given feature key (or if the feature is globally disabled).
 *
 * Usage:
 *   router.get("/ai/estimate", requireAuth, requireCompany, requireFeature("AI_ESTIMATING"), handler)
 */
export const requireFeature = (featureKey: string) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Super admins bypass feature gates
    if (req.systemRole === "super_admin") {
      next();
      return;
    }

    // If not yet authenticated, let requireAuth on the individual route handle it
    if (!req.userId) {
      next();
      return;
    }

    if (!req.companyId) {
      res.status(403).json({ error: "No company associated with this account" });
      return;
    }

    const [row] = await db
      .select({ featureId: planFeaturesTable.featureId })
      .from(subscriptionsTable)
      .innerJoin(planFeaturesTable, eq(planFeaturesTable.planId, subscriptionsTable.planId))
      .innerJoin(featuresTable, eq(featuresTable.id, planFeaturesTable.featureId))
      .where(
        and(
          eq(subscriptionsTable.companyId, req.companyId),
          eq(featuresTable.key, featureKey),
          eq(featuresTable.isEnabled, true),
        ),
      )
      .limit(1);

    if (!row) {
      res
        .status(403)
        .json({ error: `Feature "${featureKey}" is not included in your current plan` });
      return;
    }

    next();
  };
};
