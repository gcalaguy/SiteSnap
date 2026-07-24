CREATE TYPE "public"."backup_destination_type" AS ENUM('platform_storage', 'custom_cloud_storage', 'network_drive');--> statement-breakpoint
CREATE TYPE "public"."backup_frequency" AS ENUM('daily', 'weekly', 'monthly');--> statement-breakpoint
CREATE TYPE "public"."backup_status" AS ENUM('in_progress', 'completed', 'failed');--> statement-breakpoint
CREATE TABLE "backup_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"status" "backup_status" DEFAULT 'in_progress' NOT NULL,
	"file_size_bytes" bigint,
	"destination_type" "backup_destination_type" NOT NULL,
	"destination_path" text,
	"error_message" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "backup_schedules" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"frequency" "backup_frequency" DEFAULT 'weekly' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"retention_days" integer DEFAULT 90 NOT NULL,
	"destination_type" "backup_destination_type" DEFAULT 'platform_storage' NOT NULL,
	"destination_mount_key" text,
	"destination_subpath" text,
	"custom_cloud_config" jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "backup_schedules_company_id_unique" UNIQUE("company_id")
);
--> statement-breakpoint
ALTER TABLE "backup_logs" ADD CONSTRAINT "backup_logs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "backup_schedules" ADD CONSTRAINT "backup_schedules_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_backup_logs_company" ON "backup_logs" USING btree ("company_id");
