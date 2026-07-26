DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'safety_scans' AND policyname = 'tenant_isolation') THEN
    CREATE POLICY tenant_isolation ON safety_scans
      AS PERMISSIVE
      USING (current_tenant_id() IS NULL OR company_id = current_tenant_id());
  END IF;
END $$;

ALTER TABLE safety_scans ENABLE ROW LEVEL SECURITY;
ALTER TABLE safety_scans FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'scan_hazards' AND policyname = 'tenant_isolation') THEN
    CREATE POLICY tenant_isolation ON scan_hazards
      AS PERMISSIVE
      USING (current_tenant_id() IS NULL OR company_id = current_tenant_id());
  END IF;
END $$;

ALTER TABLE scan_hazards ENABLE ROW LEVEL SECURITY;
ALTER TABLE scan_hazards FORCE ROW LEVEL SECURITY;
