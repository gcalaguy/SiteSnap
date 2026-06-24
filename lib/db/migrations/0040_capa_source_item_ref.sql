ALTER TABLE "capa_tickets" ADD COLUMN "source_item_ref" text;--> statement-breakpoint
CREATE INDEX "idx_capa_inspection_item" ON "capa_tickets" USING btree ("company_id","source_type","source_record_id","source_item_ref");
