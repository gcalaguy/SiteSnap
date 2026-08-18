-- Mobile app query-performance audit: the mobile app's hottest quote query is
-- `WHERE project_id = ? AND company_id = ?`, and builder estimates are always
-- looked up / joined by project and estimate id — none of these had an index.
-- Postgres does not auto-index foreign key columns, so these were full-scanning.

CREATE INDEX IF NOT EXISTS "idx_quotes_project_id" ON "quotes" ("project_id");
CREATE INDEX IF NOT EXISTS "idx_builder_estimates_project_id" ON "builder_estimates" ("project_id");
CREATE INDEX IF NOT EXISTS "idx_builder_estimate_items_estimate_id" ON "builder_estimate_items" ("estimate_id");
