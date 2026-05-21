ALTER TABLE change_orders
  ADD COLUMN client_signature_data TEXT,
  ADD COLUMN signed_at TIMESTAMP;
