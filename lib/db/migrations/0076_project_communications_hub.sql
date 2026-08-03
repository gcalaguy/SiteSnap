-- Project Communications Hub (Phase 1 — Email Integration Foundation).
-- Hand-authored to isolate this change from unrelated drift between the
-- drizzle-kit migration journal (last synced at 0044) and the numbered .sql
-- files already present through 0075 — running `generate` directly against
-- the current schema pulls in that unrelated drift, so this file was written
-- by hand from the relevant portion of that diff instead.
CREATE TYPE "public"."email_account_status" AS ENUM('active', 'disconnected', 'error', 'reauth_required');--> statement-breakpoint
CREATE TYPE "public"."email_provider" AS ENUM('outlook', 'gmail');--> statement-breakpoint
CREATE TYPE "public"."email_sync_frequency" AS ENUM('15min', 'hourly', 'daily');--> statement-breakpoint
CREATE TABLE "email_accounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"connected_by_user_id" integer,
	"provider" "email_provider" NOT NULL,
	"email_address" text NOT NULL,
	"display_name" text,
	"status" "email_account_status" DEFAULT 'active' NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"token_expires_at" timestamp with time zone,
	"scopes" text[],
	"delta_cursor" text,
	"selected_folders" jsonb,
	"sync_frequency" "email_sync_frequency" DEFAULT 'hourly' NOT NULL,
	"last_sync_at" timestamp with time zone,
	"last_sync_error" text,
	"next_sync_due_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "email_accounts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "email_threads" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"email_account_id" integer NOT NULL,
	"project_id" integer,
	"provider_thread_id" text NOT NULL,
	"subject" text,
	"participant_emails" text[],
	"last_message_at" timestamp with time zone,
	"message_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "email_threads" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "email_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"email_account_id" integer NOT NULL,
	"thread_id" integer NOT NULL,
	"provider_message_id" text NOT NULL,
	"from_email" text,
	"from_name" text,
	"to_emails" text[],
	"cc_emails" text[],
	"subject" text,
	"body_text" text,
	"body_html" text,
	"has_attachments" boolean DEFAULT false NOT NULL,
	"sent_at" timestamp with time zone NOT NULL,
	"search_vector" "tsvector" GENERATED ALWAYS AS (setweight(to_tsvector('english', coalesce(subject, '')), 'A') || setweight(to_tsvector('english', coalesce(body_text, '')), 'B')) STORED,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "email_messages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "email_attachments" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"message_id" integer NOT NULL,
	"filename" text NOT NULL,
	"content_type" text,
	"size_bytes" integer,
	"object_path" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "email_attachments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "project_number" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "po_number" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "primary_contact_id" integer;--> statement-breakpoint
ALTER TABLE "email_accounts" ADD CONSTRAINT "email_accounts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_accounts" ADD CONSTRAINT "email_accounts_connected_by_user_id_users_id_fk" FOREIGN KEY ("connected_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_threads" ADD CONSTRAINT "email_threads_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_threads" ADD CONSTRAINT "email_threads_email_account_id_email_accounts_id_fk" FOREIGN KEY ("email_account_id") REFERENCES "public"."email_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_threads" ADD CONSTRAINT "email_threads_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_email_account_id_email_accounts_id_fk" FOREIGN KEY ("email_account_id") REFERENCES "public"."email_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_thread_id_email_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."email_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_attachments" ADD CONSTRAINT "email_attachments_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_attachments" ADD CONSTRAINT "email_attachments_message_id_email_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."email_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_primary_contact_id_contacts_id_fk" FOREIGN KEY ("primary_contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_email_accounts_company" ON "email_accounts" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_email_accounts_due" ON "email_accounts" USING btree ("status","next_sync_due_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_email_accounts_company_provider_address" ON "email_accounts" USING btree ("company_id","provider","email_address");--> statement-breakpoint
CREATE INDEX "idx_email_threads_company" ON "email_threads" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_email_threads_project" ON "email_threads" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_email_threads_account_provider_thread" ON "email_threads" USING btree ("email_account_id","provider_thread_id");--> statement-breakpoint
CREATE INDEX "idx_email_messages_company" ON "email_messages" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_email_messages_thread" ON "email_messages" USING btree ("thread_id");--> statement-breakpoint
CREATE INDEX "idx_email_messages_sent_at" ON "email_messages" USING btree ("sent_at");--> statement-breakpoint
CREATE INDEX "idx_email_messages_search_vector" ON "email_messages" USING gin ("search_vector");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_email_messages_account_provider_msg" ON "email_messages" USING btree ("email_account_id","provider_message_id");--> statement-breakpoint
CREATE INDEX "idx_email_attachments_company" ON "email_attachments" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_email_attachments_message" ON "email_attachments" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "idx_projects_primary_contact" ON "projects" USING btree ("primary_contact_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_projects_company_project_number" ON "projects" USING btree ("company_id","project_number");--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "email_accounts" AS PERMISSIVE FOR ALL TO public USING (current_tenant_id() IS NULL OR "email_accounts"."company_id" = current_tenant_id());--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "email_threads" AS PERMISSIVE FOR ALL TO public USING (current_tenant_id() IS NULL OR "email_threads"."company_id" = current_tenant_id());--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "email_messages" AS PERMISSIVE FOR ALL TO public USING (current_tenant_id() IS NULL OR "email_messages"."company_id" = current_tenant_id());--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "email_attachments" AS PERMISSIVE FOR ALL TO public USING (current_tenant_id() IS NULL OR "email_attachments"."company_id" = current_tenant_id());
