-- Add ON DELETE CASCADE to proposals.company_id, file_attachments.company_id,
-- and estimator_actuals.company_id so tenant deletion never stalls on these
-- tables. Previously they had RESTRICT (the Postgres default), causing the
-- DELETE FROM companies transaction to fail with an FK violation whenever the
-- tenant had proposals, file attachments, or estimator actuals.  The rows are
-- pure tenant-owned data and should be removed with the company.

ALTER TABLE "proposals"
  DROP CONSTRAINT IF EXISTS "proposals_company_id_companies_id_fk",
  ADD CONSTRAINT "proposals_company_id_companies_id_fk"
    FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE;

ALTER TABLE "file_attachments"
  DROP CONSTRAINT IF EXISTS "file_attachments_company_id_companies_id_fk",
  ADD CONSTRAINT "file_attachments_company_id_companies_id_fk"
    FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE;

ALTER TABLE "estimator_actuals"
  DROP CONSTRAINT IF EXISTS "estimator_actuals_company_id_companies_id_fk",
  ADD CONSTRAINT "estimator_actuals_company_id_companies_id_fk"
    FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE;
