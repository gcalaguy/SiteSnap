-- PHASE 6: Scalability & Memory Tuning — move volatile in-memory rate-limit
-- and debounce state into Postgres so it's shared correctly across every
-- load-balanced api-server instance instead of drifting per-process.
--
-- Neither table is tenant/company data — both are operational/infra state,
-- so they are intentionally NOT covered by the Phase 5 tenant RLS rollout.

-- ── express-rate-limit custom store backing table ────────────────────────────
-- One row per (prefixed) rate-limit key. `reset_time` marks when the current
-- window ends; increment() UPSERTs and resets the count atomically once the
-- window has elapsed, so concurrent requests across instances see one
-- consistent counter instead of N independent in-memory ones.
CREATE TABLE IF NOT EXISTS rate_limit_hits (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 0,
  reset_time TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rate_limit_hits_reset_time ON rate_limit_hits (reset_time);

-- ── Compliance analysis debounce backing table ───────────────────────────────
-- Replaces the in-memory `pending` Map + setTimeout in
-- services/compliance/debouncer.ts. `fire_at` is pushed forward by 15 minutes
-- on every reschedule; any instance's poller may claim and run a row once
-- fire_at has elapsed (via SELECT ... FOR UPDATE SKIP LOCKED, so exactly one
-- instance fires it even though every instance polls the same table).
CREATE TABLE IF NOT EXISTS pending_compliance_analyses (
  project_id INTEGER PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  fire_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pending_compliance_analyses_fire_at ON pending_compliance_analyses (fire_at);
