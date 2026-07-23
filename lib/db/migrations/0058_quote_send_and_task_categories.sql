ALTER TABLE "quotes" ADD COLUMN "sent_at" timestamp with time zone;
ALTER TABLE "quotes" ADD COLUMN "sent_via" text;
ALTER TABLE "quotes" ADD COLUMN "structured_scope" json;
--> statement-breakpoint
CREATE TABLE "task_categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer,
	"trade" text NOT NULL,
	"canonical_name" text NOT NULL,
	"synonyms" text[] DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "task_categories" ADD CONSTRAINT "task_categories_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "idx_task_categories_company_id" ON "task_categories" USING btree ("company_id");
