# Site Snap — Technical Audit: Executive Summary

**Date:** 2026-08-25 · **Branch:** `lifetime-mobile-restyle` · **Scope:** Full monorepo — Express 5 API (74 route files, 565 endpoints, 52k LOC), React 19/Vite web dashboard (~69k LOC), Expo SDK 54 mobile (~48.7k LOC), PostgreSQL/Drizzle (124 tables), on Replit. Every finding was verified by reading the cited source.

## Verdict

Site Snap is a **functionally mature, feature-dense product with a real security baseline** — the criticals from the prior May 2026 internal audit (`SECURITY_AUDIT_RISK_MATRIX.md`) are genuinely fixed (CORS, mass-assignment, storage auth, cross-tenant cascade delete, document scoping). The blockers to scaling toward paid production are now **operational and structural**, not feature gaps:

1. **Tenant isolation depends on hand-written filters over a fail-open, unreliably-deployed backstop.** The RLS safety net is permissive-by-default and, on a `push`-provisioned database, likely absent on ~90% of tables.
2. **The request path holds a scarce DB connection through inline AI/PDF/OCR work**, capping concurrency around the low-thousands of users.
3. **There is no alerting, no real error tracking, and no DR plan** — the app can't be operated safely under load yet.

**Production-readiness: 4/10. Database health: 4.5/10.** Both are recoverable with focused work; see `09-action-plan.md`.

---

## Top 10 issues (ranked by severity × likelihood)

| # | Issue | Sev | Where | Detail |
|:-:|-------|:---:|-------|--------|
| 1 | **The database provides no tenant isolation at all — the app connects as a `SUPERUSER`+`BYPASSRLS` role, so RLS is bypassed unconditionally.** Verified live: the only login role is `postgres` (`rolsuper=t, rolbypassrls=t`); Postgres ignores every policy for such a role. So the RLS layer enforces nothing today — including on the 15 tables that *look* enabled. Underneath that, the policies themselves are also broken: RLS is switched off on 109/124 tables (41 have a dormant policy; 33 more carry `company_id` with no policy at all — incl. the whole COR/IHSA compliance module + `expenses`/`proposals`), and the one enabled policy on `contacts` uses a GUC the app never sets. **Fixing this requires a production connection-role change, not just `ENABLE ROW LEVEL SECURITY`** — a reviewed migration is at `docs/audit/rls-remediation.sql`. Tenant isolation currently rests **entirely** on per-handler `WHERE company_id` filters, with zero database backstop. | Critical | live DB query, 2026-08-25 | 03 V1 |
| 2 | **Indirect-tenant mutations rely on a per-handler join that can be forgotten.** 20 tables (tasks, cost_analyses, portal, photos…) have no `company_id`; with RLS absent/bypassed, a forgotten ownership check = cross-tenant read/write. | Critical | `costAnalyses.ts` + 20 tables | 03 V2, 05 D3 |
| 3 | **Migration system is inert; schema drifts across 3 channels.** `push` is canonical, `.sql` migrations aren't replayed, and boot-time DDL runs raw `ALTER`s every start. RLS policies + pgvector HNSW index may not exist in prod. | High | `README.md`; `index.ts:105-148` | 01 A3, 05 |
| 4 | **DB connection pinned in an open transaction across external I/O.** `requireTenantCtx` holds 1 of 20 pooled connections through inline OpenAI/Stripe/GCS/email calls → ~20-request concurrency ceiling; idle-in-transaction risk. | High | `auth.ts:343`; `dbInstance.ts` | 02 B1, 06 |
| 5 | **All long work (AI, PDF/Playwright, OCR, cron) runs in the API process** under a non-cancelling timeout; cron sits inside an autoscale target that can scale to zero. | High | `cron.ts`; `app.ts:203`; `routes/ai.ts` | 01 A2, 04 P9 |
| 6 | **No alerting + no real error tracking.** `alertOnHighErrorRate` is a TODO; crash reporting is a self-hosted Postgres endpoint with no grouping/symbolication/notifications; healthz is liveness-only. | High | `logger.ts`; `routes/systemLogs.ts` | 07 |
| 7 | **Portal/public tokens never expire and portal routes aren't rate-limited**; the portal read exposes a project's full document set and mints anonymous GCS upload URLs. | High | `portal.ts:28,73,391`; `quotes.ts:240` | 03 V3, 08 D3 |
| 8 | **Virus scanning fails open; authenticated upload filter is a client-controlled deny-list.** Scanner off by default and treats errors as clean; multer filter trusts client MIME/extension. | High | `virusScan.ts:20`; `upload.ts:40` | 03 V4, 08 D2 |
| 9 | **5 MB single JS bundle, zero code-splitting**, precached by the service worker — every field user downloads the admin console, PDF/docx/xlsx/charts libs before first paint. | High (UX) | `web/src/App.tsx`; `vite.config.ts` | 04 P1 |
| 10 | **Query inefficiency at scale:** missing indexes (auth-hot `user_memberships.company_id`, ~16 FK columns, RAG FTS), TradeHub N+1 (≤7 queries/post), unpaginated tenant-wide lists, 5 sequential dashboard counts. | Med–High | `05-database.md`, `04-performance.md` | 05, 04 |

**Honorable mentions:** process-local auth cache → cross-instance permission staleness (02 B2); NODE_ENV toggles many security controls at once (03 V6); permission tables duplicated + drifted between server and mobile (01 A5); zero CHECK constraints on regulated compliance data (05, 08 D4); PIPEDA/GDPR data-residency undocumented for a Canadian-market product sending photos/voice to OpenAI (07, 08 D5).

---

## What's genuinely solid (don't regress these)
Spec-first API with codegen + pre-commit drift checks · consistent error envelope · PG-backed shared rate-limit store + per-company AI quotas · pre-signed uploads with company-scoped ACLs (and the default-deny ACL fix) · pino with a strong redact list · atomic idempotent quote/invoice signing · advisory-locked cron · a well-built mobile safety-form offline queue with a dead-letter queue · fail-closed mobile permissions.

---

## How to read this report
- `01-architecture.md` … `08-construction-review.md` — one file per audit phase, findings with severity/impact/fix and `file:line` evidence.
- `05-database.md` — includes copy-paste index SQL and **live-DB verification queries** (run these; code review alone can't confirm what's deployed).
- `09-action-plan.md` — the whole thing sequenced into 0–7 day / 30 / 90 / 6-month buckets.

## Live-database verification (completed 2026-08-25)
The queries in `05-database.md` were run against the workspace's live Postgres (`heliumdb`, PostgreSQL 16.10). Results confirmed and *sharpened* the code-review findings — the RLS situation is worse and more precisely diagnosable than static analysis alone could show (see finding #1 above and `03-security.md` V1 for the exact numbers and a copy-paste fix). The pgvector HNSW index and the `document_chunks` FTS index were both confirmed **absent** (only 3 btree indexes exist on that table); the live unindexed-FK-column scan returned 112 columns (vs. the ~16 representative examples originally listed) — see `05-database.md` for the full list.

## Information gaps (could not be confirmed from source alone)
- **Backup/PITR:** the Replit-managed Postgres backup posture isn't visible in code or in a standard SQL query; confirm and document it separately (check the Replit dashboard/support docs for the `heliumdb` instance).
- **Whether this is the same database backing the production deployment**, or a workspace/dev instance — the connection used (`heliumdb` host `helium`, via the ambient `DATABASE_URL`) is whatever this workspace resolves to. If production runs a separate database, re-run the verification queries in `05-database.md` against it before treating this as the final word on production's RLS state.
- **`pnpm audit` dependency CVEs:** CI runs it at `--critical` only; a full `--audit-level=high` review of the 16-high/15-moderate dependency findings noted in the prior audit was out of scope here.
- Load/perf numbers in `06-scalability.md` are reasoned estimates from the architecture, not measured — calibrate with a load test.
