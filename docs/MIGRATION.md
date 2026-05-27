# Platform Migration Playbook: Replit → Neon + Railway

This document is the authoritative step-by-step guide for migrating Site Snap from the Replit-managed environment to **Neon** (serverless PostgreSQL) and **Railway** (API hosting). Follow each step in order. Do not skip steps.

---

## Prerequisites

- Node 24 installed locally (`nvm use 24`)
- `pnpm` installed globally (`npm i -g pnpm`)
- Railway CLI installed (`npm i -g @railway/cli`) and logged in (`railway login`)
- Neon CLI or access to the Neon console at [console.neon.tech](https://console.neon.tech)
- Repository cloned and `pnpm install` run at the root

---

## Step 1 — Provision Neon Database

1. Log into [console.neon.tech](https://console.neon.tech) and create a new project. Choose the region closest to your Railway deployment (e.g. `us-east-1`).

2. Inside the project, create a database named `sitesnap` (or your preferred name).

3. **Enable `pgvector`** — required for AI Document Q&A (RAG). Run the following against your Neon database from the Neon SQL editor or a `psql` session:

   ```sql
   CREATE EXTENSION IF NOT EXISTS vector;
   ```

4. From the Neon console go to **Connection Details** and copy the **pooled connection string**. It looks like:

   ```
   postgres://user:password@ep-xxx-pooler.us-east-1.aws.neon.tech/sitesnap?sslmode=require
   ```

   > Use the **pooled** URL (contains `-pooler` in the hostname). This routes through PgBouncer and is safe for serverless/long-lived server workloads alike.

5. Save this string — it becomes `DATABASE_URL` in all subsequent steps.

---

## Step 2 — Run Production Drizzle Migrations

Migrations are run from a **secure, local machine or CI/CD environment** using the Neon connection string. Never run migrations from inside the deployed Railway container.

```bash
# From the monorepo root, targeting the Neon database
DATABASE_URL="postgres://user:password@ep-xxx-pooler.us-east-1.aws.neon.tech/sitesnap?sslmode=require" \
  pnpm --filter @workspace/db run migrate
```

This runs `drizzle-kit migrate` which applies all pending SQL migration files from `lib/db/migrations/` in order.

**Verify the migration succeeded:**

```bash
# Connect with psql and confirm tables exist
psql "postgres://user:password@ep-xxx-pooler.us-east-1.aws.neon.tech/sitesnap?sslmode=require" \
  -c "\dt public.*"
```

If you see the expected tables (`users`, `companies`, `projects`, etc.) the migration is complete.

> **Stripe schema note**: The `stripe.*` schema tables are created automatically at API server startup via `stripe-replit-sync` migrations. Do not create them manually.

---

## Step 3 — Deploy the API Server to Railway

### 3a. Create a Railway project

```bash
railway init
# Choose "Empty project", name it "sitesnap-api"
```

Or create the project from [railway.app](https://railway.app) and then link it:

```bash
railway link
```

### 3b. Create the service

```bash
# From the monorepo root
railway service create --name api-server
```

### 3c. Configure the build

Railway supports **Nixpacks** (zero-config) or a custom `Dockerfile`. Nixpacks is recommended for this monorepo.

Create a `railway.toml` at the monorepo root (Railway picks this up automatically):

```toml
[build]
builder = "NIXPACKS"
buildCommand = "pnpm install --frozen-lockfile && pnpm --filter @workspace/api-server run build"

[deploy]
startCommand = "node artifacts/api-server/dist/index.js"
restartPolicyType = "ON_FAILURE"
restartPolicyMaxRetries = 3
healthcheckPath = "/api/healthz"
healthcheckTimeout = 30
```

> The `artifacts/api-server/` build produces a CJS bundle at `artifacts/api-server/dist/index.js` via esbuild.

### 3d. Set the root directory (if deploying from a monorepo)

In the Railway dashboard → your service → Settings → Source → set **Root Directory** to `/` (monorepo root) so the build can resolve workspace packages.

### 3e. Deploy

```bash
railway up --service api-server
```

Railway will run the `buildCommand`, then start with `startCommand`. Inspect build logs in the Railway dashboard if the deploy fails.

---

## Step 4 — Map Environment Variables

Set all required variables on the Railway service. Use the Railway dashboard (Settings → Variables) or the CLI:

```bash
railway variables set \
  NODE_ENV=production \
  DATABASE_URL="postgres://user:password@ep-xxx-pooler.us-east-1.aws.neon.tech/sitesnap?sslmode=require" \
  SESSION_SECRET="$(openssl rand -hex 32)" \
  CLERK_PUBLISHABLE_KEY="pk_live_..." \
  CLERK_SECRET_KEY="sk_live_..." \
  RESEND_API_KEY="re_..." \
  STRIPE_SECRET_KEY="sk_live_..." \
  STRIPE_WEBHOOK_SECRET="whsec_..." \
  QB_CLIENT_ID="..." \
  QB_CLIENT_SECRET="..." \
  TWILIO_ACCOUNT_SID="AC..." \
  TWILIO_AUTH_TOKEN="..." \
  AI_INTEGRATIONS_OPENAI_API_KEY="sk-..." \
  AI_INTEGRATIONS_OPENAI_BASE_URL="https://api.openai.com/v1" \
  TAVILY_API_KEY="tvly-..." \
  LOG_LEVEL="info" \
  SLOW_QUERY_THRESHOLD_MS="500"
```

**Important — `APP_BASE_URL`**: Set this to your Railway public URL **after** Railway assigns it (or after you configure a custom domain). This replaces the Replit `REPLIT_DOMAINS` variable for generating webhook callbacks, referral links, and OAuth redirect URIs.

```bash
railway variables set APP_BASE_URL="https://api.sitesnap.app"
```

**Port**: Railway injects `PORT` automatically — do not override it.

### Variable mapping table

| Old Replit variable | Railway / Neon equivalent | Notes |
|---|---|---|
| `REPLIT_DOMAINS` | `APP_BASE_URL` | Set to your Railway public domain |
| `REPL_IDENTITY` | _(remove)_ | Replit identity token — not used outside Replit |
| `WEB_REPL_RENEWAL` | _(remove)_ | Replit deployment renewal token |
| `REPLIT_CONNECTORS_HOSTNAME` | _(remove)_ | Replit-managed Stripe connector |
| `REPLIT_DEPLOYMENT` | _(remove)_ | Always `1` on Railway via `NODE_ENV=production` |
| `OBJECT_STORAGE_ENDPOINT` | See note below | Replit Object Storage sidecar |

> **Object Storage**: Replit Object Storage uses a local sidecar at `http://127.0.0.1:1106`. On Railway you must migrate file storage to a GCS bucket or S3-compatible service (e.g. Cloudflare R2, AWS S3) and update `objectStorage.ts` accordingly. Set `OBJECT_STORAGE_ENDPOINT` to point to your new provider's token endpoint if it remains GCS-compatible.

---

## Step 5 — Update Stripe Webhook Endpoint

After your Railway service is live and `APP_BASE_URL` is set, update the Stripe webhook endpoint:

1. Go to [Stripe dashboard → Developers → Webhooks](https://dashboard.stripe.com/webhooks).
2. Delete or disable the old Replit webhook endpoint.
3. Add a new endpoint: `https://<your-railway-domain>/api/stripe/webhook`
4. Copy the new **Signing secret** and update `STRIPE_WEBHOOK_SECRET` in Railway variables.

---

## Step 6 — Update QuickBooks OAuth Redirect URI

1. Log into the [Intuit Developer portal](https://developer.intuit.com/app/developer/myapps).
2. Select your app → Keys & OAuth.
3. Add `https://<your-railway-domain>/api/quickbooks/callback` to the list of **Redirect URIs**.
4. Remove the old Replit redirect URI.

---

## Step 7 — Smoke Test

After deployment:

```bash
# Health check
curl https://<your-railway-domain>/api/healthz

# Verify DB connectivity (expect 200 with some JSON)
curl https://<your-railway-domain>/api/companies \
  -H "Authorization: Bearer <clerk_jwt>"
```

Check Railway logs for any startup errors:

```bash
railway logs --service api-server
```

---

## Rollback Procedure

If the Railway deployment fails:

1. In the Railway dashboard, go to Deployments → select the last successful deploy → **Redeploy**.
2. Revert the Stripe webhook endpoint to the Replit URL.
3. Revert the QuickBooks redirect URI to the Replit URL.
4. No database rollback is needed unless you ran a destructive migration — in that case, restore from the Neon point-in-time recovery in the Neon console.
