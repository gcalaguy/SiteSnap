ALTER TABLE "user_memberships" ADD COLUMN IF NOT EXISTS "permissions" jsonb;
