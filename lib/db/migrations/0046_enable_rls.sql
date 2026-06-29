-- Enable Row Level Security for core tenant tables.
--
-- WHY PERMISSIVE + NULL FALLBACK (not RESTRICTIVE):
--   Restricting to `company_id = current_tenant_id()` when the GUC is unset
--   would hide all rows from code paths that don't go through withTenantCtx()
--   (cron jobs, super-admin routes, migrations). Using a PERMISSIVE policy with
--   `current_tenant_id() IS NULL OR company_id = <id>` means:
--     • No tenant context set  → all rows visible (existing behaviour, safe for
--       admin paths and cron — they already apply their own WHERE clauses).
--     • Tenant context set via withTenantCtx() → only matching rows visible.
--   This lets us enable RLS today and migrate routes incrementally rather than
--   in a single big-bang cutover.
--
-- HOW IT WORKS:
--   Routes that use requireTenantCtx middleware (projects, invoices, quotes,
--   timesheets) run their SQL inside a transaction where
--   `SET LOCAL app.company_id = <id>` is active. The `current_tenant_id()`
--   helper function (created in 0029) reads that GUC and returns the integer.
--   Outside a withTenantCtx() call the GUC is unset, returning NULL, and the
--   `IS NULL` branch of the policy lets the query through unchanged.
--
-- NEXT STEPS (full enforcement):
--   Once all tenant-scoped routes use requireTenantCtx, drop the IS NULL
--   fallback and switch to `AS RESTRICTIVE` to prevent any bypass.

-- ── Alter existing policies from RESTRICTIVE to PERMISSIVE with NULL fallback ─

DO $$
BEGIN
  -- projects
  IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'projects' AND policyname = 'tenant_isolation') THEN
    ALTER POLICY tenant_isolation ON projects
      USING (current_tenant_id() IS NULL OR company_id = current_tenant_id());
  END IF;

  -- invoices
  IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'invoices' AND policyname = 'tenant_isolation') THEN
    ALTER POLICY tenant_isolation ON invoices
      USING (current_tenant_id() IS NULL OR company_id = current_tenant_id());
  END IF;

  -- quotes
  IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'quotes' AND policyname = 'tenant_isolation') THEN
    ALTER POLICY tenant_isolation ON quotes
      USING (current_tenant_id() IS NULL OR company_id = current_tenant_id());
  END IF;

  -- timesheets
  IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'timesheets' AND policyname = 'tenant_isolation') THEN
    ALTER POLICY tenant_isolation ON timesheets
      USING (current_tenant_id() IS NULL OR company_id = current_tenant_id());
  END IF;
END
$$;

-- ── Activate RLS on each table ────────────────────────────────────────────────
-- ENABLE without FORCE so that the database owner role (used by migrations and
-- super-admin tooling) can still bypass RLS when needed. FORCE can be added
-- once all application paths have been migrated to withTenantCtx().

ALTER TABLE projects   ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices   ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotes     ENABLE ROW LEVEL SECURITY;
ALTER TABLE timesheets ENABLE ROW LEVEL SECURITY;
