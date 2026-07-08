-- Native audit-logging / error-tracking system. Distinct from audit_logs (a
-- human business-action trail with NOT NULL company_id/user_id): this table
-- represents machine/system/error events, so user_id/tenant_id are nullable
-- to support pre-auth client crashes and failed company-creation attempts.

CREATE TABLE IF NOT EXISTS "system_logs" (
  "id" serial PRIMARY KEY,
  "log_type" text NOT NULL,
  "platform" text NOT NULL,
  "user_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "tenant_id" integer REFERENCES "companies"("id") ON DELETE SET NULL,
  "message" text NOT NULL,
  "stack_trace" text,
  "metadata" jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_system_logs_created_at" ON "system_logs" ("created_at");
CREATE INDEX IF NOT EXISTS "idx_system_logs_log_type" ON "system_logs" ("log_type");
CREATE INDEX IF NOT EXISTS "idx_system_logs_tenant_id" ON "system_logs" ("tenant_id");
