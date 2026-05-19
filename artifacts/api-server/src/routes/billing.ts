import { Router } from 'express';
import { eq, and, isNotNull } from 'drizzle-orm';
import { requireAuth, requireCompany, requireOwner } from '../lib/auth';
import { db, companiesTable, usersTable, userMembershipsTable, plansTable } from '@workspace/db';
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

router.get('/billing/plans', async (req, res) => {
  try {
    const dbPlans = await db
      .select({
        stripeProductId: plansTable.stripeProductId,
        stripeMonthlyPriceId: plansTable.stripeMonthlyPriceId,
        stripeYearlyPriceId: plansTable.stripeYearlyPriceId,
        slug: plansTable.slug,
      })
      .from(plansTable)
      .where(isNotNull(plansTable.stripeProductId));

    const linkedProductIds = new Set(dbPlans.map((p) => p.stripeProductId!));
    const linkedPriceIds = new Set(
      dbPlans.flatMap((p) => [p.stripeMonthlyPriceId, p.stripeYearlyPriceId].filter(Boolean) as string[])
    );

    const rows = await listProductsWithPrices();
    const filtered = linkedProductIds.size === 0
      ? rows
      : rows.filter((r) => linkedProductIds.has(r.product_id) && (r.price_id === null || linkedPriceIds.has(r.price_id)));

    const plans = groupProductsWithPrices(filtered);
    const publishableKey = await getStripePublishableKey();
    res.json({ plans, publishableKey });
  } catch (err: any) {
    req.log.error({ err }, 'billing/plans error');
    res.status(500).json({ error: 'Failed to load plans' });
  }
});

router.get('/billing/subscription', requireAuth, requireCompany, async (req, res) => {
  try {
    const [company] = await db
      .select()
      .from(companiesTable)
      .where(eq(companiesTable.id, req.companyId!));

    if (!company?.stripeSubscriptionId) {
      res.json({ subscription: null, company });
      return;
    }

    const subscription = await getStripeSubscription(company.stripeSubscriptionId);
    res.json({ subscription, company });
  } catch (err: any) {
    req.log.error({ err }, 'billing/subscription error');
    res.status(500).json({ error: 'Failed to load subscription' });
  }
});

router.post('/billing/checkout', requireAuth, requireCompany, requireOwner, async (req, res) => {
  try {
    const { priceId, seats = 1 } = req.body as { priceId: string; seats?: number };
    if (!priceId) { res.status(400).json({ error: 'priceId is required' }); return; }

    const [company] = await db
      .select()
      .from(companiesTable)
      .where(eq(companiesTable.id, req.companyId!));

    const stripe = await getUncachableStripeClient();

    let customerId = company.stripeCustomerId ?? undefined;
    if (!customerId) {
      const [ownerUser] = await db
        .select({ email: usersTable.email })
        .from(usersTable)
        .innerJoin(
          userMembershipsTable,
          and(
            eq(userMembershipsTable.userId, usersTable.id),
            eq(userMembershipsTable.companyId, req.companyId!),
            eq(userMembershipsTable.role, 'owner'),
          ),
        )
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

router.get('/billing/seats', requireAuth, requireCompany, async (req, res) => {
  try {
    const seatInfo = await getCompanySeatInfo(req.companyId!);
    res.json(seatInfo);
  } catch (err: any) {
    req.log.error({ err }, 'billing/seats error');
    res.status(500).json({ error: 'Failed to load seat info' });
  }
});

router.post('/billing/portal', requireAuth, requireCompany, requireOwner, async (req, res) => {
  try {
    const [company] = await db
      .select()
      .from(companiesTable)
      .where(eq(companiesTable.id, req.companyId!));

    if (!company?.stripeCustomerId) {
      res.status(400).json({ error: 'No billing account found. Subscribe first.' });
      return;
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
