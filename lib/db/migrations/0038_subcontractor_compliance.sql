CREATE TYPE "public"."subcontractor_trade_type" AS ENUM('electrical', 'plumbing', 'hvac', 'concrete', 'framing', 'drywall', 'roofing', 'masonry', 'excavation', 'landscaping', 'painting', 'flooring', 'mechanical', 'fire_protection', 'steel_erection', 'insulation', 'glazing', 'general', 'other');--> statement-breakpoint
CREATE TYPE "public"."subcontractor_compliance_status" AS ENUM('compliant', 'non_compliant', 'expired', 'pending');--> statement-breakpoint
CREATE TYPE "public"."subcontractor_doc_type" AS ENUM('wsib_clearance', 'safety_manual', 'insurance_certificate', 'health_safety_policy', 'cor_certificate', 'other');--> statement-breakpoint
CREATE TYPE "public"."subcontractor_doc_status" AS ENUM('valid', 'expired', 'pending', 'rejected');--> statement-breakpoint
CREATE TABLE "subcontractors" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"company_name" text NOT NULL,
	"contact_name" text,
	"contact_email" text,
	"contact_phone" text,
	"trade_type" "subcontractor_trade_type" NOT NULL,
	"overall_status" "subcontractor_compliance_status" DEFAULT 'pending' NOT NULL,
	"notes" text,
	"invited_at" timestamp with time zone,
	"last_reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subcontractor_docs" (
	"id" serial PRIMARY KEY NOT NULL,
	"subcontractor_id" integer NOT NULL,
	"company_id" integer NOT NULL,
	"doc_type" "subcontractor_doc_type" NOT NULL,
	"doc_status" "subcontractor_doc_status" DEFAULT 'pending' NOT NULL,
	"document_url" text,
	"issue_date" text,
	"expiry_date" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_sub_doc_type" UNIQUE("subcontractor_id","doc_type")
);
--> statement-breakpoint
ALTER TABLE "subcontractors" ADD CONSTRAINT "subcontractors_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subcontractor_docs" ADD CONSTRAINT "subcontractor_docs_subcontractor_id_subcontractors_id_fk" FOREIGN KEY ("subcontractor_id") REFERENCES "public"."subcontractors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subcontractor_docs" ADD CONSTRAINT "subcontractor_docs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_subcontractors_company" ON "subcontractors" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_subcontractors_status" ON "subcontractors" USING btree ("company_id","overall_status");--> statement-breakpoint
CREATE INDEX "idx_subdocs_sub" ON "subcontractor_docs" USING btree ("subcontractor_id");--> statement-breakpoint
CREATE INDEX "idx_subdocs_company" ON "subcontractor_docs" USING btree ("company_id");
