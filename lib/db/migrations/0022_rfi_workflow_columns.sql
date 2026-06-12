-- RFI Workflow: add companyId, blueprintCoordinates, imageUrl columns
-- and extend rfi_status enum with approved/rejected for the standalone workflow.

ALTER TYPE "rfi_status" ADD VALUE IF NOT EXISTS 'approved';
ALTER TYPE "rfi_status" ADD VALUE IF NOT EXISTS 'rejected';

ALTER TABLE "rfis"
  ADD COLUMN IF NOT EXISTS "company_id"             integer REFERENCES "companies"("id") ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS "blueprint_coordinates"  text,
  ADD COLUMN IF NOT EXISTS "image_url"              text;

-- Back-fill company_id from the parent project for existing rows
UPDATE "rfis" r
SET "company_id" = p."company_id"
FROM "projects" p
WHERE r."project_id" = p."id"
  AND r."company_id" IS NULL;
