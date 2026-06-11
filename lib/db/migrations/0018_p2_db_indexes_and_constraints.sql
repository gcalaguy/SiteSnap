-- P2: Add missing tenant-first composite indexes and fix timesheet unique constraint
-- Addresses Weptile audit finding: "Tenant-first composite indexes (companyId + entityField)
-- are missing on several high-traffic tables."
--
-- Also fixes the timesheet unique constraint to include project_id so multi-project
-- timesheets (added in P1) are correctly enforced at the DB level.

-- ── Equipment ──────────────────────────────────────────────────────────────────
-- equipment has no indexes at all; add company_id so listing a company's equipment is fast.
CREATE INDEX IF NOT EXISTS "idx_equipment_company_id" ON "equipment" ("company_id");
CREATE INDEX IF NOT EXISTS "idx_equipment_company_id_status" ON "equipment" ("company_id", "status");

-- ── Project Notes ──────────────────────────────────────────────────────────────
-- project_notes has no indexes; add composite for company+project listing pattern.
CREATE INDEX IF NOT EXISTS "idx_project_notes_company_id" ON "project_notes" ("company_id");
CREATE INDEX IF NOT EXISTS "idx_project_notes_company_project" ON "project_notes" ("company_id", "project_id");

-- ── Schedule Events ────────────────────────────────────────────────────────────
-- Add compound (company_id, start_time) for date-range calendar queries.
CREATE INDEX IF NOT EXISTS "idx_schedule_events_company_start" ON "schedule_events" ("company_id", "start_time");

-- ── Conversations ──────────────────────────────────────────────────────────────
-- Queries always filter by both company_id AND user_id; a compound index is more
-- selective than the two single-column indexes that exist today.
CREATE INDEX IF NOT EXISTS "idx_conversations_company_user" ON "conversations" ("company_id", "user_id");

-- ── Timesheets unique constraint — multi-project aware ────────────────────────
-- The P1 fix allows one timesheet row per (company, user, week, project).
-- The old unique constraint (company_id, user_id, week_start) must be replaced with
-- two partial unique indexes so NULL project_id is handled correctly by Postgres
-- (NULLs are never equal in a plain unique index, which would allow unlimited
-- project-less timesheets per week — not the desired behaviour).

-- Drop the old constraint (created by drizzle as a named unique index).
-- Use DROP INDEX CONCURRENTLY is not supported inside transactions, so we use a plain drop.
DROP INDEX IF EXISTS "idx_timesheets_company_user_week";

-- One row per (company, user, week) when project_id IS NULL  (no-project timesheets)
CREATE UNIQUE INDEX IF NOT EXISTS "idx_timesheets_company_user_week_no_project"
  ON "timesheets" ("company_id", "user_id", "week_start")
  WHERE "project_id" IS NULL;

-- One row per (company, user, week, project) when project_id IS NOT NULL
CREATE UNIQUE INDEX IF NOT EXISTS "idx_timesheets_company_user_week_project"
  ON "timesheets" ("company_id", "user_id", "week_start", "project_id")
  WHERE "project_id" IS NOT NULL;
