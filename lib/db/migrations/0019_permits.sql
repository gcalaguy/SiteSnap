CREATE TABLE IF NOT EXISTS "permits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" integer NOT NULL,
	"project_id" integer NOT NULL,
	"title" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"expiration_date" timestamp,
	"file_url" text,
	"created_by_user_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "uq_permits_company_project_title" UNIQUE("company_id","project_id","title")
);--> statement-breakpoint
ALTER TABLE "permits" ADD CONSTRAINT "permits_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "permits" ADD CONSTRAINT "permits_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "permits" ADD CONSTRAINT "permits_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_permits_company" ON "permits" ("company_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_permits_company_project" ON "permits" ("company_id","project_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_permits_expiration" ON "permits" ("expiration_date");
