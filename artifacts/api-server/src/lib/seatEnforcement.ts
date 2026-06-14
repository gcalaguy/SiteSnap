import { sql, eq, count } from 'drizzle-orm';
import { db, companiesTable, userMembershipsTable } from '@workspace/db';
import type { Request, Response, NextFunction } from 'express';

export interface SeatInfo {
  currentSeats: number;
  maxSeats: number | 'unlimited';
  canAddMore: boolean;
  planName: string | null;
  subscriptionStatus: string | null;
}

/**
 * Looks up the seat limit for a company by joining through the stripe schema:
 * subscriptions → subscription_items → prices → products → metadata.maxSeats
 *
 * If no active subscription exists, returns unlimited (no paywall during trial/free).
 */
export async function getCompanySeatInfo(companyId: number): Promise<SeatInfo> {
  // Count current team members
  const [{ value: currentSeats }] = await db
    .select({ value: count() })
    .from(userMembershipsTable)
    .where(eq(userMembershipsTable.companyId, companyId));

  // Get company's subscription ID
  const [company] = await db
    .select({ stripeSubscriptionId: companiesTable.stripeSubscriptionId })
    .from(companiesTable)
    .where(eq(companiesTable.id, companyId));

  const subscriptionId = company?.stripeSubscriptionId;
  if (!subscriptionId) {
    return {
      currentSeats: Number(currentSeats),
      maxSeats: 'unlimited',
      canAddMore: true,
      planName: null,
      subscriptionStatus: null,
    };
  }

  // Join subscription → subscription_items → prices → products to get maxSeats
  const result = await db.execute(sql`
    SELECT
      sub.status            AS subscription_status,
      p.name                AS product_name,
      p.metadata->>'maxSeats' AS max_seats
    FROM stripe.subscriptions sub
    JOIN stripe.subscription_items si ON si.subscription = sub.id
    JOIN stripe.prices pr ON pr.id = si.price
    JOIN stripe.products p ON p.id = pr.product
    WHERE sub.id = ${subscriptionId}
    LIMIT 1
  `);

  const row = result.rows[0] as any;
  if (!row) {
    // Subscription ID set but not yet synced to local stripe schema — allow for now
    return {
      currentSeats: Number(currentSeats),
      maxSeats: 'unlimited',
      canAddMore: true,
      planName: null,
      subscriptionStatus: null,
    };
  }

  const maxSeatsRaw: string = row.max_seats ?? 'unlimited';
  const maxSeats: number | 'unlimited' =
    maxSeatsRaw === 'unlimited' ? 'unlimited' : Number(maxSeatsRaw);

  const canAddMore =
    maxSeats === 'unlimited' || Number(currentSeats) < maxSeats;

  return {
    currentSeats: Number(currentSeats),
    maxSeats,
    canAddMore,
    planName: row.product_name ?? null,
    subscriptionStatus: row.subscription_status ?? null,
  };
}

/**
 * Express middleware — blocks the request with 403 if the company has reached
 * its plan's seat limit. Attaches seatInfo to req for downstream use.
 *
 * Requires requireAuth + requireCompany to run first (needs req.companyId).
 */
export const requireSeatAvailable = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  const companyId = req.companyId;
  if (!companyId) {
    res.status(403).json({ error: 'No company associated with this account' });
    return;
  }

  try {
    const seatInfo = await getCompanySeatInfo(companyId);
    (req as any).seatInfo = seatInfo;

    if (!seatInfo.canAddMore) {
      res.status(403).json({
        error: 'Seat limit reached',
        code: 'SEAT_LIMIT_REACHED',
        currentSeats: seatInfo.currentSeats,
        maxSeats: seatInfo.maxSeats,
        planName: seatInfo.planName,
        message: `Your ${seatInfo.planName ?? 'current'} plan allows up to ${seatInfo.maxSeats} team members. Upgrade your plan to add more.`,
      });
      return;
    }

    next();
  } catch (err) {
    // P1 fix: fail closed on seat-check errors rather than silently allowing
    // unlimited invites. Log the error so ops can diagnose Stripe sync issues.
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error('[seatEnforcement] seat check error — blocking request:', errMsg);
    res.status(503).json({
      error: 'Unable to verify seat availability. Please try again in a moment.',
      code: 'SEAT_CHECK_UNAVAILABLE',
    });
  }
};
