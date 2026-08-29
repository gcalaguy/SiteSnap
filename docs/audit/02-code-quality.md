# Phase 2 — Code Quality Review

Bugs and correctness risks verified by reading the cited code. Each entry: file · function · root cause · fix · example. Ordered by severity.

---

### B1. `requireTenantCtx` holds a pooled connection in an open transaction for the entire request
- **Severity: High** · `src/lib/auth.ts:343-374` · `requireTenantCtx`
- **Root cause:** The middleware wraps the whole remaining handler chain in `withTenantCtx()` and monkey-patches `res.end` to defer the response flush until the transaction commits. Correct for read-your-writes consistency, but it means one of only 20 pooled connections (`dbInstance.ts` `max: 20`) stays checked out **inside a BEGIN** for the full request duration — including any inline OpenAI call, Stripe call, GCS upload, or email send.
- **Failure scenario:** 20 concurrent authenticated requests that each make a ~5–30 s AI call exhaust the pool; the 21st request blocks on `connectionTimeoutMillis` (10 s) and 500s. A handler that throws before ever calling `res.end` (e.g. an uncaught error that bypasses the patched `end`) leaves the transaction open until `statement_timeout` (30 s) or the pool idle timeout reaps it — "idle in transaction" accumulation.
- **Fix:** Two-part. Short term: move long I/O (AI/PDF/email) out of the tenant transaction — do the DB writes, `COMMIT`, then do the external call. Long term: adopt `withTenantCtxRaw` per-query or a `SET`-then-`RESET` pattern that doesn't pin a connection across external I/O, and shrink the transaction to just the DB work (ties to `01-architecture.md` A2 and `05-database.md` D1).
```ts
// Instead of wrapping the whole handler:
// 1. gather inputs, 2. run external I/O OUTSIDE the tx, 3. persist inside a short tx
const aiResult = await callOpenAI(...);              // no DB connection held
await withTenantCtx(companyId, (tx) => tx.insert(...).values(...)); // brief
```

### B2. Auth cache invalidation is process-local; role/permission changes lag across instances
- **Severity: High** · `src/lib/auth.ts:24-56` · `AuthTTLCache` / `invalidateAuthCache`
- **Root cause:** `authCache` (10 s TTL) and `subCache` (300 s TTL) are per-process `Map`s. `invalidateAuthCache(clerkUserId)` only deletes from the local instance's map. On Replit autoscale (multiple instances), a permission revocation or member removal on instance A leaves instances B/C serving the old `{user, memberships, permissions}` for up to 10 s.
- **Failure scenario:** An owner removes a worker or downgrades their permissions; the worker's in-flight requests routed to another instance keep passing `requirePermission` checks for up to 10 s. For `subCache`, a subscription/plan change lags up to 5 minutes.
- **Fix:** The codebase already has a Postgres `LISTEN/NOTIFY` invalidation channel for feature flags (`startPgListener()`, `lib/featureGate.ts`). Reuse it: `NOTIFY auth_invalidate, '<clerkUserId>'` on membership/permission changes, and have every instance's listener evict its `authCache`. Keep the TTL as a backstop.
```ts
// on membership/permission write:
await pool.query(`SELECT pg_notify('auth_invalidate', $1)`, [clerkUserId]);
// in the shared pg listener: authCache.delete(payload)
```

### B3. Boot-time DDL runs on every start and races on multi-instance startup
- **Severity: Medium** · `src/index.ts:105-148` · `ensureRfiSubmittal` / `applyRfiWorkflowMigration`
- **Root cause:** Raw `ALTER TYPE … ADD VALUE IF NOT EXISTS`, `ALTER TABLE … ADD COLUMN IF NOT EXISTS`, and a backfill `UPDATE` run at every process start, errors swallowed. `ALTER TYPE ADD VALUE` cannot run inside a transaction and is not concurrency-safe; when autoscale spins up N instances simultaneously they race on the same DDL.
- **Failure scenario:** Concurrent cold starts issue the same `ALTER TYPE` — one may error (swallowed as "non-fatal"), and the backfill `UPDATE "rfis" … WHERE company_id IS NULL` re-scans the whole table every boot.
- **Fix:** Delete this block; the columns already exist in `lib/db/src/schema/index.ts`. Provision schema through the single chosen channel (`01-architecture.md` A3).

### B4. `auditLogs.ts` builds a `conditions` array then ignores it
- **Severity: Low** (dead code, currently harmless) · `src/routes/auditLogs.ts:21-26`
- **Root cause:** `const conditions = isSuperAdmin ? [] : [eq(...)]` is computed, then the `.where()` re-derives the same predicate inline (`conditions.length ? eq(...) : undefined`). The array is never used.
- **Failure scenario:** None today, but the two expressions can drift; a future edit to one won't touch the other. Also the endpoint has a hard `.limit(500)` with no pagination — a busy Enterprise tenant silently sees only its 500 most recent events.
- **Fix:** Use the array (`.where(and(...conditions))`) and add cursor pagination (`createdAt` + `id` keyset).
```ts
const conditions = isSuperAdmin ? [] : [eq(auditLogsTable.companyId, companyId!)];
const logs = await db.select().from(auditLogsTable)
  .where(conditions.length ? and(...conditions) : undefined)
  .orderBy(desc(auditLogsTable.createdAt)).limit(limit).offset(offset);
```

### B5. `POOL_MAX` is defined twice and can drift
- **Severity: Low** · `lib/db/src/index.ts:13` and `lib/db/src/dbInstance.ts` (`max: 20`)
- **Root cause:** The pool size is hardcoded as `20` in the Pool config and again as `POOL_MAX = 20` in the monitor. Changing one leaves the 80 %-utilization warning miscalibrated.
- **Fix:** Export a single `POOL_MAX` constant from `dbInstance.ts` and pass it to both `new Pool({ max: POOL_MAX })` and the monitor. Ideally read from env (`DB_POOL_MAX`).

### B6. Every mutation triggers two dashboard refetches app-wide
- **Severity: Low** (correctness-safe, perf cost) · `web-dashboard/src/lib/queryClient.ts:44-47`
- **Root cause:** `MutationCache.onSuccess: invalidateDashboard` invalidates the dashboard summary + recent-activity queries after **every** successful mutation, everywhere in the app — even mutations that can't affect those cards (e.g. marking a notification read, updating a profile field).
- **Failure scenario:** No bug, but a user doing rapid edits triggers a stream of dashboard refetches (2 network requests each), and `dashboard.ts` is one of the heaviest endpoints (see `04-performance.md`).
- **Fix:** Scope invalidation to mutations that actually touch dashboard-reflected entities (quotes/invoices/timesheets/forms), via a mutation-key allowlist or per-mutation `meta: { invalidatesDashboard: true }`.

### B7. Portal read endpoint mislabels its query filter and returns all invoice statuses' data before filtering in JS
- **Severity: Low** · `src/routes/portal.ts:319-341`
- **Root cause:** The `invoices` query comment says "Only show invoices that have been sent" but the `WHERE` has an empty `and()` — it fetches **all** invoices for the project, then filters `draft`/`cancelled` out in JS (`:339`). Draft/cancelled invoice rows (amounts, titles) are pulled from the DB into the portal handler unnecessarily.
- **Fix:** Filter in SQL: `.where(and(eq(invoicesTable.projectId, projectId), notInArray(invoicesTable.status, ['draft','cancelled'])))`. Minor data-minimization + perf win.

### B8. Mobile permission fallback omits keys the server grants
- **Severity: Low** (UX, drift) · `mobile/hooks/usePermissions.ts:53-69` — see `01-architecture.md` A5 for the full write-up
- **Root cause:** The worker fallback map hand-copies server `WORKER_DEFAULTS` but omits `viewDailyLog` and `viewReports` (server defaults both `true` at `permissionGate.ts:18-19`).
- **Failure scenario:** A worker whose `me.permissions` is null on mobile loses Daily Log and Reports UI they're entitled to.
- **Fix:** Have `GET /users/me` return the server-**resolved** permission map so the client never re-derives defaults.

---

## Async / error-handling notes (no bug, but fragile-by-design — verified intentional)
- `res.end` monkey-patch (B1) assumes every handler eventually calls `res.end`. The global 408 timeout + `res.headersSent` guards in `errorHandler.ts:70-74` exist specifically to survive the double-write this can cause. It works but is load-bearing and subtle; the queue refactor (A2) removes the need.
- `process.on("unhandledRejection") → exit(1)` (`index.ts:152`) is deliberate fail-fast. Correct **only** once a supervisor restarts the process and alerting fires — neither is wired yet (`07-saas-readiness.md`). Until then, one stray un-awaited rejection anywhere takes down a live instance.
- Fire-and-forget emails use `.catch()` with `ResendSandboxError` discrimination (`public.ts:381-391`, `481-492`) — correctly non-fatal.

## Summary table

| # | Bug | Severity | File |
|---|-----|----------|------|
| B1 | Connection pinned in tx across external I/O | High | auth.ts:343 |
| B2 | Process-local auth cache; cross-instance staleness | High | auth.ts:24 |
| B3 | Boot-time DDL, races on autoscale start | Medium | index.ts:105 |
| B4 | auditLogs dead `conditions` + no pagination | Low | auditLogs.ts:21 |
| B5 | POOL_MAX duplicated | Low | db/index.ts:13 |
| B6 | Global dashboard invalidation on every mutation | Low | queryClient.ts:44 |
| B7 | Portal invoice query fetches all, filters in JS | Low | portal.ts:319 |
| B8 | Mobile permission fallback drift | Low | usePermissions.ts:53 |
