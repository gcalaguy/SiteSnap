-- P2 fix: persist per-minute AI usage counters to DB so they are shared
-- across all server instances (previously in-memory only, allowing N×limit
-- calls per minute when N instances are running behind a load balancer).
CREATE TABLE IF NOT EXISTS "ai_minute_usage" (
  "company_id"  integer NOT NULL,
  "minute"      text    NOT NULL,  -- 'YYYY-MM-DDTHH:MM' UTC
  "count"       integer NOT NULL DEFAULT 0,
  PRIMARY KEY ("company_id", "minute")
);

CREATE INDEX IF NOT EXISTS "idx_ai_minute_usage_minute" ON "ai_minute_usage" ("minute");

-- Rows older than the current minute are never read again; prune periodically
-- (e.g. via pg_cron: DELETE FROM ai_minute_usage WHERE minute < to_char(now() - interval '1 hour', 'YYYY-MM-DD"T"HH24:MI'))
