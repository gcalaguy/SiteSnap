import { sql } from 'drizzle-orm';
import { db } from '@workspace/db';

export async function getStripeProduct(productId: string) {
  const result = await db.execute(
    sql`SELECT * FROM stripe.products WHERE id = ${productId}`
  );
  return result.rows[0] ?? null;
}

export async function listProductsWithPrices() {
  const result = await db.execute(sql`
    WITH paginated_products AS (
      SELECT id, name, description, metadata, active
      FROM stripe.products
      WHERE active = true
      ORDER BY name
    )
    SELECT
      p.id          AS product_id,
      p.name        AS product_name,
      p.description AS product_description,
      p.active      AS product_active,
      p.metadata    AS product_metadata,
      pr.id         AS price_id,
      pr.unit_amount,
      pr.currency,
      pr.recurring,
      pr.active     AS price_active,
      pr.metadata   AS price_metadata
    FROM paginated_products p
    LEFT JOIN stripe.prices pr ON pr.product = p.id AND pr.active = true
    ORDER BY p.name, pr.unit_amount
  `);
  return result.rows;
}

export async function getStripeSubscription(subscriptionId: string) {
  const result = await db.execute(
    sql`SELECT * FROM stripe.subscriptions WHERE id = ${subscriptionId}`
  );
  return result.rows[0] ?? null;
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
