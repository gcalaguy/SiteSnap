# Phase 7 — SaaS Production-Readiness Review

Scorecard 1–10 per category with evidence, then an overall readiness verdict.

| Category | Score | Comments |
|----------|:----:|----------|
| **Logging** | 8 | pino with a thorough redact list (auth/cookie headers, `*.password`/`*.token`/`*.ssn`/`*.creditCard` — `lib/logger.ts`); pino-http request logging with query strings stripped; slow-query logger (`instrumentPool`, `SLOW_QUERY_THRESHOLD_MS` default 500). Strong. Gap: logs go to stdout only — no aggregation/retention/search in a hosted log store. |
| **Monitoring** | 3 | `/api/healthz` = `SELECT 1` liveness only (`routes/health.ts`), wired to the Replit startup check. No readiness check of dependencies (object storage, Clerk, OpenAI, Resend, Stripe). No metrics (latency/error-rate/throughput/pool-utilization) exported anywhere — the pool monitor only `console.warn`s at ≥80%. |
| **Alerting** | 1 | **None wired.** `alertOnHighErrorRate()` (`lib/logger.ts`) logs `warn`/`error` with a literal `// TODO: Send PagerDuty/Slack alert here`. No one is paged when an instance `process.exit(1)`s (`index.ts:152`) or error rate spikes. |
| **Error tracking** | 3 | No Sentry/Datadog/OTel/Bugsnag anywhere (grep clean; only stale strings in `build.mjs`/`dist`). Instead a **self-hosted** pipeline: web + mobile crash handlers POST to `/api/system-logs/report` → Postgres, readable by super-admins. Captures data, but no grouping, no release/source-map symbolication, no notifications, no dashboards. Better than nothing; not production observability. |
| **Audit trails** | 6 | Real feature: `audit_logs` table + `logAuditEvent`/`logAuditEventFromRequest` writers, `GET /api/audit-logs` viewer, `auditExport.ts`, external-auditor portal. But read is **Enterprise-plan-gated** (`requireAuditAccess`), so most tenants get no audit visibility; the endpoint has a hard 500-row cap with no pagination and dead filter code (`02-code-quality.md` B4); write coverage is partial (present on member-removal, needs a coverage pass on all sensitive mutations). |
| **Backups** | 5 | App-level backup feature exists (`routes/backup.ts`, `services/backupEngine.ts`, `backup_schedules`/`backup_logs`, config encrypted, `requireOwner`-gated, tested). But this is a tenant-facing export feature, **not** infrastructure DR. Actual DB backup/PITR depends on the Replit-managed Postgres defaults — unverified from code; must be confirmed and documented. |
| **Disaster recovery** | 2 | No documented RTO/RPO, no tested restore runbook, single region, single primary (no replica/failover). `docs/MIGRATION.md` addresses moving platforms, not recovering from failure. |
| **Data retention** | 3 | Some cleanup crons (orphan storage weekly, tenant-export receipts, backup-log purge in the midnight job). No documented retention policy per data class; audit logs, document chunks, email messages, and system-log crash reports grow unbounded. |
| **Multi-tenancy** | 5 | Application-level isolation is generally enforced (explicit `company_id` filters + `requireTenantCtx`), and the prior audit's cross-tenant bugs are fixed. But the DB-level backstop (RLS) is fail-open and not reliably deployed (`03-security.md` V1), 20 indirect tables depend on per-handler joins, and tenant selection is a client-supplied `x-tenant-id` header (membership-checked, but still client-driven). Solid at the app layer, weak at the defense-in-depth layer. |
| **GDPR compliance** | 4 | Tenant export + purge machinery exists (`services/tenantExport.ts`, super-admin `POST /admin/tenants/:id/export` and `DELETE`), which supports data-portability and erasure requests. Missing: a documented DPA/data-processing inventory, per-subject (not just per-tenant) export/erasure, consent/cookie handling on the web app, sub-processor list (Clerk, OpenAI, Resend, GCS, Stripe), and data-residency guarantees. |
| **PIPEDA compliance** | 4 | Same export/purge foundation helps. The product targets **Canadian** construction firms, so PIPEDA (and provincial equivalents) apply: needs documented purpose/consent, breach-notification procedure, and — importantly — **data-residency clarity** (where Replit/GCS/Postgres physically store data; OpenAI processing of documents/photos leaves Canada). None documented. |
| **Security controls** | 6 | Good baseline: helmet (prod), CORS allowlist, tiered PG-backed rate limits, per-company AI quotas, bearer-token auth via Clerk, pre-signed uploads with ACLs, `Cache-Control: no-store` on API, graceful shutdown, secrets via env/connectors (none hardcoded), gitleaks in CI. Open items are the `03-security.md` findings (fail-open RLS, token expiry, virus-scan fail-open, NODE_ENV coupling). |

**Weighted overall readiness: 4 / 10.**

The application is **functionally rich and has a real security baseline** (the May 2026 audit's criticals are genuinely fixed), but it is **not yet operationally production-ready** for paid multi-tenant use at scale. The dominant gaps are *operational*, not feature gaps: no alerting, thin monitoring, no real error tracking, no DR plan, and a schema/RLS provisioning path that can't be trusted to have deployed the tenant-isolation policies. These are exactly the things that turn a 2am incident into a prolonged outage or a cross-tenant data exposure that no one notices.

## Top readiness gaps to close before charging customers
1. **Wire alerting** (error rate, instance exit, pool saturation) to Slack/PagerDuty — the TODO is already in the code.
2. **Add real error tracking** with source-map symbolication (Sentry fits the stack; the esbuild config already emits linked source maps).
3. **Make RLS deterministic and fail-closed** (`03-security.md` V1) — this is a compliance issue, not just security.
4. **Confirm + document DB backup/PITR and a tested restore runbook** with RTO/RPO.
5. **Readiness health check** covering dependencies, distinct from liveness.
6. **Document data residency + sub-processors** (PIPEDA/GDPR) before onboarding regulated customers.
7. **De-Enterprise-gate basic audit-log visibility** so every tenant can see who did what.
