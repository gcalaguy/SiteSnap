CREATE INDEX "idx_notifications_type_user_ref_created" ON "notifications" USING btree ("type","user_id","reference_id","created_at");
