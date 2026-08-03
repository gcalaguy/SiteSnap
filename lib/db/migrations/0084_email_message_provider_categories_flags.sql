-- Project Communications Hub — capture provider-native categories/flags
-- (Outlook categories + flag status, Gmail labelIds/STARRED) that sync was
-- previously discarding. Hand-authored for the same reason 0076-0083 were.
-- Apply directly with `psql -f`, or via `pnpm --filter @workspace/db run push`.
ALTER TABLE "email_messages" ADD COLUMN "provider_categories" text[];--> statement-breakpoint
ALTER TABLE "email_messages" ADD COLUMN "provider_flagged" boolean DEFAULT false NOT NULL;
