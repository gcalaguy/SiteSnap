-- Inventory & Asset Management schema
-- Tables: inventory_assets, asset_schedules, inventory_materials, tool_checkouts

CREATE TABLE IF NOT EXISTS "inventory_assets" (
  "id" serial PRIMARY KEY NOT NULL,
  "company_id" integer NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "category" text NOT NULL DEFAULT 'fleet',
  "asset_type" text NOT NULL DEFAULT 'other',
  "make" text,
  "model" text,
  "year" text,
  "serial_number" text,
  "status" text NOT NULL DEFAULT 'available',
  "photo_url" text,
  "daily_cost" numeric(10, 2),
  "last_known_lat" numeric(10, 6),
  "last_known_lng" numeric(11, 6),
  "notes" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_inventory_assets_company_id" ON "inventory_assets"("company_id");
CREATE INDEX IF NOT EXISTS "idx_inventory_assets_company_category" ON "inventory_assets"("company_id", "category");
CREATE INDEX IF NOT EXISTS "idx_inventory_assets_company_status" ON "inventory_assets"("company_id", "status");

CREATE TABLE IF NOT EXISTS "asset_schedules" (
  "id" serial PRIMARY KEY NOT NULL,
  "company_id" integer NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "asset_id" integer NOT NULL REFERENCES "inventory_assets"("id") ON DELETE CASCADE,
  "project_id" integer REFERENCES "projects"("id") ON DELETE SET NULL,
  "assigned_to_user_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "start_date" date NOT NULL,
  "end_date" date NOT NULL,
  "notes" text,
  "color" text NOT NULL DEFAULT '#D4AF37',
  "status" text NOT NULL DEFAULT 'scheduled',
  "created_by_user_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_asset_schedules_company_id" ON "asset_schedules"("company_id");
CREATE INDEX IF NOT EXISTS "idx_asset_schedules_asset_id" ON "asset_schedules"("asset_id");
CREATE INDEX IF NOT EXISTS "idx_asset_schedules_project_id" ON "asset_schedules"("project_id");
CREATE INDEX IF NOT EXISTS "idx_asset_schedules_company_dates" ON "asset_schedules"("company_id", "start_date", "end_date");

CREATE TABLE IF NOT EXISTS "inventory_materials" (
  "id" serial PRIMARY KEY NOT NULL,
  "company_id" integer NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "category" text NOT NULL DEFAULT 'other',
  "unit" text NOT NULL DEFAULT 'each',
  "quantity_on_hand" numeric(10, 2) NOT NULL DEFAULT '0',
  "reorder_threshold" numeric(10, 2),
  "reorder_qty" numeric(10, 2),
  "unit_cost" numeric(10, 2),
  "location" text,
  "notes" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_inventory_materials_company_id" ON "inventory_materials"("company_id");
CREATE INDEX IF NOT EXISTS "idx_inventory_materials_company_category" ON "inventory_materials"("company_id", "category");

CREATE TABLE IF NOT EXISTS "tool_checkouts" (
  "id" serial PRIMARY KEY NOT NULL,
  "company_id" integer NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "asset_id" integer NOT NULL REFERENCES "inventory_assets"("id") ON DELETE CASCADE,
  "project_id" integer REFERENCES "projects"("id") ON DELETE SET NULL,
  "checked_out_to_user_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "checked_out_to_contact_id" integer REFERENCES "contacts"("id") ON DELETE SET NULL,
  "checked_out_to_name" text,
  "status" text NOT NULL DEFAULT 'checked_out',
  "notes" text,
  "checked_out_at" timestamp DEFAULT now() NOT NULL,
  "expected_return_date" date,
  "returned_at" timestamp,
  "checked_out_by_user_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "returned_by_user_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_tool_checkouts_company_id" ON "tool_checkouts"("company_id");
CREATE INDEX IF NOT EXISTS "idx_tool_checkouts_asset_id" ON "tool_checkouts"("asset_id");
CREATE INDEX IF NOT EXISTS "idx_tool_checkouts_company_status" ON "tool_checkouts"("company_id", "status");
CREATE INDEX IF NOT EXISTS "idx_tool_checkouts_user" ON "tool_checkouts"("checked_out_to_user_id");
