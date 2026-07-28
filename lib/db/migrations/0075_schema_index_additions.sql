CREATE INDEX "idx_submission_comments_submission_id" ON "submission_comments" USING btree ("submission_id");
--> statement-breakpoint
CREATE INDEX "idx_tradehub_messages_conversation_id" ON "tradehub_messages" USING btree ("conversation_id");
--> statement-breakpoint
CREATE INDEX "idx_schedule_event_assignees_event_id" ON "schedule_event_assignees" USING btree ("event_id");
--> statement-breakpoint
CREATE INDEX "idx_schedule_event_assignees_resource" ON "schedule_event_assignees" USING btree ("resource_type","resource_id");
