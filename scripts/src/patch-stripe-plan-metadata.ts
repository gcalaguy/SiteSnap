import Stripe from "stripe";

const PLANS = [
  { productId: "prod_UTZ79WgKr03jYW", slug: "starter", name: "Starter", maxSeats: "5" },
  { productId: "prod_UTZ7OLvxPq9JGE", slug: "pro",     name: "Pro",     maxSeats: "20" },
  { productId: "prod_UTZ7mjuO6PACF6", slug: "enterprise", name: "Enterprise", maxSeats: "100" },
];

async function main() {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) throw new Error("STRIPE_SECRET_KEY not set");

  const stripe = new Stripe(secretKey, { apiVersion: "2023-10-16" as any });

  console.log(`Patching ${PLANS.length} Stripe products…`);

  for (const plan of PLANS) {
    const updated = await stripe.products.update(plan.productId, {
      metadata: {
        plan: plan.slug,
        slug: plan.slug,
        maxSeats: plan.maxSeats,
        source: "site_snap_admin",
      },
    });
    console.log(`✓ ${plan.name} → metadata.plan = "${updated.metadata.plan}"`);
  }

  console.log("Done.");
  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
