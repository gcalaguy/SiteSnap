ALTER TABLE "site_photos" ADD COLUMN "uploaded_by_user_id" integer;--> statement-breakpoint
ALTER TABLE "site_photos" ADD CONSTRAINT "site_photos_uploaded_by_user_id_users_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
