-- TradeHub profile media: photos and small documents that users can
-- attach to their public TradeHub profile (portfolio shots, certificates,
-- insurance docs, etc.).  Multiple files per user are supported.

CREATE TABLE IF NOT EXISTS "tradehub_profile_media" (
  "id"          SERIAL PRIMARY KEY,
  "user_id"     INTEGER NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "url"         TEXT NOT NULL,
  "object_path" TEXT,
  "media_type"  TEXT NOT NULL DEFAULT 'document',
  "file_name"   TEXT,
  "created_at"  TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "idx_tradehub_profile_media_user_id"
  ON "tradehub_profile_media" ("user_id");
