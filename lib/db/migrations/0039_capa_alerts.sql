CREATE TYPE "public"."capa_status" AS ENUM('open', 'in_progress', 'pending_review', 'closed', 'void');--> statement-breakpoint
CREATE TYPE "public"."capa_priority" AS ENUM('critical', 'high', 'medium', 'low');--> statement-breakpoint
CREATE TYPE "public"."capa_source_type" AS ENUM('audit_trail', 'inspection', 'manual', 'voice_log');--> statement-breakpoint
CREATE TABLE "capa_tickets" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"project_id" integer,
	"title" text NOT NULL,
	"description" text,
	"source_type" "capa_source_type" DEFAULT 'manual' NOT NULL,
	"source_record_id" integer,
	"ihsa_element" "ihsa_element",
	"priority" "capa_priority" DEFAULT 'medium' NOT NULL,
	"status" "capa_status" DEFAULT 'open' NOT NULL,
	"assigned_to_user_id" integer,
	"due_date" text,
	"closed_at" timestamp with time zone,
	"closed_by_user_id" integer,
	"closure_notes" text,
	"evidence_photo_url" text,
	"is_locked" boolean DEFAULT false NOT NULL,
	"created_by_user_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credential_alert_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"credential_type" text NOT NULL,
	"alert_type" text NOT NULL,
	"sent_for_expiry" text NOT NULL,
	"sent_to_email" text,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_credential_alert" UNIQUE("company_id","user_id","credential_type","alert_type","sent_for_expiry")
);
--> statement-breakpoint
ALTER TABLE "capa_tickets" ADD CONSTRAINT "capa_tickets_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capa_tickets" ADD CONSTRAINT "capa_tickets_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capa_tickets" ADD CONSTRAINT "capa_tickets_assigned_to_user_id_users_id_fk" FOREIGN KEY ("assigned_to_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capa_tickets" ADD CONSTRAINT "capa_tickets_closed_by_user_id_users_id_fk" FOREIGN KEY ("closed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capa_tickets" ADD CONSTRAINT "capa_tickets_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credential_alert_logs" ADD CONSTRAINT "credential_alert_logs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credential_alert_logs" ADD CONSTRAINT "credential_alert_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_capa_company" ON "capa_tickets" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_capa_status" ON "capa_tickets" USING btree ("company_id","status");--> statement-breakpoint
CREATE INDEX "idx_capa_assigned" ON "capa_tickets" USING btree ("assigned_to_user_id");--> statement-breakpoint
CREATE INDEX "idx_capa_source" ON "capa_tickets" USING btree ("source_record_id");--> statement-breakpoint
CREATE INDEX "idx_alert_logs_user" ON "credential_alert_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_alert_logs_company" ON "credential_alert_logs" USING btree ("company_id");
