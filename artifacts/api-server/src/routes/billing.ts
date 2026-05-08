import { Router } from 'express';
import { eq, and, isNotNull } from 'drizzle-orm';
import { requireAuth, requireCompany, requireOwner } from '../lib/auth';
import { db, companiesTable, usersTable, plansTable } from '@workspace/db';
import {
  getUncachableStripeClient,
  getStripePublishableKey,
} from '../lib/stripeClient';
import {
  listProductsWithPrices,
  groupProductsWithPrices,
  getStripeSubscription,
} from '../lib/stripeStorage';
import { getCompanySeatInfo } from '../lib/seatEnforcement';

const router = Router();

// GET /api/billing/plans — public list of products + prices
// Only returns Stripe products that are linked to a DB plan (stripeProductId),
// so orphaned/legacy Stripe products are never shown to customers.
router.get('/billing/plans', async (req, res) => {
  try {
    // Fetch the set of Stripe product IDs that are authoritative in our DB
    const dbPlans = await db
      .select({
        stripeProductId: plansTable.stripeProductId,
        stripeMonthlyPriceId: plansTable.stripeMonthlyPriceId,
        stripeYearlyPriceId: plansTable.stripeYearlyPriceId,
        maxSeats: plansTable.maxSeats,
        slug: plansTable.slug,
      })
      .from(plansTable)
      .where(isNotNull(plansTable.stripeProductId));

    const linkedProductIds = new Set(dbPlans.map((p) => p.stripeProductId!));
    const linkedPriceIds = new Set(
      dbPlans.flatMap((p) => [p.stripeMonthlyPriceId, p.stripeYearlyPriceId].filter(Boolean) as string[])
    );

    if (linkedProductIds.size === 0) {
      // No plans synced to Stripe yet — fall back to full list
      const rows = await listProductsWithPrices();
      const plans = groupProductsWithPrices(rows);
      const publishableKey = await getStripePublishableKey();
      return res.json({ plans, publishableKey });
    }

    const rows = await listProductsWithPrices();

    // Filter to only products and prices registered in our DB
    const filtered = rows.filter(
      (r) => linkedProductIds.has(r.product_id) && (r.price_id === null || linkedPriceIds.has(r.price_id))
    );

    const plans = groupProductsWithPrices(filtered);
    const publishableKey = await getStripePublishableKey();
    res.json({ plans, publishableKey });
  } catch (err: any) {
    req.log.error({ err }, 'billing/plans error');
    res.status(500).json({ error: 'Failed to load plans' });
  }
});

// GET /api/billing/subscription — current company subscription
router.get('/billing/subscription', requireAuth, requireCompany, async (req, res) => {
  try {
    const [company] = await db
      .select()
      .from(companiesTable)
      .where(eq(companiesTable.id, req.companyId!));

    if (!company?.stripeSubscriptionId) {
      return res.json({ subscription: null, company });
    }

    const subscription = await getStripeSubscription(company.stripeSubscriptionId);
    res.json({ subscription, company });
  } catch (err: any) {
    req.log.error({ err }, 'billing/subscription error');
    res.status(500).json({ error: 'Failed to load subscription' });
  }
});

// POST /api/billing/checkout — create Stripe checkout session (owner only)
router.post('/billing/checkout', requireAuth, requireCompany, requireOwner, async (req, res) => {
  try {
    const { priceId, seats = 1 } = req.body as { priceId: string; seats?: number };
    if (!priceId) return res.status(400).json({ error: 'priceId is required' });

    const [company] = await db
      .select()
      .from(companiesTable)
      .where(eq(companiesTable.id, req.companyId!));

    const stripe = await getUncachableStripeClient();

    // Find or create Stripe customer for this company
    let customerId = company.stripeCustomerId ?? undefined;
    if (!customerId) {
      const [ownerUser] = await db
        .select()
        .from(usersTable)
        .where(and(eq(usersTable.companyId, req.companyId!), eq(usersTable.role, 'owner')))
        .limit(1);

      const customer = await stripe.customers.create({
        email: ownerUser?.email ?? undefined,
        name: company.name,
        metadata: { companyId: String(req.companyId) },
      });
      customerId = customer.id;
      await db
        .update(companiesTable)
        .set({ stripeCustomerId: customerId })
        .where(eq(companiesTable.id, req.companyId!));
    }

    const domain = `https://${process.env.REPLIT_DOMAINS?.split(',')[0]}`;

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: seats }],
      mode: 'subscription',
      success_url: `${domain}/admin?billing=success`,
      cancel_url: `${domain}/admin?billing=cancel`,
      subscription_data: {
        metadata: { companyId: String(req.companyId) },
      },
    });

    res.json({ url: session.url });
  } catch (err: any) {
    req.log.error({ err }, 'billing/checkout error');
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

// GET /api/billing/seats — current seat usage for the company
router.get('/billing/seats', requireAuth, requireCompany, async (req, res) => {
  try {
    const seatInfo = await getCompanySeatInfo(req.companyId!);
    res.json(seatInfo);
  } catch (err: any) {
    req.log.error({ err }, 'billing/seats error');
    res.status(500).json({ error: 'Failed to load seat info' });
  }
});

// POST /api/billing/portal — create Stripe billing portal session (owner only)
router.post('/billing/portal', requireAuth, requireCompany, requireOwner, async (req, res) => {
  try {
    const [company] = await db
      .select()
      .from(companiesTable)
      .where(eq(companiesTable.id, req.companyId!));

    if (!company?.stripeCustomerId) {
      return res.status(400).json({ error: 'No billing account found. Subscribe first.' });
    }

    const stripe = await getUncachableStripeClient();
    const domain = `https://${process.env.REPLIT_DOMAINS?.split(',')[0]}`;

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: company.stripeCustomerId,
      return_url: `${domain}/admin`,
    });

    res.json({ url: portalSession.url });
  } catch (err: any) {
    req.log.error({ err }, 'billing/portal error');
    res.status(500).json({ error: 'Failed to create portal session' });
  }
});

export default router;
