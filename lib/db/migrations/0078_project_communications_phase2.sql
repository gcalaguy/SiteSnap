-- Project Communications Hub (Phase 2 — Intelligent Project Organization).
-- Hand-authored for the same reason 0076 was: drizzle-kit push/generate pulls
-- in unrelated schema drift already present in this DB (confirmed again while
-- applying this migration — see quotes.public_token NOT NULL drift noted in
-- 0076's header). Apply this file directly with `psql -f`, not drizzle-kit.
CREATE TYPE "public"."email_triage_status" AS ENUM('unassigned', 'suggested', 'assigned', 'archived', 'ignored', 'merged');--> statement-breakpoint
CREATE TYPE "public"."email_match_source" AS ENUM('engine', 'rule', 'manual');--> statement-breakpoint
CREATE TYPE "public"."email_priority" AS ENUM('low', 'medium', 'high', 'urgent');--> statement-breakpoint
CREATE TYPE "public"."filing_rule_condition_logic" AS ENUM('AND', 'OR');--> statement-breakpoint

ALTER TABLE "email_threads" ADD COLUMN "triage_status" "email_triage_status" DEFAULT 'unassigned' NOT NULL;--> statement-breakpoint
ALTER TABLE "email_threads" ADD COLUMN "suggested_project_id" integer;--> statement-breakpoint
ALTER TABLE "email_threads" ADD COLUMN "match_confidence" integer;--> statement-breakpoint
ALTER TABLE "email_threads" ADD COLUMN "match_reasons" jsonb;--> statement-breakpoint
ALTER TABLE "email_threads" ADD COLUMN "match_source" "email_match_source";--> statement-breakpoint
ALTER TABLE "email_threads" ADD COLUMN "category" text;--> statement-breakpoint
ALTER TABLE "email_threads" ADD COLUMN "flagged" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "email_threads" ADD COLUMN "priority" "email_priority" DEFAULT 'medium' NOT NULL;--> statement-breakpoint
ALTER TABLE "email_threads" ADD COLUMN "merged_into_thread_id" integer;--> statement-breakpoint
ALTER TABLE "email_threads" ADD CONSTRAINT "email_threads_suggested_project_id_projects_id_fk" FOREIGN KEY ("suggested_project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_threads" ADD CONSTRAINT "email_threads_merged_into_thread_id_email_threads_id_fk" FOREIGN KEY ("merged_into_thread_id") REFERENCES "public"."email_threads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_email_threads_triage_status" ON "email_threads" USING btree ("company_id","triage_status");--> statement-breakpoint

ALTER TABLE "permits" ADD COLUMN "permit_number" text;--> statement-breakpoint
CREATE INDEX "idx_permits_permit_number" ON "permits" USING btree ("permit_number");--> statement-breakpoint

CREATE TABLE "project_match_keywords" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"project_id" integer NOT NULL,
	"keyword" text NOT NULL,
	"created_by_user_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_match_keywords" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "email_filing_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"name" text NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"condition_logic" "filing_rule_condition_logic" DEFAULT 'AND' NOT NULL,
	"conditions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"actions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by_user_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "email_filing_rules" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "communication_search_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"created_by_user_id" integer,
	"name" text NOT NULL,
	"criteria" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "communication_search_templates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

ALTER TABLE "project_match_keywords" ADD CONSTRAINT "project_match_keywords_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_match_keywords" ADD CONSTRAINT "project_match_keywords_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_match_keywords" ADD CONSTRAINT "project_match_keywords_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_filing_rules" ADD CONSTRAINT "email_filing_rules_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_filing_rules" ADD CONSTRAINT "email_filing_rules_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_search_templates" ADD CONSTRAINT "communication_search_templates_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_search_templates" ADD CONSTRAINT "communication_search_templates_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint

CREATE INDEX "idx_project_match_keywords_company" ON "project_match_keywords" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_project_match_keywords_project" ON "project_match_keywords" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_project_match_keywords_project_keyword" ON "project_match_keywords" USING btree ("project_id","keyword");--> statement-breakpoint
CREATE INDEX "idx_email_filing_rules_company" ON "email_filing_rules" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_email_filing_rules_company_priority" ON "email_filing_rules" USING btree ("company_id","priority");--> statement-breakpoint
CREATE INDEX "idx_communication_search_templates_company" ON "communication_search_templates" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_communication_search_templates_company_name" ON "communication_search_templates" USING btree ("company_id","name");--> statement-breakpoint

CREATE POLICY "tenant_isolation" ON "project_match_keywords" AS PERMISSIVE FOR ALL TO public USING (current_tenant_id() IS NULL OR "project_match_keywords"."company_id" = current_tenant_id());--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "email_filing_rules" AS PERMISSIVE FOR ALL TO public USING (current_tenant_id() IS NULL OR "email_filing_rules"."company_id" = current_tenant_id());--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "communication_search_templates" AS PERMISSIVE FOR ALL TO public USING (current_tenant_id() IS NULL OR "communication_search_templates"."company_id" = current_tenant_id());
