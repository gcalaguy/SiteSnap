-- Project Communications Hub (Phase 3 — AI Communications Intelligence).
-- Hand-authored for the same reason 0076/0078 were: drizzle-kit push/generate
-- pulls in unrelated schema drift already present in this DB (quotes.public_token
-- NOT NULL — see 0076's header). Apply this file directly with `psql -f`.
CREATE TYPE "public"."project_signal_type" AS ENUM('sender_email', 'sender_domain', 'subject_keyword');--> statement-breakpoint

ALTER TABLE "email_messages" ADD COLUMN "ai_trade" "subcontractor_trade_type";--> statement-breakpoint
ALTER TABLE "email_messages" ADD COLUMN "ai_summary" text;--> statement-breakpoint
ALTER TABLE "email_messages" ADD COLUMN "ai_entities" jsonb;--> statement-breakpoint
ALTER TABLE "email_messages" ADD COLUMN "ai_extracted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "email_messages" ADD COLUMN "ai_extraction_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "email_messages" ADD COLUMN "ai_extraction_error" text;--> statement-breakpoint
CREATE INDEX "idx_email_messages_company_trade" ON "email_messages" USING btree ("company_id","ai_trade");--> statement-breakpoint
CREATE INDEX "idx_email_messages_extracted_at" ON "email_messages" USING btree ("ai_extracted_at");--> statement-breakpoint

-- Backfill decision (confirmed with user): extraction only processes emails
-- synced from now on. Stamp every pre-existing message as already-handled so
-- the extraction cron job's `WHERE ai_extracted_at IS NULL` filter only ever
-- picks up genuinely new messages.
UPDATE "email_messages" SET "ai_extracted_at" = now() WHERE "ai_extracted_at" IS NULL;--> statement-breakpoint

CREATE TABLE "project_signal_weights" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"project_id" integer NOT NULL,
	"signal_type" "project_signal_type" NOT NULL,
	"signal_value" text NOT NULL,
	"weight" integer DEFAULT 1 NOT NULL,
	"last_reinforced_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_signal_weights" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "email_thread_corrections" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"thread_id" integer NOT NULL,
	"prior_project_id" integer,
	"prior_suggested_project_id" integer,
	"prior_match_source" "email_match_source",
	"prior_match_confidence" integer,
	"corrected_project_id" integer NOT NULL,
	"corrected_by_user_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "email_thread_corrections" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

ALTER TABLE "project_signal_weights" ADD CONSTRAINT "project_signal_weights_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_signal_weights" ADD CONSTRAINT "project_signal_weights_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_thread_corrections" ADD CONSTRAINT "email_thread_corrections_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_thread_corrections" ADD CONSTRAINT "email_thread_corrections_thread_id_email_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."email_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_thread_corrections" ADD CONSTRAINT "email_thread_corrections_corrected_by_user_id_users_id_fk" FOREIGN KEY ("corrected_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint

CREATE INDEX "idx_project_signal_weights_company" ON "project_signal_weights" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_project_signal_weights_lookup" ON "project_signal_weights" USING btree ("company_id","signal_type","signal_value");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_project_signal_weights_project_signal" ON "project_signal_weights" USING btree ("company_id","project_id","signal_type","signal_value");--> statement-breakpoint
CREATE INDEX "idx_email_thread_corrections_company" ON "email_thread_corrections" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_email_thread_corrections_thread" ON "email_thread_corrections" USING btree ("thread_id");--> statement-breakpoint

CREATE POLICY "tenant_isolation" ON "project_signal_weights" AS PERMISSIVE FOR ALL TO public USING (current_tenant_id() IS NULL OR "project_signal_weights"."company_id" = current_tenant_id());--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "email_thread_corrections" AS PERMISSIVE FOR ALL TO public USING (current_tenant_id() IS NULL OR "email_thread_corrections"."company_id" = current_tenant_id());
