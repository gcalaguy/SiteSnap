-- Bind claim tokens to the invited owner's email so a leaked/forwarded claim
-- link can't be redeemed by an unintended account (see POST /companies/:id/claim).
ALTER TABLE "companies"
  ADD COLUMN IF NOT EXISTS "claim_owner_email" text;
