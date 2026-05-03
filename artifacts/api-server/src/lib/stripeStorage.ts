import { sql } from 'drizzle-orm';
import { db } from '@workspace/db';
import { getUncachableStripeClient } from './stripeClient';

export async function getStripeProduct(productId: string) {
  const result = await db.execute(
    sql`SELECT * FROM stripe.products WHERE id = ${productId}`
  );
  return result.rows[0] ?? null;
}

/**
 * Fetches active products with their active prices directly from the Stripe API.
 * We use the API directly because stripe-replit-sync only reliably backfills
 * products in the local stripe schema; prices, subscriptions and customers
 * require webhook events to populate and may be absent on a fresh instance.
 */
export async function listProductsWithPrices() {
  const stripe = await getUncachableStripeClient();

  const [productsRes, pricesRes] = await Promise.all([
    stripe.products.list({ active: true, limit: 100 }),
    stripe.prices.list({ active: true, limit: 100 }),
  ]);

  const rows: any[] = [];
  for (const product of productsRes.data) {
    const productPrices = pricesRes.data.filter(
      (p) => p.product === product.id,
    );
    if (productPrices.length === 0) {
      rows.push({
        product_id: product.id,
        product_name: product.name,
        product_description: product.description,
        product_active: product.active,
        product_metadata: product.metadata,
        price_id: null,
        unit_amount: null,
        currency: null,
        recurring: null,
        price_active: null,
        price_metadata: null,
      });
    } else {
      for (const price of productPrices) {
        rows.push({
          product_id: product.id,
          product_name: product.name,
          product_description: product.description,
          product_active: product.active,
          product_metadata: product.metadata,
          price_id: price.id,
          unit_amount: price.unit_amount,
          currency: price.currency,
          recurring: price.recurring,
          price_active: price.active,
          price_metadata: price.metadata,
        });
      }
    }
  }

  // Sort: by product name, then price amount ascending
  rows.sort((a, b) => {
    const nameComp = (a.product_name ?? '').localeCompare(b.product_name ?? '');
    if (nameComp !== 0) return nameComp;
    return (a.unit_amount ?? 0) - (b.unit_amount ?? 0);
  });

  return rows;
}

/**
 * Fetches a subscription directly from the Stripe API, expanding line items.
 */
export async function getStripeSubscription(subscriptionId: string) {
  try {
    const stripe = await getUncachableStripeClient();
    const sub = await stripe.subscriptions.retrieve(subscriptionId, {
      expand: ['items.data.price.product'],
    });
    return sub;
  } catch {
    return null;
  }
}

export async function getStripeCustomer(customerId: string) {
  const result = await db.execute(
    sql`SELECT * FROM stripe.customers WHERE id = ${customerId}`
  );
  return result.rows[0] ?? null;
}

export function groupProductsWithPrices(rows: any[]) {
  const productsMap = new Map<string, any>();
  for (const row of rows) {
    if (!productsMap.has(row.product_id)) {
      productsMap.set(row.product_id, {
        id: row.product_id,
        name: row.product_name,
        description: row.product_description,
        metadata: row.product_metadata ?? {},
        prices: [],
      });
    }
    if (row.price_id) {
      productsMap.get(row.product_id).prices.push({
        id: row.price_id,
        unitAmount: row.unit_amount,
        currency: row.currency,
        recurring: row.recurring,
      });
    }
  }
  return Array.from(productsMap.values());
}
