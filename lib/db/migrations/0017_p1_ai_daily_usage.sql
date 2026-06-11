-- P1 fix: persist daily AI usage counters to DB so they survive server restarts.
-- Per-minute burst limiting remains in-memory (acceptable for rate shaping).
CREATE TABLE IF NOT EXISTS "ai_daily_usage" (
  "company_id"  integer NOT NULL,
  "date"        date    NOT NULL DEFAULT CURRENT_DATE,
  "count"       integer NOT NULL DEFAULT 0,
  PRIMARY KEY ("company_id", "date")
);

CREATE INDEX IF NOT EXISTS "idx_ai_daily_usage_date" ON "ai_daily_usage" ("date");
