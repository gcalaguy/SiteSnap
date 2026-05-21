CREATE TYPE compliance_status AS ENUM ('compliant', 'non_compliant', 'warning');

ALTER TABLE contacts
  ADD COLUMN coi_expiration DATE,
  ADD COLUMN workers_comp_clearance_expiration DATE,
  ADD COLUMN compliance_status compliance_status NOT NULL DEFAULT 'compliant';
