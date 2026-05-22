ALTER TABLE worker_schedules
  ALTER COLUMN user_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS contact_id INTEGER REFERENCES contacts(id);
