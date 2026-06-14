-- PHASE 4 ACTIVATION REQUIRED — read before running
--
-- This migration prepares RLS policies for core tenant tables. The policies are
-- created but ENABLE ROW LEVEL SECURITY is intentionally left commented out.
--
-- WHY: Activating RLS with `current_setting('app.company_id', true)` requires
-- the application to call `SET LOCAL app.company_id = <id>` inside a transaction
-- before every tenant-scoped query. With a connection pool this means wrapping
-- every authenticated request in a db.transaction() — an architectural change
-- that is scoped to Phase 4.
--
-- TO ENABLE in Phase 4:
--   1. Implement withTenantCtx() helper (see lib/db/src/tenantCtx.ts)
--   2. Wrap requireCompany middleware in a transaction that sets the GUC
--   3. Uncomment the ENABLE ROW LEVEL SECURITY / FORCE lines below
--   4. Run this migration
--
-- The policies below are RESTRICTIVE: when app.company_id is set, only rows
-- matching that value are visible. When not set, the setting returns NULL and
-- `company_id = NULL` is never true — all rows are hidden. This ensures the
-- policies cannot be trivially bypassed by omitting the SET call.

-- ── Create the GUC namespace (idempotent) ─────────────────────────────────────
-- This is a no-op on Postgres ≥15 where custom GUCs are accepted without prior
-- registration. On older versions you may need to add app.company_id to
-- postgresql.conf under custom_variable_classes.

-- ── Policy helper function ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION current_tenant_id() RETURNS integer AS $$
  SELECT NULLIF(current_setting('app.company_id', true), '')::integer;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ── Policies (created now, enforcement activated in Phase 4) ─────────────────

DO $$
BEGIN
  -- projects
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'projects' AND policyname = 'tenant_isolation') THEN
    CREATE POLICY tenant_isolation ON projects
      AS RESTRICTIVE
      USING (company_id = current_tenant_id());
  END IF;

  -- invoices
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'invoices' AND policyname = 'tenant_isolation') THEN
    CREATE POLICY tenant_isolation ON invoices
      AS RESTRICTIVE
      USING (company_id = current_tenant_id());
  END IF;

  -- quotes
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'quotes' AND policyname = 'tenant_isolation') THEN
    CREATE POLICY tenant_isolation ON quotes
      AS RESTRICTIVE
      USING (company_id = current_tenant_id());
  END IF;

  -- timesheets
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'timesheets' AND policyname = 'tenant_isolation') THEN
    CREATE POLICY tenant_isolation ON timesheets
      AS RESTRICTIVE
      USING (company_id = current_tenant_id());
  END IF;

  -- project_documents intentionally omitted: table has no company_id column;
  -- tenant isolation goes through project_id → projects.company_id join.
END
$$;

-- ── UNCOMMENT BLOCK BELOW IN PHASE 4 ONLY ────────────────────────────────────
-- ALTER TABLE projects         ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE projects         FORCE ROW LEVEL SECURITY;
-- ALTER TABLE invoices         ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE invoices         FORCE ROW LEVEL SECURITY;
-- ALTER TABLE quotes           ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE quotes           FORCE ROW LEVEL SECURITY;
-- ALTER TABLE timesheets       ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE timesheets       FORCE ROW LEVEL SECURITY;
-- ALTER TABLE project_documents ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE project_documents FORCE ROW LEVEL SECURITY;
