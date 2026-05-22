ALTER TABLE change_orders
  ADD COLUMN IF NOT EXISTS client_signature_data TEXT,
  ADD COLUMN IF NOT EXISTS signed_at TIMESTAMP;
