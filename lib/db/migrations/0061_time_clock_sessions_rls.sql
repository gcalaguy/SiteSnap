DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'time_clock_sessions' AND policyname = 'tenant_isolation') THEN
    CREATE POLICY tenant_isolation ON time_clock_sessions
      AS PERMISSIVE
      USING (current_tenant_id() IS NULL OR company_id = current_tenant_id());
  END IF;
END $$;

ALTER TABLE time_clock_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_clock_sessions FORCE ROW LEVEL SECURITY;

-- Enforce "one active session per worker" at the DB level (mirrors the
-- partial-unique-index technique used for timesheets in migration 0018).
CREATE UNIQUE INDEX IF NOT EXISTS idx_time_clock_sessions_one_active_per_user
  ON time_clock_sessions (company_id, user_id)
  WHERE status = 'active';
