ALTER TABLE "scans" ADD COLUMN IF NOT EXISTS "source_type" text DEFAULT 'file' NOT NULL;--> statement-breakpoint
ALTER TABLE "scans" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'ready' NOT NULL;
