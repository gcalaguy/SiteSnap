DO $$ BEGIN
  CREATE TYPE compliance_status AS ENUM ('compliant', 'non_compliant', 'warning');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS coi_expiration DATE,
  ADD COLUMN IF NOT EXISTS workers_comp_clearance_expiration DATE,
  ADD COLUMN IF NOT EXISTS compliance_status compliance_status NOT NULL DEFAULT 'compliant';
