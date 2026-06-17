CREATE TABLE IF NOT EXISTS "expenses" (
  "id" serial PRIMARY KEY NOT NULL,
  "company_id" integer NOT NULL,
  "project_id" integer NOT NULL,
  "submitted_by_user_id" integer NOT NULL,
  "amount" numeric(12, 2) NOT NULL,
  "description" text NOT NULL,
  "receipt_object_path" text,
  "status" text DEFAULT 'submitted' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_submitted_by_user_id_users_id_fk" FOREIGN KEY ("submitted_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_expenses_company_id" ON "expenses" ("company_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_expenses_project_id" ON "expenses" ("project_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_expenses_submitted_by" ON "expenses" ("submitted_by_user_id");
