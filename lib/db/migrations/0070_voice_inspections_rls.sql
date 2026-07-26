DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'voice_inspections' AND policyname = 'tenant_isolation') THEN
    CREATE POLICY tenant_isolation ON voice_inspections
      AS PERMISSIVE
      USING (current_tenant_id() IS NULL OR company_id = current_tenant_id());
  END IF;
END $$;

ALTER TABLE voice_inspections ENABLE ROW LEVEL SECURITY;
ALTER TABLE voice_inspections FORCE ROW LEVEL SECURITY;
