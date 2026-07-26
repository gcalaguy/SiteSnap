CREATE TYPE "public"."voice_inspection_status" AS ENUM('complete', 'failed');--> statement-breakpoint
CREATE TYPE "public"."voice_inspection_pass_status" AS ENUM('pass', 'fail', 'conditional');--> statement-breakpoint
CREATE TABLE "voice_inspections" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"project_id" integer NOT NULL,
	"submitted_by_user_id" integer,
	"status" "voice_inspection_status" DEFAULT 'complete' NOT NULL,
	"audio_object_path" text NOT NULL,
	"audio_duration_seconds" integer,
	"transcript" text NOT NULL,
	"gps_lat" numeric(10, 7) NOT NULL,
	"gps_lng" numeric(10, 7) NOT NULL,
	"gps_altitude" numeric(8, 2),
	"gps_accuracy_m" numeric(8, 2),
	"gps_captured_at" timestamp with time zone NOT NULL,
	"gps_timezone" text,
	"site_address" text,
	"equipment_or_area" text,
	"inspection_type" text,
	"pass_status" "voice_inspection_pass_status",
	"hazard_summary" text,
	"severity_level" "cor_risk_level",
	"location_details" text,
	"immediate_action_required" boolean DEFAULT false NOT NULL,
	"recommended_actions" jsonb,
	"ai_raw_response" jsonb,
	"capa_ticket_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "voice_inspections" ADD CONSTRAINT "voice_inspections_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_inspections" ADD CONSTRAINT "voice_inspections_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_inspections" ADD CONSTRAINT "voice_inspections_submitted_by_user_id_users_id_fk" FOREIGN KEY ("submitted_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_inspections" ADD CONSTRAINT "voice_inspections_capa_ticket_id_capa_tickets_id_fk" FOREIGN KEY ("capa_ticket_id") REFERENCES "public"."capa_tickets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_voice_inspections_company" ON "voice_inspections" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_voice_inspections_company_project" ON "voice_inspections" USING btree ("company_id","project_id");--> statement-breakpoint
CREATE INDEX "idx_voice_inspections_company_created" ON "voice_inspections" USING btree ("company_id","created_at");
