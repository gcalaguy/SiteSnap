import { getUncachableStripeClient } from './stripeClient';

async function main() {
  const stripe = await getUncachableStripeClient();
  const prices = await stripe.prices.list({ active: true, limit: 20 });
  console.log('Prices from Stripe API:');
  for (const p of prices.data) {
    console.log(`  ${p.id} product=${p.product} amount=${p.unit_amount} interval=${(p.recurring as any)?.interval}`);
  }
  if (prices.data.length === 0) {
    console.log('  (none)');
  }
}

main().catch(console.error);
