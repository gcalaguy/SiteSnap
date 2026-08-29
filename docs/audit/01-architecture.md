# Phase 1 — Architecture Review

**Scope:** Full monorepo (`artifacts/api-server` 52k LOC · `artifacts/web-dashboard` ~69k LOC · `artifacts/mobile` ~48.7k LOC · `lib/db` 124 tables). Audited 2026-08-25 on branch `lifetime-mobile-restyle`.

**Overall shape:** pnpm monorepo with a single Express 5 API (74 route files, 565 endpoints), a React 19/Vite SPA, an Expo SDK 54 mobile app, and a spec-first codegen pipeline (OpenAPI → Orval → typed React Query client + Zod). Deployment is 100 % Replit-native (autoscale API + static web + Expo dev-client hosting), no containers.

What is genuinely good and worth preserving: spec-first API contracts with pre-commit drift checks (`.husky/pre-commit` → `scripts/check-api-zod.sh`); consistent error envelope (`src/lib/errors.ts` + `src/middlewares/errorHandler.ts`); PG-backed shared rate-limit store (`src/lib/pgRateLimitStore.ts`); pre-signed-URL uploads; pino with a thorough redact list; Postgres advisory locks around cron jobs.

---

## Findings

### A1. Tenant isolation is re-implemented per query with a fail-open backstop
- **Severity: Critical**
- **Where:** 60 of 74 route files query Drizzle inline; tenant scoping is a hand-written `eq(table.companyId, req.companyId!)` repeated across ~565 handlers. The RLS layer beneath it is deliberately permissive (`current_tenant_id() IS NULL OR company_id = …` — `lib/db/migrations/0046_enable_rls.sql`), and `requireTenantCtx` silently no-ops when `req.companyId` is null (`artifacts/api-server/src/lib/auth.ts:348-351`).
- **Impact:** Every new endpoint is one forgotten `WHERE` away from a silent cross-tenant leak, and the backstop is designed not to catch it. One concrete instance already exists (see 02-code-quality B1 / 03-security V2).
- **Recommendation:** (1) Ship the RLS lockdown that already exists as `lib/db/migrations/0051_rls_lockdown_default_deny.sql.draft` — strip the `IS NULL` fallback for request-path tables, keep it only for `user_memberships`/`subscriptions` as documented in `0050`. (2) Make `requireTenantCtx` **throw** (500) instead of `next()` when `companyId` is null on routes that also declare `requireCompany` absent. (3) Funnel new code through the repository layer where scoping lives once (`src/repositories/`), not per handler.
- **Effort:** 1–2 weeks (lockdown migration + fixing the cron/superAdmin paths that legitimately need a bypass role).

### A2. Single-process coupling: HTTP + cron + AI + PDF + OCR in one autoscale service
- **Severity: High**
- **Where:** `src/cron.ts` (797 LOC, 10+ schedules incl. email polling every 5 min) runs inside the API process; all OpenAI calls (`routes/ai.ts`, `routes/calculators.ts:37`, `routes/conversations.ts:87`), PDF generation (`lib/invoicePdf.ts`, Playwright in `lib/documentTemplateRenderer.ts`), and OCR run inline in request handlers under a 120 s client timeout that does **not** cancel the work (`src/app.ts:203-217`).
- **Impact:** One slow AI/PDF burst starves CRUD traffic (shared event loop, shared 20-connection pool — see 05-database D1); on Replit **autoscale**, a scaled-to-zero instance simply never runs the cron jobs (advisory locks prevent double-runs, not zero-runs); a Playwright render OOM kills unrelated requests.
- **Recommendation:** Split into (a) API service, (b) worker service consuming a Postgres-backed job queue (`pg-boss` fits the existing stack — no new infra), (c) a scheduler (either the worker with cron, or Replit scheduled deployments). Move AI/PDF/OCR/export/email-sync into jobs; return 202 + poll/notify for long operations (the mobile app's offline queue pattern already tolerates async completion).
- **Effort:** 2–3 weeks incremental (start with email sync + PDF; AI endpoints last since the UI awaits them).

### A3. Schema changes execute outside the migration system — on every boot
- **Severity: High**
- **Where:** `src/index.ts:105-148` — `ensureRfiSubmittal()` seed + `applyRfiWorkflowMigration()` runs raw `ALTER TYPE`/`ALTER TABLE`/backfill `UPDATE` at every process start, errors swallowed as "non-fatal". Meanwhile `lib/db/README.md` documents that `drizzle-kit push --force` is the canonical schema path and the 87 SQL migrations are effectively inert (journal stops at `0044`, snapshot at `0036`).
- **Impact:** Three uncoordinated schema channels (push, .sql files, boot-time DDL). No environment is guaranteed to have the SQL-only DDL — which includes **most RLS policies and the pgvector HNSW index**. Boot-time DDL also races when autoscale starts several instances at once.
- **Recommendation:** Pick one channel. Either commit to `drizzle-kit generate`/`migrate` (regenerate a fresh baseline snapshot, journal forward) or keep push canonical and **move every RLS policy, HNSW index, and partial unique into the Drizzle schema** (`pgPolicy().enableRLS()`, `.using("hnsw", …)`) so push materializes them. Delete `applyRfiWorkflowMigration` (its columns already exist in the schema).
- **Effort:** 3–5 days; highest-leverage single ops fix in the codebase.

### A4. No enforced service/repository layering
- **Severity: Medium**
- **Where:** `src/repositories/` (13 files) and `src/services/` exist but only newer verticals use them (COR, estimator, comms hub, tradehub); the core money paths — `routes/invoices.ts`, `routes/quotes.ts`, `routes/projects.ts`, `routes/timesheets.ts`, `routes/dashboard.ts` — are 700–1300-line route files with inline queries, inline email sending, and inline PDF calls.
- **Impact:** Duplication of tenant scoping (see A1), untestable business logic (12 API test files for 565 endpoints), and route files too large to review (`cor.ts` 1329 LOC).
- **Recommendation:** Don't big-bang refactor. Adopt a rule: any route touched for another reason moves its queries into a repository. Extract the invoice/quote signing + email + PDF flows first — they are the highest-consequence duplicated logic.
- **Effort:** Ongoing; ~1 day per major route file.

### A5. Duplicated authorization tables between server and mobile
- **Severity: Medium**
- **Where:** `artifacts/api-server/src/lib/permissionGate.ts:4-31` defines 26 permission keys; `artifacts/mobile/hooks/usePermissions.ts:3-25` hand-copies **21** of them (missing `manageFinancials`, `viewDailyLog`, `manageEmailIntegrations`, `manageFilingRules`, `managePricing`), and its worker-fallback block (`:53-69`) omits `viewDailyLog`/`viewReports`, which the server defaults to `true`.
- **Impact:** Already-drifted UI gating: a worker in the mobile fallback path loses Daily Log and Reports UI that the server would allow. Every new permission flag must be added in ≥2 places (the comment at `:52` admits it's synced "by hand").
- **Recommendation:** Export the permission key list + worker defaults from the OpenAPI spec (it already flows to both clients via `@workspace/api-client-react`), or have `GET /users/me` return the **resolved** permission map so clients never re-derive defaults. The server already resolves it (`resolvePermission`); mobile line 46 (`me.permissions` spread over `ALL_TRUE`) shows the client is merging raw JSONB, not the resolved result.
- **Effort:** 1–2 days.

### A6. Dual API mounts with uneven protection
- **Severity: Medium**
- **Where:** `src/app.ts:241-249` mounts the same router at `/api/v1` and legacy `/api`; the code comment concedes WAF/rate-limit rules on `/api/v1` don't cover `/api`. Concretely: `uploadLimiter` is registered only for `/api/storage/uploads` (`app.ts:83`) — `/api/v1/storage/uploads` has **no upload rate limit** (the AI limiter, by contrast, correctly registers both at `:81-82`).
- **Impact:** Any path-scoped control must be remembered twice; today the versioned upload path is the unlimited one.
- **Recommendation:** One-line fix now: `app.use("/api/v1/storage/uploads", uploadLimiter)`. Then add client telemetry on the `Deprecation` header and retire `/api`.
- **Effort:** Minutes for the fix; retirement is a client-migration project.

### A7. Side effects and writes inside authentication middleware
- **Severity: Medium**
- **Where:** `src/lib/auth.ts:150-181` — `requireAuth` auto-provisions a Starter subscription (2 reads + possible insert) inside the auth path; `initStripe()` at boot runs vendor migrations and fires `syncBackfill()` fire-and-forget (`src/index.ts:26-80`).
- **Impact:** Auth latency and failure modes now include billing-table health; a plans-table problem degrades every request. The 300 s `subCache` makes it rare but unpredictable.
- **Recommendation:** Move provisioning to the two places that create tenants (`POST /companies`, super-admin seed) and to a nightly reconcile job.
- **Effort:** ½ day.

### A8. Missing abstractions: env validation, caching, and notifications are ad hoc
- **Severity: Medium**
- **Where:** ~40 raw `process.env.X` reads with lazy throws (`objectStorage.ts:55`, `quickbooks.ts:15`, `embeddingsClient.ts:16`); only `PORT` validated at boot (`index.ts:11-21`). No response/entity caching besides the auth LRU — e.g., `dashboard.ts` recomputes 10 counts per view (see 04-performance). `QB_STATE_SECRET ?? QB_CLIENT_SECRET` fallback reuses the OAuth client secret as an HMAC key (`routes/quickbooks.ts:14`).
- **Impact:** Misconfiguration surfaces mid-request instead of at deploy; repeated hot reads hit Postgres unnecessarily.
- **Recommendation:** One `env.ts` with a Zod schema validated at boot (the repo already standardizes on Zod); add a small TTL cache for dashboard summary + feature keys (featureGate already has one — reuse the pattern).
- **Effort:** 1 day for env schema; caching case-by-case.

### A9. Single points of failure (inventory)
- **Severity: Medium** (accepted at MVP; must be on the scaling roadmap)
- Single Postgres, no replica or PgBouncer (`lib/db/src/dbInstance.ts` — `max: 20`).
- Single API deployment doing everything (see A2).
- Replit-platform coupling: object-storage sidecar at `127.0.0.1:1106` (`objectStorage.ts:13-32`), Stripe credentials via Replit connectors API (`stripeClient.ts:14-61`), routing via `.replit-artifact/artifact.toml`. `docs/MIGRATION.md` (Neon + Railway) exists but note the api-server serves nothing static — a migration must also replace the platform router that fronts `/` and `/api`.
- `process.on("unhandledRejection") → process.exit(1)` (`index.ts:152-155`): any missed `.catch` anywhere kills the instance — correct policy only once a supervisor and alerting exist (see 07-saas-readiness).

### A10. Dead weight and stale docs
- **Severity: Low**
- `apps/` directory is vestigial (0-byte `app.ts`, duplicate files) — delete.
- `replit.md` documents Twilio as required; **no Twilio code exists anywhere** — SMS is aspirational, remove or implement.
- Repo root carries a 31 MB `.mp4`, 3.4 MB `sitesnap-src.zip`, 24 MB `attached_assets/`; web dashboard ships a 2.9 MB `public/supersplat-viewer/` with zero importers, plus unused deps (`@uppy/*` ×4, `framer-motion`) and a dead page file `src/pages/contacts.tsx.tmp.501.b907f4697893`.
- **Effort:** Hours; do it during the next quiet Friday.

---

## Summary table

| # | Finding | Severity | Effort |
|---|---------|----------|--------|
| A1 | Per-query tenant scoping over fail-open RLS | Critical | 1–2 wk |
| A2 | HTTP+cron+AI+PDF in one autoscale process | High | 2–3 wk |
| A3 | Three uncoordinated schema channels; boot-time DDL | High | 3–5 d |
| A4 | No enforced data-access layer on core routes | Medium | ongoing |
| A5 | Permission tables duplicated server/mobile (drifted) | Medium | 1–2 d |
| A6 | Dual `/api` mount; `/api/v1` upload limiter gap | Medium | minutes |
| A7 | Writes inside auth middleware | Medium | ½ d |
| A8 | No env validation; missing caching layer | Medium | 1 d+ |
| A9 | SPOF inventory (DB, process, Replit coupling) | Medium | roadmap |
| A10 | Dead code/assets, stale docs | Low | hours |
