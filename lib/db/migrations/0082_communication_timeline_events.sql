-- Project Communications Hub (Phase 4 — AI Timeline).
-- Hand-authored for the same reason 0076/0078/0079/0080/0081 were. Apply directly with `psql -f`.
CREATE TYPE "public"."communication_timeline_event_type" AS ENUM('permit_submitted', 'permit_approved', 'permit_rejected', 'inspection_scheduled', 'inspection_passed', 'inspection_failed', 'change_order_received', 'change_order_approved', 'invoice_sent', 'invoice_paid', 'payment_requested', 'quote_sent', 'quote_accepted', 'other');--> statement-breakpoint

CREATE TABLE "communication_timeline_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"project_id" integer,
	"thread_id" integer NOT NULL,
	"message_id" integer NOT NULL,
	"event_type" "communication_timeline_event_type" NOT NULL,
	"event_date" timestamp with time zone,
	"description" text NOT NULL,
	"confidence" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "communication_timeline_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

ALTER TABLE "communication_timeline_events" ADD CONSTRAINT "communication_timeline_events_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_timeline_events" ADD CONSTRAINT "communication_timeline_events_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_timeline_events" ADD CONSTRAINT "communication_timeline_events_thread_id_email_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."email_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_timeline_events" ADD CONSTRAINT "communication_timeline_events_message_id_email_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."email_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

CREATE INDEX "idx_communication_timeline_events_company" ON "communication_timeline_events" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_communication_timeline_events_project" ON "communication_timeline_events" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_communication_timeline_events_thread" ON "communication_timeline_events" USING btree ("thread_id");--> statement-breakpoint
CREATE INDEX "idx_communication_timeline_events_message" ON "communication_timeline_events" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "idx_communication_timeline_events_event_date" ON "communication_timeline_events" USING btree ("event_date");--> statement-breakpoint

CREATE POLICY "tenant_isolation" ON "communication_timeline_events" AS PERMISSIVE FOR ALL TO public USING (current_tenant_id() IS NULL OR "communication_timeline_events"."company_id" = current_tenant_id());
