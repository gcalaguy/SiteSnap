CREATE TYPE "public"."psi_status" AS ENUM('draft', 'submitted');--> statement-breakpoint
CREATE TABLE "psi_checklists" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"project_id" integer NOT NULL,
	"created_by_user_id" integer NOT NULL,
	"date" date NOT NULL,
	"weather_temp" text,
	"trade_description" text,
	"location" text,
	"hazards" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"task_rows" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"voice_notes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" "psi_status" DEFAULT 'draft' NOT NULL,
	"submitted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "psi_worker_signatures" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"psi_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"signature_url" text NOT NULL,
	"signed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_psi_signature_user" UNIQUE("psi_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "psi_approvals" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"psi_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"signature_url" text,
	"approved_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_psi_approval_user" UNIQUE("psi_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "psi_checklists" ADD CONSTRAINT "psi_checklists_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "psi_checklists" ADD CONSTRAINT "psi_checklists_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "psi_checklists" ADD CONSTRAINT "psi_checklists_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "psi_worker_signatures" ADD CONSTRAINT "psi_worker_signatures_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "psi_worker_signatures" ADD CONSTRAINT "psi_worker_signatures_psi_id_psi_checklists_id_fk" FOREIGN KEY ("psi_id") REFERENCES "public"."psi_checklists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "psi_worker_signatures" ADD CONSTRAINT "psi_worker_signatures_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "psi_approvals" ADD CONSTRAINT "psi_approvals_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "psi_approvals" ADD CONSTRAINT "psi_approvals_psi_id_psi_checklists_id_fk" FOREIGN KEY ("psi_id") REFERENCES "public"."psi_checklists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "psi_approvals" ADD CONSTRAINT "psi_approvals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_psi_company_id" ON "psi_checklists" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_psi_company_project" ON "psi_checklists" USING btree ("company_id","project_id");--> statement-breakpoint
CREATE INDEX "idx_psi_company_status" ON "psi_checklists" USING btree ("company_id","status");--> statement-breakpoint
CREATE INDEX "idx_psi_company_created" ON "psi_checklists" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_psi_signatures_company" ON "psi_worker_signatures" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_psi_signatures_psi" ON "psi_worker_signatures" USING btree ("psi_id");--> statement-breakpoint
CREATE INDEX "idx_psi_approvals_company" ON "psi_approvals" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_psi_approvals_psi" ON "psi_approvals" USING btree ("psi_id");
