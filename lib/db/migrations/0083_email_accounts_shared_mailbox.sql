-- Project Communications Hub (Phase 4 — Outlook Shared Mailboxes).
-- Hand-authored for the same reason 0076/0078/0079/0080/0081/0082 were. Apply directly with `psql -f`.
CREATE TYPE "public"."email_mailbox_type" AS ENUM('personal', 'shared');--> statement-breakpoint

ALTER TABLE "email_accounts" ADD COLUMN "mailbox_type" "email_mailbox_type" DEFAULT 'personal' NOT NULL;--> statement-breakpoint
ALTER TABLE "email_accounts" ADD COLUMN "shared_mailbox_address" text;
