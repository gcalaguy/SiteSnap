-- P1 fix: normalize feature key casing to UPPER_SNAKE_CASE
-- Fixes inconsistency between backend code ("Smart_Estimator", "Contacts", "Financials")
-- and the canonical UPPER_SNAKE_CASE convention used by the web dashboard and AI quota system.
UPDATE features SET key = UPPER(REPLACE(key, ' ', '_')) WHERE key != UPPER(REPLACE(key, ' ', '_'));

-- Also normalize any company activeFeatures arrays stored with mixed-case keys
UPDATE companies
  SET "active_features" = ARRAY(
    SELECT UPPER(REPLACE(f, ' ', '_')) FROM unnest("active_features") AS f
  )
  WHERE "active_features" IS NOT NULL AND array_length("active_features", 1) > 0;
