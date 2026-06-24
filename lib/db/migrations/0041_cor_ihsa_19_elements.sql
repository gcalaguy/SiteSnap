ALTER TYPE "public"."ihsa_element" ADD VALUE IF NOT EXISTS 'element_15';--> statement-breakpoint
ALTER TYPE "public"."ihsa_element" ADD VALUE IF NOT EXISTS 'element_16';--> statement-breakpoint
ALTER TYPE "public"."ihsa_element" ADD VALUE IF NOT EXISTS 'element_17';--> statement-breakpoint
ALTER TYPE "public"."ihsa_element" ADD VALUE IF NOT EXISTS 'element_18';--> statement-breakpoint
ALTER TYPE "public"."ihsa_element" ADD VALUE IF NOT EXISTS 'element_19';--> statement-breakpoint
ALTER TABLE "cor_audit_packages" ADD COLUMN IF NOT EXISTS "project_ids" jsonb;
