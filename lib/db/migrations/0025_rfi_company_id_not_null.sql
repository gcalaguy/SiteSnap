-- Fix: rfis.company_id was added as nullable in migration 0022 and the insert
-- code never set it, so all RFIs created after 0022 have company_id = NULL.
-- This migration backfills those rows and enforces NOT NULL.

-- Re-run the same backfill pattern from 0022 — safe to run multiple times,
-- the WHERE clause only touches rows that are still NULL.
UPDATE "rfis" r
SET "company_id" = p."company_id"
FROM "projects" p
WHERE r."project_id" = p."id"
  AND r."company_id" IS NULL;

-- Now that all rows have a value, add the NOT NULL constraint.
ALTER TABLE "rfis" ALTER COLUMN "company_id" SET NOT NULL;
