CREATE TYPE "public"."compliance_directive_status" AS ENUM('PENDING', 'COMPLETED', 'DISMISSED', 'SUPERSEDED');--> statement-breakpoint
CREATE TYPE "public"."compliance_source_type" AS ENUM('FIELD_LOG', 'DAILY_REPORT', 'SCHEDULE', 'RULE_ENGINE', 'WEATHER', 'INCIDENT', 'TRAINING');--> statement-breakpoint
CREATE TYPE "public"."compliance_status" AS ENUM('compliant', 'non_compliant', 'warning');--> statement-breakpoint
CREATE TYPE "public"."compliance_target_form" AS ENUM('toolbox_talk', 'site_inspection', 'hazard_id', 'incident_investigation', 'training_record', 'audit_prep');--> statement-breakpoint
CREATE TYPE "public"."compliance_urgency" AS ENUM('HIGH', 'MEDIUM', 'LOW');--> statement-breakpoint
CREATE TYPE "public"."provider_token_type" AS ENUM('google', 'outlook');--> statement-breakpoint
ALTER TYPE "public"."document_status" ADD VALUE 'processing_ocr' BEFORE 'ready';--> statement-breakpoint
CREATE TABLE "ai_compliance_directives" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"project_id" integer NOT NULL,
	"target_form_id" "compliance_target_form" NOT NULL,
	"urgency" "compliance_urgency" NOT NULL,
	"worker_directive" text NOT NULL,
	"trigger_keywords" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source_type" "compliance_source_type" NOT NULL,
	"source_record_id" text,
	"confidence_score" integer DEFAULT 0 NOT NULL,
	"ai_model" text,
	"status" "compliance_directive_status" DEFAULT 'PENDING' NOT NULL,
	"assigned_to" integer,
	"completed_by" integer,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"user_name" text NOT NULL,
	"user_role" text NOT NULL,
	"action" text NOT NULL,
	"details" text NOT NULL,
	"project_name" text,
	"ip_address" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"foreman_id" integer NOT NULL,
	"notes" text,
	"weather_temp" text,
	"weather_condition" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_chunks" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"company_id" integer NOT NULL,
	"doc_id" integer NOT NULL,
	"chunk_index" integer NOT NULL,
	"content" text NOT NULL,
	"embedding" vector(1536),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_posting_applications" (
	"id" serial PRIMARY KEY NOT NULL,
	"job_posting_id" integer NOT NULL,
	"applicant_id" integer NOT NULL,
	"applicant_profile_id" integer,
	"message" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_postings" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"created_by" integer NOT NULL,
	"project_title" text NOT NULL,
	"description" text NOT NULL,
	"scope_of_work" text,
	"budget_estimate" text,
	"targeted_start_date" date,
	"location" text,
	"province" text,
	"trade" text,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media_hub_photos" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"uploaded_by_id" integer,
	"image_url" text NOT NULL,
	"room_location" text,
	"markup_data" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"company_id" integer NOT NULL,
	"provider" "provider_token_type" NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"token_data" jsonb,
	"expires_at" timestamp,
	"scopes" text[],
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "safety_signoffs" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"worker_id" integer NOT NULL,
	"responses" jsonb NOT NULL,
	"signature_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "site_photos" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"image_url" text NOT NULL,
	"markup_data" jsonb,
	"room_location" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_memberships" (
	"user_id" integer NOT NULL,
	"company_id" integer NOT NULL,
	"role" "user_role" DEFAULT 'worker' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"permissions" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_memberships_user_id_company_id_pk" PRIMARY KEY("user_id","company_id")
);
--> statement-breakpoint
CREATE TABLE "worker_documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"worker_id" integer NOT NULL,
	"company_id" integer NOT NULL,
	"document_type" text NOT NULL,
	"file_url" text NOT NULL,
	"file_path" text,
	"expiration_date" date,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trade_reviews" (
	"id" serial PRIMARY KEY NOT NULL,
	"reviewer_id" integer NOT NULL,
	"target_type" text NOT NULL,
	"target_company_id" integer,
	"target_user_id" integer,
	"rating" integer NOT NULL,
	"comment" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "task_dependencies" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "task_dependencies" CASCADE;--> statement-breakpoint
ALTER TABLE "estimator_addons" DROP CONSTRAINT "estimator_addons_addon_key_unique";--> statement-breakpoint
ALTER TABLE "builder_estimate_items" DROP CONSTRAINT "builder_estimate_items_estimate_id_builder_estimates_id_fk";
--> statement-breakpoint
ALTER TABLE "builder_estimates" DROP CONSTRAINT "builder_estimates_company_id_companies_id_fk";
--> statement-breakpoint
ALTER TABLE "change_orders" DROP CONSTRAINT "change_orders_company_id_companies_id_fk";
--> statement-breakpoint
ALTER TABLE "change_orders" DROP CONSTRAINT "change_orders_project_id_projects_id_fk";
--> statement-breakpoint
ALTER TABLE "contacts" DROP CONSTRAINT "contacts_company_id_companies_id_fk";
--> statement-breakpoint
ALTER TABLE "cost_analyses" DROP CONSTRAINT "cost_analyses_project_id_projects_id_fk";
--> statement-breakpoint
ALTER TABLE "daily_reports" DROP CONSTRAINT "daily_reports_project_id_projects_id_fk";
--> statement-breakpoint
ALTER TABLE "estimate_template_items" DROP CONSTRAINT "estimate_template_items_template_id_estimate_templates_id_fk";
--> statement-breakpoint
ALTER TABLE "estimate_templates" DROP CONSTRAINT "estimate_templates_company_id_companies_id_fk";
--> statement-breakpoint
ALTER TABLE "form_submissions" DROP CONSTRAINT "form_submissions_contact_id_contacts_id_fk";
--> statement-breakpoint
ALTER TABLE "form_submissions" DROP CONSTRAINT "form_submissions_reviewed_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "invitations" DROP CONSTRAINT "invitations_company_id_companies_id_fk";
--> statement-breakpoint
ALTER TABLE "invoices" DROP CONSTRAINT "invoices_company_id_companies_id_fk";
--> statement-breakpoint
ALTER TABLE "invoices" DROP CONSTRAINT "invoices_project_id_projects_id_fk";
--> statement-breakpoint
ALTER TABLE "invoices" DROP CONSTRAINT "invoices_quote_id_quotes_id_fk";
--> statement-breakpoint
ALTER TABLE "invoices" DROP CONSTRAINT "invoices_assigned_to_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "leads" DROP CONSTRAINT "leads_company_id_companies_id_fk";
--> statement-breakpoint
ALTER TABLE "leads" DROP CONSTRAINT "leads_converted_project_id_projects_id_fk";
--> statement-breakpoint
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_project_id_projects_id_fk";
--> statement-breakpoint
ALTER TABLE "payments" DROP CONSTRAINT "payments_company_id_companies_id_fk";
--> statement-breakpoint
ALTER TABLE "project_documents" DROP CONSTRAINT "project_documents_project_id_projects_id_fk";
--> statement-breakpoint
ALTER TABLE "projects" DROP CONSTRAINT "projects_company_id_companies_id_fk";
--> statement-breakpoint
ALTER TABLE "quotes" DROP CONSTRAINT "quotes_company_id_companies_id_fk";
--> statement-breakpoint
ALTER TABLE "quotes" DROP CONSTRAINT "quotes_project_id_projects_id_fk";
--> statement-breakpoint
ALTER TABLE "quotes" DROP CONSTRAINT "quotes_assigned_to_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "quotes" DROP CONSTRAINT "quotes_approved_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "rfis" DROP CONSTRAINT "rfis_project_id_projects_id_fk";
--> statement-breakpoint
ALTER TABLE "rfis" DROP CONSTRAINT "rfis_assigned_to_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "tasks" DROP CONSTRAINT "tasks_project_id_projects_id_fk";
--> statement-breakpoint
ALTER TABLE "tasks" DROP CONSTRAINT "tasks_assigned_to_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "time_entries" DROP CONSTRAINT "time_entries_company_id_companies_id_fk";
--> statement-breakpoint
ALTER TABLE "time_entries" DROP CONSTRAINT "time_entries_project_id_projects_id_fk";
--> statement-breakpoint
ALTER TABLE "timesheets" DROP CONSTRAINT "timesheets_reviewed_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "tradehub_posts" DROP CONSTRAINT "tradehub_posts_company_id_companies_id_fk";
--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT "users_company_id_companies_id_fk";
--> statement-breakpoint
ALTER TABLE "worker_schedules" DROP CONSTRAINT "worker_schedules_company_id_companies_id_fk";
--> statement-breakpoint
ALTER TABLE "worker_schedules" DROP CONSTRAINT "worker_schedules_project_id_projects_id_fk";
--> statement-breakpoint
ALTER TABLE "invoices" ALTER COLUMN "public_token" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "quotes" ALTER COLUMN "public_token" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "worker_schedules" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "change_orders" ADD COLUMN "client_signature_data" text;--> statement-breakpoint
ALTER TABLE "change_orders" ADD COLUMN "signed_at" timestamp;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "estimator_config" jsonb;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "quote_number_prefix" text DEFAULT 'QUO';--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "invoice_number_prefix" text DEFAULT 'INV';--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "quote_start_number" integer DEFAULT 1;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "invoice_start_number" integer DEFAULT 1;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "default_quote_terms" text;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "default_invoice_notes" text;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "digest_from_email" text;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "resend_api_key" text;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "coi_expiration" date;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "workers_comp_clearance_expiration" date;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "compliance_status" "compliance_status" DEFAULT 'compliant' NOT NULL;--> statement-breakpoint
ALTER TABLE "daily_reports" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "estimator_addons" ADD COLUMN "company_id" integer;--> statement-breakpoint
ALTER TABLE "estimator_cost_models" ADD COLUMN "company_id" integer;--> statement-breakpoint
ALTER TABLE "estimator_cost_models" ADD COLUMN "source_type" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "estimator_cost_models" ADD COLUMN "source_id" text;--> statement-breakpoint
ALTER TABLE "invitations" ADD COLUMN "preferred_language" text DEFAULT 'en' NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "proposal_id" integer;--> statement-breakpoint
ALTER TABLE "scans" ADD COLUMN "project_id" integer;--> statement-breakpoint
ALTER TABLE "scans" ADD COLUMN "name" text;--> statement-breakpoint
ALTER TABLE "scans" ADD COLUMN "thumbnail_path" text;--> statement-breakpoint
ALTER TABLE "tradehub_profiles" ADD COLUMN "compliance_status" "compliance_status" DEFAULT 'compliant' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "active_company_id" integer;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "preferred_language" text DEFAULT 'en' NOT NULL;--> statement-breakpoint
ALTER TABLE "worker_schedules" ADD COLUMN "contact_id" integer;--> statement-breakpoint
ALTER TABLE "ai_compliance_directives" ADD CONSTRAINT "ai_compliance_directives_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_compliance_directives" ADD CONSTRAINT "ai_compliance_directives_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_compliance_directives" ADD CONSTRAINT "ai_compliance_directives_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_compliance_directives" ADD CONSTRAINT "ai_compliance_directives_completed_by_users_id_fk" FOREIGN KEY ("completed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_logs" ADD CONSTRAINT "daily_logs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_logs" ADD CONSTRAINT "daily_logs_foreman_id_users_id_fk" FOREIGN KEY ("foreman_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_chunks" ADD CONSTRAINT "document_chunks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_chunks" ADD CONSTRAINT "document_chunks_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_chunks" ADD CONSTRAINT "document_chunks_doc_id_project_documents_id_fk" FOREIGN KEY ("doc_id") REFERENCES "public"."project_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_posting_applications" ADD CONSTRAINT "job_posting_applications_job_posting_id_job_postings_id_fk" FOREIGN KEY ("job_posting_id") REFERENCES "public"."job_postings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_posting_applications" ADD CONSTRAINT "job_posting_applications_applicant_id_users_id_fk" FOREIGN KEY ("applicant_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_posting_applications" ADD CONSTRAINT "job_posting_applications_applicant_profile_id_tradehub_profiles_id_fk" FOREIGN KEY ("applicant_profile_id") REFERENCES "public"."tradehub_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_postings" ADD CONSTRAINT "job_postings_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_postings" ADD CONSTRAINT "job_postings_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_hub_photos" ADD CONSTRAINT "media_hub_photos_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_hub_photos" ADD CONSTRAINT "media_hub_photos_uploaded_by_id_users_id_fk" FOREIGN KEY ("uploaded_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_tokens" ADD CONSTRAINT "provider_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_tokens" ADD CONSTRAINT "provider_tokens_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safety_signoffs" ADD CONSTRAINT "safety_signoffs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safety_signoffs" ADD CONSTRAINT "safety_signoffs_worker_id_users_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_photos" ADD CONSTRAINT "site_photos_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_memberships" ADD CONSTRAINT "user_memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_memberships" ADD CONSTRAINT "user_memberships_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "worker_documents" ADD CONSTRAINT "worker_documents_worker_id_users_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "worker_documents" ADD CONSTRAINT "worker_documents_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_reviews" ADD CONSTRAINT "trade_reviews_reviewer_id_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_reviews" ADD CONSTRAINT "trade_reviews_target_company_id_companies_id_fk" FOREIGN KEY ("target_company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_reviews" ADD CONSTRAINT "trade_reviews_target_user_id_users_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_compliance_directives_project_id" ON "ai_compliance_directives" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_compliance_directives_company_id" ON "ai_compliance_directives" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_compliance_directives_status" ON "ai_compliance_directives" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_compliance_directives_urgency" ON "ai_compliance_directives" USING btree ("urgency");--> statement-breakpoint
CREATE INDEX "idx_compliance_directives_created_at" ON "ai_compliance_directives" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_audit_logs_company_id" ON "audit_logs" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_audit_logs_user_id" ON "audit_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_audit_logs_created_at" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "document_chunks_project_idx" ON "document_chunks" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "document_chunks_doc_idx" ON "document_chunks" USING btree ("doc_id");--> statement-breakpoint
CREATE INDEX "idx_job_postings_company_id" ON "job_postings" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_job_postings_status" ON "job_postings" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_job_postings_trade" ON "job_postings" USING btree ("trade");--> statement-breakpoint
CREATE INDEX "idx_worker_docs_worker" ON "worker_documents" USING btree ("worker_id");--> statement-breakpoint
CREATE INDEX "idx_worker_docs_company" ON "worker_documents" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_worker_docs_type" ON "worker_documents" USING btree ("document_type");--> statement-breakpoint
CREATE INDEX "idx_worker_docs_status" ON "worker_documents" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_worker_docs_company_worker" ON "worker_documents" USING btree ("company_id","worker_id");--> statement-breakpoint
CREATE INDEX "trade_reviews_target_company_idx" ON "trade_reviews" USING btree ("target_company_id");--> statement-breakpoint
CREATE INDEX "trade_reviews_target_user_idx" ON "trade_reviews" USING btree ("target_user_id");--> statement-breakpoint
CREATE INDEX "trade_reviews_reviewer_idx" ON "trade_reviews" USING btree ("reviewer_id");--> statement-breakpoint
CREATE INDEX "trade_reviews_target_type_idx" ON "trade_reviews" USING btree ("target_type");--> statement-breakpoint
ALTER TABLE "builder_estimate_items" ADD CONSTRAINT "builder_estimate_items_estimate_id_builder_estimates_id_fk" FOREIGN KEY ("estimate_id") REFERENCES "public"."builder_estimates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "builder_estimates" ADD CONSTRAINT "builder_estimates_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_orders" ADD CONSTRAINT "change_orders_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_orders" ADD CONSTRAINT "change_orders_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_analyses" ADD CONSTRAINT "cost_analyses_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_reports" ADD CONSTRAINT "daily_reports_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estimate_template_items" ADD CONSTRAINT "estimate_template_items_template_id_estimate_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."estimate_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estimate_templates" ADD CONSTRAINT "estimate_templates_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estimator_addons" ADD CONSTRAINT "estimator_addons_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estimator_cost_models" ADD CONSTRAINT "estimator_cost_models_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_submissions" ADD CONSTRAINT "form_submissions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_submissions" ADD CONSTRAINT "form_submissions_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_submissions" ADD CONSTRAINT "form_submissions_reviewed_by_user_id_users_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_proposal_id_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."proposals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_quote_id_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quotes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_assigned_to_user_id_users_id_fk" FOREIGN KEY ("assigned_to_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_converted_project_id_projects_id_fk" FOREIGN KEY ("converted_project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_documents" ADD CONSTRAINT "project_documents_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_assigned_to_user_id_users_id_fk" FOREIGN KEY ("assigned_to_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_approved_by_user_id_users_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfis" ADD CONSTRAINT "rfis_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfis" ADD CONSTRAINT "rfis_assigned_to_user_id_users_id_fk" FOREIGN KEY ("assigned_to_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scans" ADD CONSTRAINT "scans_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assigned_to_user_id_users_id_fk" FOREIGN KEY ("assigned_to_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timesheets" ADD CONSTRAINT "timesheets_reviewed_by_user_id_users_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tradehub_posts" ADD CONSTRAINT "tradehub_posts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_active_company_id_companies_id_fk" FOREIGN KEY ("active_company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "worker_schedules" ADD CONSTRAINT "worker_schedules_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "worker_schedules" ADD CONSTRAINT "worker_schedules_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "worker_schedules" ADD CONSTRAINT "worker_schedules_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_builder_estimates_company_id" ON "builder_estimates" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_change_orders_company_id" ON "change_orders" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_change_orders_project_id" ON "change_orders" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_change_orders_status" ON "change_orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_change_orders_company_id_status" ON "change_orders" USING btree ("company_id","status");--> statement-breakpoint
CREATE INDEX "idx_change_orders_company_id_project_id" ON "change_orders" USING btree ("company_id","project_id");--> statement-breakpoint
CREATE INDEX "idx_contacts_company_id" ON "contacts" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_contacts_type" ON "contacts" USING btree ("type");--> statement-breakpoint
CREATE INDEX "idx_daily_reports_project_id" ON "daily_reports" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_estimates_company_id" ON "estimates" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_estimates_status" ON "estimates" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_file_attachments_company_id" ON "file_attachments" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_file_attachments_entity" ON "file_attachments" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "idx_form_submissions_company_id" ON "form_submissions" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_form_submissions_status" ON "form_submissions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_form_submissions_company_status" ON "form_submissions" USING btree ("company_id","status");--> statement-breakpoint
CREATE INDEX "idx_form_submissions_project_id" ON "form_submissions" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_form_templates_category" ON "form_templates" USING btree ("category");--> statement-breakpoint
CREATE INDEX "idx_form_templates_is_active" ON "form_templates" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "idx_inspections_company_id" ON "inspections" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_inspections_project_id" ON "inspections" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_inspections_company_project" ON "inspections" USING btree ("company_id","project_id");--> statement-breakpoint
CREATE INDEX "idx_invoices_company_id" ON "invoices" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_invoices_project_id" ON "invoices" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_invoices_status" ON "invoices" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_invoices_quote_id" ON "invoices" USING btree ("quote_id");--> statement-breakpoint
CREATE INDEX "idx_invoices_company_id_status" ON "invoices" USING btree ("company_id","status");--> statement-breakpoint
CREATE INDEX "idx_invoices_company_id_project_id" ON "invoices" USING btree ("company_id","project_id");--> statement-breakpoint
CREATE INDEX "idx_lead_activities_lead_id" ON "lead_activities" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "idx_leads_company_id" ON "leads" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_leads_stage" ON "leads" USING btree ("stage");--> statement-breakpoint
CREATE INDEX "idx_notifications_user_id" ON "notifications" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_notifications_is_read" ON "notifications" USING btree ("is_read");--> statement-breakpoint
CREATE INDEX "idx_payments_company_id" ON "payments" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_payments_invoice_id" ON "payments" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "idx_project_documents_project_id" ON "project_documents" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_project_documents_status" ON "project_documents" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_project_documents_project_status" ON "project_documents" USING btree ("project_id","status");--> statement-breakpoint
CREATE INDEX "idx_project_members_company_user" ON "project_members" USING btree ("company_id","user_id");--> statement-breakpoint
CREATE INDEX "idx_projects_company_id" ON "projects" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_projects_company_id_id" ON "projects" USING btree ("company_id","id");--> statement-breakpoint
CREATE INDEX "idx_quotes_company_id" ON "quotes" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_quotes_status" ON "quotes" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_quotes_company_id_status" ON "quotes" USING btree ("company_id","status");--> statement-breakpoint
CREATE INDEX "idx_rfis_project_id" ON "rfis" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_rfis_status" ON "rfis" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_rfis_project_status" ON "rfis" USING btree ("project_id","status");--> statement-breakpoint
CREATE INDEX "idx_scans_company_id" ON "scans" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_scans_project_id" ON "scans" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_schedule_events_company_id" ON "schedule_events" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_tasks_project_id" ON "tasks" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_tasks_status" ON "tasks" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_tasks_project_status" ON "tasks" USING btree ("project_id","status");--> statement-breakpoint
CREATE INDEX "idx_time_entries_company_id" ON "time_entries" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_time_entries_project_id" ON "time_entries" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_time_entries_user_id" ON "time_entries" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_timesheets_company_id" ON "timesheets" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_timesheets_user_id" ON "timesheets" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_timesheets_project_id" ON "timesheets" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_timesheets_status" ON "timesheets" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_timesheets_project_status" ON "timesheets" USING btree ("project_id","status");--> statement-breakpoint
CREATE INDEX "idx_tradehub_posts_company_id" ON "tradehub_posts" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_tradehub_posts_type" ON "tradehub_posts" USING btree ("type");--> statement-breakpoint
CREATE INDEX "idx_worker_schedules_company_user_project" ON "worker_schedules" USING btree ("company_id","user_id","project_id");--> statement-breakpoint
CREATE INDEX "idx_conversations_user_id" ON "conversations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_conversations_company_id" ON "conversations" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_messages_conversation_id" ON "messages" USING btree ("conversation_id");--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "company_id";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "role";--> statement-breakpoint
ALTER TABLE "timesheets" ADD CONSTRAINT "idx_timesheets_company_user_week" UNIQUE("company_id","user_id","week_start");