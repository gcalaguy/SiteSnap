CREATE TYPE "public"."safety_scan_status" AS ENUM('complete', 'failed');--> statement-breakpoint
CREATE TABLE "safety_scans" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"project_id" integer NOT NULL,
	"submitted_by_user_id" integer,
	"status" "safety_scan_status" DEFAULT 'complete' NOT NULL,
	"photo_object_paths" jsonb NOT NULL,
	"gps_lat" numeric(10, 7) NOT NULL,
	"gps_lng" numeric(10, 7) NOT NULL,
	"gps_altitude" numeric(8, 2),
	"gps_accuracy_m" numeric(8, 2),
	"gps_captured_at" timestamp with time zone NOT NULL,
	"gps_timezone" text,
	"site_address" text,
	"summary" text,
	"compliance_score" integer,
	"risk_level" "cor_risk_level",
	"ppe_detected" jsonb,
	"ai_raw_response" jsonb,
	"report_object_path" text,
	"inspector_signature_data" text,
	"inspector_signed_at" timestamp with time zone,
	"foreman_user_id" integer,
	"foreman_signature_data" text,
	"foreman_signed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "scan_hazards" (
	"id" serial PRIMARY KEY NOT NULL,
	"scan_id" integer NOT NULL,
	"company_id" integer NOT NULL,
	"title" text NOT NULL,
	"severity" "cor_risk_level" NOT NULL,
	"description" text NOT NULL,
	"remediation" text,
	"bounding_area" jsonb,
	"source_photo_object_path" text,
	"capa_ticket_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "safety_scans" ADD CONSTRAINT "safety_scans_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safety_scans" ADD CONSTRAINT "safety_scans_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safety_scans" ADD CONSTRAINT "safety_scans_submitted_by_user_id_users_id_fk" FOREIGN KEY ("submitted_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safety_scans" ADD CONSTRAINT "safety_scans_foreman_user_id_users_id_fk" FOREIGN KEY ("foreman_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scan_hazards" ADD CONSTRAINT "scan_hazards_scan_id_safety_scans_id_fk" FOREIGN KEY ("scan_id") REFERENCES "public"."safety_scans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scan_hazards" ADD CONSTRAINT "scan_hazards_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scan_hazards" ADD CONSTRAINT "scan_hazards_capa_ticket_id_capa_tickets_id_fk" FOREIGN KEY ("capa_ticket_id") REFERENCES "public"."capa_tickets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_safety_scans_company" ON "safety_scans" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_safety_scans_company_project" ON "safety_scans" USING btree ("company_id","project_id");--> statement-breakpoint
CREATE INDEX "idx_safety_scans_company_created" ON "safety_scans" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_scan_hazards_scan" ON "scan_hazards" USING btree ("scan_id");--> statement-breakpoint
CREATE INDEX "idx_scan_hazards_company" ON "scan_hazards" USING btree ("company_id");
