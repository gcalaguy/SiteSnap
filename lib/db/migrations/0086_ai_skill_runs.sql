CREATE TYPE "public"."ai_skill_run_status" AS ENUM('draft', 'pending_approval', 'approved', 'rejected');--> statement-breakpoint
CREATE TABLE "ai_skill_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"project_id" integer NOT NULL,
	"user_id" integer,
	"skill_key" text NOT NULL,
	"inputs" jsonb NOT NULL,
	"output_text" text,
	"output_json" jsonb,
	"status" "ai_skill_run_status" DEFAULT 'draft' NOT NULL,
	"approved_by_user_id" integer,
	"approved_at" timestamp with time zone,
	"rejection_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "ai_skill_runs" ADD CONSTRAINT "ai_skill_runs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_skill_runs" ADD CONSTRAINT "ai_skill_runs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_skill_runs" ADD CONSTRAINT "ai_skill_runs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_skill_runs" ADD CONSTRAINT "ai_skill_runs_approved_by_user_id_users_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_ai_skill_runs_company_project" ON "ai_skill_runs" USING btree ("company_id","project_id");--> statement-breakpoint
CREATE INDEX "idx_ai_skill_runs_company_skill" ON "ai_skill_runs" USING btree ("company_id","skill_key");--> statement-breakpoint
CREATE INDEX "idx_ai_skill_runs_company_created" ON "ai_skill_runs" USING btree ("company_id","created_at");
