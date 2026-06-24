CREATE TYPE "public"."cor_document_type" AS ENUM('swp', 'jha', 'company_rules', 'policy');--> statement-breakpoint
CREATE TABLE "policy_documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"document_type" "cor_document_type" NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"file_url" text,
	"content_text" text,
	"ihsa_element" "ihsa_element" NOT NULL,
	"requires_annual_renewal" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by_user_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "policy_signoffs" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"policy_document_id" integer NOT NULL,
	"worker_user_id" integer NOT NULL,
	"signed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"signature_data" text,
	"is_valid" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_policy_signoff_worker_doc" UNIQUE("policy_document_id","worker_user_id")
);
--> statement-breakpoint
ALTER TABLE "policy_documents" ADD CONSTRAINT "policy_documents_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_documents" ADD CONSTRAINT "policy_documents_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_signoffs" ADD CONSTRAINT "policy_signoffs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_signoffs" ADD CONSTRAINT "policy_signoffs_policy_document_id_policy_documents_id_fk" FOREIGN KEY ("policy_document_id") REFERENCES "public"."policy_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_signoffs" ADD CONSTRAINT "policy_signoffs_worker_user_id_users_id_fk" FOREIGN KEY ("worker_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_policy_docs_company" ON "policy_documents" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_policy_docs_company_type" ON "policy_documents" USING btree ("company_id","document_type");--> statement-breakpoint
CREATE INDEX "idx_policy_docs_active" ON "policy_documents" USING btree ("company_id","is_active");--> statement-breakpoint
CREATE INDEX "idx_policy_signoffs_company" ON "policy_signoffs" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_policy_signoffs_document" ON "policy_signoffs" USING btree ("policy_document_id");--> statement-breakpoint
CREATE INDEX "idx_policy_signoffs_worker" ON "policy_signoffs" USING btree ("worker_user_id");--> statement-breakpoint
CREATE INDEX "idx_policy_signoffs_company_worker" ON "policy_signoffs" USING btree ("company_id","worker_user_id");
