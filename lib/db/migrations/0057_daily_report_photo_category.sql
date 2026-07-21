CREATE TYPE "public"."daily_report_photo_category" AS ENUM('progress', 'issue', 'site_condition');--> statement-breakpoint
ALTER TABLE "daily_report_photos" ADD COLUMN "category" "daily_report_photo_category" NOT NULL DEFAULT 'progress';
