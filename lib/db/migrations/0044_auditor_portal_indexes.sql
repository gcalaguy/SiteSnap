CREATE INDEX "idx_cor_audit_trail_company_created" ON "cor_audit_trail" USING btree ("company_id","created_at");
--> statement-breakpoint
CREATE INDEX "idx_cor_voice_logs_company_created" ON "cor_voice_action_logs" USING btree ("company_id","created_at");
--> statement-breakpoint
CREATE INDEX "idx_inspections_company_created" ON "inspections" USING btree ("company_id","created_at");
--> statement-breakpoint
CREATE INDEX "idx_inspections_project_status_created" ON "inspections" USING btree ("project_id","status","created_at");
