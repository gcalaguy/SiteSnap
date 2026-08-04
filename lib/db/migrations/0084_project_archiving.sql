-- Project archiving. Hand-authored for the same reason 0076/0078/0079/0080/
-- 0081/0082/0083 were (journal drift). Apply directly with `psql -f`.
ALTER TABLE "projects" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint

CREATE INDEX "idx_projects_company_archived" ON "projects" USING btree ("company_id","archived_at");
