-- ============================================================================
-- RLS Remediation for Site Snap — prepared 2026-08-25 from live-DB verification
-- ============================================================================
--
-- ⚠️  DO NOT RUN blindly. Read this header first.
--
-- WHY THIS IS NOT JUST "ENABLE ROW LEVEL SECURITY":
-- The application connects to Postgres as role `postgres`, which is a SUPERUSER
-- with rolbypassrls = true (verified: SELECT rolsuper, rolbypassrls FROM pg_roles
-- WHERE rolname='postgres' → t, t). Postgres bypasses ALL row-level security for
-- superusers and BYPASSRLS roles UNCONDITIONALLY — ENABLE and FORCE and every
-- policy are ignored for such a role. Therefore:
--
--   Enabling RLS changes NOTHING until the app connects as a
--   NON-superuser, NON-BYPASSRLS role.
--
-- This is also why the 15 tables that already show "RLS enabled" today
-- (contacts, email_*, project_documents, ai_skill_runs, …) are NOT actually
-- enforcing isolation for the running application.
--
-- REQUIRED ORDER OF OPERATIONS:
--   STEP 1 — Create a least-privilege application role (Section 1 below).
--   STEP 2 — Point the app's DATABASE_URL at that new role and redeploy.
--            ⚠️ This is a production connection cutover. If a grant is missing
--            the app loses DB access. Test in a staging DB first. Have a
--            rollback DATABASE_URL (the current postgres one) ready.
--   STEP 3 — Only after the app is confirmed healthy on the new role, apply
--            Sections 2–3 (policies + ENABLE/FORCE). Because the new role is
--            NOT bypassrls, RLS becomes real the moment these run.
--
-- SAFETY OF THE POLICY DESIGN:
--   Every policy uses the pattern (current_tenant_id() IS NULL OR <tenant match>).
--   current_tenant_id() reads GUC `app.company_id`, which requireTenantCtx sets
--   (lib/db/src/tenantCtx.ts:65). The `IS NULL` fallback means any query that
--   runs OUTSIDE a tenant transaction — public quote/invoice signing (routes/
--   public.ts), cron jobs (cron.ts), super-admin (routes/superAdmin.ts), and the
--   TradeHub marketplace's cross-company reads (repositories/tradehub.ts:322,
--   which run under requireAuth only, NOT requireTenantCtx) — continues to see
--   all rows and keeps working. In-context queries (68/74 route files) already
--   filter by req.companyId explicitly, so the policy is a backstop, not a
--   behaviour change, for correct code — and a real block for a handler that
--   forgets its WHERE. This matches the proven-working pattern already live on
--   the 15 current tables that use current_tenant_id().
--
--   NOTE the deliberate special cases below:
--     • companies             → matches on `id`, not `company_id`
--     • estimator_cost_models,
--       estimator_addons       → also allow `company_id IS NULL` (shared system
--                                defaults that every tenant must still see)
--     • cost_analyses, daily_logs, safety_signoffs, site_photos, tasks
--                              → no company_id column; scoped via projects join
--
--   The RESTRICTIVE `tenant_isolation` policies currently sitting (disabled) on
--   invoices/projects/quotes/timesheets have NO null fallback and would break
--   public signing + cron. Section 2 DROPs them and replaces with the safe
--   fallback form. If you want true default-deny on those four tables, do it
--   only after auditing every out-of-context reader.
--
-- The long-term home for all of this is the Drizzle schema (pgPolicy().
-- enableRLS().forceRLS()) so `drizzle-kit push` reproduces it — see the audit's
-- 05-database.md. This .sql file is the immediate, reviewable artifact.
-- ============================================================================


-- ============================================================================
-- SECTION 1 — Least-privilege application role   (STEP 1; run once)
-- ============================================================================
-- Adjust the password to a real secret (store it in Replit Secrets, not here).

-- CREATE ROLE app_rls WITH LOGIN PASSWORD 'REPLACE_WITH_A_REAL_SECRET'
--   NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
--
-- GRANT USAGE ON SCHEMA public TO app_rls;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES    IN SCHEMA public TO app_rls;
-- GRANT USAGE, SELECT                  ON ALL SEQUENCES IN SCHEMA public TO app_rls;
-- GRANT EXECUTE                        ON ALL FUNCTIONS IN SCHEMA public TO app_rls;
-- ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES    TO app_rls;
-- ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT                  ON SEQUENCES TO app_rls;
-- ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE                        ON FUNCTIONS TO app_rls;
--
-- If Stripe-managed tables in the `stripe` schema are read by the app, grant there too:
-- GRANT USAGE ON SCHEMA stripe TO app_rls;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA stripe TO app_rls;
--
-- Then STEP 2: set DATABASE_URL to use app_rls and redeploy. Verify app health.
-- current_tenant_id() is SECURITY DEFINER (owned by postgres) so app_rls can
-- still read the GUC helper. Confirm withTenantCtx works end-to-end before Section 2.


-- ============================================================================
-- SECTION 2 — Correct + consolidate policies   (STEP 3; after role cutover)
-- ============================================================================
BEGIN;

-- Drop the inert app_company_id()-based policies and the no-fallback RESTRICTIVE ones.
DROP POLICY IF EXISTS company_isolation ON audit_logs;
DROP POLICY IF EXISTS company_isolation ON change_orders;
DROP POLICY IF EXISTS company_isolation ON companies;
DROP POLICY IF EXISTS company_isolation ON cost_analyses;
DROP POLICY IF EXISTS company_isolation ON daily_logs;
DROP POLICY IF EXISTS company_isolation ON daily_reports;
DROP POLICY IF EXISTS company_isolation ON document_chunks;
DROP POLICY IF EXISTS company_isolation ON equipment;
DROP POLICY IF EXISTS company_isolation ON estimates;
DROP POLICY IF EXISTS company_isolation ON estimator_actuals;
DROP POLICY IF EXISTS company_isolation ON estimator_addons;
DROP POLICY IF EXISTS company_isolation ON estimator_cost_models;
DROP POLICY IF EXISTS company_isolation ON file_attachments;
DROP POLICY IF EXISTS company_isolation ON form_submissions;
DROP POLICY IF EXISTS company_isolation ON inspection_alerts;
DROP POLICY IF EXISTS company_isolation ON inspections;
DROP POLICY IF EXISTS company_isolation ON invitations;
DROP POLICY IF EXISTS company_isolation ON invoices;
DROP POLICY IF EXISTS tenant_isolation  ON invoices;   -- RESTRICTIVE no-fallback
DROP POLICY IF EXISTS company_isolation ON job_postings;
DROP POLICY IF EXISTS company_isolation ON leads;
DROP POLICY IF EXISTS company_isolation ON payments;
DROP POLICY IF EXISTS company_isolation ON project_notes;
DROP POLICY IF EXISTS company_isolation ON projects;
DROP POLICY IF EXISTS tenant_isolation  ON projects;   -- RESTRICTIVE no-fallback
DROP POLICY IF EXISTS company_isolation ON provider_tokens;
DROP POLICY IF EXISTS company_isolation ON quickbooks_connections;
DROP POLICY IF EXISTS company_isolation ON quotes;
DROP POLICY IF EXISTS tenant_isolation  ON quotes;     -- RESTRICTIVE no-fallback
DROP POLICY IF EXISTS company_isolation ON rfis;
DROP POLICY IF EXISTS tenant_isolation  ON safety_scans;
DROP POLICY IF EXISTS company_isolation ON safety_signoffs;
DROP POLICY IF EXISTS tenant_isolation  ON scan_hazards;
DROP POLICY IF EXISTS company_isolation ON scans;
DROP POLICY IF EXISTS company_isolation ON schedule_events;
DROP POLICY IF EXISTS company_isolation ON site_photos;
DROP POLICY IF EXISTS company_isolation ON subscriptions;
DROP POLICY IF EXISTS company_isolation ON tasks;
DROP POLICY IF EXISTS tenant_isolation  ON time_clock_sessions;
DROP POLICY IF EXISTS company_isolation ON time_entries;
DROP POLICY IF EXISTS company_isolation ON timesheets;
DROP POLICY IF EXISTS tenant_isolation  ON timesheets;  -- RESTRICTIVE no-fallback
DROP POLICY IF EXISTS company_isolation ON user_memberships;
DROP POLICY IF EXISTS tenant_isolation  ON voice_inspections;
DROP POLICY IF EXISTS company_isolation ON worker_schedules;

-- Recreate a single fallback-safe tenant_isolation policy per table.
-- Direct company_id tables:
CREATE POLICY tenant_isolation ON audit_logs             AS PERMISSIVE FOR ALL USING (current_tenant_id() IS NULL OR company_id = current_tenant_id()) WITH CHECK (current_tenant_id() IS NULL OR company_id = current_tenant_id());
CREATE POLICY tenant_isolation ON change_orders          AS PERMISSIVE FOR ALL USING (current_tenant_id() IS NULL OR company_id = current_tenant_id()) WITH CHECK (current_tenant_id() IS NULL OR company_id = current_tenant_id());
CREATE POLICY tenant_isolation ON daily_reports          AS PERMISSIVE FOR ALL USING (current_tenant_id() IS NULL OR company_id = current_tenant_id()) WITH CHECK (current_tenant_id() IS NULL OR company_id = current_tenant_id());
CREATE POLICY tenant_isolation ON document_chunks        AS PERMISSIVE FOR ALL USING (current_tenant_id() IS NULL OR company_id = current_tenant_id()) WITH CHECK (current_tenant_id() IS NULL OR company_id = current_tenant_id());
CREATE POLICY tenant_isolation ON equipment              AS PERMISSIVE FOR ALL USING (current_tenant_id() IS NULL OR company_id = current_tenant_id()) WITH CHECK (current_tenant_id() IS NULL OR company_id = current_tenant_id());
CREATE POLICY tenant_isolation ON estimates              AS PERMISSIVE FOR ALL USING (current_tenant_id() IS NULL OR company_id = current_tenant_id()) WITH CHECK (current_tenant_id() IS NULL OR company_id = current_tenant_id());
CREATE POLICY tenant_isolation ON estimator_actuals      AS PERMISSIVE FOR ALL USING (current_tenant_id() IS NULL OR company_id = current_tenant_id()) WITH CHECK (current_tenant_id() IS NULL OR company_id = current_tenant_id());
CREATE POLICY tenant_isolation ON file_attachments       AS PERMISSIVE FOR ALL USING (current_tenant_id() IS NULL OR company_id = current_tenant_id()) WITH CHECK (current_tenant_id() IS NULL OR company_id = current_tenant_id());
CREATE POLICY tenant_isolation ON form_submissions       AS PERMISSIVE FOR ALL USING (current_tenant_id() IS NULL OR company_id = current_tenant_id()) WITH CHECK (current_tenant_id() IS NULL OR company_id = current_tenant_id());
CREATE POLICY tenant_isolation ON inspection_alerts      AS PERMISSIVE FOR ALL USING (current_tenant_id() IS NULL OR company_id = current_tenant_id()) WITH CHECK (current_tenant_id() IS NULL OR company_id = current_tenant_id());
CREATE POLICY tenant_isolation ON inspections            AS PERMISSIVE FOR ALL USING (current_tenant_id() IS NULL OR company_id = current_tenant_id()) WITH CHECK (current_tenant_id() IS NULL OR company_id = current_tenant_id());
CREATE POLICY tenant_isolation ON invitations            AS PERMISSIVE FOR ALL USING (current_tenant_id() IS NULL OR company_id = current_tenant_id()) WITH CHECK (current_tenant_id() IS NULL OR company_id = current_tenant_id());
CREATE POLICY tenant_isolation ON invoices               AS PERMISSIVE FOR ALL USING (current_tenant_id() IS NULL OR company_id = current_tenant_id()) WITH CHECK (current_tenant_id() IS NULL OR company_id = current_tenant_id());
CREATE POLICY tenant_isolation ON job_postings           AS PERMISSIVE FOR ALL USING (current_tenant_id() IS NULL OR company_id = current_tenant_id()) WITH CHECK (current_tenant_id() IS NULL OR company_id = current_tenant_id());
CREATE POLICY tenant_isolation ON leads                  AS PERMISSIVE FOR ALL USING (current_tenant_id() IS NULL OR company_id = current_tenant_id()) WITH CHECK (current_tenant_id() IS NULL OR company_id = current_tenant_id());
CREATE POLICY tenant_isolation ON payments               AS PERMISSIVE FOR ALL USING (current_tenant_id() IS NULL OR company_id = current_tenant_id()) WITH CHECK (current_tenant_id() IS NULL OR company_id = current_tenant_id());
CREATE POLICY tenant_isolation ON project_notes          AS PERMISSIVE FOR ALL USING (current_tenant_id() IS NULL OR company_id = current_tenant_id()) WITH CHECK (current_tenant_id() IS NULL OR company_id = current_tenant_id());
CREATE POLICY tenant_isolation ON projects               AS PERMISSIVE FOR ALL USING (current_tenant_id() IS NULL OR company_id = current_tenant_id()) WITH CHECK (current_tenant_id() IS NULL OR company_id = current_tenant_id());
CREATE POLICY tenant_isolation ON provider_tokens        AS PERMISSIVE FOR ALL USING (current_tenant_id() IS NULL OR company_id = current_tenant_id()) WITH CHECK (current_tenant_id() IS NULL OR company_id = current_tenant_id());
CREATE POLICY tenant_isolation ON quickbooks_connections AS PERMISSIVE FOR ALL USING (current_tenant_id() IS NULL OR company_id = current_tenant_id()) WITH CHECK (current_tenant_id() IS NULL OR company_id = current_tenant_id());
CREATE POLICY tenant_isolation ON quotes                 AS PERMISSIVE FOR ALL USING (current_tenant_id() IS NULL OR company_id = current_tenant_id()) WITH CHECK (current_tenant_id() IS NULL OR company_id = current_tenant_id());
CREATE POLICY tenant_isolation ON rfis                   AS PERMISSIVE FOR ALL USING (current_tenant_id() IS NULL OR company_id = current_tenant_id()) WITH CHECK (current_tenant_id() IS NULL OR company_id = current_tenant_id());
CREATE POLICY tenant_isolation ON safety_scans           AS PERMISSIVE FOR ALL USING (current_tenant_id() IS NULL OR company_id = current_tenant_id()) WITH CHECK (current_tenant_id() IS NULL OR company_id = current_tenant_id());
CREATE POLICY tenant_isolation ON scan_hazards           AS PERMISSIVE FOR ALL USING (current_tenant_id() IS NULL OR company_id = current_tenant_id()) WITH CHECK (current_tenant_id() IS NULL OR company_id = current_tenant_id());
CREATE POLICY tenant_isolation ON scans                  AS PERMISSIVE FOR ALL USING (current_tenant_id() IS NULL OR company_id = current_tenant_id()) WITH CHECK (current_tenant_id() IS NULL OR company_id = current_tenant_id());
CREATE POLICY tenant_isolation ON schedule_events        AS PERMISSIVE FOR ALL USING (current_tenant_id() IS NULL OR company_id = current_tenant_id()) WITH CHECK (current_tenant_id() IS NULL OR company_id = current_tenant_id());
CREATE POLICY tenant_isolation ON subscriptions          AS PERMISSIVE FOR ALL USING (current_tenant_id() IS NULL OR company_id = current_tenant_id()) WITH CHECK (current_tenant_id() IS NULL OR company_id = current_tenant_id());
CREATE POLICY tenant_isolation ON time_clock_sessions    AS PERMISSIVE FOR ALL USING (current_tenant_id() IS NULL OR company_id = current_tenant_id()) WITH CHECK (current_tenant_id() IS NULL OR company_id = current_tenant_id());
CREATE POLICY tenant_isolation ON time_entries           AS PERMISSIVE FOR ALL USING (current_tenant_id() IS NULL OR company_id = current_tenant_id()) WITH CHECK (current_tenant_id() IS NULL OR company_id = current_tenant_id());
CREATE POLICY tenant_isolation ON timesheets             AS PERMISSIVE FOR ALL USING (current_tenant_id() IS NULL OR company_id = current_tenant_id()) WITH CHECK (current_tenant_id() IS NULL OR company_id = current_tenant_id());
CREATE POLICY tenant_isolation ON user_memberships       AS PERMISSIVE FOR ALL USING (current_tenant_id() IS NULL OR company_id = current_tenant_id()) WITH CHECK (current_tenant_id() IS NULL OR company_id = current_tenant_id());
CREATE POLICY tenant_isolation ON voice_inspections      AS PERMISSIVE FOR ALL USING (current_tenant_id() IS NULL OR company_id = current_tenant_id()) WITH CHECK (current_tenant_id() IS NULL OR company_id = current_tenant_id());
CREATE POLICY tenant_isolation ON worker_schedules       AS PERMISSIVE FOR ALL USING (current_tenant_id() IS NULL OR company_id = current_tenant_id()) WITH CHECK (current_tenant_id() IS NULL OR company_id = current_tenant_id());

-- companies: tenant key is `id`, not company_id.
CREATE POLICY tenant_isolation ON companies AS PERMISSIVE FOR ALL USING (current_tenant_id() IS NULL OR id = current_tenant_id()) WITH CHECK (current_tenant_id() IS NULL OR id = current_tenant_id());

-- Nullable-global estimator tables: shared system defaults (company_id IS NULL) must remain visible to all tenants.
CREATE POLICY tenant_isolation ON estimator_addons      AS PERMISSIVE FOR ALL USING (current_tenant_id() IS NULL OR company_id IS NULL OR company_id = current_tenant_id()) WITH CHECK (current_tenant_id() IS NULL OR company_id = current_tenant_id());
CREATE POLICY tenant_isolation ON estimator_cost_models AS PERMISSIVE FOR ALL USING (current_tenant_id() IS NULL OR company_id IS NULL OR company_id = current_tenant_id()) WITH CHECK (current_tenant_id() IS NULL OR company_id = current_tenant_id());

-- Indirect tables (no company_id) scoped through their parent project.
CREATE POLICY tenant_isolation ON cost_analyses   AS PERMISSIVE FOR ALL USING (current_tenant_id() IS NULL OR EXISTS (SELECT 1 FROM projects p WHERE p.id = cost_analyses.project_id   AND p.company_id = current_tenant_id())) WITH CHECK (current_tenant_id() IS NULL OR EXISTS (SELECT 1 FROM projects p WHERE p.id = cost_analyses.project_id   AND p.company_id = current_tenant_id()));
CREATE POLICY tenant_isolation ON daily_logs      AS PERMISSIVE FOR ALL USING (current_tenant_id() IS NULL OR EXISTS (SELECT 1 FROM projects p WHERE p.id = daily_logs.project_id      AND p.company_id = current_tenant_id())) WITH CHECK (current_tenant_id() IS NULL OR EXISTS (SELECT 1 FROM projects p WHERE p.id = daily_logs.project_id      AND p.company_id = current_tenant_id()));
CREATE POLICY tenant_isolation ON safety_signoffs AS PERMISSIVE FOR ALL USING (current_tenant_id() IS NULL OR EXISTS (SELECT 1 FROM projects p WHERE p.id = safety_signoffs.project_id AND p.company_id = current_tenant_id())) WITH CHECK (current_tenant_id() IS NULL OR EXISTS (SELECT 1 FROM projects p WHERE p.id = safety_signoffs.project_id AND p.company_id = current_tenant_id()));
CREATE POLICY tenant_isolation ON site_photos     AS PERMISSIVE FOR ALL USING (current_tenant_id() IS NULL OR EXISTS (SELECT 1 FROM projects p WHERE p.id = site_photos.project_id     AND p.company_id = current_tenant_id())) WITH CHECK (current_tenant_id() IS NULL OR EXISTS (SELECT 1 FROM projects p WHERE p.id = site_photos.project_id     AND p.company_id = current_tenant_id()));
CREATE POLICY tenant_isolation ON tasks           AS PERMISSIVE FOR ALL USING (current_tenant_id() IS NULL OR EXISTS (SELECT 1 FROM projects p WHERE p.id = tasks.project_id           AND p.company_id = current_tenant_id())) WITH CHECK (current_tenant_id() IS NULL OR EXISTS (SELECT 1 FROM projects p WHERE p.id = tasks.project_id           AND p.company_id = current_tenant_id()));

COMMIT;


-- ============================================================================
-- SECTION 3 — Enable + force RLS   (STEP 3; same maintenance window as Section 2)
-- ============================================================================
-- FORCE is REQUIRED even after the role change if the app role owns the tables.
-- If app_rls does NOT own the tables (recommended — leave postgres as owner),
-- ENABLE alone suffices for app_rls, but FORCE is harmless and belt-and-braces.
-- Run for every one of the 41 tables:

ALTER TABLE audit_logs             ENABLE ROW LEVEL SECURITY; ALTER TABLE audit_logs             FORCE ROW LEVEL SECURITY;
ALTER TABLE change_orders          ENABLE ROW LEVEL SECURITY; ALTER TABLE change_orders          FORCE ROW LEVEL SECURITY;
ALTER TABLE companies              ENABLE ROW LEVEL SECURITY; ALTER TABLE companies              FORCE ROW LEVEL SECURITY;
ALTER TABLE cost_analyses          ENABLE ROW LEVEL SECURITY; ALTER TABLE cost_analyses          FORCE ROW LEVEL SECURITY;
ALTER TABLE daily_logs             ENABLE ROW LEVEL SECURITY; ALTER TABLE daily_logs             FORCE ROW LEVEL SECURITY;
ALTER TABLE daily_reports          ENABLE ROW LEVEL SECURITY; ALTER TABLE daily_reports          FORCE ROW LEVEL SECURITY;
ALTER TABLE document_chunks        ENABLE ROW LEVEL SECURITY; ALTER TABLE document_chunks        FORCE ROW LEVEL SECURITY;
ALTER TABLE equipment              ENABLE ROW LEVEL SECURITY; ALTER TABLE equipment              FORCE ROW LEVEL SECURITY;
ALTER TABLE estimates              ENABLE ROW LEVEL SECURITY; ALTER TABLE estimates              FORCE ROW LEVEL SECURITY;
ALTER TABLE estimator_actuals      ENABLE ROW LEVEL SECURITY; ALTER TABLE estimator_actuals      FORCE ROW LEVEL SECURITY;
ALTER TABLE estimator_addons       ENABLE ROW LEVEL SECURITY; ALTER TABLE estimator_addons       FORCE ROW LEVEL SECURITY;
ALTER TABLE estimator_cost_models  ENABLE ROW LEVEL SECURITY; ALTER TABLE estimator_cost_models  FORCE ROW LEVEL SECURITY;
ALTER TABLE file_attachments       ENABLE ROW LEVEL SECURITY; ALTER TABLE file_attachments       FORCE ROW LEVEL SECURITY;
ALTER TABLE form_submissions       ENABLE ROW LEVEL SECURITY; ALTER TABLE form_submissions       FORCE ROW LEVEL SECURITY;
ALTER TABLE inspection_alerts      ENABLE ROW LEVEL SECURITY; ALTER TABLE inspection_alerts      FORCE ROW LEVEL SECURITY;
ALTER TABLE inspections            ENABLE ROW LEVEL SECURITY; ALTER TABLE inspections            FORCE ROW LEVEL SECURITY;
ALTER TABLE invitations            ENABLE ROW LEVEL SECURITY; ALTER TABLE invitations            FORCE ROW LEVEL SECURITY;
ALTER TABLE invoices               ENABLE ROW LEVEL SECURITY; ALTER TABLE invoices               FORCE ROW LEVEL SECURITY;
ALTER TABLE job_postings           ENABLE ROW LEVEL SECURITY; ALTER TABLE job_postings           FORCE ROW LEVEL SECURITY;
ALTER TABLE leads                  ENABLE ROW LEVEL SECURITY; ALTER TABLE leads                  FORCE ROW LEVEL SECURITY;
ALTER TABLE payments               ENABLE ROW LEVEL SECURITY; ALTER TABLE payments               FORCE ROW LEVEL SECURITY;
ALTER TABLE project_notes          ENABLE ROW LEVEL SECURITY; ALTER TABLE project_notes          FORCE ROW LEVEL SECURITY;
ALTER TABLE projects               ENABLE ROW LEVEL SECURITY; ALTER TABLE projects               FORCE ROW LEVEL SECURITY;
ALTER TABLE provider_tokens        ENABLE ROW LEVEL SECURITY; ALTER TABLE provider_tokens        FORCE ROW LEVEL SECURITY;
ALTER TABLE quickbooks_connections ENABLE ROW LEVEL SECURITY; ALTER TABLE quickbooks_connections FORCE ROW LEVEL SECURITY;
ALTER TABLE quotes                 ENABLE ROW LEVEL SECURITY; ALTER TABLE quotes                 FORCE ROW LEVEL SECURITY;
ALTER TABLE rfis                   ENABLE ROW LEVEL SECURITY; ALTER TABLE rfis                   FORCE ROW LEVEL SECURITY;
ALTER TABLE safety_scans           ENABLE ROW LEVEL SECURITY; ALTER TABLE safety_scans           FORCE ROW LEVEL SECURITY;
ALTER TABLE safety_signoffs        ENABLE ROW LEVEL SECURITY; ALTER TABLE safety_signoffs        FORCE ROW LEVEL SECURITY;
ALTER TABLE scan_hazards           ENABLE ROW LEVEL SECURITY; ALTER TABLE scan_hazards           FORCE ROW LEVEL SECURITY;
ALTER TABLE scans                  ENABLE ROW LEVEL SECURITY; ALTER TABLE scans                  FORCE ROW LEVEL SECURITY;
ALTER TABLE schedule_events        ENABLE ROW LEVEL SECURITY; ALTER TABLE schedule_events        FORCE ROW LEVEL SECURITY;
ALTER TABLE site_photos            ENABLE ROW LEVEL SECURITY; ALTER TABLE site_photos            FORCE ROW LEVEL SECURITY;
ALTER TABLE subscriptions          ENABLE ROW LEVEL SECURITY; ALTER TABLE subscriptions          FORCE ROW LEVEL SECURITY;
ALTER TABLE tasks                  ENABLE ROW LEVEL SECURITY; ALTER TABLE tasks                  FORCE ROW LEVEL SECURITY;
ALTER TABLE time_clock_sessions    ENABLE ROW LEVEL SECURITY; ALTER TABLE time_clock_sessions    FORCE ROW LEVEL SECURITY;
ALTER TABLE time_entries           ENABLE ROW LEVEL SECURITY; ALTER TABLE time_entries           FORCE ROW LEVEL SECURITY;
ALTER TABLE timesheets             ENABLE ROW LEVEL SECURITY; ALTER TABLE timesheets             FORCE ROW LEVEL SECURITY;
ALTER TABLE user_memberships       ENABLE ROW LEVEL SECURITY; ALTER TABLE user_memberships       FORCE ROW LEVEL SECURITY;
ALTER TABLE voice_inspections      ENABLE ROW LEVEL SECURITY; ALTER TABLE voice_inspections      FORCE ROW LEVEL SECURITY;
ALTER TABLE worker_schedules       ENABLE ROW LEVEL SECURITY; ALTER TABLE worker_schedules       FORCE ROW LEVEL SECURITY;

-- Also apply the same ENABLE/FORCE + current_tenant_id() fix to the 15 tables
-- that already show RLS "enabled" but are (a) not enforced for a superuser and
-- (b) mostly not FORCEd — and fix `contacts`, whose policy uses the dead
-- app_company_id() GUC (rewrite it to current_tenant_id() like the others).

-- And add policies + enable/force for the 33 zero-policy tables that carry
-- company_id (expenses, proposals, capa_tickets, cor_audit_trail,
-- worker_credentials, psi_*, inventory_*, subcontractor*, permits, …) — same
-- pattern. Those are omitted here only because they need a policy authored from
-- scratch; do them in the same window. See docs/audit/03-security.md V1.


-- ============================================================================
-- SECTION 4 — Post-cutover verification (run AS the app_rls role, not postgres)
-- ============================================================================
-- SET ROLE app_rls;  -- or connect with the app_rls DATABASE_URL
-- SELECT set_config('app.company_id', '1', false);
-- SELECT count(*) FROM projects;                 -- should show only company 1's rows
-- SELECT count(*) FROM projects WHERE company_id <> 1;  -- should be 0
-- SELECT set_config('app.company_id', '', false);
-- SELECT count(*) FROM projects;                 -- fallback: all rows (cron/public path)
-- RESET ROLE;
