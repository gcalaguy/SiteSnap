# Action Plan

Derived strictly from the verified findings in this audit. Each item links to its finding. Effort is engineering-days for a developer familiar with the codebase.

---

## Immediate (0–7 days) — safety nets and one-line risk reductions
Goal: stop the bleeding on the highest-consequence, lowest-effort items.

| Item | Finding | Effort |
|------|---------|:---:|
| **Wire alerting (error rate, `process.exit`, pool ≥80%) to Slack/PagerDuty** — the TODO is already in `lib/logger.ts` | 07 #1 | 1 d |
| Add upload rate limiter to `/api/v1/storage/uploads` (one line) | A6 | 15 min |
| Make virus scan **fail-closed** when configured + require `VIRUS_SCAN_ENDPOINT` in prod | V4 | ½ d |
| Convert authenticated upload filter to an allow-list (mirror `ALLOWED_PORTAL_MIME_TYPES`) | V4 | ½ d |
| Add `expiresAt` check to portal/public tokens + rate-limit `/portal/:token/*` | V3 | 1–2 d |
| Route RAG raw `pool.query` calls through `withTenantCtxRaw` | V1/P8 | ½ d |
| Add Tier-1 indexes (`user_memberships.company_id`, RAG FTS, confirm HNSW) via `CONCURRENTLY` | 05 | ½ d |

## Short term (30 days) — make tenant isolation real + decouple long work (start)
Goal: give the database an actual tenant-isolation backstop, and take pool pressure off the request path.

| Item | Finding | Effort |
|------|---------|:---:|
| **Make RLS enforce at all (the real fix):** create a least-privilege `NOSUPERUSER NOBYPASSRLS` DB role with proper grants; cut `DATABASE_URL` over to it (staging first, `postgres` URL kept as rollback); then apply the corrected policies + `ENABLE`/`FORCE`. Reviewed migration ready at `docs/audit/rls-remediation.sql`. **This is the prerequisite that makes every RLS statement below meaningful** — while the app is a BYPASSRLS superuser, no policy does anything. | V1 | 3–5 d + a tested prod cutover |
| Fix the GUC mismatch: rewrite all `app_company_id()` policies (incl. `contacts`) to `current_tenant_id()`; author policies for the 33 zero-policy `company_id` tables (COR/IHSA + `expenses`/`proposals` first) | V1 | 2–3 d |
| **Make RLS deterministic going forward:** move all policies into the Drizzle schema (`pgPolicy().enableRLS().forceRLS()`) so `push` reproduces this state on any database; decide on the dormant RESTRICTIVE lockdown policies on invoices/projects/quotes/timesheets; make `requireTenantCtx` fail-closed | A1, A3 | 3–4 d |
| Add project-ownership joins to all 20 indirect-tenant-table mutations | V2, 05 D3 | 3 d |
| Delete boot-time DDL (`applyRfiWorkflowMigration`); pick one schema channel | A3, B3 | 2 d |
| Stand up a Postgres-backed job queue (`pg-boss`); move **email sync + PDF generation** off the request path first | A2, P9 | 5 d |
| Shrink the tenant transaction so external I/O (AI/Stripe/GCS/email) runs outside it | B1 | 2–3 d |
| Add Tier-2/3 indexes (FK columns, missing `company_id`) + `trade_reviews` unique + contacts trigram | 05 | 1 d |
| Add real error tracking (Sentry) with source-map symbolication | 07 #2 | 1 d |
| Code-split the web bundle (`React.lazy` per route + `manualChunks`); remove dead deps/assets | P1, P2, A10 | 3–4 d |
| Fix auth-cache cross-instance staleness via LISTEN/NOTIFY (channel already exists) | B2 | 1 d |
| Batch the TradeHub feed/messaging N+1s | P6 | 2 d |

## Medium term (90 days) — scale-readiness and operational maturity
Goal: comfortably serve 1,000→10,000 users and survive a 2am incident.

| Item | Finding | Effort |
|------|---------|:---:|
| Add PgBouncer (transaction pooling) in front of Postgres | 06 | 2 d |
| Split services: API / worker / scheduler; move all AI/OCR/export/cron off the API process | A2, 06 | 8–12 d |
| Add a read replica; route dashboards/reports/exports to it | 06 | 3 d |
| Readiness health check (dependencies) distinct from liveness; export metrics | 07 #5 | 3 d |
| Paginate all tenant-wide list endpoints; collapse dashboard counts into one query | P5, P7 | 3 d |
| Confirm + document DB backup/PITR and a **tested restore runbook** (RTO/RPO) | 07 #4 | 2 d + policy |
| Env-var Zod schema validated at boot; separate `QB_STATE_SECRET`; central caching layer | A8, V8 | 2 d |
| De-Enterprise-gate basic audit-log read; add pagination; write-coverage pass | 07 #7, B4, D4 | 3 d |
| Client-approval hardening: token expiry + signed-document snapshot/hash | D3 | 3 d |
| Enforce service/repository layer on the money routes (invoices/quotes/timesheets) | A4 | ongoing |

## Long term (6 months) — 10k→100k foundations and compliance
Goal: remove the remaining single points of failure and satisfy PIPEDA/GDPR for regulated customers.

| Item | Finding | Effort |
|------|---------|:---:|
| Migrate hot-table + `document_chunks`/`email_messages` PKs to `bigint` | 05, 06 | 1–2 wk |
| Table partitioning for append-only tables (audit_logs, chunks, email, photos) | 06 | 2 wk |
| CDN for web app + signed-URL media; photo thumbnailing + lifecycle/tiering | 06, D2 | 2 wk |
| Email ingestion via webhooks + queue (replace 5-min polling) | 06, D6 | 1 wk |
| Document data residency + sub-processor list; per-subject export/erasure; regionalize/disclose AI processing | 07 #6, D5 | policy + 1 wk |
| DB CHECK constraints + append-only immutability on compliance/audit tables | D4, 05 | 1 wk |
| Unify mobile offline queues behind one status surface + server idempotency keys | D1 | 1 wk |
| Evaluate migration off Replit coupling per `docs/MIGRATION.md` (also replace the platform router that serves static + API) | A9, 06 | project |

---

## Sequencing logic
The three prerequisites that unlock everything else, in order:
1. **Make RLS + migrations deterministic** (short term) — until schema provisioning is trustworthy, no tenant-isolation claim holds and compliance is unprovable.
2. **Decouple long work from the request path + PgBouncer** (short→medium) — removes the ~20-request concurrency ceiling that caps growth around low-thousands of users.
3. **Wire observability (alerting + error tracking + readiness)** (immediate→short) — you can't safely operate the above changes without it.

Everything in medium/long term builds on these three.
