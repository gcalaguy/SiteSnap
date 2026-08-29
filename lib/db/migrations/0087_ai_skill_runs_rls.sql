DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ai_skill_runs' AND policyname = 'tenant_isolation') THEN
    CREATE POLICY tenant_isolation ON ai_skill_runs
      AS PERMISSIVE
      USING (current_tenant_id() IS NULL OR company_id = current_tenant_id());
  END IF;
END $$;

ALTER TABLE ai_skill_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_skill_runs FORCE ROW LEVEL SECURITY;
