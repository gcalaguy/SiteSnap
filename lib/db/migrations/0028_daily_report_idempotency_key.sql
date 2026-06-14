-- HIGH-001: offline daily reports have no idempotency guarantee.
-- If connectivity is restored while a retry is in flight, the server can
-- receive the same report twice and create duplicates.
--
-- Fix: client generates a stable UUID per queued item and sends it as
-- clientIdempotencyKey. Server returns the existing record on re-submission
-- instead of inserting a second row.

ALTER TABLE "daily_reports"
  ADD COLUMN IF NOT EXISTS "client_idempotency_key" text;

-- Partial unique index so NULL values (non-offline reports) are ignored.
CREATE UNIQUE INDEX IF NOT EXISTS "idx_daily_reports_idempotency_key"
  ON "daily_reports" ("client_idempotency_key")
  WHERE "client_idempotency_key" IS NOT NULL;
