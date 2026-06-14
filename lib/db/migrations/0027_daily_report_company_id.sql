-- HIGH-005: daily_reports table was missing company_id, forcing every query
-- that needs tenant isolation to JOIN through projects. Adds the column,
-- backfills it from the parent project, and locks it NOT NULL so no future
-- report can exist without a tenant association.

ALTER TABLE "daily_reports"
  ADD COLUMN IF NOT EXISTS "company_id" integer REFERENCES "companies"("id") ON DELETE CASCADE;

UPDATE "daily_reports" dr
SET "company_id" = p."company_id"
FROM "projects" p
WHERE dr."project_id" = p."id"
  AND dr."company_id" IS NULL;

ALTER TABLE "daily_reports" ALTER COLUMN "company_id" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "idx_daily_reports_company_id"
  ON "daily_reports" ("company_id");
