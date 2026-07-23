CREATE TYPE "public"."time_clock_session_status" AS ENUM('active', 'completed');--> statement-breakpoint
CREATE TABLE "time_clock_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"project_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"clocked_in_by_user_id" integer NOT NULL,
	"clocked_out_by_user_id" integer,
	"date" date NOT NULL,
	"clock_in_time" timestamp with time zone DEFAULT now() NOT NULL,
	"clock_out_time" timestamp with time zone,
	"clock_in_notes" text,
	"clock_out_notes" text,
	"status" "time_clock_session_status" DEFAULT 'active' NOT NULL,
	"time_entry_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "time_clock_sessions" ADD CONSTRAINT "time_clock_sessions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_clock_sessions" ADD CONSTRAINT "time_clock_sessions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_clock_sessions" ADD CONSTRAINT "time_clock_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_clock_sessions" ADD CONSTRAINT "time_clock_sessions_clocked_in_by_user_id_users_id_fk" FOREIGN KEY ("clocked_in_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_clock_sessions" ADD CONSTRAINT "time_clock_sessions_clocked_out_by_user_id_users_id_fk" FOREIGN KEY ("clocked_out_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_clock_sessions" ADD CONSTRAINT "time_clock_sessions_time_entry_id_time_entries_id_fk" FOREIGN KEY ("time_entry_id") REFERENCES "public"."time_entries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_time_clock_sessions_company_id" ON "time_clock_sessions" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_time_clock_sessions_user_id" ON "time_clock_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_time_clock_sessions_project_id" ON "time_clock_sessions" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_time_clock_sessions_status" ON "time_clock_sessions" USING btree ("status");
