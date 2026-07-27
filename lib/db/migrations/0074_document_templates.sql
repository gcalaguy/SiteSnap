CREATE TYPE "public"."document_template_type" AS ENUM ('quote', 'invoice', 'rfi', 'proposal', 'change_order');--> statement-breakpoint
CREATE TYPE "public"."document_template_file_type" AS ENUM ('docx', 'html', 'pdf');--> statement-breakpoint
CREATE TABLE "document_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"document_type" "document_template_type" NOT NULL,
	"file_type" "document_template_file_type" NOT NULL,
	"original_filename" text NOT NULL,
	"object_path" text NOT NULL,
	"mime_type" text NOT NULL,
	"file_size_bytes" integer NOT NULL,
	"detected_merge_tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"uploaded_by_user_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "document_templates" ADD CONSTRAINT "document_templates_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_templates" ADD CONSTRAINT "document_templates_uploaded_by_user_id_users_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_document_templates_company_type" ON "document_templates" USING btree ("company_id","document_type");--> statement-breakpoint
CREATE INDEX "idx_document_templates_company_id" ON "document_templates" USING btree ("company_id");--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'document_templates' AND policyname = 'tenant_isolation') THEN
    CREATE POLICY tenant_isolation ON document_templates
      AS PERMISSIVE
      USING (current_tenant_id() IS NULL OR company_id = current_tenant_id());
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "document_templates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "document_templates" FORCE ROW LEVEL SECURITY;
