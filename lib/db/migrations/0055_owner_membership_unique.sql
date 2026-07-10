-- Duplicate-tenant backstop.
--
-- Enrollment duplicates arise because POST /companies (self-serve create) is not
-- idempotent: a retried or concurrent request inserts a second company plus a
-- second "owner" membership for the same user. This partial unique index makes a
-- user ownable of at most ONE company, so the duplicate membership insert fails.
-- createCompany now wraps its writes in a transaction, so the stray company insert
-- rolls back with it — no orphan tenant remains.
--
-- IMPORTANT: this index will FAIL to create while duplicate owner memberships still
-- exist. Resolve existing duplicates first (see the report from
--   pnpm --filter @workspace/api-server run identify-duplicate-tenants
-- and merge/remove the extras) before applying this migration.
CREATE UNIQUE INDEX "uniq_owner_membership_per_user"
  ON "user_memberships" ("user_id")
  WHERE "role" = 'owner';
