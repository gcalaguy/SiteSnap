CREATE TABLE "external_auditor_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"token" text NOT NULL,
	"label" text NOT NULL,
	"created_by_user_id" integer,
	"expires_at" timestamp with time zone NOT NULL,
	"access_count" integer DEFAULT 0 NOT NULL,
	"last_accessed_at" timestamp with time zone,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "external_auditor_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "external_auditor_tokens" ADD CONSTRAINT "external_auditor_tokens_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "external_auditor_tokens" ADD CONSTRAINT "external_auditor_tokens_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "idx_ext_auditor_tokens_company" ON "external_auditor_tokens" USING btree ("company_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "idx_ext_auditor_tokens_token" ON "external_auditor_tokens" USING btree ("token");
