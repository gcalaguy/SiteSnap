CREATE TABLE IF NOT EXISTS "trade_reviews" (
	"id" serial PRIMARY KEY NOT NULL,
	"reviewer_id" integer NOT NULL,
	"target_type" text NOT NULL,
	"target_company_id" integer,
	"target_user_id" integer,
	"rating" integer NOT NULL,
	"comment" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "trade_reviews" ADD CONSTRAINT "trade_reviews_reviewer_id_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "trade_reviews" ADD CONSTRAINT "trade_reviews_target_company_id_companies_id_fk" FOREIGN KEY ("target_company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "trade_reviews" ADD CONSTRAINT "trade_reviews_target_user_id_users_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trade_reviews_target_company_idx" ON "trade_reviews" USING btree ("target_company_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trade_reviews_target_user_idx" ON "trade_reviews" USING btree ("target_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trade_reviews_reviewer_idx" ON "trade_reviews" USING btree ("reviewer_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trade_reviews_target_type_idx" ON "trade_reviews" USING btree ("target_type");
