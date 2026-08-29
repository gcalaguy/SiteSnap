# Phase 5 — Database Audit

**PostgreSQL 16 + Drizzle ORM.** 124 tables (`lib/db/src/schema/`, 4,520 lines), 87 SQL migrations, single `pg` pool. Money `numeric(12,2)`, timestamps `timestamptz`, ~20 `pgEnum`s, **zero CHECK constraints**.

> **Overriding caveat — the migration system is inert, and this was verified live, not inferred.** `lib/db/README.md` states `drizzle-kit push --force` is the canonical provisioning path; the migration journal (`meta/_journal.json`) stops at `0044` and the newest snapshot at `0036`, so migrations `0045–0087` are **never replayed by tooling**. Queried against the live database (`heliumdb`, 2026-08-25): the pgvector HNSW index from migration `0031` **does not exist** (`document_chunks` has only 3 btree indexes + PK — confirmed via `pg_indexes`); RLS is `ENABLE`d on only **15 of 124 tables** despite 56 tables having a policy defined (see below); `estimator_cost_models`/`estimator_addons`.`company_id` — which migration `0006` indexes — **are not indexed live**. Every recommendation below that adds an index or policy must be added to the **Drizzle schema** (`src/schema/*.ts`), not just a `.sql` file, or `push` will not recreate it. This is the single most important database finding — it undermines both the security model (`03-security.md` V1) and the index coverage below.

---

## Schema design

**Multi-tenant model:** tenant key is `companyId integer → companies.id ON DELETE CASCADE` (97 occurrences in `index.ts`). Three tiers, classified in `0050_rls_tenant_isolation_phase5.sql:5-8`:
- **Direct** (51 tables): `company_id NOT NULL`.
- **Nullable-global** (2): `estimator_cost_models`, `estimator_addons` — `NULL` = system default visible to all tenants.
- **Indirect** (20 tables, **no `company_id` column**): tenancy only via a parent FK. Examples: `tasks` (→ `project_id`), `cost_analyses` (→ `project_id`), `daily_report_photos` (→ `report_id`), `client_portal_tokens/_uploads/_messages`, `daily_logs`, `site_photos`, `submission_photos`, `inspection_items`. These are the highest-risk surface: their tenant boundary is an EXISTS-subquery RLS policy that only exists in `0050` (so possibly absent), plus whatever explicit join the handler remembers to write (`03-security.md` V2).

**Primary keys:** `serial` (int4) on ~all tables. No `bigserial`. Hot high-volume tables — `document_chunks`, `email_messages`, and eventually `projects`/`invoices` line items — have a **2.1-billion-row ceiling**. Not urgent at 10k users; must be addressed before very high volume (`06-scalability.md`).

**Constraints:**
- FK on-delete: 164 `cascade`, 65 `set null`, **92 with no `onDelete`** (defaults to `NO ACTION`). Combined with unindexed FK columns (below), a `DELETE FROM companies` (tenant offboarding) does a sequential scan per referencing table to check `NO ACTION`.
- Unique constraints used well (column-level, composite, and tenant-scoped `uniqueIndex`), including a nice partial unique `uniq_owner_membership_per_user ON user_memberships(user_id) WHERE role='owner'` (`index.ts:200`) that backstops duplicate-tenant creation.
- **Zero CHECK constraints** — all value-domain rules (rating 1–5, non-negative money, status transitions) live only in Zod at the API boundary. Any direct DB write, backfill, or the boot-time DDL bypasses them.
- **`trade_reviews` has no unique constraint** backing its "one review per reviewer per target" rule — enforced only in app code (`routes/tradeReviews.ts:65-85`), so concurrent submits can duplicate. Add a partial unique index (below).

---

## Missing indexes — recommended SQL

Each verified against existing migrations + schema (no duplicates). **Add these to `lib/db/src/schema/*.ts` as `index(...)` entries** so `push` creates them; the raw SQL below is for a one-off `CREATE INDEX CONCURRENTLY` on the live DB in the meantime. Run each `CONCURRENTLY` outside a transaction.

### Tier 1 — hot path, add immediately
```sql
-- user_memberships: read on EVERY authenticated request (auth.ts:97). Composite PK
-- is (user_id, company_id) so company_id-leading lookups have no usable index.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_memberships_company
  ON user_memberships (company_id);

-- document_chunks.content: RAG keyword-search builds to_tsvector at query time
-- (repositories/documents.ts:158) with no supporting index → sequential scan.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_document_chunks_content_fts
  ON document_chunks USING gin (to_tsvector('english', content));
-- (Prefer: add a generated tsvector column like email_messages.search_vector, then GIN it.)

-- pgvector HNSW index currently exists ONLY in migration 0031 (not in schema →
-- push does not create it). Add to schema via .using("hnsw", ...) OR ensure this ran:
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_document_chunks_embedding_hnsw
  ON document_chunks USING hnsw (embedding vector_cosine_ops) WITH (m=16, ef_construction=64);
```

### Tier 2 — unindexed FK columns (join + cascade-delete hot spots)
```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cost_analyses_project        ON cost_analyses (project_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_daily_report_photos_report   ON daily_report_photos (report_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_client_portal_tokens_project ON client_portal_tokens (project_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_client_portal_uploads_token  ON client_portal_uploads (portal_token_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_client_portal_uploads_project ON client_portal_uploads (project_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_client_portal_messages_token ON client_portal_messages (portal_token_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_submission_photos_submission ON submission_photos (submission_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_estimate_template_items_tmpl ON estimate_template_items (template_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_inspection_items_inspection  ON inspection_items (inspection_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tradehub_comments_post       ON tradehub_comments (post_id);   -- fixes N+1 in 04-performance P6
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_job_posting_applications_job ON job_posting_applications (job_posting_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tradehub_notifications_user  ON tradehub_notifications (user_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tradehub_saved_calcs_user    ON tradehub_saved_calculations (user_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pending_compliance_project   ON pending_compliance_analyses (project_id);
```

### Tier 3 — unindexed `company_id` on tenant tables
```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_invitations_company        ON invitations (company_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_proposals_company          ON proposals (company_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_estimate_templates_company ON estimate_templates (company_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_estimator_actuals_company  ON estimator_actuals (company_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_estimator_cost_models_company ON estimator_cost_models (company_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_estimator_addons_company   ON estimator_addons (company_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_inspection_alerts_company  ON inspection_alerts (company_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_provider_tokens_company    ON provider_tokens (company_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tradehub_profiles_company  ON tradehub_profiles (company_id);
-- NOTE: contacts.company_id already indexed live (idx_contacts_company_id, from 0015 — confirmed present).
-- estimator_cost_models/addons.company_id: migration 0006 claims to index these but does NOT exist live —
-- confirms the "migrations are inert" finding; both are now in this list.
```

### Tier 5 — live-verified unindexed FK columns beyond the Tiers above (112 total, app-schema only)
The verification query below returned 112 unindexed FK columns on live `public.*` tables (15 more rows in a `stripe.*` schema are vendor-managed by `stripe-replit-sync` and out of scope). Tiers 1–3 above cover the highest-traffic ones; the remainder are mostly actor/audit columns (`*_by_user_id`, `*_id` on child tables) that matter for join performance on detail views and cascade-delete cost rather than hot-path latency. Full list, grouped by table:
```
cost_analyses(project_id) · daily_reports(submitted_by_user_id) · rfis(assigned_to_user_id, company_id, submitted_by_user_id)
users(active_company_id) · daily_report_photos(report_id) · messages(conversation_id) · project_documents(uploaded_by_user_id)
invoices(created_by_user_id) · quotes(created_by_user_id) · worker_schedules(contact_id, user_id) · project_members(company_id)
client_portal_tokens(project_id) · client_portal_uploads(project_id) · client_portal_messages(project_id)
estimates(created_by_user_id, scan_id) · subscriptions(plan_id) · form_submissions(template_id, user_id)
submission_photos(submission_id) · submission_comments(user_id) · tradehub_profiles(company_id) · tradehub_posts(user_id)
tradehub_comments(post_id, user_id) · tradehub_job_applications(applicant_id, post_id) · tradehub_reports(reporter_id)
tradehub_notifications(user_id) · tradehub_messages(sender_id) · tradehub_saved_calculations(user_id)
leads(contact_id) · lead_activities(lead_id, user_id) · proposals(builder_estimate_id, company_id)
change_orders(approved_by_user_id, requested_by_user_id) · file_attachments(uploaded_by_user_id)
estimator_cost_models/addons/actuals(company_id[, estimate_id]) · inspections(inspector_id)
inspection_items(inspection_id) · inspection_alerts(company_id, inspection_id, project_id)
schedule_events(created_by_user_id, project_id) · project_notes(author_id) · scans(created_by_user_id)
daily_logs(foreman_id) · site_photos(uploaded_by_user_id) · safety_signoffs(worker_id) · provider_tokens(company_id, user_id)
media_hub_photos(uploaded_by_id) · job_postings(created_by) · job_posting_applications(applicant_id, job_posting_id)
permits(created_by_user_id) · capa_tickets(closed_by_user_id, created_by_user_id, project_id, resolved_by_user_id, verified_by_user_id)
external_auditor_tokens(created_by_user_id) · time_clock_sessions(clocked_in_by_user_id, clocked_out_by_user_id, time_entry_id)
psi_checklists(created_by_user_id) · safety_scans(foreman_user_id, submitted_by_user_id) · scan_hazards(capa_ticket_id)
voice_inspections(capa_ticket_id, submitted_by_user_id) · document_templates(uploaded_by_user_id)
email_accounts(connected_by_user_id) · email_threads(suggested_project_id) · project_match_keywords(created_by_user_id)
email_filing_rules(created_by_user_id) · communication_search_templates(created_by_user_id)
email_thread_corrections(corrected_by_user_id) · ai_skill_runs(approved_by_user_id, user_id)
```
Add these opportunistically when touching each table rather than as a single batch migration.

### Tier 4 — data-integrity constraints (not just perf)
```sql
-- Back the "one review per reviewer per target" app rule with a real constraint:
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_trade_reviews_reviewer_target
  ON trade_reviews (reviewer_id, target_type, COALESCE(target_company_id,0), COALESCE(target_user_id,0));

-- Contact search: replace ILIKE '%term%' (04-performance P7) with trigram index:
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_contacts_name_trgm ON contacts USING gin (name gin_trgm_ops);
```

---

## Query rewrites

**1. TradeHub feed N+1 → batched (details in `04-performance.md` P6).** Replace `Promise.all(posts.map(enrichPost))` with set-based fetches keyed by `inArray(postIds)` for authors/profiles/media/counts, then assemble in memory — the exact pattern already correct in `routes/tradeReviews.ts:187-203`.

**2. Dashboard counts → single aggregate (`04-performance.md` P5).**
```sql
SELECT
  count(*) FILTER (WHERE status='pending_approval') AS pending_quotes,
  count(*) FILTER (WHERE status='draft')            AS draft_quotes
FROM quotes WHERE company_id = $1;
-- and a UNION ALL across quotes/invoices/form_submissions/timesheets in one round trip,
-- rather than 5 sequential SELECT count(*) queries.
```

**3. RAG FTS → indexed.** After adding the GIN index above, `ftsWebsearchQuery` (`repositories/documents.ts:158`) uses it automatically; better, add a stored generated `content_tsv` column so the vector isn't rebuilt per row. Also route these raw `pool.query` calls through `withTenantCtxRaw` so they respect RLS (`03-security.md` V1).

**4. Portal invoice list → filter in SQL** not JS (`02-code-quality.md` B7).

---

## Connection & concurrency
Single `pg` pool `max: 20`, no PgBouncer, no read replica (`lib/db/src/dbInstance.ts`). `requireTenantCtx` pins one connection inside an open transaction for the **entire request** including external I/O (`02-code-quality.md` B1) — so effective max concurrency of authenticated requests is ~20. This is the hardest scaling ceiling (`06-scalability.md` D1). `SET LOCAL app.company_id = ${companyId}` is string-interpolated (guarded by `assertValidCompanyId`; the guard comment notes it regressed from parameterized form once) — keep the guard; the risk is real if a future caller passes an unvalidated value.

---

## Database Health Score

| Dimension | Score /10 | Rationale |
|-----------|-----------|-----------|
| **Schema design** | 6 | Clean tenant model, good enums/uniques/timestamps; but 20 indirect tables with no `company_id`, zero CHECK constraints, all-`serial` PKs, 92 FKs with no `onDelete`. |
| **Indexing** | 5 | Strong leading-`company_id` composites on newer modules; but the auth-hot `user_memberships.company_id`, ~16 FK columns, several `company_id`s, and the RAG FTS column are unindexed. |
| **Query efficiency** | 5 | Pagination + `Promise.all` used in places; undermined by TradeHub N+1s, 5 sequential dashboard counts, unpaginated tenant-wide lists, query-time tsvector. |
| **Scalability** | 3 | 20-conn pool + request-length transactions + no replica/pooler + int4 PKs on hot tables + inert migration system. |
| **Tenant isolation (DB layer)** | 0 | Live-verified: the app connects as `postgres` (`SUPERUSER` + `BYPASSRLS`), so **RLS is bypassed unconditionally and enforces nothing** — even on the 15 tables that show "enabled". Beneath that, RLS is off on 109/124 tables and 33 `company_id` tables have no policy at all. Isolation is 100% dependent on application-layer `WHERE` clauses; there is no database backstop of any kind. See `rls-remediation.sql`. |
| **Overall** | **4** | Fundamentally sound relational model held back by an unreliable provisioning path, a concurrency design that caps throughput early, and — the deciding factor — a database-level tenant-isolation backstop that is switched off almost everywhere it was designed to run. |

---

## Live verification — completed 2026-08-25 against `heliumdb` (PostgreSQL 16.10)

These queries were run against the workspace's live Postgres. Results are folded into the findings above (`03-security.md` V1 has the full RLS breakdown); raw counts below for reference. If production runs a separate database instance, re-run these there before treating this as final.

```sql
-- RLS enabled/disabled + policy count per table
SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity, count(p.policyname)
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
LEFT JOIN pg_policies p ON p.schemaname='public' AND p.tablename=c.relname
WHERE n.nspname='public' AND c.relkind='r'
GROUP BY 1,2,3 ORDER BY 2,1;
```
**Result:** 124 public tables total. **15 have RLS enabled** (`ai_skill_runs`, `communication_search_templates`, `communication_timeline_events`, `contacts`, `cost_catalog`, `document_templates`, `email_accounts`, `email_attachments`, `email_filing_rules`, `email_messages`, `email_thread_corrections`, `email_threads`, `project_documents`, `project_match_keywords`, `project_signal_weights`). **41 tables have a policy defined but RLS disabled** — including `invoices`, `projects`, `quotes`, `timesheets`, `tasks`, `cost_analyses`, `daily_reports`, `document_chunks`, `user_memberships`, `companies`, `rfis`, `leads`, `payments`, `subscriptions`, `form_submissions`, `schedule_events`, `estimates`, `estimator_actuals/addons/cost_models`, `inspections`, `inspection_alerts`, `safety_scans`, `safety_signoffs`, `scan_hazards`, `time_clock_sessions`, `time_entries`, `voice_inspections`, `site_photos`, `daily_logs`, `worker_schedules`, `provider_tokens`, `quickbooks_connections`, `job_postings`, `change_orders`, `equipment`, `file_attachments`, `invitations`, `scans`, `project_notes`. **68 tables have no policy at all** (33 of which carry `company_id` — see `03-security.md` V1 for the full list).

Additionally: `invoices`/`projects`/`quotes`/`timesheets` each carry a dormant RESTRICTIVE `tenant_isolation` policy (`company_id = current_tenant_id()`, no NULL fallback) alongside the dormant PERMISSIVE one — a partial, never-activated lockdown. And `contacts`' single enabled policy checks `app_company_id()`, which reads GUC `app.current_company_id` — a variable the app's only context-setter (`withTenantCtx`, `tenantCtx.ts:65`) never sets (it sets `app.company_id`, read by the *other* function, `current_tenant_id()`). `contacts` therefore shows RLS "on" but enforces nothing.

```sql
-- pgvector HNSW index and document_chunks FTS index
SELECT indexname FROM pg_indexes WHERE tablename='document_chunks';
```
**Result:** `document_chunks_pkey`, `document_chunks_project_idx`, `document_chunks_doc_idx`, `document_chunks_company_idx` only. **No HNSW index, no FTS/GIN index** — confirms migration `0031` never ran on this database; RAG vector search is doing a full sequential scan and cosine-distance computation over every chunk.

```sql
-- Unindexed FK columns
SELECT conrelid::regclass AS tbl, a.attname AS col
FROM pg_constraint c JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=ANY(c.conkey)
WHERE c.contype='f'
  AND NOT EXISTS (SELECT 1 FROM pg_index i WHERE i.indrelid=c.conrelid AND a.attnum=ANY(i.indkey))
ORDER BY 1,2;
```
**Result:** 112 unindexed FK columns across `public.*` (full list in the Tier 5 section above), plus 15 more in the vendor-managed `stripe.*` schema (out of scope — managed by `stripe-replit-sync`).

```sql
-- pg_trgm extension (needed for the contacts-search index recommendation)
SELECT name, installed_version FROM pg_available_extensions WHERE name='pg_trgm';
```
**Result:** available but **not installed** — `CREATE EXTENSION pg_trgm;` (already included in the Tier 4 SQL above) is required before the trigram index will build.
