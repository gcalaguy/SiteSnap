-- P0 security fix: add claim_token to companies table
-- Used by the /companies/:companyId/claim endpoint to verify the caller
-- was given this token by the super-admin who provisioned the tenant.
ALTER TABLE "companies"
  ADD COLUMN IF NOT EXISTS "claim_token" text;
