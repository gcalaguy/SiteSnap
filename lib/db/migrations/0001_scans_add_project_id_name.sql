ALTER TABLE "scans" ADD COLUMN IF NOT EXISTS "project_id" integer REFERENCES "projects"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "scans" ADD COLUMN IF NOT EXISTS "name" text;
