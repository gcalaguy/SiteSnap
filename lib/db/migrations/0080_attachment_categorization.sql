-- Project Communications Hub (Phase 4 — Attachment Categorization).
-- Hand-authored for the same reason 0076/0078/0079 were: drizzle-kit push/generate
-- pulls in unrelated schema drift already present in this DB. Apply directly with `psql -f`.
CREATE TYPE "public"."email_attachment_category" AS ENUM('pdf', 'word', 'excel', 'image', 'cad', 'blueprint', 'quote', 'invoice', 'inspection_report', 'permit', 'other');--> statement-breakpoint
CREATE TYPE "public"."email_attachment_category_source" AS ENUM('heuristic', 'ai_entity_bias', 'manual');--> statement-breakpoint

ALTER TABLE "email_attachments" ADD COLUMN "category" "email_attachment_category";--> statement-breakpoint
ALTER TABLE "email_attachments" ADD COLUMN "category_source" "email_attachment_category_source";--> statement-breakpoint
CREATE INDEX "idx_email_attachments_category" ON "email_attachments" USING btree ("category");--> statement-breakpoint

-- Backfill existing rows heuristically (filename/content-type only — mirrors
-- ATTACHMENT_TYPE_SQL in repositories/emailIntegrations.ts) so old attachments
-- aren't left uncategorized. New rows are classified at ingest time going
-- forward by attachmentClassifier.ts.
UPDATE "email_attachments" SET
  "category" = (CASE
    WHEN "content_type" = 'application/pdf' OR "filename" ILIKE '%.pdf' THEN 'pdf'
    WHEN "content_type" IN ('application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
      OR "filename" ILIKE '%.doc' OR "filename" ILIKE '%.docx' THEN 'word'
    WHEN "content_type" IN ('application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      OR "filename" ILIKE '%.xls' OR "filename" ILIKE '%.xlsx' THEN 'excel'
    WHEN "content_type" ILIKE 'image/%' THEN 'image'
    WHEN "filename" ILIKE '%.dwg' OR "filename" ILIKE '%.dxf' OR "content_type" ILIKE '%dwg%' THEN 'cad'
    WHEN "filename" ILIKE '%blueprint%' OR "filename" ILIKE '%plan%' THEN 'blueprint'
    ELSE 'other'
  END)::email_attachment_category,
  "category_source" = 'heuristic'::email_attachment_category_source
WHERE "category" IS NULL;
