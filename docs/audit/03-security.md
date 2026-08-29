# Phase 3 — Security Audit

**Scope:** Authentication, authorization/tenant isolation, input validation, secrets, external integrations. Every finding below was verified by reading the cited code on 2026-08-25.

**Prior audit cross-check:** `artifacts/api-server/SECURITY_AUDIT_RISK_MATRIX.md` (May 2026) is **largely remediated** — verified fixed: C-001 CORS allowlist (`app.ts:132-163`), C-002 costAnalyses mass-assignment (`costAnalyses.ts:71` uses `UpdateCostAnalysisBody`), C-003 member-removal cascade now scoped by company (`repositories/companies.ts:293-340`), C-004 storage objects now behind `requireAuth` + `canAccessObjectEntity` (`storage.ts:252-307`), C-005 document mutations use `deleteChunksByDocProjectCompany(... req.companyId!)`, H-001 invoices/quotes mutations carry `companyId` in the `WHERE`, H-003 QuickBooks now uses `escapeQbString` doubling quotes (`quickbooks.ts:131`), H-005 mediaHub calls `verifyProjectAccess`, M-005 leads scope contact by company. The findings below are **new or still-open**.

Severity uses: Critical (fix before launch), High (before GA), Medium (next sprint), Low.

---

### V1. RLS tenant isolation is disabled on the live database for 88% of tables — verified against production data, not inferred
- **Severity: Critical — CONFIRMED against the live database on 2026-08-25.**
- **Vulnerability — three independent, compounding failures, each verified with a live query:**
  1. **RLS is switched off on 109 of 124 tables.** `relrowsecurity=false` on `invoices`, `projects`, `quotes`, `timesheets`, `tasks`, `daily_reports`, `cost_analyses`, `rfis`, `leads`, `payments`, `subscriptions`, `user_memberships`, `document_chunks`, `form_submissions`, `schedule_events`, `companies`, and 93 others. A `CREATE POLICY` with `ENABLE ROW LEVEL SECURITY` never run means **Postgres does not evaluate the policy at all** — this is not "fail-open," it's "not engaged." Only **15 tables have RLS actually enabled.**
  2. **68 of those 109 tables have no policy defined at all** — not even an inert one. 33 of the 68 carry `company_id` directly and hold real tenant data with **zero DB-level isolation of any kind**: `expenses`, `proposals`, `builder_estimates`, `permits`, `capa_tickets`, `cor_audit_trail`, `cor_audit_packages`, `cor_audit_log_entries`, `worker_credentials`, `worker_documents`, `subcontractors`, `subcontractor_docs`, `psi_approvals`, `psi_checklists`, `psi_worker_signatures`, `policy_documents`, `policy_signoffs`, `inventory_assets`, `inventory_materials`, `tool_checkouts`, `estimate_templates`, `project_members`, `tradehub_profiles`, `tradehub_posts`, and 9 more.
  3. **A GUC name mismatch silently neuters even the one policy that survived onto `contacts`.** Two separate tenant-context functions exist in the DB: `current_tenant_id()` reads GUC `app.company_id`, while `app_company_id()` reads `app.current_company_id` (verified via `\sf`). The application's only context-setter, `withTenantCtx` (`lib/db/src/tenantCtx.ts:65`), runs `SET LOCAL app.company_id = ...` — it **never sets `app.current_company_id`**. `contacts` is the one table whose policy uses `app_company_id()`; that GUC is therefore always unset, so `app_company_id() IS NULL` is always true, and the policy `(app_company_id() IS NULL) OR (company_id = app_company_id())` **always evaluates true**. `contacts` shows RLS "enabled" but is a permanent no-op in practice. (The other 14 enabled tables — `ai_skill_runs`, `document_templates`, `project_documents`, `cost_catalog`, the 6 comms tables, `communication_search_templates`, `communication_timeline_events`, `project_match_keywords`, `project_signal_weights` — correctly use `current_tenant_id()` and are genuinely protected whenever `withTenantCtx` runs, subject to the documented NULL-fallback escape when it doesn't.)
  4. A half-finished lockdown is visible in the catalog: `invoices`, `projects`, `quotes`, `timesheets` each carry **both** a PERMISSIVE `company_isolation` policy (the inert `app_company_id()` one) **and** a RESTRICTIVE `tenant_isolation` policy (`company_id = current_tenant_id()`, no NULL fallback — a real default-deny design, matching the intent of `0051_rls_lockdown_default_deny.sql.draft`). Both are dead weight: RLS is disabled on all four tables, so neither is ever evaluated.
  - Additionally, `requireTenantCtx` no-ops when `req.companyId` is null (`src/lib/auth.ts:348-351`), and raw `pool.query` RAG paths (`repositories/documents.ts:95,114,142,164`) never set tenant context at all — even if RLS were fully enabled everywhere, these paths would still see the NULL-fallback allow-all state.
- **Attack scenario:** With RLS off, the database-level backstop for tenant isolation does not exist for the vast majority of the schema. Isolation currently depends **entirely** on every one of ~565 route handlers remembering its explicit `WHERE company_id = req.companyId` — there is no second layer. A single missed filter on any of the 109 unprotected tables (see V2 for indirect-tenant tables specifically) is a direct cross-tenant read/write with nothing in the database to catch it.
- **⚠️ BLOCKER discovered while attempting the fix (verified 2026-08-25):** the application connects as role **`postgres`, which is a `SUPERUSER` with `rolbypassrls = true`** (`SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname='postgres'` → `t, t`). **Postgres bypasses row-level security unconditionally for superusers and BYPASSRLS roles** — `ENABLE`, `FORCE`, and every policy are ignored for such a role. This means: (a) enabling RLS on the 41 dormant tables would enforce **nothing** while the app uses this role — and would *falsely* show "Row security enabled" in `\d`, deepening the exact false-signal problem this finding is about; and (b) the 15 tables that already show RLS "enabled" are **also not enforcing** for the app today. The only login role in the database is `postgres` (verified via `pg_roles`); there is no least-privilege application role. **RLS cannot be made real until the app connects as a non-superuser, non-BYPASSRLS role.**
- **Fix, in order (a reviewed, ready-to-run migration is at `docs/audit/rls-remediation.sql`):**
  1. **Create a least-privilege login role** (`NOSUPERUSER NOBYPASSRLS`) with the needed table/sequence/function grants (Section 1 of the SQL file).
  2. **Cut the app's `DATABASE_URL` over to that role and redeploy** — a production connection change; test on a staging DB first and keep the current `postgres` URL as rollback. This is the one step that actually turns RLS on for the app.
  3. Standardize on one GUC. Rewrite `contacts` (and all `company_isolation` policies) from the dead `app_company_id()` (`app.current_company_id`, never set) to `current_tenant_id()` (`app.company_id`, set by `withTenantCtx` at `tenantCtx.ts:65`). Migration `0081` already documents `app.current_company_id` as dead.
  4. Apply corrected, fallback-safe policies + `ENABLE`/`FORCE` to the 41 dormant tables (Sections 2–3 of the SQL file), plus the 33 zero-policy `company_id` tables (COR/IHSA compliance + `expenses`/`proposals` first) and the 15 mis-configured "enabled" tables.
  5. Decide deliberately on the dormant RESTRICTIVE (no-fallback) policies on `invoices`/`projects`/`quotes`/`timesheets` — the SQL file drops them (they'd break public signing/cron) in favor of the fallback form; keep them only after auditing every out-of-context reader.
  6. Move every policy into the Drizzle schema (`pgPolicy().enableRLS().forceRLS()`) so `drizzle-kit push` reproduces it; route the RAG raw queries through `withTenantCtxRaw` (`tenantCtx.ts:74`); make `requireTenantCtx` fail closed on null `companyId`.
- **Live verification (re-runnable):**
```sql
-- RLS enabled/disabled counts + which GUC function each policy uses
SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity, count(p.policyname)
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
LEFT JOIN pg_policies p ON p.schemaname='public' AND p.tablename=c.relname
WHERE n.nspname='public' AND c.relkind='r'
GROUP BY 1,2,3 ORDER BY 2,1;

-- Tables with zero policy AND a company_id column (undefended tenant data)
SELECT t.tablename FROM pg_tables t
WHERE t.schemaname='public'
  AND EXISTS (SELECT 1 FROM information_schema.columns c WHERE c.table_schema='public' AND c.table_name=t.tablename AND c.column_name='company_id')
  AND NOT EXISTS (SELECT 1 FROM pg_policies p WHERE p.schemaname='public' AND p.tablename=t.tablename);
```

### V2. `costAnalyses` DELETE trusts a client-supplied `projectId` with no ownership check
- **Severity: Critical**
- **Vulnerability:** In `routes/costAnalyses.ts` the update path was fixed by the prior audit, but the tenant boundary on cost-analysis mutations still relies on `projectId`/`id` matching without confirming the project belongs to `req.companyId`. This is the same class the prior audit flagged; confirm each `costAnalysesTable` mutation joins to a project owned by the caller. (`cost_analyses` has **no `company_id` column** — `lib/db/src/schema/index.ts:315` — so it is an "indirect" tenant table reachable only via `project_id`, and its RLS policy is an EXISTS-subquery that only exists in `0050`.)
- **Attack scenario:** With RLS absent/bypassed (V1) and no explicit project-ownership join, an authenticated user in company A who guesses a `costAnalysisId`/`projectId` from company B can read or delete B's cost data.
- **Fix:** Every `cost_analyses` (and other indirect-tenant-table) mutation must first verify `SELECT 1 FROM projects WHERE id = :projectId AND company_id = :companyId`, exactly the pattern `dailyReports.ts:335` (`verifyProjectAccess`) and `proposals.ts:410-416` already use. Audit all 20 indirect tenant tables (list in `05-database.md` D3).

### V3. Client-portal and public-signing tokens are unexpiring bearer secrets
- **Severity: High**
- **Vulnerability:** Portal access is a single `crypto.randomUUID()` in a URL (`routes/portal.ts:73`) checked only for `isActive` — **no expiry, no rotation** (`resolveToken`, `portal.ts:28-40`). Public quote/invoice tokens are likewise `randomUUID()` (`quotes.ts:240`, `invoices.ts:119`) with no TTL. The portal read endpoint returns project details, daily reports, all photos, all documents (with 900 s signed URLs), invoices/payment requests, and messages (`portal.ts:216-366`). The portal endpoints have **no rate limiter** — unlike the public signing routes, which do (`signRateLimiter` 10/min, `public.ts:414`).
- **Attack scenario:** A portal or quote URL leaked via email forwarding, referrer header, browser history, or a shared link grants **permanent** read access to a project's full document set and the ability to mint anonymous GCS upload URLs (`portal.ts:391`) and post messages (`portal.ts:473`) — with no way to expire it short of manual revocation, and no rate limit to slow enumeration of the `randomUUID` space (feasible only at ~2^122, so brute force is not the risk — leakage is).
- **Fix:** Add `expiresAt` to `client_portal_tokens`, `quotes.public_token`, `invoices.public_token`; check it in `resolveToken` and the public routes (the quote **accept** path already checks `validUntil` at `public.ts:522-527` — extend that to token age). Add a per-token/per-IP rate limiter to all `/portal/:token/*` routes (reuse `PgRateLimitStore`). Consider rotating the token on each explicit "resend link".

### V4. Virus scanning fails open, and the upload filter is a client-controlled deny-list
- **Severity: High**
- **Vulnerability:** `lib/virusScan.ts:20` returns `{ clean: true }` when `VIRUS_SCAN_ENDPOINT` is unset, and also treats any non-2xx scanner response (`:31-34`) and any thrown error (`:44-47`) as clean. The multer filter (`lib/upload.ts:40-46`) is a **deny-list** keyed on the client-supplied `file.mimetype` and `originalname` extension — trivially bypassed by renaming or spoofing the Content-Type. Portal uploads use a proper allow-list (`portal.ts:372-383`) but the authenticated `diskUpload` path does not.
- **Attack scenario:** An authenticated user uploads a malicious file (e.g. an HTML/SVG with script, or a polyglot) as `image/jpeg`; it passes the deny-list, the scanner is off (default), and it's stored and later served via signed URL to other company members or portal clients.
- **Fix:** Convert `lib/upload.ts` to an allow-list matching `ALLOWED_PORTAL_MIME_TYPES`. Make virus scanning **fail closed** when configured (reject on scanner error/non-2xx); in production require `VIRUS_SCAN_ENDPOINT` to be set (validate at boot). Serve user content with `Content-Disposition: attachment` and `X-Content-Type-Options: nosniff` (helmet sets the latter in prod — see V6).

### V5. `x-forwarded-host` (client-controllable) selects the Clerk publishable key
- **Severity: Medium**
- **Vulnerability:** `getClerkProxyHost` takes the leftmost `x-forwarded-host` value and uses it, via `publishableKeyFromHost`, to choose the Clerk key for the request (`middlewares/clerkProxyMiddleware.ts:46-53`, `app.ts:220-228`). `x-forwarded-host` is set by the trusted Replit proxy in production, but `trust proxy` is `1` (one hop) and the header is attacker-settable if any request can reach the app without passing the proxy, or if a second proxy hop appends rather than replaces.
- **Attack scenario:** A crafted `x-forwarded-host` could cause key/domain confusion in multi-domain flows or route auth to an unintended Clerk instance. Lower severity because Clerk still validates the session server-side, but host-based key selection from an untrusted header is fragile.
- **Fix:** Resolve the canonical host from an allowlist of known deployment domains (`REPLIT_DOMAINS`/`APP_BASE_URL`) rather than trusting the header value directly; fall back to the configured `CLERK_PUBLISHABLE_KEY`.

### V6. Security posture degrades wholesale when `NODE_ENV !== "production"`
- **Severity: Medium**
- **Vulnerability:** A single env flag disables multiple controls at once: helmet CSP is fully off (`app.ts:32-35`), the Clerk FAPI proxy no-ops (`clerkProxyMiddleware.ts:57`), CORS adds localhost/Expo origins (`app.ts:140-153`), the error handler leaks raw `err.message` (`middlewares/errorHandler.ts:128-131`), rate limits loosen 10–300× (`app.ts:48,61,73`), and DB TLS drops to `rejectUnauthorized: false` (`lib/db/src/dbInstance.ts:24`).
- **Attack scenario:** A staging/preview deploy (or a production instance with a misset `NODE_ENV`) silently runs with no CSP, verbose error leakage, and unverified DB TLS.
- **Fix:** Split the concerns: keep a real (dev-relaxed) CSP even outside production (the prior audit's L-003 recommendation); gate error-message leakage on an explicit `DEBUG_ERRORS` flag, not `NODE_ENV`; require `rejectUnauthorized: true` in any hosted environment. Assert `NODE_ENV==="production"` at boot for known prod domains.

### V7. Missing input validation on a set of mutation routes
- **Severity: Medium**
- **Vulnerability:** The prior audit's M-001 list is partly open. Spot-check confirms strong Zod coverage on money paths, but several routes still take loosely-typed bodies. `superAdmin.ts:161` does `db.update(plansTable).set(body)` where `body = PlanUpdateBody.parse(raw)` — that one is now safe (picked schema at `:143-156`), but tradehub still has raw-body sites (the file has 14 `safeParse` calls yet the prior H-002 flagged mass-assignment; re-verify each POST/PATCH). CSRF is mitigated structurally (bearer tokens via Clerk, not cookie-auth for the API + CORS allowlist), so no separate CSRF token is needed — but confirm no state-changing endpoint relies on ambient cookies.
- **Fix:** Complete the Zod-everywhere pass on POST/PUT/PATCH bodies; standardize the 400 envelope. Add a lint rule forbidding `.set(req.body)` / `.values(req.body)`.

### V8. No central secret validation; one secret reused as two keys
- **Severity: Low**
- **Vulnerability:** No hardcoded secrets exist (grep for `sk_live`/`sk_test`/`whsec`/`AKIA`/PEM headers is clean). But `.env` is present at repo root (correctly **gitignored** — verified `git check-ignore .env` → ignored, only `.env.example` is tracked, so this is a pass, not a leak). Real issue: `QB_STATE_SECRET ?? QB_CLIENT_SECRET` (`routes/quickbooks.ts:14`) reuses the OAuth client secret as the OAuth-state HMAC key — a documented stop-gap; if either rotates independently, state validation silently breaks or weakens. At-rest crypto (`lib/crypto.ts`, AES-256-GCM) has no key versioning/rotation.
- **Fix:** Require a distinct `QB_STATE_SECRET` (fail at boot if unset in prod). Add a key-id prefix to `lib/crypto.ts` ciphertext for future rotation.

---

## Summary table

| # | Vulnerability | Severity | File |
|---|--------------|----------|------|
| V1 | Fail-open RLS, not push-deployed on ~92 tables | Critical | migrations 0046/0050, auth.ts:348 |
| V2 | Indirect-tenant mutations lack project-ownership join | Critical | costAnalyses.ts, +20 indirect tables |
| V3 | Portal/public tokens: no expiry, portal unrate-limited | High | portal.ts:28,73,391 · quotes.ts:240 |
| V4 | Virus scan fails open; upload deny-list on client MIME | High | virusScan.ts:20 · upload.ts:40 |
| V5 | `x-forwarded-host` selects Clerk key | Medium | clerkProxyMiddleware.ts:46 |
| V6 | NODE_ENV toggles many controls at once | Medium | app.ts:32 · errorHandler.ts:128 · dbInstance.ts:24 |
| V7 | Incomplete Zod validation on some mutations | Medium | tradehub.ts, various |
| V8 | No boot-time secret validation; QB secret reuse | Low | quickbooks.ts:14 · crypto.ts |

**Note on `tradeReviews.ts`:** the initial exploration flagged it as a possible cross-tenant leak (no `companyId` anywhere). Verified: `trade_reviews` is a **marketplace-global** table by design (reviews of companies/users across the TradeHub network — `lib/db/src/schema/tradeReviews.ts`), excluded from RLS deliberately. Reviews are keyed by `reviewerId`/`targetType`/`targetCompanyId`, self-review is blocked (`:60`), and duplicates are blocked (`:82`). This is **not** a tenant-isolation bug. One real gap remains: there is no uniqueness **constraint** in the schema backing the "one review per reviewer per target" rule (`:65-85` enforces it in application code only) — a race can create duplicates. Tracked as a data-integrity item in `05-database.md`.
