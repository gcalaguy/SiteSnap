ALTER TABLE worker_schedules
  ALTER COLUMN user_id DROP NOT NULL,
  ADD COLUMN contact_id INTEGER REFERENCES contacts(id);
