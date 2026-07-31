-- Project Communications Hub (Phase 4 — Document Library Integration).
-- Hand-authored for the same reason 0076/0078/0079/0080 were. Apply directly with `psql -f`.
--
-- project_documents predates the comms-hub tenant-isolation convention: it had
-- no direct company_id column, and its only RLS policy ("company_isolation",
-- using app_company_id()/app.current_company_id) was never actually enforced —
-- RLS was disabled on the table, and nothing in the codebase sets
-- app.current_company_id (that GUC is dead; requireTenantCtx sets app.company_id,
-- read by current_tenant_id(), which is what every other comms-hub table uses).
-- Confirmed live via psql before writing this migration.

ALTER TABLE "project_documents" ADD COLUMN "company_id" integer;--> statement-breakpoint
UPDATE "project_documents" pd SET "company_id" = p."company_id"
  FROM "projects" p WHERE p."id" = pd."project_id" AND pd."company_id" IS NULL;--> statement-breakpoint
ALTER TABLE "project_documents" ALTER COLUMN "company_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "project_documents" ADD CONSTRAINT "project_documents_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_project_documents_company" ON "project_documents" USING btree ("company_id");--> statement-breakpoint

ALTER TABLE "project_documents" ADD COLUMN "source_email_attachment_id" integer;--> statement-breakpoint
ALTER TABLE "project_documents" ADD CONSTRAINT "project_documents_source_email_attachment_id_email_attachments_id_fk" FOREIGN KEY ("source_email_attachment_id") REFERENCES "public"."email_attachments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_project_documents_source_attachment" ON "project_documents" USING btree ("source_email_attachment_id");--> statement-breakpoint

-- uploaded_by_user_id: relax to nullable (system-triggered attachment
-- promotions have no acting user) and change its FK to ON DELETE SET NULL
-- (was implicit ON DELETE NO ACTION, which would have blocked user deletion).
ALTER TABLE "project_documents" ALTER COLUMN "uploaded_by_user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "project_documents" DROP CONSTRAINT "project_documents_uploaded_by_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "project_documents" ADD CONSTRAINT "project_documents_uploaded_by_user_id_users_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint

-- Replace the dead legacy policy with the standard comms-hub tenant_isolation
-- policy and actually enable RLS (previously disabled, so the legacy policy
-- was never enforced anyway).
DROP POLICY IF EXISTS "company_isolation" ON "project_documents";--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "project_documents" AS PERMISSIVE FOR ALL TO public USING (current_tenant_id() IS NULL OR "project_documents"."company_id" = current_tenant_id());--> statement-breakpoint
ALTER TABLE "project_documents" ENABLE ROW LEVEL SECURITY;
