import { getUncachableStripeClient } from './stripeClient';

const PLANS = [
  {
    name: 'Site Snap Starter',
    description: 'Perfect for small crews. Up to 3 team members.',
    metadata: { plan: 'starter', maxSeats: '3', features: 'Projects,Daily Reports,Quotes,Invoices,AI Assistant' },
    prices: [
      { amount: 4900, interval: 'month' as const, nickname: 'Starter Monthly' },
      { amount: 49000, interval: 'year' as const, nickname: 'Starter Annual (save 17%)' },
    ],
  },
  {
    name: 'Site Snap Pro',
    description: 'For growing companies. Up to 10 team members.',
    metadata: { plan: 'pro', maxSeats: '10', features: 'Everything in Starter,Document OCR,Push Notifications,Email Reminders' },
    prices: [
      { amount: 9900, interval: 'month' as const, nickname: 'Pro Monthly' },
      { amount: 99000, interval: 'year' as const, nickname: 'Pro Annual (save 17%)' },
    ],
  },
  {
    name: 'Site Snap Business',
    description: 'Unlimited team members. Full feature access.',
    metadata: { plan: 'business', maxSeats: 'unlimited', features: 'Everything in Pro,Unlimited Seats,Priority Support' },
    prices: [
      { amount: 19900, interval: 'month' as const, nickname: 'Business Monthly' },
      { amount: 199000, interval: 'year' as const, nickname: 'Business Annual (save 17%)' },
    ],
  },
];

async function seedProducts() {
  const stripe = await getUncachableStripeClient();

  console.log('Seeding Site Snap products in Stripe...\n');

  for (const plan of PLANS) {
    const existing = await stripe.products.search({
      query: `name:'${plan.name}' AND active:'true'`,
    });

    let productId: string;

    if (existing.data.length > 0) {
      productId = existing.data[0].id;
      console.log(`✓ ${plan.name} already exists (${productId})`);
      // Update metadata in case it changed
      await stripe.products.update(productId, { metadata: plan.metadata });
    } else {
      const product = await stripe.products.create({
        name: plan.name,
        description: plan.description,
        metadata: plan.metadata,
      });
      productId = product.id;
      console.log(`+ Created ${plan.name} (${productId})`);
    }

    for (const price of plan.prices) {
      const existingPrices = await stripe.prices.list({
        product: productId,
        active: true,
        recurring: { interval: price.interval },
      });

      if (existingPrices.data.length > 0) {
        console.log(`  ✓ ${price.nickname} already exists (${existingPrices.data[0].id})`);
      } else {
        const created = await stripe.prices.create({
          product: productId,
          unit_amount: price.amount,
          currency: 'cad',
          recurring: { interval: price.interval },
          nickname: price.nickname,
        });
        console.log(`  + Created ${price.nickname}: $${price.amount / 100} CAD/${price.interval} (${created.id})`);
      }
    }
  }

  console.log('\nDone! Webhooks will sync prices to the database automatically.');
}

seedProducts().catch((err) => {
  console.error('Error seeding products:', err);
  process.exit(1);
});
