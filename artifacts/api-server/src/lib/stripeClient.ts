import Stripe from 'stripe';
import { StripeSync } from 'stripe-replit-sync';

type StripeCredentials = { publishableKey: string; secretKey: string; webhookSecret?: string };

// Cached for the lifetime of the process — the Replit connector round-trip and
// Stripe/StripeSync construction only need to happen once, not on every request.
// A shared in-flight promise also dedupes concurrent cold-start callers instead
// of each firing its own connector fetch.
let credentialsPromise: Promise<StripeCredentials> | null = null;
let cachedStripeClient: Stripe | null = null;
let cachedStripeSync: StripeSync | null = null;

async function fetchStripeCredentials(): Promise<StripeCredentials> {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? 'repl ' + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
      ? 'depl ' + process.env.WEB_REPL_RENEWAL
      : null;

  if (!hostname || !xReplitToken) {
    throw new Error(
      'Missing Replit environment variables. ' +
      'Ensure the Stripe integration is connected via the Integrations tab.'
    );
  }

  const isProduction = process.env.REPLIT_DEPLOYMENT === '1';
  const targetEnvironment = isProduction ? 'production' : 'development';

  const url = new URL(`https://${hostname}/api/v2/connection`);
  url.searchParams.set('include_secrets', 'true');
  url.searchParams.set('connector_names', 'stripe');
  url.searchParams.set('environment', targetEnvironment);

  const resp = await fetch(url.toString(), {
    headers: { Accept: 'application/json', 'X-Replit-Token': xReplitToken },
    signal: AbortSignal.timeout(10_000),
  });

  if (!resp.ok) {
    throw new Error(`Failed to fetch Stripe credentials: ${resp.status} ${resp.statusText}`);
  }

  const data = await resp.json() as { items?: Array<{ settings?: { secret?: string; publishable?: string; webhook_secret?: string } }> };
  const settings = data.items?.[0]?.settings;

  if (!settings?.secret) {
    throw new Error(
      'Stripe integration not connected or missing secret key. ' +
      'Connect Stripe via the Integrations tab first.'
    );
  }

  return {
    publishableKey: settings.publishable ?? '',
    secretKey: settings.secret,
    webhookSecret: settings.webhook_secret,
  };
}

function getStripeCredentials(): Promise<StripeCredentials> {
  if (!credentialsPromise) {
    credentialsPromise = fetchStripeCredentials().catch((err) => {
      // Don't cache a failed fetch — a transient connector hiccup shouldn't
      // permanently break Stripe access for the rest of the process lifetime.
      credentialsPromise = null;
      throw err;
    });
  }
  return credentialsPromise;
}

export async function getStripeClient(): Promise<Stripe> {
  if (cachedStripeClient) return cachedStripeClient;
  const { secretKey } = await getStripeCredentials();
  cachedStripeClient = new Stripe(secretKey, { apiVersion: '2025-08-27.basil' as any });
  return cachedStripeClient;
}

export async function getStripePublishableKey(): Promise<string> {
  const { publishableKey } = await getStripeCredentials();
  return publishableKey;
}

export async function getStripeSync(): Promise<StripeSync> {
  if (cachedStripeSync) return cachedStripeSync;
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL environment variable is required');

  const { secretKey, webhookSecret } = await getStripeCredentials();
  cachedStripeSync = new StripeSync({
    poolConfig: { connectionString: databaseUrl },
    stripeSecretKey: secretKey,
    stripeWebhookSecret: webhookSecret ?? '',
  });
  return cachedStripeSync;
}
