ALTER TYPE "public"."capa_status" ADD VALUE IF NOT EXISTS 'resolved';--> statement-breakpoint
ALTER TYPE "public"."capa_status" ADD VALUE IF NOT EXISTS 'verified';--> statement-breakpoint
ALTER TYPE "public"."capa_source_type" ADD VALUE IF NOT EXISTS 'safety_scan';--> statement-breakpoint
ALTER TABLE "capa_tickets" ADD COLUMN IF NOT EXISTS "resolved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "capa_tickets" ADD COLUMN IF NOT EXISTS "resolved_by_user_id" integer;--> statement-breakpoint
ALTER TABLE "capa_tickets" ADD COLUMN IF NOT EXISTS "resolution_photo_url" text;--> statement-breakpoint
ALTER TABLE "capa_tickets" ADD COLUMN IF NOT EXISTS "verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "capa_tickets" ADD COLUMN IF NOT EXISTS "verified_by_user_id" integer;--> statement-breakpoint
ALTER TABLE "capa_tickets" ADD CONSTRAINT "capa_tickets_resolved_by_user_id_users_id_fk" FOREIGN KEY ("resolved_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capa_tickets" ADD CONSTRAINT "capa_tickets_verified_by_user_id_users_id_fk" FOREIGN KEY ("verified_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
