-- Fix: invoice and quote numbering used SELECT count(*) which is not atomic.
-- Concurrent inserts could read the same count and produce duplicate document numbers,
-- violating CRA sequential-numbering requirements.
--
-- Solution: add monotonically-incrementing counter columns to companies.
-- The application does UPDATE companies SET invoice_counter = invoice_counter + 1
-- RETURNING invoice_counter inside the same transaction as the insert, making
-- the sequence allocation and the row creation a single atomic unit.

ALTER TABLE "companies"
  ADD COLUMN IF NOT EXISTS "invoice_counter" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "quote_counter"   integer NOT NULL DEFAULT 0;

-- Backfill counters to match the current row counts so existing number sequences
-- remain contiguous (new numbers pick up where the last one left off).
UPDATE "companies" c
SET
  invoice_counter = (SELECT count(*) FROM "invoices" WHERE company_id = c.id),
  quote_counter   = (SELECT count(*) FROM "quotes"   WHERE company_id = c.id);
