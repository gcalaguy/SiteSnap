import app from "./app";
import { logger } from "./lib/logger";
import { startDailyCron } from "./cron";
import { pool } from "@workspace/db";
import { instrumentPool } from "./lib/slowQueryLogger";
import { startPgListener } from "./lib/pgListener";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// Instrument pg pool before any queries run.
instrumentPool(pool);

async function initStripe() {
  try {
    const { runMigrations } = await import("stripe-replit-sync");
    const { getStripeSync } = await import("./lib/stripeClient");

    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error("DATABASE_URL required for Stripe");

    // Pre-create stripe.invoice_status before stripe-replit-sync migrations run.
    // stripe-replit-sync's invoices migration checks pg_type by typname only
    // (no schema filter), so it finds our public.invoice_status and skips
    // creating stripe.invoice_status — then fails when the stripe.invoices table
    // references it. We create the type in the stripe schema explicitly first.
    const client = await pool.connect();
    try {
      await client.query(`CREATE SCHEMA IF NOT EXISTS stripe;`);
      await client.query(`
        DO $$ BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_type t
            JOIN pg_namespace n ON t.typnamespace = n.oid
            WHERE t.typname = 'invoice_status' AND n.nspname = 'stripe'
          ) THEN
            CREATE TYPE stripe.invoice_status AS ENUM ('draft', 'open', 'paid', 'uncollectible', 'void');
          END IF;
        END $$;
      `);
    } finally {
      client.release();
    }

    logger.info("Initializing Stripe schema...");
    await runMigrations({ databaseUrl });
    logger.info("Stripe schema ready");

    const stripeSync = await getStripeSync();
    const webhookBaseUrl =
      process.env.APP_BASE_URL ??
      `https://${process.env.REPLIT_DOMAINS?.split(",")[0]}`;
    await stripeSync.findOrCreateManagedWebhook(
      `${webhookBaseUrl}/api/stripe/webhook`,
    );
    logger.info("Stripe webhook configured");

    // Run backfill in background — don't block server startup
    stripeSync
      .syncBackfill()
      .then(() => logger.info("Stripe data backfill complete"))
      .catch((err: any) => logger.error({ err }, "Stripe backfill error"));
  } catch (err: any) {
    logger.error({ err }, "Stripe initialization failed — billing unavailable");
  }
}

await initStripe();

// Ensure any features added to the seed list after initial DB setup are inserted.
// onConflictDoNothing makes this safe to run on every startup.
async function ensureFeatures() {
  try {
    const { db, featuresTable, planFeaturesTable, plansTable } = await import("@workspace/db");
    const { eq } = await import("drizzle-orm");
    await db.insert(featuresTable).values([
      { name: "Worker Documents", key: "WORKER_DOCUMENTS", description: "Enterprise worker document management and compliance" },
    ]).onConflictDoNothing();
    // Link to Enterprise plan if not already linked
    const [enterprise] = await db.select().from(plansTable).where(eq(plansTable.slug, "enterprise")).limit(1);
    const [feature] = await db.select().from(featuresTable).where(eq(featuresTable.key, "WORKER_DOCUMENTS")).limit(1);
    if (enterprise && feature) {
      await db.insert(planFeaturesTable).values({ planId: enterprise.id, featureId: feature.id }).onConflictDoNothing();
    }
  } catch (err: any) {
    logger.warn({ err }, "ensureFeatures: failed to upsert features — non-fatal");
  }
}

await ensureFeatures();

// Ensure RFI_SUBMITTAL feature exists and is linked to Pro + Enterprise plans.
async function ensureRfiSubmittal() {
  try {
    const { db, featuresTable, planFeaturesTable, plansTable } = await import("@workspace/db");
    const { eq, inArray } = await import("drizzle-orm");
    await db.insert(featuresTable).values([
      { name: "RFI & Submittal", key: "RFI_SUBMITTAL", description: "RFI and submittal workflow tracking" },
    ]).onConflictDoNothing();
    const plans = await db.select().from(plansTable).where(inArray(plansTable.slug, ["pro", "enterprise"]));
    const [feature] = await db.select().from(featuresTable).where(eq(featuresTable.key, "RFI_SUBMITTAL")).limit(1);
    if (feature && plans.length > 0) {
      await db.insert(planFeaturesTable).values(
        plans.map((p) => ({ planId: p.id, featureId: feature.id }))
      ).onConflictDoNothing();
    }
  } catch (err: any) {
    logger.warn({ err }, "ensureRfiSubmittal: non-fatal");
  }
}

await ensureRfiSubmittal();

// Apply RFI workflow migration — safe to run on every startup (IF NOT EXISTS / ADD VALUE IF NOT EXISTS).
async function applyRfiWorkflowMigration() {
  try {
    await pool.query(`ALTER TYPE "rfi_status" ADD VALUE IF NOT EXISTS 'approved'`);
    await pool.query(`ALTER TYPE "rfi_status" ADD VALUE IF NOT EXISTS 'rejected'`);
    await pool.query(`
      ALTER TABLE "rfis"
        ADD COLUMN IF NOT EXISTS "company_id"            integer REFERENCES "companies"("id") ON DELETE CASCADE,
        ADD COLUMN IF NOT EXISTS "blueprint_coordinates" text,
        ADD COLUMN IF NOT EXISTS "image_url"             text
    `);
    await pool.query(`
      UPDATE "rfis" r
      SET "company_id" = p."company_id"
      FROM "projects" p
      WHERE r."project_id" = p."id" AND r."company_id" IS NULL
    `);
  } catch (err: any) {
    logger.warn({ err }, "applyRfiWorkflowMigration: non-fatal");
  }
}

await applyRfiWorkflowMigration();

// Start LISTEN/NOTIFY listener for distributed feature cache invalidation.
// Non-blocking — a connection failure logs a warning and retries automatically.
startPgListener().catch((err) =>
  logger.warn({ err }, "pgListener startup error — feature cache will rely on TTL only"),
);

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
  startDailyCron();
});
