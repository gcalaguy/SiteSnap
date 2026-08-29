# Phase 6 — Scalability Review

"What breaks first" as load climbs. Capacity estimates are order-of-magnitude, derived from the verified architecture (single autoscale API doing HTTP+cron+AI+PDF, single Postgres `max: 20` pool with request-length transactions, single-region Replit). They are reasoning aids, not benchmarks — run a load test to calibrate.

---

## Current capacity estimate

The binding constraint is **concurrent authenticated requests ≈ pool size (20)**, because `requireTenantCtx` holds one pooled connection inside an open transaction for the whole request (`02-code-quality.md` B1, `05-database.md` D1). Fast CRUD requests (5–20 ms) release quickly, so 20 connections can serve a few thousand light req/s in principle — but any request that does inline AI (5–30 s), PDF/Playwright, or an email/GCS/QuickBooks call holds its connection for that entire duration.

- **Comfortably fine at 100 users.** Handful of concurrent requests, small tables, cron trivial.
- **Practical ceiling before work is required: roughly the low-1,000s of users** — the moment a modest fraction of them trigger AI/PDF/report endpoints concurrently, the 20-connection pool saturates and unrelated CRUD requests queue on `connectionTimeoutMillis` (10 s) then 500.

---

## What breaks first, by scale

### → 1,000 users
**Breaks first: the DB connection pool + inline long work.**
- 20-connection pool + request-length transactions + inline AI/PDF means a dozen concurrent "generate estimate / render PDF / daily digest" operations can starve everyone else (D1/B1/P9).
- Web bundle (5 MB, `04-performance.md` P1) makes first load slow on field mobile connections — felt immediately by construction users on-site.
- Unpaginated tenant-wide lists (contacts/projects/psi — P7) grow with the biggest tenant, not the user count.
- **Fixes:** move AI/PDF/OCR/email to a job queue (`01-architecture.md` A2); shrink the tenant transaction (B1); code-split the bundle (P1); paginate lists (P7); add PgBouncer (transaction pooling) in front of Postgres so the app can raise effective concurrency without exhausting server-side connections.

### → 10,000 users
**Breaks first: single-process everything + cron-in-autoscale + single Postgres.**
- Cron runs in the API process on Replit **autoscale**; a scaled-to-zero instance runs no jobs, and email polling every 5 min (`cron.ts:735`) + AI extraction compete with request traffic (A2).
- Write contention on hot tables (timesheets, daily reports, photos) on a single primary; read-heavy dashboards have no replica to offload to.
- N+1s (TradeHub feed/messaging — P6) turn a busy marketplace into thousands of queries/request.
- int4 (`serial`) PKs on `document_chunks`/`email_messages` start to be a medium-term concern as RAG + email ingestion accumulate rows (`05-database.md`).
- **Fixes:** separate worker + scheduler services; add a read replica and route dashboards/reports/exports to it; migrate hot-table + chunk/message PKs to `bigint`; batch the N+1s; introduce a cache (dashboard summary, feature keys) — the LISTEN/NOTIFY invalidation channel already exists to keep it coherent.

### → 100,000 users
**Breaks first: single-region Postgres write throughput, storage growth, and the platform itself.**
- One primary can't absorb the write volume; needs partitioning of the largest append-only tables (audit_logs, document_chunks, email_messages, photos metadata) and likely per-region sharding or a managed scale-out Postgres.
- GCS object growth (photos are the dominant cost driver in a field-photo-heavy product) needs lifecycle policies, thumbnailing, and cold-tiering (`07-saas-readiness.md`).
- Replit autoscale + object-storage sidecar + connectors coupling is likely outgrown; `docs/MIGRATION.md` (Neon + Railway) becomes mandatory, and must also replace the platform router that currently fronts `/` (static) and `/api` (the API serves no static content today).
- Real-time: there are **no WebSockets/SSE today** — notifications are DB rows + Expo push, and email is polled, not webhook-driven. At this scale, push fan-out and email ingestion both need dedicated infrastructure (webhooks + queue + a notification service).
- **Fixes:** managed scale-out Postgres + read replicas + PgBouncer; table partitioning; CDN for the web app and signed-URL media; queue-based ingestion; multi-region.

---

## Layer-by-layer

### API layer
- **Throughput/concurrency:** capped by the pool (20) × transaction-holding pattern, not by CPU. No queueing system — long work runs inline.
- **Rate limiting:** solid foundation — PG-backed shared store for global (500/15min)/AI (15/min)/upload (30/10min) limiters (`app.ts:44-83`), plus per-company AI quotas (`requireAiQuota`, 100/day·10/min). Gaps: route-level limiters (public sign, systemLogs, tradehub post) use in-memory per-instance stores so they under-count across instances; `/api/v1/storage/uploads` has no upload limiter (`01-architecture.md` A6). IP-keyed limiters rely on `trust proxy:1` being correct.
- **Fix:** job queue for long work; move the in-memory limiters to the PG store; close the v1 upload gap.

### Database
- **Connection limits:** 20, no pooler — the primary ceiling. **Add PgBouncer.**
- **Query performance:** missing indexes + N+1 + unpaginated lists (`05-database.md`, `04-performance.md`).
- **Write contention:** single primary; no partitioning of append-only tables.

### Storage
- **File growth:** photo-centric product → GCS is the fastest-growing cost. No lifecycle/tiering/thumbnail strategy observed. Orphan cleanup exists (weekly cron listing the whole bucket — `cron.ts:609` — itself an O(bucket) job that won't scale).
- **Fix:** thumbnails + responsive image variants; lifecycle rules; replace full-bucket-scan cleanup with a reconcile against DB object paths.

### Real-time features
- **None currently.** Notifications = DB rows + Expo push (`lib/push.ts`); email = 5-min polling; no WebSocket/SSE (the SW explicitly `NetworkOnly`s upgrade requests). This is *simpler* to scale than a socket fleet, but push fan-out and email ingestion still need queue + webhook infrastructure at 10k+.

---

## Recommended capacity roadmap (summary)

| Scale | First bottleneck | Must-have change |
|-------|------------------|------------------|
| 1k | Pool + inline AI/PDF | Job queue; shrink tenant tx; PgBouncer; code-split bundle; paginate |
| 10k | Single process/cron/DB | Worker+scheduler services; read replica; batch N+1; cache; bigint on hot PKs |
| 100k | Single-region write throughput; storage; platform | Scale-out Postgres + partitioning; CDN; queue-based ingestion; migrate off Replit coupling; multi-region |

The through-line: **decouple long work from the request path, put a pooler in front of Postgres, and make the migration/RLS story deterministic** — those three unlock the first order of magnitude and are prerequisites for the rest.
