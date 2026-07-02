-- daily_logs, site_photos, safety_signoffs, and media_hub_photos had no index at
-- all (not even on their project_id FK), despite being listed/joined on every
-- project-detail page load. Add the missing project_id index on each.
CREATE INDEX "idx_daily_logs_project_id" ON "daily_logs" USING btree ("project_id");
--> statement-breakpoint
CREATE INDEX "idx_site_photos_project_id" ON "site_photos" USING btree ("project_id");
--> statement-breakpoint
CREATE INDEX "idx_safety_signoffs_project_id" ON "safety_signoffs" USING btree ("project_id");
--> statement-breakpoint
CREATE INDEX "idx_media_hub_photos_project_id" ON "media_hub_photos" USING btree ("project_id");
