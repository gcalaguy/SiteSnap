-- document_chunks was filtered by company_id at the query layer (see documents.ts
-- vectorSearch/fullTextSearch) but had no index backing that column at all.
CREATE INDEX "document_chunks_company_idx" ON "document_chunks" USING btree ("company_id");
--> statement-breakpoint

-- daily_logs, site_photos, safety_signoffs, and media_hub_photos got a project_id
-- index in 0047, but every read path filters by project_id AND orders/paginates by
-- created_at together (e.g. audit exports). Add the composite index each of those
-- queries actually needs so they don't fall back to an in-memory sort.
CREATE INDEX "idx_daily_logs_project_created" ON "daily_logs" USING btree ("project_id","created_at");
--> statement-breakpoint
CREATE INDEX "idx_site_photos_project_created" ON "site_photos" USING btree ("project_id","created_at");
--> statement-breakpoint
CREATE INDEX "idx_safety_signoffs_project_created" ON "safety_signoffs" USING btree ("project_id","created_at");
--> statement-breakpoint
CREATE INDEX "idx_media_hub_photos_project_created" ON "media_hub_photos" USING btree ("project_id","created_at");
