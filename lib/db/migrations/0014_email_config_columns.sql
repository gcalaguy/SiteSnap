ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "digest_from_email" text;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "resend_api_key" text;
